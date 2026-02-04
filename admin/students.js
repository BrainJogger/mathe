document.addEventListener("DOMContentLoaded", () => {
  const classList = document.getElementById("classList");
  const addClassBtn = document.getElementById("addClassBtn");
  const newClassNameInput = document.getElementById("newClassName");
  const newClassTeacherInput = document.getElementById("newClassTeacher");
  const newClassYearInput = document.getElementById("newClassYear");

  let classes = [];
  let students = [];
  const openClasses = new Set();
  const openYears = new Set();


  async function loadData() {
    try {
      const [classRes, studentRes] = await Promise.all([
        fetch("/api/classes"),
        fetch("/api/students")
      ]);
      classes = classRes.ok ? await classRes.json() : [];
      students = studentRes.ok ? await studentRes.json() : [];
      renderClasses();
    } catch (err) {
      console.error(err);
      classList.innerHTML = "<p>❌ Fehler beim Laden der Daten</p>";
    }
  }

  function renderClasses() {
    classList.innerHTML = "";
    if (!classes.length) {
      classList.innerHTML = "<p>Keine Klassen vorhanden.</p>";
      return;
    }

    // --- Klassen alphabetisch sortieren ---
    const sortedClasses = [...classes].sort((a, b) => a.name.localeCompare(b.name));

    // Gruppiere Klassen nach Name
    const classesByName = {};
    sortedClasses.forEach(c => {
      if (!classesByName[c.name]) classesByName[c.name] = [];
      classesByName[c.name].push(c);
    });

    Object.keys(classesByName).forEach(klasseName => {
      const classGroupDiv = document.createElement("div");
      classGroupDiv.className = "class-group";

      const title = document.createElement("h2");
      title.className = "class-title";
      //const arrow = openClasses.has(klasseName) ? "▼" : "▶";
      title.innerHTML = `Klasse ${klasseName}`;
      classGroupDiv.appendChild(title);

      const content = document.createElement("div");
      content.className = "class-content";
      content.style.display = openClasses.has(klasseName) ? "block" : "none";

      // --- Jahrgänge alphabetisch sortieren ---
      const yearGroups = classesByName[klasseName].sort((a, b) => (a.jahrgang || "").localeCompare(b.jahrgang || ""));

      yearGroups.forEach(({ jahrgang, lehrer }) => {
        const yearKey = `${klasseName}_${jahrgang}`;

        const yearDiv = document.createElement("div");
        yearDiv.className = "year-group";

        if (!openYears.has(yearKey)) yearDiv.classList.add("collapsed");

        const yearTitle = document.createElement("h3");
        yearTitle.className = "year-title";
        yearTitle.textContent = `Jahrgang: ${jahrgang || "-"} (${lehrer || "kein Lehrer"})`;
        yearDiv.appendChild(yearTitle);

        const yearContent = document.createElement("div");
        yearContent.className = "year-content";
        yearContent.style.display = openYears.has(yearKey) ? "block" : "none";

        const ul = document.createElement("ul");


        // --- Schüler alphabetisch sortieren ---
        const studentsInYear = students
          .filter(s => s.klasse === klasseName && s.jahrgang === jahrgang)
          .sort((a, b) => a.name.localeCompare(b.name));

        studentsInYear.forEach(st => {
          const li = document.createElement("li");
          li.className = "student-card";

          const nameSpan = document.createElement("span");
          nameSpan.textContent = st.name;
          nameSpan.className = "student-name";
          li.appendChild(nameSpan);

          const btnGroup = document.createElement("div");
          btnGroup.className = "student-buttons";

          // Bearbeiten
          const editBtn = document.createElement("button");
          editBtn.textContent = "✏️";
          editBtn.title = "Namen bearbeiten";
          editBtn.className = "btn btn-warning";
          editBtn.addEventListener("click", () => {
            const input = document.createElement("input");
            input.value = st.name;
            input.style.flex = "1";
            li.replaceChild(input, nameSpan);
            input.focus();

            input.addEventListener("keydown", async (e) => {
              if (e.key === "Enter") {
                const newName = input.value.trim();
                if (!newName) return;
                await updateStudentName(st.id, newName);
              }
              if (e.key === "Escape") {
                li.replaceChild(nameSpan, input);
              }
            });

            input.addEventListener("blur", () => {
              li.replaceChild(nameSpan, input);
            });
          });
          btnGroup.appendChild(editBtn);

          // Löschen
          const delBtn = document.createElement("button");
          delBtn.textContent = "🗑";
          delBtn.className = "btn btn-danger";
          delBtn.onclick = async () => {
            if (!confirm(`Schüler ${st.name} löschen?`)) return;
            await deleteStudent(st.id);
          };
          btnGroup.appendChild(delBtn);

          li.appendChild(btnGroup);
          ul.appendChild(li);
        });

        // Neuer Schüler Input
        const studentInput = document.createElement("input");
        studentInput.placeholder = "Neuer Schülername";
        const addBtn = document.createElement("button");
        addBtn.textContent = "➕ Schüler hinzufügen";
        addBtn.className = "btn btn-success";
        addBtn.onclick = async () => {
          const name = studentInput.value.trim();
          if (!name) return;
          await addStudent(name, klasseName, jahrgang);
          studentInput.value = "";
        };
        yearContent.appendChild(ul);
        yearContent.appendChild(studentInput);
        yearContent.appendChild(addBtn);

        yearDiv.appendChild(yearContent);
        content.appendChild(yearDiv);

        yearTitle.addEventListener("click", () => {
          if (yearContent.style.display === "none") {
            yearContent.style.display = "block";
            yearDiv.classList.remove("collapsed");
            openYears.add(yearKey);
          } else {
            yearContent.style.display = "none";
            yearDiv.classList.add("collapsed");
            openYears.delete(yearKey);
          }
        });
      });

      classGroupDiv.appendChild(content);
      classList.appendChild(classGroupDiv);

      // Auf-/Zuklappen der Klasse
      title.addEventListener("click", () => {
        if (content.style.display === "none") {
          content.style.display = "block";
          openClasses.add(klasseName);
        } else {
          content.style.display = "none";
          openClasses.delete(klasseName);
        }
      });
    });
  }

  async function addClass(name) {
    const teacher = newClassTeacherInput.value.trim();
    const year = newClassYearInput.value.trim();
    try {
      await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, lehrer: teacher, jahrgang: year })
      });
      await loadData();
    } catch (err) {
      console.error("Fehler beim Anlegen der Klasse", err);
    }
  }

  async function addStudent(name, klasse, jahrgang) {
    try {
      await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, klasse, jahrgang })
      });
      await loadData();
    } catch (err) {
      console.error("Fehler beim Anlegen des Schülers", err);
    }
  }

  async function updateStudentName(id, newName) {
    try {
      await fetch(`/api/students/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName })
      });
      await loadData();
    } catch (err) {
      console.error("Fehler beim Aktualisieren des Namens", err);
    }
  }

  async function deleteStudent(id) {
    try {
      await fetch(`/api/students/${id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      console.error("Fehler beim Löschen des Schülers", err);
    }
  }

  addClassBtn.addEventListener("click", () => {
    const name = newClassNameInput.value.trim();
    if (!name) return;
    addClass(name);
    newClassNameInput.value = "";
    newClassTeacherInput.value = "";
    newClassYearInput.value = "";
  });

  loadData();
});
