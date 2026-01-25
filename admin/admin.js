document.addEventListener("DOMContentLoaded", () => {
  const resultsContainer = document.getElementById("resultsContainer");
  const searchInput = document.getElementById("searchInput");
  const classFilter = document.getElementById("classFilter");
  const dateFilter = document.getElementById("dateFilter");
  const groupingSelect = document.getElementById("groupingSelect");
  const clearFilter = document.getElementById("clearFilter");

  let results = [];
  let classes = [];

  async function loadData() {
    try {
      const [clsRes, resultsRes] = await Promise.all([
        fetch("/api/classes"),
        fetch("/results")
      ]);
      classes = clsRes.ok ? await clsRes.json() : [];
      results = resultsRes.ok ? await resultsRes.json() : [];
      populateClassFilter(classes);
      renderResults();
    } catch (err) {
      console.error("Fehler beim Laden:", err);
      resultsContainer.innerHTML = "<p>Fehler beim Laden der Daten</p>";
    }
  }

  function populateClassFilter(list) {
    const classNames = [...new Set(list.map(r => r.name))];
    classFilter.innerHTML = '<option value="">Alle Klassen</option>';
    classNames.sort().forEach(cls => {
      const option = document.createElement("option");
      option.value = cls;
      option.textContent = cls;
      classFilter.appendChild(option);
    });
  }

  function renderResults() {
    resultsContainer.innerHTML = "";

    let filteredResults = [...results];
    if (searchInput.value) {
      filteredResults = filteredResults.filter(r =>
        r.name.toLowerCase().includes(searchInput.value.toLowerCase())
      );
    }
    if (classFilter.value) {
      filteredResults = filteredResults.filter(r => r.klasse === classFilter.value);
    }
    if (dateFilter.value) {
      filteredResults = filteredResults.filter(r => r.submittedAt.startsWith(dateFilter.value));
    }

    const groupBy = groupingSelect.value;

    // Gruppieren
    const grouped = {};
    filteredResults.forEach(r => {
      const cls = r.klasse;
      const year = r.jahrgang;
      const date = r.submittedAt.split("T")[0];
      const student = r.name;

      if (!grouped[cls]) grouped[cls] = {};
      if (!grouped[cls][year]) grouped[cls][year] = {};

      if (groupBy === "date") {
        if (!grouped[cls][year][date]) grouped[cls][year][date] = {};
        if (!grouped[cls][year][date][student]) grouped[cls][year][date][student] = [];
        grouped[cls][year][date][student].push(r);
      } else {
        if (!grouped[cls][year][student]) grouped[cls][year][student] = {};
        if (!grouped[cls][year][student][date]) grouped[cls][year][student][date] = [];
        grouped[cls][year][student][date].push(r);
      }
    });

    // Klassen
    Object.keys(grouped).sort().forEach(cls => {
      const clsGroup = document.createElement("div");
      clsGroup.className = "class-group";

      const clsTitle = document.createElement("h3");
      clsTitle.className = "class-title";
      clsTitle.textContent = `Klasse ${cls}`;
      clsGroup.appendChild(clsTitle);

      const clsContent = document.createElement("div");
      clsContent.className = "class-content";
      clsContent.style.display = "none";

      // Jahrgänge
      Object.keys(grouped[cls]).sort().forEach(year => {
        const yearGroup = document.createElement("div");
        yearGroup.className = "year-group";

        const yearTitle = document.createElement("h4");
        yearTitle.className = "class-title";
        yearTitle.textContent = `Jahrgang ${year}`;

        // Button: Jahrgang löschen
        const yearDeleteBtn = document.createElement("button");
        yearDeleteBtn.className = "btn btn-danger";
        yearDeleteBtn.textContent = `🗑 Ergebnisse Klasse ${cls}, Jahrgang ${year} löschen`;
        yearDeleteBtn.style.marginLeft = "10px";
        yearTitle.appendChild(yearDeleteBtn);

        yearDeleteBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!confirm(`Möchtest du wirklich alle Ergebnisse der Klasse ${cls} im Jahrgang ${year} löschen?`)) return;
          try {
            let allResults = [];
            Object.values(grouped[cls][year]).forEach(dateOrStudentObj => {
              if (Array.isArray(dateOrStudentObj)) {
                allResults.push(...dateOrStudentObj);
              } else if (typeof dateOrStudentObj === "object") {
                allResults.push(...Object.values(dateOrStudentObj).flat());
              }
            });
            for (const result of allResults) {
              await fetch(`/results/${result.id}`, { method: "DELETE" });
            }
            results = results.filter(r => !(r.klasse === cls && r.jahrgang === year));
            renderResults();
          } catch (err) {
            console.error("Fehler beim Löschen:", err);
            alert("Löschen fehlgeschlagen");
          }
        });

        yearGroup.appendChild(yearTitle);

        const yearContent = document.createElement("div");
        yearContent.style.display = "none";

        if (groupBy === "date") {
          Object.keys(grouped[cls][year]).sort().forEach(date => {
            const dateGroup = document.createElement("div");
            dateGroup.className = "date-group";

            const dateTitle = document.createElement("h5");
            dateTitle.className = "class-title";
            dateTitle.textContent = `Datum: ${date}`;
            dateTitle.style.display = "flex";
            dateTitle.style.justifyContent = "space-between";
            dateTitle.style.alignItems = "center";

            // Buttons Datumsebene
            const dateDownloadBtn = document.createElement("button");
            dateDownloadBtn.className = "btn export-btn";
            dateDownloadBtn.textContent = "📄 PDF";

            const dateDownloadSummaryBtn = document.createElement("button");
            dateDownloadSummaryBtn.className = "btn export-btn";
            dateDownloadSummaryBtn.textContent = "📊 Übersicht PDF";

            const dateDeleteBtn = document.createElement("button");
            dateDeleteBtn.className = "btn btn-danger";
            dateDeleteBtn.textContent = "🗑 Alle löschen";

            const buttonContainer = document.createElement("div");
            buttonContainer.style.display = "flex";
            buttonContainer.style.gap = "5px";
            buttonContainer.appendChild(dateDownloadBtn);
            buttonContainer.appendChild(dateDownloadSummaryBtn);
            buttonContainer.appendChild(dateDeleteBtn);
            dateTitle.appendChild(buttonContainer);

            const dateContent = document.createElement("div");
            dateContent.style.display = "none";

            Object.keys(grouped[cls][year][date]).sort().forEach(studentName => {
              appendStudentCard(dateContent, grouped[cls][year][date][studentName], studentName, date);
            });

            // PDF Export Datum
            dateDownloadBtn.addEventListener("click", e => {
              e.stopPropagation();
              exportDatePDF(grouped[cls][year][date], cls, year, date);
            });
            dateDownloadSummaryBtn.addEventListener("click", e => {
              e.stopPropagation();
              exportDateSummaryPDF(grouped[cls][year][date], cls, year, date);
            });

            // Löschen Datum
            // Löschen aller Ergebnisse für dieses Datum
            dateDeleteBtn.addEventListener("click", async e => {
              e.stopPropagation();
              if (!confirm(`Möchtest du wirklich alle Ergebnisse der Klasse ${cls}, Jahrgang ${year} am ${date} löschen?`)) return;
              try {
                // grouped[cls][year][date] ist ein Objekt { studentName: [result,...], ... }
                const studentResultsObj = grouped[cls][year][date];
                for (const studentName in studentResultsObj) {
                  const studentResults = studentResultsObj[studentName];
                  if (Array.isArray(studentResults)) {
                    for (const result of studentResults) {
                      await fetch(`/results/${result.id}`, { method: "DELETE" });
                    }
                  }
                }

                // Filtere die globale results-Liste
                results = results.filter(r => !(r.klasse === cls && r.jahrgang === year && r.submittedAt.startsWith(date)));
                renderResults();
              } catch (err) {
                console.error("Fehler beim Löschen:", err);
                alert("Löschen fehlgeschlagen");
              }
            });


            dateGroup.appendChild(dateTitle);
            dateGroup.appendChild(dateContent);
            dateTitle.style.cursor = "pointer";
            dateTitle.addEventListener("click", () => {
              dateContent.style.display = dateContent.style.display === "none" ? "grid" : "none";
            });

            yearContent.appendChild(dateGroup);
          });
        } else {
          Object.keys(grouped[cls][year]).sort().forEach(studentName => {
            const studentGroupContainer = document.createElement("div");
            studentGroupContainer.className = "student-name-group";

            const studentTitle = document.createElement("h5");
            studentTitle.textContent = studentName;
            studentTitle.style.cursor = "pointer";
            studentGroupContainer.appendChild(studentTitle);

            const studentDatesContainer = document.createElement("div");
            studentDatesContainer.style.display = "none";

            Object.keys(grouped[cls][year][studentName]).sort().forEach(date => {
              appendStudentCard(studentDatesContainer, grouped[cls][year][studentName][date], studentName, date);
            });

            studentTitle.addEventListener("click", () => {
              studentDatesContainer.style.display = studentDatesContainer.style.display === "none" ? "grid" : "none";
            });

            studentGroupContainer.appendChild(studentDatesContainer);
            yearContent.appendChild(studentGroupContainer);
          });
        }

        yearGroup.appendChild(yearContent);

        yearTitle.style.cursor = "pointer";
        yearTitle.addEventListener("click", () => {
          yearContent.style.display = yearContent.style.display === "none" ? "block" : "none";
        });

        clsContent.appendChild(yearGroup);
      });

      clsGroup.appendChild(clsContent);

      clsTitle.style.cursor = "pointer";
      clsTitle.addEventListener("click", () => {
        clsContent.style.display = clsContent.style.display === "none" ? "block" : "none";
      });

      resultsContainer.appendChild(clsGroup);
    });
  }


  function appendStudentCard(container, studentResults, studentName, date) {
    const studentGroup = document.createElement("div");
    studentGroup.className = "student-card";

    const headerDiv = document.createElement("div");
    headerDiv.style.display = "flex";
    headerDiv.style.justifyContent = "space-between";
    headerDiv.style.alignItems = "center";

    let earned = 0, total = 0;
    studentResults.forEach(r => Object.values(r.answers).forEach(a => { total++; if (a.isCorrect) earned++; }));

    const nameSpan = document.createElement("span");
    nameSpan.className = "student-name";
    nameSpan.textContent = `${studentName}: ${earned}/${total}`;

    const buttonGroup = document.createElement("div");
    buttonGroup.style.display = "flex";
    buttonGroup.style.gap = "5px";

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "btn export-btn";
    downloadBtn.textContent = "📄 PDF";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "🗑 Löschen";

    buttonGroup.appendChild(downloadBtn);
    buttonGroup.appendChild(deleteBtn);
    headerDiv.appendChild(nameSpan);
    headerDiv.appendChild(buttonGroup);
    studentGroup.appendChild(headerDiv);

    const dateDiv = document.createElement("div");
    dateDiv.textContent = `Datum: ${date}`;
    dateDiv.style.fontSize = "0.8em";
    studentGroup.appendChild(dateDiv);

    const answersContainer = document.createElement("div");
    answersContainer.className = "student-answers";
    answersContainer.style.display = "none";
    answersContainer.style.gridTemplateColumns = "repeat(10,1fr)";
    answersContainer.style.gap = "5px";

    studentResults.forEach(result => {
      Object.values(result.answers).forEach(ansObj => {
        const li = document.createElement("div");
        li.className = `answer-card ${ansObj.isCorrect ? "correct" : "incorrect"}`;
        li.style.fontSize = "0.9em";

        const questionDiv = document.createElement("div");
        questionDiv.className = "question";
        questionDiv.textContent = ansObj.question;

        const givenDiv = document.createElement("div");
        givenDiv.className = "given";
        givenDiv.textContent = `Antwort: ${ansObj.given || "-"}`;

        const correctDiv = document.createElement("div");
        correctDiv.className = "correct-answer";
        correctDiv.textContent = `Richtig: ${ansObj.correct}`;

        li.appendChild(questionDiv);
        li.appendChild(givenDiv);
        li.appendChild(correctDiv);

        answersContainer.appendChild(li);
      });
    });

    studentGroup.appendChild(answersContainer);

    nameSpan.style.cursor = "pointer";
    nameSpan.addEventListener("click", () => {
      answersContainer.style.display = answersContainer.style.display === "none" ? "grid" : "none";
    });

    downloadBtn.addEventListener("click", () => {
      exportStudentPDF(studentResults, studentName, date);
    });

    deleteBtn.addEventListener("click", async () => {
      if (!confirm(`Möchtest du alle Ergebnisse von ${studentName} wirklich löschen?`)) return;
      try {
        for (const result of studentResults) {
          await fetch(`/results/${result.id}`, { method: "DELETE" });
        }
        results = results.filter(r => r.name !== studentName || r.submittedAt.split("T")[0] !== date);
        renderResults();
      } catch (err) {
        console.error("Fehler beim Löschen:", err);
        alert("Löschen fehlgeschlagen");
      }
    });

    container.appendChild(studentGroup);
  }

  // Einzel-Download (wie bisher)
  function exportStudentPDF(studentResults, studentName, date) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 20;
    const cols = 5;
    const rowHeight = 28;
    const fontSize = 7;

    let firstPage = true;
    studentResults.forEach((result, idx) => {
      if (!firstPage) doc.addPage();
      firstPage = false;

      const answers = Object.values(result.answers);
      let x = margin;
      let y = 60;
      let totalPoints = 0;
      answers.forEach(a => { if (a.isCorrect) totalPoints++; });

      doc.setFontSize(14);
      doc.text(`${studentName}`, margin, 30);
      doc.setFontSize(10);
      doc.text(`Datum: ${date} | Gesamtpunkte: ${totalPoints}`, margin, 45);
      doc.setFontSize(fontSize);

      answers.forEach((ansObj, i) => {
        if (y + rowHeight > pageHeight - margin) {
          doc.addPage();
          y = margin + 30;
          x = margin;
        }
        const colWidth = (pageWidth - margin * 2 - (cols - 1) * 2) / cols;
        doc.setFillColor(ansObj.isCorrect ? 230 : 255, ansObj.isCorrect ? 255 : 230, ansObj.isCorrect ? 230 : 230);
        doc.rect(x, y, colWidth, rowHeight, 'F');
        doc.setTextColor(0, 0, 0);
        doc.text(ansObj.question, x + 2, y + 8, { maxWidth: colWidth - 4 });
        doc.text(`Antwort: ${ansObj.given || "-"}`, x + 2, y + 16, { maxWidth: colWidth - 4 });
        doc.text(`Richtig: ${ansObj.correct}`, x + 2, y + 24, { maxWidth: colWidth - 4 });
        x += colWidth + 2;
        if ((i + 1) % cols === 0) {
          x = margin;
          y += rowHeight + 3;
        }
      });
    });

    doc.save(`${studentName}_Ergebnisse.pdf`);
  }

  // Download Datumsebene: je 1 Schüler pro Seite
  function exportDatePDF(dateGroupData, cls, year, date) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');

    const students = Object.keys(dateGroupData).sort();
    let firstPage = true;

    students.forEach(studentName => {
      let studentResultsArr = dateGroupData[studentName];

      // Immer in ein Array umwandeln
      if (!Array.isArray(studentResultsArr)) {
        studentResultsArr = Object.values(studentResultsArr).flat();
      }

      // Falls studentResultsArr ein Array von Arrays ist, flach machen
      studentResultsArr = studentResultsArr.flat();

      // Jetzt studentResultsArr garantiert ein Array von Result-Objekten
      studentResultsArr.forEach(studentResults => {
        const answers = Object.values(studentResults.answers);

        if (!firstPage) doc.addPage();
        firstPage = false;

        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 20;
        const cols = 5;
        const rowHeight = 28;
        const fontSize = 7;

        let x = margin;
        let y = 60;

        let totalPoints = answers.filter(a => a.isCorrect).length;

        doc.setFontSize(14);
        doc.text(`${studentName}`, margin, 30);
        doc.setFontSize(10);
        doc.text(`Datum: ${date} | Gesamtpunkte: ${totalPoints}`, margin, 45);
        doc.setFontSize(fontSize);

        answers.forEach((ansObj, i) => {
          if (y + rowHeight > pageHeight - margin) {
            doc.addPage();
            y = margin + 30;
            x = margin;
          }
          const colWidth = (pageWidth - margin * 2 - (cols - 1) * 2) / cols;
          doc.setFillColor(ansObj.isCorrect ? 230 : 255, ansObj.isCorrect ? 255 : 230, ansObj.isCorrect ? 230 : 230);
          doc.rect(x, y, colWidth, rowHeight, 'F');
          doc.setTextColor(0, 0, 0);
          doc.text(ansObj.question, x + 2, y + 8, { maxWidth: colWidth - 4 });
          doc.text(`Antwort: ${ansObj.given || "-"}`, x + 2, y + 16, { maxWidth: colWidth - 4 });
          doc.text(`Richtig: ${ansObj.correct}`, x + 2, y + 24, { maxWidth: colWidth - 4 });
          x += colWidth + 2;
          if ((i + 1) % cols === 0) {
            x = margin;
            y += rowHeight + 3;
          }
        });
      });
    });

    doc.save(`Klasse_${cls}_Jahrgang_${year}_${date}.pdf`);
  }


  // Download Übersicht: eine Seite, nur Gesamtpunkte
  function exportDateSummaryPDF(dateGroupData, cls, year, date) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const margin = 20;
    const rowHeight = 28;

    // Klasse & Jahrgang
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(`Klasse ${cls} | Jahrgang ${year}`, margin, 30);

    // Datum
    doc.setFontSize(16);
    doc.text(`Datum: ${date}`, margin, 55);

    // Tabellenüberschriften
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    let y = 85;
    doc.text("Schüler", margin, y);
    doc.text("Gesamtpunkte", pageWidth - margin - 100, y);
    y += rowHeight;

    const students = Object.keys(dateGroupData).sort();

    doc.setFont("helvetica", "normal");
    students.forEach(studentName => {
      const studentResults = dateGroupData[studentName];
      let totalPoints = 0;
      let totalQuestions = 0;
      studentResults.forEach(r => {
        Object.values(r.answers).forEach(a => {
          totalQuestions++;
          if (a.isCorrect) totalPoints++;
        });
      });

      doc.text(studentName, margin, y);
      doc.text(`${totalPoints} / ${totalQuestions}`, pageWidth - margin - 100, y);
      y += rowHeight;

      if (y > doc.internal.pageSize.height - margin) {
        doc.addPage();
        y = margin + 20;
        // Tabellenüberschrift auf neuer Seite erneut
        doc.setFont("helvetica", "bold");
        doc.text("Schüler", margin, y);
        doc.text("Gesamtpunkte", pageWidth - margin - 100, y);
        y += rowHeight;
        doc.setFont("helvetica", "normal");
      }
    });

    doc.save(`Klasse_${cls}_Jahrgang_${year}_${date}_Übersicht.pdf`);
  }


  searchInput.addEventListener("input", renderResults);
  classFilter.addEventListener("change", renderResults);
  dateFilter.addEventListener("change", renderResults);
  groupingSelect.addEventListener("change", renderResults);
  clearFilter.addEventListener("click", () => {
    searchInput.value = "";
    classFilter.value = "";
    dateFilter.value = "";
    groupingSelect.value = "date";
    renderResults();
  });

  loadData();
});
