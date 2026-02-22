document.addEventListener("DOMContentLoaded", () => {

  const classList = document.getElementById("classList");
  const addClassBtn = document.getElementById("addClassBtn");
  const newClassName = document.getElementById("newClassName");
  const newClassYear = document.getElementById("newClassYear");
  const newClassTeacher = document.getElementById("newClassTeacher");

  let classes = [];
  let students = [];

  const openClasses = new Set();
  const openYears = new Set();

  async function loadData() {
    const [c, s] = await Promise.all([
      fetch("/api/classes"),
      fetch("/api/students")
    ]);
    classes = await c.json();
    students = await s.json();
    render();
  }

  function render() {
    classList.innerHTML = "";

    const grouped = {};
    classes.forEach(c => {
      if (!grouped[c.name]) grouped[c.name] = [];
      grouped[c.name].push(c);
    });

    Object.keys(grouped).sort().forEach(klasse => {
      const wrap = document.createElement("div");
      wrap.className = "class-group";

      const title = document.createElement("h2");
      title.textContent = "▶ Klasse " + klasse;
      wrap.appendChild(title);

      const content = document.createElement("div");
      content.style.display = openClasses.has(klasse) ? "block" : "none";

      title.onclick = () => {
        if (content.style.display === "none") {
          content.style.display = "block";
          openClasses.add(klasse);
        } else {
          content.style.display = "none";
          openClasses.delete(klasse);
        }
      };

      grouped[klasse].forEach(c => {
        const yearKey = klasse + "-" + c.jahrgang;

        const yearBox = document.createElement("div");
        yearBox.className = "year-group";

        const yearTitle = document.createElement("h3");
        yearTitle.textContent = "▶ Jahrgang " + c.jahrgang;
        yearBox.appendChild(yearTitle);

        const yearContent = document.createElement("div");
        yearContent.style.display = openYears.has(yearKey) ? "block" : "none";

        yearTitle.onclick = () => {
          if (yearContent.style.display === "none") {
            yearContent.style.display = "block";
            openYears.add(yearKey);
          } else {
            yearContent.style.display = "none";
            openYears.delete(yearKey);
          }
        };

        // Hinweis für Bulk-Buttons
        const hint = document.createElement("div");
        hint.textContent = "Aktionen beziehen sich auf die markierten Schüler:";
        hint.style.fontStyle = "italic";
        hint.style.marginBottom = "5px";
        yearContent.appendChild(hint);

        const ul = document.createElement("ul");

        const list = students
          .filter(s => s.klasse === klasse && s.jahrgang === c.jahrgang)
          .sort((a, b) => a.name.localeCompare(b.name));

        list.forEach(st => {
          const li = document.createElement("li");
          li.className = "student-card";

          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.dataset.id = st.id;
          li.appendChild(cb);

          const span = document.createElement("span");
          span.textContent = st.name;
          span.style.flex = "1";
          li.appendChild(span);

          const btns = document.createElement("div");

          // ✏️ Bearbeiten
          const edit = document.createElement("button");
          edit.textContent = "✏️";
          edit.className = "btn btn-warning";
          edit.onclick = () => {
            const input = document.createElement("input");
            input.value = st.name;
            li.replaceChild(input, span);
            input.focus();

            input.onkeydown = async e => {
              if (e.key === "Enter") {
                await fetch("/api/students/" + st.id, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: input.value })
                });
                loadData();
              }
              if (e.key === "Escape") li.replaceChild(span, input);
            };

            input.onblur = () => li.replaceChild(span, input);
          };

          // 🗑 Löschen einzelner Schüler
          const del = document.createElement("button");
          del.textContent = "🗑";
          del.className = "btn btn-danger";
          del.onclick = async () => {
            if (!confirm(st.name + " löschen?")) return;
            await fetch("/api/students/" + st.id, { method: "DELETE" });
            loadData();
          };

          btns.appendChild(edit);
          btns.appendChild(del);
          li.appendChild(btns);
          ul.appendChild(li);
        });

        // Bulk-Buttons
        const selectAll = document.createElement("button");
        selectAll.textContent = "☑ Alle";
        selectAll.className = "btn btn-all";

        let allSelected = false;
        selectAll.onclick = () => {
          const checkboxes = yearContent.querySelectorAll("input[type=checkbox]");
          allSelected = !allSelected;
          checkboxes.forEach(c => c.checked = allSelected);
        };

        const bulkMoveBtn = document.createElement("button");
        bulkMoveBtn.textContent = "📦 Verschieben";
        bulkMoveBtn.className = "btn btn-success";
        bulkMoveBtn.onclick = () => bulkMove(yearContent);

        const bulkDelBtn = document.createElement("button");
        bulkDelBtn.textContent = "🗑 Löschen";
        bulkDelBtn.className = "btn btn-danger";
        bulkDelBtn.onclick = async () => {
          const checked = [...yearContent.querySelectorAll("input[type=checkbox]:checked")];
          if (!checked.length) return alert("Keine Schüler ausgewählt");
          if (!confirm("Ausgewählte Schüler wirklich löschen?")) return;

          for (const cb of checked) {
            const id = cb.dataset.id;
            await fetch("/api/students/" + id, { method: "DELETE" });
          }

          loadData();
        };

        yearContent.appendChild(selectAll);
        yearContent.appendChild(bulkMoveBtn);
        yearContent.appendChild(bulkDelBtn);
        yearContent.appendChild(ul);

        // Neuer Schüler
        const inp = document.createElement("input");
        inp.placeholder = "Neuer Schüler";

        const add = document.createElement("button");
        add.textContent = "➕";
        add.className = "btn";
        add.onclick = async () => {
          if (!inp.value.trim()) return;
          await fetch("/api/students", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: inp.value, klasse, jahrgang: c.jahrgang })
          });
          inp.value = "";
          loadData();
        };

        yearContent.appendChild(inp);
        yearContent.appendChild(add);

        yearBox.appendChild(yearContent);
        content.appendChild(yearBox);
      });

      wrap.appendChild(content);
      classList.appendChild(wrap);
    });
  }

  // -----------------------
  // Bulk Move mit Dropdown Pop-Up
  // -----------------------
  async function bulkMove(yearContent) {
    const checked = [...yearContent.querySelectorAll("input[type=checkbox]:checked")];
    if (!checked.length) return alert("Keine Schüler ausgewählt");

    const ids = checked.map(c => c.dataset.id);

    // Popup erzeugen
    const modal = document.createElement("div");
    modal.style.position = "fixed";
    modal.style.top = 0;
    modal.style.left = 0;
    modal.style.width = "100%";
    modal.style.height = "100%";
    modal.style.background = "rgba(0,0,0,0.5)";
    modal.style.display = "flex";
    modal.style.justifyContent = "center";
    modal.style.alignItems = "center";
    modal.style.zIndex = 9999;

    const box = document.createElement("div");
    box.style.background = "#fff";
    box.style.padding = "20px";
    box.style.borderRadius = "10px";
    box.style.minWidth = "250px";

    const labelClass = document.createElement("label");
    labelClass.textContent = "Neue Klasse:";
    const selectClass = document.createElement("select");
    selectClass.style.width = "100%";
    selectClass.style.marginBottom = "10px";

    const uniqueClasses = [...new Set(classes.map(c => c.name))].sort();
    uniqueClasses.forEach(k => {
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = k;
      selectClass.appendChild(opt);
    });

    const labelYear = document.createElement("label");
    labelYear.textContent = "Neuer Jahrgang:";
    const selectYear = document.createElement("select");
    selectYear.style.width = "100%";
    selectYear.style.marginBottom = "10px";

    const uniqueYears = [...new Set(classes.map(c => c.jahrgang))].sort();
    uniqueYears.forEach(y => {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      selectYear.appendChild(opt);
    });

    const okBtn = document.createElement("button");
    okBtn.textContent = "✔ Verschieben";
    okBtn.className = "btn btn-success";
    okBtn.style.marginRight = "10px";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "❌ Abbrechen";
    cancelBtn.className = "btn btn-danger";

    box.appendChild(labelClass);
    box.appendChild(selectClass);
    box.appendChild(labelYear);
    box.appendChild(selectYear);
    box.appendChild(okBtn);
    box.appendChild(cancelBtn);
    modal.appendChild(box);
    document.body.appendChild(modal);

    cancelBtn.onclick = () => document.body.removeChild(modal);

    okBtn.onclick = async () => {
      const targetClass = selectClass.value;
      const targetYear = selectYear.value;
      if (!targetClass || !targetYear) return alert("Klasse und Jahrgang erforderlich");

      if (!confirm(ids.length + " Schüler verschieben?")) return;

      for (const id of ids) {
        await fetch("/api/students/" + id, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ klasse: targetClass, jahrgang: targetYear })
        });
      }

      document.body.removeChild(modal);
      loadData();
    };
  }

  addClassBtn.onclick = async () => {
    if (!newClassName.value || !newClassYear.value) return;

    await fetch("/api/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newClassName.value,
        jahrgang: newClassYear.value,
        lehrer: newClassTeacher.value
      })
    });

    newClassName.value = "";
    newClassYear.value = "";
    newClassTeacher.value = "";
    loadData();
  };

  loadData();
});
