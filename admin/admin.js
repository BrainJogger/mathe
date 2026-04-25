document.addEventListener("DOMContentLoaded", () => {
  const resultsContainer = document.getElementById("resultsContainer");
  const searchInput = document.getElementById("searchInput");
  const classFilter = document.getElementById("classFilter");
  const dateFilter = document.getElementById("dateFilter");
  const groupingSelect = document.getElementById("groupingSelect");
  const clearFilter = document.getElementById("clearFilter");

  let results = [];
  let classes = [];

  function buildResultsQuery() {
    const params = new URLSearchParams();
    if (searchInput.value) params.set("search", searchInput.value.trim());
    if (classFilter.value) params.set("klasse", classFilter.value);
    if (dateFilter.value) params.set("date", dateFilter.value);
    return params.toString();
  }

  async function loadData() {
    try {
      const query = buildResultsQuery();
      const resultsUrl = query ? `/results?${query}` : "/results";
      const [clsRes, resultsRes] = await Promise.all([
        fetch("/api/classes"),
        fetch(resultsUrl)
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
      const date = getIsoDateKey(r.submittedAt);
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

        if (groupBy === "name") {
          const yearDownloadBtn = document.createElement("button");
          yearDownloadBtn.className = "btn export-btn";
          yearDownloadBtn.textContent = "📄 Jahrgang PDF";
          yearDownloadBtn.style.marginLeft = "10px";
          yearTitle.appendChild(yearDownloadBtn);

          yearDownloadBtn.addEventListener("click", e => {
            e.stopPropagation();
            exportYearPDF(grouped[cls][year], cls, year);
          });
        }

        yearGroup.appendChild(yearTitle);

        const yearContent = document.createElement("div");
        yearContent.style.display = "none";

        if (groupBy === "date") {
          Object.keys(grouped[cls][year]).sort().forEach(date => {
            const dateGroup = document.createElement("div");
            dateGroup.className = "date-group";

            const dateTitle = document.createElement("h5");
            dateTitle.className = "class-title";
            dateTitle.textContent = `Datum: ${formatDateDisplay(date)}`;
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
              appendStudentEntries(dateContent, grouped[cls][year][date][studentName], studentName, date);
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
              if (!confirm(`Möchtest du wirklich alle Ergebnisse der Klasse ${cls}, Jahrgang ${year} am ${formatDateDisplay(date)} löschen?`)) return;
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
            studentTitle.style.display = "flex";
            studentTitle.style.justifyContent = "space-between";
            studentTitle.style.alignItems = "center";
            studentTitle.style.gap = "8px";
            studentTitle.style.cursor = "pointer";

            const studentTitleText = document.createElement("span");
            studentTitleText.textContent = studentName;

            const studentDownloadBtn = document.createElement("button");
            studentDownloadBtn.className = "btn export-btn";
            studentDownloadBtn.textContent = `📄 ${studentName} PDF`;

            studentTitle.appendChild(studentTitleText);
            studentTitle.appendChild(studentDownloadBtn);
            studentGroupContainer.appendChild(studentTitle);

            const studentDatesContainer = document.createElement("div");
            studentDatesContainer.style.display = "none";

            Object.keys(grouped[cls][year][studentName]).sort().forEach(date => {
              appendStudentEntries(studentDatesContainer, grouped[cls][year][studentName][date], studentName, date);
            });

            studentTitle.addEventListener("click", () => {
              studentDatesContainer.style.display = studentDatesContainer.style.display === "none" ? "grid" : "none";
            });

            studentDownloadBtn.addEventListener("click", e => {
              e.stopPropagation();
              exportStudentAllResultsPDF(grouped[cls][year][studentName], studentName, year);
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

  function appendStudentEntries(container, studentResults, studentName, date) {
    const entries = Array.isArray(studentResults) ? studentResults : [studentResults];
    entries
      .slice()
      .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))
      .forEach(result => appendStudentCard(container, [result], studentName, date));
  }


  function appendStudentCard(container, studentResults, studentName, date) {
    const studentGroup = document.createElement("div");
    studentGroup.className = "student-card";

    const headerDiv = document.createElement("div");
    headerDiv.style.display = "flex";
    headerDiv.style.justifyContent = "space-between";
    headerDiv.style.alignItems = "center";

    let earned = 0, total = 0;
    let totalTimeUsed = 0;
    const maxTime = 600; // ⬅ falls eure Prüfungszeit 10 Minuten beträgt

    studentResults.forEach(r => {
      Object.values(r.answers).forEach(a => {
        total++;
        if (a.isCorrect) earned++;
      });

      if (typeof r.timeLeft === "number") {
        totalTimeUsed += (maxTime - r.timeLeft);
      }
    });

    // Zeit formatieren
    function formatTime(seconds) {
      const min = Math.floor(seconds / 60);
      const sec = seconds % 60;
      return `${min}m ${sec}s`;
    }

    const modeLabels = {
      mul: "Einmaleins",
      div: "Einsdurcheins",
      mul_big: "Großes Einmaleins",
      div_big: "Großes Einsdurcheins",
    };
    const modes = [...new Set(studentResults.map(r => (r.mode || "mul").toString().toLowerCase()))];
    const modeLabel = modes.length === 1
      ? (modeLabels[modes[0]] || "Einmaleins")
      : "Gemischt";

    const nameSpan = document.createElement("span");
    nameSpan.className = "student-name";
    nameSpan.textContent = `${studentName}: ${earned}/${total} | ⏱ ${formatTime(totalTimeUsed)} `;

    const modeBadge = document.createElement("span");
    modeBadge.className = "mode-badge";

    const modeIcon = document.createElement("span");
    modeIcon.className = "mode-icon";
    if (modes.length === 1) {
      const key = modes[0];
      modeIcon.textContent = key.startsWith("div") ? "÷" : "×";
      if (key === "mul_big") modeBadge.classList.add("mode-mul-big");
      else if (key === "div_big") modeBadge.classList.add("mode-div-big");
      else if (key === "div") modeBadge.classList.add("mode-div");
      else modeBadge.classList.add("mode-mul");
    } else {
      modeIcon.textContent = "×/÷";
      modeBadge.classList.add("mode-mixed");
    }

    const modeText = document.createElement("span");
    modeText.className = "mode-text";
    modeText.textContent = modeLabel;

    modeBadge.appendChild(modeIcon);
    modeBadge.appendChild(modeText);
    nameSpan.appendChild(modeBadge);
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
    dateDiv.className = "student-meta";
    if (studentResults.length === 1 && studentResults[0]?.submittedAt) {
      const submittedAt = new Date(studentResults[0].submittedAt);
      const isValidDate = !Number.isNaN(submittedAt.getTime());
      dateDiv.textContent = isValidDate
        ? `Datum: ${formatDateDisplay(submittedAt)} | Uhrzeit: ${submittedAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`
        : `Datum: ${formatDateDisplay(date)}`;
    } else {
      dateDiv.textContent = `Datum: ${formatDateDisplay(date)}`;
    }
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
      const resultIds = studentResults.map(r => r.id).filter(Boolean);
      if (!resultIds.length) return;
      const confirmationText = resultIds.length === 1
        ? `Möchtest du dieses Ergebnis von ${studentName} wirklich löschen?`
        : `Möchtest du alle ${resultIds.length} Ergebnisse von ${studentName} wirklich löschen?`;
      if (!confirm(confirmationText)) return;
      try {
        for (const result of studentResults) {
          await fetch(`/results/${result.id}`, { method: "DELETE" });
        }
        const deletedIds = new Set(resultIds);
        results = results.filter(r => !deletedIds.has(r.id));
        renderResults();
      } catch (err) {
        console.error("Fehler beim Löschen:", err);
        alert("Löschen fehlgeschlagen");
      }
    });

    container.appendChild(studentGroup);
  }

  function sanitizeText(text) {
    if (!text) return text;
    return text
      .replace(/⋅/g, "·")   // mathematischer Punkt
      .replace(/×/g, "x");   // optional falls du auch × nutzt
  }

  function getIsoDateKey(value) {
    if (!value) return "";
    const str = String(value);
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    const yyyy = String(parsed.getFullYear());
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    const dd = String(parsed.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function formatDateDisplay(value) {
    const isoDate = getIsoDateKey(value);
    if (!isoDate) return value ? String(value) : "-";
    const [yyyy, mm, dd] = isoDate.split("-");
    return `${dd}.${mm}.${yyyy}`;
  }

  function collectSummaryRows(studentResults, studentName) {
    const maxTime = 600;
    const rows = [];

    (studentResults || []).forEach(result => {
      const answers = Object.values(result.answers || {});
      const totalQuestions = answers.length;
      const totalPoints = answers.filter(a => a.isCorrect).length;
      const timeUsed = (typeof result.timeLeft === "number")
        ? (maxTime - result.timeLeft)
        : 0;

      rows.push({
        studentName,
        submittedAt: result.submittedAt || "",
        modeLabel: getModeLabel(result.mode),
        pointsText: `${totalPoints} / ${totalQuestions}`,
        durationText: formatDuration(timeUsed)
      });
    });

    return rows;
  }

  function flattenStudentResultsByDate(studentDateMap) {
    const flattened = [];
    Object.keys(studentDateMap || {}).sort().forEach(date => {
      const dateResults = Array.isArray(studentDateMap[date]) ? studentDateMap[date] : [studentDateMap[date]];
      flattened.push(...dateResults);
    });
    return flattened;
  }

  function exportSummaryPDF(rows, title, subtitle, filename) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const margin = 20;
    const rowHeight = 28;

    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(title, margin, 30);

    doc.setFontSize(16);
    doc.text(subtitle, margin, 55);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    let y = 85;
    doc.text("Schüler", margin, y);
    doc.text("Datum", margin + 175, y);
    doc.text("Typ", margin + 255, y);
    doc.text("Punkte", pageWidth - margin - 120, y);
    doc.text("Dauer", pageWidth - margin - 50, y);
    y += rowHeight;

    doc.setFont("helvetica", "normal");

    if (!rows.length) {
      doc.text("Keine Ergebnisse vorhanden.", margin, y);
      doc.save(filename);
      return;
    }

    let previousStudentName = "";
    rows
      .slice()
      .sort((a, b) => {
        const nameDiff = (a.studentName || "").localeCompare(b.studentName || "", "de", { sensitivity: "base" });
        if (nameDiff !== 0) return nameDiff;
        return new Date(a.submittedAt || 0) - new Date(b.submittedAt || 0);
      })
      .forEach((row, index) => {
        if (index > 0 && row.studentName !== previousStudentName) {
          if (y > doc.internal.pageSize.height - margin - 10) {
            doc.addPage();
            y = margin + 20;
            doc.setFont("helvetica", "bold");
            doc.text("Schüler", margin, y);
            doc.text("Datum", margin + 175, y);
            doc.text("Typ", margin + 255, y);
            doc.text("Punkte", pageWidth - margin - 120, y);
            doc.text("Dauer", pageWidth - margin - 50, y);
            y += rowHeight;
            doc.setFont("helvetica", "normal");
          } else {
            doc.setDrawColor(170);
            doc.line(margin, y - 12, pageWidth - margin, y - 12);
          }
        }

        const submitted = new Date(row.submittedAt);
        const dateLabel = Number.isNaN(submitted.getTime())
          ? "-"
          : formatDateDisplay(row.submittedAt);

        doc.text(row.studentName, margin, y, { maxWidth: 160 });
        doc.text(dateLabel, margin + 175, y);
        doc.text(row.modeLabel, margin + 255, y, { maxWidth: 80 });
        doc.text(row.pointsText, pageWidth - margin - 120, y);
        doc.text(row.durationText, pageWidth - margin - 50, y);
        y += rowHeight;
        previousStudentName = row.studentName;

        if (y > doc.internal.pageSize.height - margin) {
          doc.addPage();
          y = margin + 20;
          doc.setFont("helvetica", "bold");
          doc.text("Schüler", margin, y);
          doc.text("Datum", margin + 175, y);
          doc.text("Typ", margin + 255, y);
          doc.text("Punkte", pageWidth - margin - 120, y);
          doc.text("Dauer", pageWidth - margin - 50, y);
          y += rowHeight;
          doc.setFont("helvetica", "normal");
        }
      });

    doc.save(filename);
  }

  function exportYearSummaryPDF(yearStudentData, cls, year) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const margin = 20;
    const rowHeight = 28;
    const studentNames = Object.keys(yearStudentData || {})
      .sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" }));

    let isFirstStudentPage = true;

    studentNames.forEach(studentName => {
      const studentResults = flattenStudentResultsByDate(yearStudentData[studentName]);
      const rows = collectSummaryRows(studentResults, studentName)
        .sort((a, b) => new Date(a.submittedAt || 0) - new Date(b.submittedAt || 0));

      if (!isFirstStudentPage) {
        doc.addPage();
      }
      isFirstStudentPage = false;

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(`Klasse ${cls} | Jahrgang ${year}`, margin, 30);

      doc.setFontSize(16);
      doc.text(`Kind: ${studentName}`, margin, 55);

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      let y = 85;
      doc.text("Schüler", margin, y);
      doc.text("Datum", margin + 175, y);
      doc.text("Typ", margin + 255, y);
      doc.text("Punkte", pageWidth - margin - 120, y);
      doc.text("Dauer", pageWidth - margin - 50, y);
      y += rowHeight;
      doc.setFont("helvetica", "normal");

      if (!rows.length) {
        doc.text("Keine Ergebnisse vorhanden.", margin, y);
        return;
      }

      rows.forEach(row => {
        const submitted = new Date(row.submittedAt);
        const dateLabel = Number.isNaN(submitted.getTime())
          ? "-"
          : formatDateDisplay(row.submittedAt);

        doc.text(row.studentName, margin, y, { maxWidth: 160 });
        doc.text(dateLabel, margin + 175, y);
        doc.text(row.modeLabel, margin + 255, y, { maxWidth: 80 });
        doc.text(row.pointsText, pageWidth - margin - 120, y);
        doc.text(row.durationText, pageWidth - margin - 50, y);
        y += rowHeight;

        if (y > doc.internal.pageSize.height - margin) {
          doc.addPage();
          y = margin + 20;
          doc.setFont("helvetica", "bold");
          doc.text("Schüler", margin, y);
          doc.text("Datum", margin + 175, y);
          doc.text("Typ", margin + 255, y);
          doc.text("Punkte", pageWidth - margin - 120, y);
          doc.text("Dauer", pageWidth - margin - 50, y);
          y += rowHeight;
          doc.setFont("helvetica", "normal");
        }
      });
    });

    if (!studentNames.length) {
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(`Klasse ${cls} | Jahrgang ${year}`, margin, 30);
      doc.setFontSize(16);
      doc.text("Alle Kinder, alle Ergebnisse", margin, 55);
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text("Keine Ergebnisse vorhanden.", margin, 85);
    }

    doc.save(`Klasse_${cls}_Jahrgang_${year}_Name_Gesamt.pdf`);
  }

  function exportYearPDF(yearStudentData, cls, year) {
    exportYearSummaryPDF(yearStudentData, cls, year);
  }

  function exportStudentAllResultsPDF(studentDateMap, studentName, year) {
    const studentResults = flattenStudentResultsByDate(studentDateMap);
    const summaryRows = collectSummaryRows(studentResults, studentName);
    exportSummaryPDF(
      summaryRows,
      `Kind: ${studentName}`,
      `Jahrgang ${year} | Alle Ergebnisse`,
      `${studentName}_Jahrgang_${year}_Alle_Ergebnisse.pdf`
    );
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
      let totalPoints = answers.filter(a => a.isCorrect).length;

      const maxTime = 600;
      const timeUsed = (typeof result.timeLeft === "number")
        ? (maxTime - result.timeLeft)
        : 0;

      function formatTime(seconds) {
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        return `${min}m ${sec}s`;
      }

      doc.setFontSize(14);
      doc.text(`${studentName}`, margin, 30);
      doc.setFontSize(10);
      doc.text(`Datum: ${formatDateDisplay(date)} | Gesamtpunkte: ${totalPoints} | Zeit: ${formatTime(timeUsed)}`, margin, 45);
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
        doc.text(sanitizeText(ansObj.question), x + 2, y + 8, { maxWidth: colWidth - 4 });
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

        const maxTime = 600; // ⬅ ggf. anpassen
        const timeUsed = (typeof studentResults.timeLeft === "number")
          ? (maxTime - studentResults.timeLeft)
          : 0;

        function formatTime(seconds) {
          const min = Math.floor(seconds / 60);
          const sec = seconds % 60;
          return `${min}m ${sec}s`;
        }

        doc.setFontSize(14);
        doc.text(`${studentName}`, margin, 30);
        doc.setFontSize(10);
        doc.text(
          `Datum: ${formatDateDisplay(date)} | Gesamtpunkte: ${totalPoints} | Zeit: ${formatTime(timeUsed)}`,
          margin,
          45
        );
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
          doc.text(sanitizeText(ansObj.question), x + 2, y + 8, { maxWidth: colWidth - 4 });
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
    const students = Object.keys(dateGroupData).sort();
    const summaryRows = [];

    students.forEach(studentName => {
      const studentResults = Array.isArray(dateGroupData[studentName])
        ? dateGroupData[studentName]
        : Object.values(dateGroupData[studentName]).flat();

      summaryRows.push(...collectSummaryRows(studentResults, studentName));
    });

    exportSummaryPDF(
      summaryRows,
      `Klasse ${cls} | Jahrgang ${year}`,
      `Datum: ${formatDateDisplay(date)}`,
      `Klasse_${cls}_Jahrgang_${year}_${date}_Übersicht.pdf`
    );
  }

  function formatDuration(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}m ${sec}s`;
  }

  function getModeLabel(mode) {
    const modeLabels = {
      mul: "Einmaleins",
      div: "Einsdurcheins",
      mul_big: "Großes 1x1",
      div_big: "Großes 1:1",
    };
    const key = (mode || "mul").toString().toLowerCase();
    return modeLabels[key] || "Einmaleins";
  }


  searchInput.addEventListener("input", loadData);
  classFilter.addEventListener("change", loadData);
  dateFilter.addEventListener("change", loadData);
  groupingSelect.addEventListener("change", renderResults);
  clearFilter.addEventListener("click", () => {
    searchInput.value = "";
    classFilter.value = "";
    dateFilter.value = "";
    groupingSelect.value = "date";
    loadData();
  });

  // Wenn die Seite aus dem Browser-Cache (bfcache) zurückkommt,
  // müssen die Daten neu geladen werden (z. B. nach Schüler-Verschiebung).
  window.addEventListener("pageshow", () => {
    loadData();
  });

  loadData();
});
