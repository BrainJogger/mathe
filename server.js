// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const BetterSqlite3 = require("better-sqlite3");

const app = express();
const PORT = 3001;
const STORAGE_BACKEND = (process.env.STORAGE_BACKEND || "json").toLowerCase();
const USE_SQLITE = STORAGE_BACKEND === "sqlite";

const RESULTS_FILE = path.join(__dirname, "results.json");
const STUDENTS_FILE = path.join(__dirname, "students.json");
const CLASSES_FILE = path.join(__dirname, "classes.json");
const TEACHERS_FILE = path.join(__dirname, "teachers.json");
const SQLITE_DB_FILE = path.join(__dirname, "data.sqlite");

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/admin", express.static(path.join(__dirname, "admin")));

// --- Hilfsfunktionen ---
let sqliteDb = null;

function toStoreKey(filePath) {
  return path.basename(filePath);
}

function initSqlite() {
  if (!USE_SQLITE) return;
  sqliteDb = new BetterSqlite3(SQLITE_DB_FILE);
  sqliteDb.pragma("journal_mode = WAL");
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS json_store (
      store_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL
    )
  `);
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS results (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      name TEXT NOT NULL,
      klasse TEXT NOT NULL,
      jahrgang TEXT NOT NULL,
      lehrjahr TEXT,
      lehrer TEXT,
      mode TEXT,
      answers_json TEXT,
      corrections_json TEXT,
      time_left INTEGER,
      submitted_at TEXT NOT NULL
    )
  `);
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_results_student_id ON results(student_id)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_results_class_year ON results(klasse, jahrgang)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_results_lehrer ON results(lehrer)");
  sqliteDb.exec("CREATE INDEX IF NOT EXISTS idx_results_submitted_at ON results(submitted_at)");
}

function sqliteReadStore(key) {
  const row = sqliteDb
    .prepare("SELECT payload FROM json_store WHERE store_key = ?")
    .get(key);
  if (!row || typeof row.payload !== "string") return null;
  try {
    return JSON.parse(row.payload || "[]");
  } catch (e) {
    console.error("Fehler beim Parsen aus SQLite:", key, e);
    return [];
  }
}

function sqliteWriteStore(key, data) {
  sqliteDb
    .prepare(`
      INSERT INTO json_store (store_key, payload)
      VALUES (?, ?)
      ON CONFLICT(store_key)
      DO UPDATE SET payload = excluded.payload
    `)
    .run(key, JSON.stringify(data || []));
}

function parseJsonSafe(value, fallback = {}) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
}

function mapResultRow(row) {
  return {
    id: Number.isNaN(Number(row.id)) ? row.id : Number(row.id),
    studentId: row.student_id,
    name: row.name,
    klasse: row.klasse,
    jahrgang: row.jahrgang,
    lehrjahr: row.lehrjahr,
    lehrer: row.lehrer,
    mode: row.mode,
    answers: parseJsonSafe(row.answers_json, {}),
    corrections: parseJsonSafe(row.corrections_json, {}),
    timeLeft: row.time_left,
    submittedAt: row.submitted_at,
  };
}

