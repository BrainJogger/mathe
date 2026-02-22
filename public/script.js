// public/script.js
document.addEventListener("DOMContentLoaded", () => {
  // --- Config ---
  const TOTAL_SECONDS = 600; // 10 Minuten
  const pageSize = 20;

  // --- State ---
  let timerInterval = null;
  let timeLeft = TOTAL_SECONDS;
  let tasks = {};
  let currentPage = 0;
  let answersCache = {};
  let selectedStudent = null; // { id, name, klasse, jahrgang, lehrer }

  // --- Elements ---
  const startBox = document.getElementById("start");
  const classSelect = document.getElementById("selectClass");
  const yearSelect = document.getElementById("selectYear");
  const studentSelect = document.getElementById("selectStudent");
  const startBtn = document.getElementById("startBtn");

  const testDiv = document.getElementById("test");
  const timerEl = document.getElementById("timer");
  const tasksContainer = document.getElementById("taskContainer");
  const paginationDiv = document.getElementById("pagination");
  const submitBtn = document.getElementById("submitBtn");

  const resultDiv = document.getElementById("result");
  const timerResultEl = document.getElementById("timerResult");
  const scoreEl = document.getElementById("score");
  const correctionsContainer = document.getElementById("corrections");
  const restartBtn = document.getElementById("restartBtn");

  const pageIndicator = document.getElementById("pageIndicator");

  let startTime = null;

  // --- Utility ---
  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  // --- Timer ---
  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timeLeft = TOTAL_SECONDS;
    timerEl.textContent = `⏱ Zeit: ${formatTime(timeLeft)}`;

    timerInterval = setInterval(() => {
      timeLeft--;
      timerEl.textContent = `⏱ Zeit: ${formatTime(timeLeft)}`;
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        submitAnswers();
      }
    }, 1000);
  }

  // --- Klassen & Schüler laden ---
  async function loadClasses() {
    try {
      const res = await fetch("/api/classes");
      const classes = res.ok ? await res.json() : [];
      classSelect.innerHTML = `<option value="">Wähle Klasse</option>`;
      yearSelect.innerHTML = `<option value="">Wähle Jahrgang</option>`;
      studentSelect.innerHTML = `<option value="">Wähle Schüler</option>`;
      yearSelect.disabled = true;
      studentSelect.disabled = true;

      // Nur eindeutige Klassennamen (z. B. A, B, C ...)
      const uniqueClasses = [...new Set(classes.map(c => c.name))].sort();
      uniqueClasses.forEach(cn => {
        const opt = document.createElement("option");
        opt.value = cn;
        opt.textContent = cn;
        classSelect.appendChild(opt);
      });

      // Speichern für spätere Nutzung
      window.allClasses = classes;
    } catch (e) {
      console.error("Fehler beim Laden der Klassen", e);
    }
  }

  // --- Jahrgänge für Klasse laden ---
  function loadYearsForClass(klasse) {
    yearSelect.innerHTML = `<option value="">Wähle Jahrgang</option>`;
    studentSelect.innerHTML = `<option value="">Wähle Schüler</option>`;
    studentSelect.disabled = true;

    const years = window.allClasses
      .filter(c => c.name === klasse)
      .map(c => c.jahrgang)
      .filter(y => y && y.trim() !== "");

    const uniqueYears = [...new Set(years)].sort();
    uniqueYears.forEach(y => {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    });

    yearSelect.disabled = uniqueYears.length === 0;
  }

  // --- Schüler für Klasse + Jahrgang laden ---
  async function loadStudents(klasse, jahrgang) {
    try {
      const res = await fetch(`/api/students?klasse=${encodeURIComponent(klasse)}&jahrgang=${encodeURIComponent(jahrgang)}`);
      const students = res.ok ? await res.json() : [];
      studentSelect.innerHTML = `<option value="">Wähle Schüler</option>`;
      students.sort((a, b) => a.name.localeCompare(b.name));
      students.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name;
        studentSelect.appendChild(opt);
      });
      studentSelect.disabled = students.length === 0;
    } catch (e) {
      console.error("Fehler beim Laden der Schüler", e);
    }
  }

  // --- Aufgaben laden & rendern ---
  async function loadTasks() {
    try {
      const res = await fetch("/api/tasks");
      if (!res.ok) throw new Error("Fehler beim Laden der Aufgaben");
      tasks = await res.json();
      renderPage(0);
    } catch (err) {
      console.error(err);
      alert("Konnte Aufgaben nicht laden.");
    }
  }

  function renderPage(page) {
    currentPage = page;
    tasksContainer.innerHTML = "";

    const keys = Object.keys(tasks);
    const start = page * pageSize;
    const end = Math.min(start + pageSize, keys.length);

    for (let i = start; i < end; i++) {
      const key = keys[i];
      const task = tasks[key];

      const wrapper = document.createElement("div");
      wrapper.className = "task";

      const label = document.createElement("label");
      label.textContent = `${task.question} =`;

      const input = document.createElement("input");
      input.type = "number";
      input.id = key;
      if (answersCache.hasOwnProperty(key)) input.value = answersCache[key];

      input.addEventListener("input", (e) => {
        answersCache[key] = e.target.value;
        renderPagination(Object.keys(tasks).length); // Status neu berechnen
      });

      wrapper.appendChild(label);
      wrapper.appendChild(input);
      tasksContainer.appendChild(wrapper);
    }

    renderPagination(Object.keys(tasks).length);
  }


  function renderPagination(total) {
    paginationDiv.innerHTML = "";
    const totalPages = Math.ceil(total / pageSize);
    const keys = Object.keys(tasks);

    pageIndicator.textContent = `Seite ${currentPage + 1} von ${totalPages}`;

    for (let i = 0; i < totalPages; i++) {
      const btn = document.createElement("button");
      btn.textContent = (i + 1).toString();

      const start = i * pageSize;
      const end = Math.min(start + pageSize, keys.length);

      let allAnswered = true;

      for (let j = start; j < end; j++) {
        const key = keys[j];
        const value = answersCache[key];
        if (!value || value === "") {
          allAnswered = false;
          break;
        }
      }

      // Farbstatus setzen
      if (i === currentPage) {
        btn.classList.add("page-active");
      } else if (allAnswered) {
        btn.classList.add("page-complete");
      } else {
        btn.classList.add("page-incomplete");
      }

      btn.addEventListener("click", () => renderPage(i));
      paginationDiv.appendChild(btn);
    }
  }

  // --- Antworten absenden ---
  async function submitAnswers() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    // ⭐ BENÖTIGTE ZEIT BERECHNEN
    const endTime = Date.now();
    let durationSeconds = 0;

    if (startTime) {
      durationSeconds = Math.floor((endTime - startTime) / 1000);
    }

    const durationFormatted = formatTime(durationSeconds);

    if (!selectedStudent) {
      alert("Kein Schüler ausgewählt.");
      return;
    }

    const structuredAnswers = {};
    const keys = Object.keys(tasks);
    let correctCount = 0;

    keys.forEach((key) => {
      const inputVal = answersCache[key] || document.getElementById(key)?.value || "";
      const correct = tasks[key].solution.toString();
      const isCorrect = inputVal === correct;
      if (isCorrect) correctCount++;
      structuredAnswers[key] = {
        question: tasks[key].question,
        given: inputVal,
        correct,
        isCorrect
      };
    });

    try {
      const payload = { studentId: selectedStudent.id, answers: structuredAnswers, timeLeft };
      const res = await fetch("/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err && err.error ? err.error : "Fehler beim Absenden");
      }

      // Ergebnisse anzeigen
      testDiv.style.display = "none";
      resultDiv.style.display = "block";
      timerResultEl.innerHTML = `
      🕒
      Benötigte Zeit: <strong>${durationFormatted}</strong>
      `;

      correctionsContainer.innerHTML = "";
      keys.forEach((k, idx) => {
        const a = structuredAnswers[k];
        const wrapper = document.createElement("div");
        wrapper.className = "task";
        if (a.isCorrect) {
          wrapper.innerHTML = `<strong>${a.question}</strong><br><span class="correct"><br>✅ ${a.given}</span>`;
        } else {
          wrapper.innerHTML = `<strong>${a.question}</strong><br><span class="incorrect">❌ Deine Antwort: ${a.given}<br><br>Richtig: ${a.correct}</span>`;
        }
        correctionsContainer.appendChild(wrapper);
      });

      // Score + Nachricht
      scoreEl.innerHTML = `<h3>Du hast <span class="correct">${correctCount}</span> von ${keys.length} Aufgaben richtig! 🎉</h3>`;

      // Prominente Nachricht basierend auf Punktzahl
      let message = "";
      if (correctCount < 50) {
        message = "Übe weiterhin fleißig alle Einmaleinsreihen!";
      } else if (correctCount === 50) {
        message = "Toll, du kannst schon die Hälfte aller Aufgaben!";
      } else if (correctCount > 50 && correctCount < 70) {
        message = "Übe fleißig weiter!";
      } else if (correctCount >= 90 && correctCount < 95) {
        message = "Übe weiter, dann schaffst du bald die 100 Punkte!";
      } else if (correctCount >= 95 && correctCount < 100) {
        message = "Super! Weiter so!";
      } else if (correctCount === 100) {
        if (selectedStudent.lehrer) {
          message = `Unglaublich! Du bist ein Einmaleins-Profi! ${selectedStudent.lehrer} ist stolz auf dich!`;
        } else {
          message = "Unglaublich! Du bist ein Einmaleins-Profi! Dein Lehrer ist stolz auf dich!";
        }
      }

      if (message) {
        const msgEl = document.createElement("div");
        msgEl.style.marginTop = "20px";
        msgEl.style.padding = "15px";
        msgEl.style.fontSize = "1.4rem";
        msgEl.style.fontWeight = "bold";
        msgEl.style.color = "#fff";
        msgEl.style.background = "#4a90e2";
        msgEl.style.borderRadius = "12px";
        msgEl.textContent = message;
        scoreEl.appendChild(msgEl);
      }

    } catch (err) {
      console.error(err);
      alert("Fehler beim Absenden: " + err.message);
    }
  }

  // --- Events ---
  classSelect.addEventListener("change", () => {
    const klasse = classSelect.value;
    if (klasse) {
      loadYearsForClass(klasse);
    } else {
      yearSelect.innerHTML = `<option value="">Wähle Jahrgang</option>`;
      yearSelect.disabled = true;
      studentSelect.innerHTML = `<option value="">Wähle Schüler</option>`;
      studentSelect.disabled = true;
    }
  });

  yearSelect.addEventListener("change", () => {
    const klasse = classSelect.value;
    const jahrgang = yearSelect.value;
    if (klasse && jahrgang) {
      loadStudents(klasse, jahrgang);
    } else {
      studentSelect.innerHTML = `<option value="">Wähle Schüler</option>`;
      studentSelect.disabled = true;
    }
  });

  startBtn.addEventListener("click", async () => {
    const studentId = studentSelect.value;
    if (!studentId) return alert("Bitte Klasse, Jahrgang und Schüler auswählen.");

    try {
      const res = await fetch(`/api/students?klasse=${encodeURIComponent(classSelect.value)}&jahrgang=${encodeURIComponent(yearSelect.value)}`);
      const students = res.ok ? await res.json() : [];
      selectedStudent = students.find(s => s.id === studentId);
      if (selectedStudent) {
        const classInfo = window.allClasses.find(c => c.name === classSelect.value && c.jahrgang === yearSelect.value);
        selectedStudent.lehrer = classInfo?.lehrer || "";
      }
    } catch (e) {
      console.error(e);
    }

    if (!selectedStudent) {
      alert("Schüler nicht gefunden.");
      return;
    }

    // --- NEUE ABFRAGE ---
    const isCorrect = confirm(`Bist du sicher, dass du ${selectedStudent.name} bist?`);
    if (!isCorrect) return;

    await loadTasks();

    startTime = Date.now(); // ⭐ STARTZEIT SPEICHERN

    startBox.style.display = "none";
    testDiv.style.display = "block";
    startTimer();
  });


  submitBtn.addEventListener("click", () => {
    if (!confirm("Antworten jetzt absenden?")) return;
    submitAnswers();
  });

  restartBtn?.addEventListener("click", () => {
    resultDiv.style.display = "none";
    startBox.style.display = "block";
    answersCache = {};
    selectedStudent = null;
    loadClasses();
  });

  window.addEventListener("beforeunload", () => {
    if (timerInterval) clearInterval(timerInterval);
  });

  // initial
  loadClasses();
});
