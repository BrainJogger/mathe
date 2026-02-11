// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");

const app = express();
const PORT = 3001;

const RESULTS_FILE = path.join(__dirname, "results.json");
const STUDENTS_FILE = path.join(__dirname, "students.json");
const CLASSES_FILE = path.join(__dirname, "classes.json");
const TEACHERS_FILE = path.join(__dirname, "teachers.json");

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/admin", express.static(path.join(__dirname, "admin")));

// --- Hilfsfunktionen ---
function ensureFile(filePath, initial = "[]") {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, initial, "utf8");
}
function readJSON(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content || "[]");
  } catch (e) {
    console.error("Fehler beim Lesen:", filePath, e);
    return [];
  }
}
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}
function normalizeName(s) {
  return (s || "").toString().trim().toLowerCase();
}

// Sicherstellen, dass JSON-Dateien existieren
ensureFile(RESULTS_FILE, "[]");
ensureFile(STUDENTS_FILE, "[]");
ensureFile(CLASSES_FILE, "[]");
ensureFile(TEACHERS_FILE, "[]");

// --- Aufgaben generieren ---
function generateTasks() {
  const allTasks = [];
  for (let i = 1; i <= 10; i++) {
    for (let j = 1; j <= 10; j++) {
      allTasks.push({ question: `${i} ⋅ ${j}`, solution: i * j });
    }
  }
  allTasks.sort(() => 0.5 - Math.random());
  const selected = allTasks.slice(0, 100);
  const tasks = {};
  selected.forEach((task, idx) => (tasks[`q${idx + 1}`] = task));
  return tasks;
}
const tasks = generateTasks();

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
  res.json({ message: "Schüler aktualisiert", student });
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
  res.json(tasks);
});

// --- Ergebnisse absenden ---
app.post("/submit", (req, res) => {
  const { studentId, answers, timeLeft } = req.body;
  if (!studentId) return res.status(400).json({ error: "studentId erforderlich" });

  const students = readJSON(STUDENTS_FILE);
  const classes = readJSON(CLASSES_FILE);
  const student = students.find(s => s.id === studentId);
  if (!student) return res.status(400).json({ error: "Ungültiger Schüler (studentId)" });

  const corrections = {};
  for (let key in tasks) {
    const correct = tasks[key].solution;
    const provided = answers && answers[key];
    const given = provided && typeof provided === "object" ? provided.given ?? provided : provided;
    corrections[key] = {
      question: tasks[key].question,
      given,
      correct,
      isCorrect: Number(given) === correct,
    };
  }

  // Bestimme den Lehrer der Klasse zum Zeitpunkt der Einreichung (falls vorhanden)
  const classObj = classes.find(c => c.name === student.klasse && (String(c.jahrgang) === String(student.jahrgang) || !c.jahrgang));
  const lehrerOfStudent = classObj ? classObj.lehrer : "";

  let results = readJSON(RESULTS_FILE);
  const entry = {
    id: Date.now(),
    studentId: student.id,
    name: student.name,
    klasse: student.klasse,
    jahrgang: student.jahrgang,
    lehrjahr: student.lehrjahr || student.jahrgang,
    lehrer: lehrerOfStudent,
    answers,
    corrections,
    timeLeft,
    submittedAt: new Date().toISOString(),
  };

  results.push(entry);
  writeJSON(RESULTS_FILE, results);

  res.json({ message: "Ergebnisse gespeichert", corrections });
});

// --- Ergebnisse abrufen ---
app.get("/results", (req, res) => {
  // akzeptiert ?lehrer=Name oder header x-teacher
  const lehrerParam = req.query.lehrer || req.headers["x-teacher"];
  const results = readJSON(RESULTS_FILE);

  if (!lehrerParam) return res.json(results);

  const wanted = normalizeName(lehrerParam);
  const filtered = results.filter(r => normalizeName(r.lehrer) === wanted);
  res.json(filtered);
});

app.delete("/results/:id", (req, res) => {
  const id = req.params.id;
  let results = readJSON(RESULTS_FILE);
  const initial = results.length;
  results = results.filter(r => String(r.id) !== String(id));
  if (results.length === initial) return res.status(404).json({ message: "Eintrag nicht gefunden" });
  writeJSON(RESULTS_FILE, results);
  res.json({ message: "Eintrag gelöscht" });
});

app.delete("/results/date/:date", (req, res) => {
  const dateStr = req.params.date;
  let results = readJSON(RESULTS_FILE);
  const filtered = results.filter(r => !(r.submittedAt || "").startsWith(dateStr));
  writeJSON(RESULTS_FILE, filtered);
  res.json({ message: `Alle Einträge vom ${dateStr} gelöscht` });
});

app.delete("/results", (req, res) => {
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

app.listen(PORT, () => console.log(`Server läuft auf http://localhost:${PORT}`));