function insertResultSqlite(entry) {
  sqliteDb.prepare(`
    INSERT INTO results (
      id, student_id, name, klasse, jahrgang, lehrjahr, lehrer, mode, answers_json, corrections_json, time_left, submitted_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(entry.id),
    String(entry.studentId),
    entry.name || "",
    entry.klasse || "",
    String(entry.jahrgang || ""),
    entry.lehrjahr || "",
    entry.lehrer || "",
    entry.mode || "",
    JSON.stringify(entry.answers || {}),
    JSON.stringify(entry.corrections || {}),
    typeof entry.timeLeft === "number" ? entry.timeLeft : null,
    entry.submittedAt || new Date().toISOString()
  );
}

function bootstrapResultsTableFromJson() {
  if (!USE_SQLITE) return;
  const countRow = sqliteDb.prepare("SELECT COUNT(*) AS count FROM results").get();
  if ((countRow?.count || 0) > 0) return;

  let sourceResults = [];
  if (fs.existsSync(RESULTS_FILE)) {
    try {
      sourceResults = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf8") || "[]");
    } catch (e) {
      sourceResults = [];
    }
  }
  if (!Array.isArray(sourceResults) || sourceResults.length === 0) {
    const fromStore = sqliteReadStore(toStoreKey(RESULTS_FILE));
    if (Array.isArray(fromStore)) sourceResults = fromStore;
  }
  if (!Array.isArray(sourceResults) || sourceResults.length === 0) return;

  const tx = sqliteDb.transaction((items) => {
    for (const item of items) {
      if (!item || item.id === undefined || !item.studentId) continue;
      insertResultSqlite(item);
    }
  });
  tx(sourceResults);
}

function getResultsSqlite(filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.lehrer) {
    conditions.push("LOWER(COALESCE(lehrer, '')) = LOWER(?)");
    params.push(String(filters.lehrer));
  }
  if (filters.klasse) {
    conditions.push("klasse = ?");
    params.push(String(filters.klasse));
  }
  if (filters.jahrgang) {
    conditions.push("jahrgang = ?");
    params.push(String(filters.jahrgang));
  }
  if (filters.studentId) {
    conditions.push("student_id = ?");
    params.push(String(filters.studentId));
  }
  if (filters.nameLike) {
    conditions.push("LOWER(name) LIKE LOWER(?)");
    params.push(`%${String(filters.nameLike)}%`);
  }
  if (filters.date) {
    conditions.push("submitted_at LIKE ?");
    params.push(`${String(filters.date)}%`);
  }

  let sql = "SELECT * FROM results";
  if (conditions.length) sql += ` WHERE ${conditions.join(" AND ")}`;
  sql += " ORDER BY submitted_at DESC";

  if (Number.isInteger(filters.limit) && filters.limit > 0) {
    sql += " LIMIT ?";
    params.push(filters.limit);
    if (Number.isInteger(filters.offset) && filters.offset >= 0) {
      sql += " OFFSET ?";
      params.push(filters.offset);
    }
  }

  const rows = sqliteDb.prepare(sql).all(...params);
  return rows.map(mapResultRow);
}

function countResultsSqlite(filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.lehrer) {
    conditions.push("LOWER(COALESCE(lehrer, '')) = LOWER(?)");
    params.push(String(filters.lehrer));
  }
  if (filters.klasse) {
    conditions.push("klasse = ?");
    params.push(String(filters.klasse));
  }
  if (filters.jahrgang) {
    conditions.push("jahrgang = ?");
    params.push(String(filters.jahrgang));
  }
  if (filters.studentId) {
    conditions.push("student_id = ?");
    params.push(String(filters.studentId));
  }
  if (filters.nameLike) {
    conditions.push("LOWER(name) LIKE LOWER(?)");
    params.push(`%${String(filters.nameLike)}%`);
  }
  if (filters.date) {
    conditions.push("submitted_at LIKE ?");
    params.push(`${String(filters.date)}%`);
  }

  let sql = "SELECT COUNT(*) AS count FROM results";
  if (conditions.length) sql += ` WHERE ${conditions.join(" AND ")}`;
  const row = sqliteDb.prepare(sql).get(...params);
  return row?.count || 0;
}

function bootstrapSqliteFromJson(filePath, initial = "[]") {
  const key = toStoreKey(filePath);
  const existing = sqliteReadStore(key);
  if (existing !== null) return;

  let data = [];
  if (fs.existsSync(filePath)) {
    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf8") || "[]");
    } catch (e) {
      console.error("Fehler beim Initialisieren aus JSON:", filePath, e);
      data = [];
    }
  } else {
    try {
      data = JSON.parse(initial || "[]");
    } catch (e) {
      data = [];
    }
  }
  sqliteWriteStore(key, data);
}

function ensureFile(filePath, initial = "[]") {
  if (USE_SQLITE) {
    bootstrapSqliteFromJson(filePath, initial);
    return;
  }
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, initial, "utf8");
}
function readJSON(filePath) {
  if (USE_SQLITE) {
    const key = toStoreKey(filePath);
    const data = sqliteReadStore(key);
    return data === null ? [] : data;
  }
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content || "[]");
  } catch (e) {
    console.error("Fehler beim Lesen:", filePath, e);
    return [];
  }
}
function writeJSON(filePath, data) {
  if (USE_SQLITE) {
    const key = toStoreKey(filePath);
    sqliteWriteStore(key, data);
    return;
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}
function normalizeName(s) {
  return (s || "").toString().trim().toLowerCase();
}
function toDateKey(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Sicherstellen, dass JSON-Dateien existieren
initSqlite();
ensureFile(RESULTS_FILE, "[]");
ensureFile(STUDENTS_FILE, "[]");
ensureFile(CLASSES_FILE, "[]");
ensureFile(TEACHERS_FILE, "[]");
bootstrapResultsTableFromJson();

// --- Aufgaben generieren ---
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function selectTasks(allTasks, count) {
  const shuffled = shuffle([...allTasks]);
  const selected = shuffled.slice(0, count);
  const tasks = {};
  selected.forEach((task, idx) => (tasks[`q${idx + 1}`] = task));
  return tasks;
}

function generateMultiplicationTasksSmall() {
  const allTasks = [];
  for (let i = 1; i <= 10; i++) {
    for (let j = 1; j <= 10; j++) {
      allTasks.push({ question: `${i} · ${j}`, solution: i * j });
    }
  }
  return selectTasks(allTasks, 100);
}

function generateDivisionTasksSmall() {
  const allTasks = [];
  for (let divisor = 1; divisor <= 10; divisor++) {
    for (let quotient = 1; quotient <= 10; quotient++) {
      const dividend = divisor * quotient;
      allTasks.push({ question: `${dividend} : ${divisor}`, solution: quotient });
    }
  }
  return selectTasks(allTasks, 100);
}

function generateMultiplicationTasksBig() {
  const allTasks = [];
  // Grundschul-tauglich: immer eine "runde" Zahl und ein einfacher Faktor
  const roundFactors = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 900];
  const easyFactors = [2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 15, 20];

  for (const r of roundFactors) {
    for (const f of easyFactors) {
      const swap = Math.random() < 0.5;
      const a = swap ? f : r;
      const b = swap ? r : f;
      allTasks.push({ question: `${a} · ${b}`, solution: r * f });
    }
  }
  return selectTasks(allTasks, 100);
}

function generateDivisionTasksBig() {
  const allTasks = [];
  const seen = new Set();
  const MAX_QUOTIENT = 999; // nie 4-stellig
  const MAX_DIVIDEND = 999; // nie 4-stellig

  function addTask(dividend, divisor) {
    if (!dividend || !divisor) return;
    if (dividend > MAX_DIVIDEND) return;
    if (dividend % divisor !== 0) return;
    const quotient = dividend / divisor;
    if (quotient > MAX_QUOTIENT) return;
    if (quotient < 2 || quotient > 250) return;
    const key = `${dividend}:${divisor}`;
    if (seen.has(key)) return;
    seen.add(key);
    allTasks.push({ question: `${dividend} : ${divisor}`, solution: quotient });
  }

  // Grundlage aus dem kleinen 1:1 (2..10), danach mit Nullen "gross" machen.
  // Idee: Wenn man die Nullen abdeckt, bleibt eine bekannte 1:1-Aufgabe.
  const baseDivisors = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  const baseQuotients = [2, 3, 4, 5, 6, 7, 8, 9, 10];

  // 1) Gleich viele Nullen bei Dividend und Divisor (z. B. 210:30 -> 21:3)
  const equalZeroFactors = [10, 100];
  for (const d of baseDivisors) {
    for (const q of baseQuotients) {
      const baseDividend = d * q;
      for (const factor of equalZeroFactors) {
        addTask(baseDividend * factor, d * factor);
      }
    }
  }

  // 2) Eine Null nur beim Dividend (z. B. 210:3 -> 21:3)
  // Dadurch entsteht der gewuenschte Mix mit 2-stelligen Ergebnissen.
  for (const d of baseDivisors) {
    for (const q of baseQuotients) {
      const baseDividend = d * q;
      addTask(baseDividend * 10, d);
    }
  }

  return selectTasks(allTasks, 100);
}

const taskGenerators = {
  mul: generateMultiplicationTasksSmall,
  div: generateDivisionTasksSmall,
  mul_big: generateMultiplicationTasksBig,
  div_big: generateDivisionTasksBig,
};

const tasksByStudent = new Map();
const TASK_TTL_MS = 2 * 60 * 60 * 1000; // 2 Stunden

function buildTaskKey(studentId, mode) {
  return `${studentId}::${mode}`;
}

function getTaskSet(mode) {
  const generator = taskGenerators[mode] || taskGenerators.mul;
  return generator();
}

function cleanupOldTasks() {
  const now = Date.now();
  for (const [key, value] of tasksByStudent.entries()) {
    if (!value || (now - value.createdAt) > TASK_TTL_MS) {
      tasksByStudent.delete(key);
    }
  }
}

// --- 🔐 Lehrer-Login / Liste ---
app.get("/api/teachers", (req, res) => {
  const teachers = readJSON(TEACHERS_FILE);
  // nur Namen zurückgeben (keine Passwörter)
  res.json(teachers.map(t => ({ lehrer: t.lehrer })));
});

app.post("/api/login", (req, res) => {
  const { lehrer, password } = req.body;
  if (!lehrer || !password) return res.status(400).json({ error: "lehrer und password erforderlich" });

  const teachers = readJSON(TEACHERS_FILE);
  const teacher = teachers.find(t => normalizeName(t.lehrer) === normalizeName(lehrer) && t.password === password);

  if (!teacher) {
    return res.status(401).json({ error: "Falscher Name oder Passwort" });
  }
  // Erfolg: gebe den originalen Lehrernamen zurück (Frontend speichert diesen z.B. in localStorage)
  res.json({ lehrer: teacher.lehrer });
});

// --- 📚 Klassen API ---
app.get("/api/classes", (req, res) => {
  // akzeptiert ?lehrer=Name (oder Header x-teacher)
  const lehrerParam = req.query.lehrer || req.headers["x-teacher"];
  const classes = readJSON(CLASSES_FILE);

  if (!lehrerParam) return res.json(classes);

  const wanted = normalizeName(lehrerParam);
  const filtered = classes.filter(c => normalizeName(c.lehrer) === wanted);
  res.json(filtered);
});

app.post("/api/classes", (req, res) => {
  const { name, lehrer, jahrgang } = req.body;
  if (!name || !jahrgang) return res.status(400).json({ error: "Klassenname und Jahrgang erforderlich" });

  let classes = readJSON(CLASSES_FILE);
  if (classes.find(c => c.name === name && String(c.jahrgang) === String(jahrgang))) {
    return res.status(400).json({ error: `Klasse ${name} im Jahrgang ${jahrgang} existiert bereits` });
  }

  classes.push({ name, lehrer: lehrer || "", jahrgang: String(jahrgang) });
  writeJSON(CLASSES_FILE, classes);
  res.json({ message: "Klasse hinzugefügt", classes });
});

app.put("/api/classes/:name/:jahrgang", (req, res) => {
  const { name, jahrgang } = req.params;
  const { lehrer } = req.body;

  let classes = readJSON(CLASSES_FILE);
  const klasse = classes.find(c => c.name === name && String(c.jahrgang) === String(jahrgang));
  if (!klasse) return res.status(404).json({ error: "Klasse nicht gefunden" });

  if (lehrer !== undefined) klasse.lehrer = lehrer;
  writeJSON(CLASSES_FILE, classes);
  res.json({ message: "Klasse aktualisiert", klasse });
});

// --- 👩‍🎓 Schüler API ---
app.get("/api/students", (req, res) => {
  // akzeptiert ?lehrer=Name, ?klasse=, ?jahrgang=
  const lehrerParam = req.query.lehrer || req.headers["x-teacher"];
  const klasse = req.query.klasse;
  const jahrgang = req.query.jahrgang;

  const students = readJSON(STUDENTS_FILE);
  const classes = readJSON(CLASSES_FILE);

  let filtered = students;

  if (lehrerParam) {
    const wanted = normalizeName(lehrerParam);
    // alle Klassennamen, die diesem Lehrer gehören
    const teacherClasses = classes.filter(c => normalizeName(c.lehrer) === wanted).map(c => c.name);
    filtered = filtered.filter(s => teacherClasses.includes(s.klasse));
  }

  if (klasse && jahrgang) {
    filtered = filtered.filter(s => s.klasse === klasse && String(s.jahrgang) === String(jahrgang));
  } else if (klasse) {
    filtered = filtered.filter(s => s.klasse === klasse);
  }

  res.json(filtered);
});

app.post("/api/students", (req, res) => {
  const { name, klasse, jahrgang, lehrjahr } = req.body;
  if (!name || !klasse || !jahrgang) return res.status(400).json({ error: "Name, Klasse und Jahrgang erforderlich" });

  const students = readJSON(STUDENTS_FILE);
  const id = Date.now().toString() + Math.floor(Math.random() * 1000).toString();
  const student = { id, name, klasse, jahrgang: String(jahrgang), lehrjahr: lehrjahr || String(jahrgang) };
  students.push(student);
  writeJSON(STUDENTS_FILE, students);

  res.json({ message: "Schüler angelegt", student });
});

app.put("/api/students/:id", (req, res) => {
  const id = req.params.id;
  const { name, lehrjahr, klasse, jahrgang } = req.body;

  const students = readJSON(STUDENTS_FILE);
  const student = students.find(s => s.id === id);

  if (!student) return res.status(404).json({ error: "Schüler nicht gefunden" });

  if (name) student.name = name;
  if (lehrjahr !== undefined) student.lehrjahr = lehrjahr;
  if (klasse !== undefined) student.klasse = klasse;
  if (jahrgang !== undefined) student.jahrgang = String(jahrgang);

  writeJSON(STUDENTS_FILE, students);

  // Bereits vorhandene Ergebnisse dieses Schülers auf aktuelle Stammdaten synchronisieren,
  // damit sie nach Klassen-/Jahrgangswechsel in der richtigen Gruppe angezeigt werden.
  const classes = readJSON(CLASSES_FILE);
  const classObj = classes.find(
    c => c.name === student.klasse && (String(c.jahrgang) === String(student.jahrgang) || !c.jahrgang)
  );
  const lehrerOfStudent = classObj ? classObj.lehrer : "";

  let updatedResults = 0;
  if (USE_SQLITE) {
    const info = sqliteDb.prepare(`
      UPDATE results
      SET
        name = ?,
        klasse = ?,
        jahrgang = ?,
        lehrjahr = ?,
        lehrer = ?
      WHERE student_id = ?
    `).run(
      student.name,
      student.klasse,
      String(student.jahrgang),
      student.lehrjahr || String(student.jahrgang),
      lehrerOfStudent,
      String(student.id)
    );
    updatedResults = info?.changes || 0;
  } else {
    const results = readJSON(RESULTS_FILE);
    results.forEach(r => {
      if (String(r.studentId) !== String(student.id)) return;
      r.name = student.name;
      r.klasse = student.klasse;
      r.jahrgang = String(student.jahrgang);
      r.lehrjahr = student.lehrjahr || String(student.jahrgang);
      r.lehrer = lehrerOfStudent;
      updatedResults++;
    });
    if (updatedResults > 0) {
      writeJSON(RESULTS_FILE, results);
    }
  }

  res.json({ message: "Schüler aktualisiert", student, updatedResults });
});


app.delete("/api/students/:id", (req, res) => {
  const id = req.params.id;
  let students = readJSON(STUDENTS_FILE);
  const initial = students.length;
  students = students.filter(s => s.id !== id);
  if (students.length === initial) return res.status(404).json({ error: "Schüler nicht gefunden" });
  writeJSON(STUDENTS_FILE, students);
  res.json({ message: "Schüler gelöscht" });
});

// --- Aufgaben API ---
app.get("/api/tasks", (req, res) => {
  const mode = (req.query.mode || "mul").toString().toLowerCase();
  const studentId = req.query.studentId;
  if (!studentId) return res.status(400).json({ error: "studentId erforderlich" });

  cleanupOldTasks();
  const tasks = getTaskSet(mode);
  tasksByStudent.set(buildTaskKey(studentId, mode), { tasks, createdAt: Date.now() });
  res.json(tasks);
});

// --- Ergebnisse absenden ---
app.post("/submit", (req, res) => {
  const { studentId, mode, answers, timeLeft } = req.body;
  if (!studentId) return res.status(400).json({ error: "studentId erforderlich" });

  const students = readJSON(STUDENTS_FILE);
  const classes = readJSON(CLASSES_FILE);
  const student = students.find(s => s.id === studentId);
  if (!student) return res.status(400).json({ error: "Ungültiger Schüler (studentId)" });

  const todayKey = toDateKey(new Date());
  let alreadyDone = false;
  if (USE_SQLITE) {
    const row = sqliteDb.prepare(`
      SELECT 1
      FROM results
      WHERE student_id = ? AND submitted_at LIKE ?
      LIMIT 1
    `).get(String(studentId), `${todayKey}%`);
    alreadyDone = Boolean(row);
  } else {
    const results = readJSON(RESULTS_FILE);
    alreadyDone = results.some(r =>
      r.studentId === studentId &&
      r.submittedAt &&
      toDateKey(r.submittedAt) === todayKey
    );
  }
  if (alreadyDone) {
    //return res.status(409).json({ error: "Für heute wurde bereits eine Prüfung abgelegt" });
  }

  const normalizedMode = (mode || "mul").toString().toLowerCase();
  cleanupOldTasks();
  const cacheKey = buildTaskKey(studentId, normalizedMode);
  const cached = tasksByStudent.get(cacheKey);
  if (!cached) {
    return res.status(409).json({ error: "Keine Aufgaben gefunden. Bitte starte die Prüfung neu." });
  }
  const taskSet = cached.tasks;
  const corrections = {};
  for (let key in taskSet) {
    const correct = taskSet[key].solution;
    const provided = answers && answers[key];
    const given = provided && typeof provided === "object" ? provided.given ?? provided : provided;
    corrections[key] = {
      question: taskSet[key].question,
      given,
      correct,
      isCorrect: Number(given) === correct,
    };
  }

  // Bestimme den Lehrer der Klasse zum Zeitpunkt der Einreichung (falls vorhanden)
  const classObj = classes.find(c => c.name === student.klasse && (String(c.jahrgang) === String(student.jahrgang) || !c.jahrgang));
  const lehrerOfStudent = classObj ? classObj.lehrer : "";

  const entry = {
    id: Date.now(),
    studentId: student.id,
    name: student.name,
    klasse: student.klasse,
    jahrgang: student.jahrgang,
    lehrjahr: student.lehrjahr || student.jahrgang,
    lehrer: lehrerOfStudent,
    mode: normalizedMode,
    answers,
    corrections,
    timeLeft,
    submittedAt: new Date().toISOString(),
  };

  tasksByStudent.delete(cacheKey);
  if (USE_SQLITE) {
    insertResultSqlite(entry);
  } else {
    const results = readJSON(RESULTS_FILE);
    results.push(entry);
    writeJSON(RESULTS_FILE, results);
  }

  res.json({ message: "Ergebnisse gespeichert", corrections });
});

// --- Ergebnisse abrufen ---
app.get("/results", (req, res) => {
  // akzeptiert ?lehrer=Name oder header x-teacher
  const lehrerParam = req.query.lehrer || req.headers["x-teacher"];
  const klasse = req.query.klasse;
  const jahrgang = req.query.jahrgang;
  const date = req.query.date;
  const search = req.query.search;
  const studentId = req.query.studentId;
  const limitRaw = req.query.limit;
  const offsetRaw = req.query.offset;
  const includeMeta = String(req.query.meta || "") === "1";

  const parsedLimit = limitRaw !== undefined ? Number.parseInt(String(limitRaw), 10) : null;
  const parsedOffset = offsetRaw !== undefined ? Number.parseInt(String(offsetRaw), 10) : 0;
  const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;
  const offset = Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

  if (USE_SQLITE) {
    const filters = {
      lehrer: lehrerParam || null,
      klasse: klasse || null,
      jahrgang: jahrgang || null,
      date: date || null,
      nameLike: search || null,
      studentId: studentId || null,
      limit,
      offset,
    };
    const rows = getResultsSqlite(filters);
    if (includeMeta) {
      const total = countResultsSqlite({ ...filters, limit: null, offset: null });
      return res.json({ data: rows, total, limit: limit || null, offset });
    }
    return res.json(rows);
  }

  let results = readJSON(RESULTS_FILE);
  if (lehrerParam) {
    const wanted = normalizeName(lehrerParam);
    results = results.filter(r => normalizeName(r.lehrer) === wanted);
  }
  if (klasse) {
    results = results.filter(r => r.klasse === klasse);
  }
  if (jahrgang) {
    results = results.filter(r => String(r.jahrgang) === String(jahrgang));
  }
  if (date) {
    results = results.filter(r => (r.submittedAt || "").startsWith(String(date)));
  }
  if (search) {
    const term = normalizeName(search);
    results = results.filter(r => normalizeName(r.name).includes(term));
  }
  if (studentId) {
    results = results.filter(r => String(r.studentId) === String(studentId));
  }
  results.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

  if (limit) {
    const paged = results.slice(offset, offset + limit);
    if (includeMeta) {
      return res.json({ data: paged, total: results.length, limit, offset });
    }
    return res.json(paged);
  }

  if (includeMeta) {
    return res.json({ data: results, total: results.length, limit: null, offset: 0 });
  }
  return res.json(results);
});

app.delete("/results/:id", (req, res) => {
  const id = req.params.id;
  if (USE_SQLITE) {
    const info = sqliteDb.prepare("DELETE FROM results WHERE id = ?").run(String(id));
    if ((info?.changes || 0) === 0) return res.status(404).json({ message: "Eintrag nicht gefunden" });
    return res.json({ message: "Eintrag gelöscht" });
  }
  let results = readJSON(RESULTS_FILE);
  const initial = results.length;
  results = results.filter(r => String(r.id) !== String(id));
  if (results.length === initial) return res.status(404).json({ message: "Eintrag nicht gefunden" });
  writeJSON(RESULTS_FILE, results);
  res.json({ message: "Eintrag gelöscht" });
});

app.delete("/results/date/:date", (req, res) => {
  const dateStr = req.params.date;
  if (USE_SQLITE) {
    sqliteDb.prepare("DELETE FROM results WHERE submitted_at LIKE ?").run(`${dateStr}%`);
    return res.json({ message: `Alle Einträge vom ${dateStr} gelöscht` });
  }
  let results = readJSON(RESULTS_FILE);
  const filtered = results.filter(r => !(r.submittedAt || "").startsWith(dateStr));
  writeJSON(RESULTS_FILE, filtered);
  res.json({ message: `Alle Einträge vom ${dateStr} gelöscht` });
});

app.delete("/results", (req, res) => {
  if (USE_SQLITE) {
    sqliteDb.prepare("DELETE FROM results").run();
    return res.json({ message: "Alle Einträge gelöscht" });
  }
  writeJSON(RESULTS_FILE, []);
  res.json({ message: "Alle Einträge gelöscht" });
});

// --- Admin-Seiten ---
/**
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin-login.html"));
});
**/
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin", "admin.html"));
});

// --- Prüfen, ob Schüler heute schon getestet wurde ---
app.get("/api/check-attempt/:studentId", (req, res) => {
  const { studentId } = req.params;
  if (!studentId) return res.status(400).json({ error: "studentId erforderlich" });

  const todayKey = toDateKey(new Date()); // nur Datum, ohne Uhrzeit (lokal)
  let alreadyDone = false;
  if (USE_SQLITE) {
    const row = sqliteDb.prepare(`
      SELECT 1
      FROM results
      WHERE student_id = ? AND submitted_at LIKE ?
      LIMIT 1
    `).get(String(studentId), `${todayKey}%`);
    alreadyDone = Boolean(row);
  } else {
    const results = readJSON(RESULTS_FILE);
    alreadyDone = results.some(r =>
      r.studentId === studentId &&
      r.submittedAt &&
      toDateKey(r.submittedAt) === todayKey
    );
  }

  res.json({ alreadyDone });
});

function shutdown() {
  if (sqliteDb) {
    try {
      sqliteDb.close();
    } catch (e) {
      console.error("Fehler beim Schließen der SQLite-DB:", e);
    }
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

app.listen(PORT, () => {
  const backendLabel = USE_SQLITE ? `sqlite (${SQLITE_DB_FILE})` : "json";
  console.log(`Server läuft auf http://localhost:${PORT} | storage=${backendLabel}`);
});
