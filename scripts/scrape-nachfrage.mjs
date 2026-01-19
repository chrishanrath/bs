// scripts/scrape-nachfrage.mjs
import * as cheerio from "cheerio";
import fs from "node:fs/promises";
import process from "node:process";

function log(msg) {
  process.stderr.write(`[${new Date().toISOString()}] ${msg}\n`);
}

const SOURCES = [
  { 
    type: "Gymnasium", 
    url: "https://www.gymnasium-berlin.net/nachfrage", 
    domain: "https://www.gymnasium-berlin.net", 
    abiturUrl: "https://www.gymnasium-berlin.net/abiturdaten",
    districtSelector: "#edit-bezirk",
    districtParam: "bezirk"
  },
  { 
    type: "ISS", 
    url: "https://www.sekundarschulen-berlin.de/nachfrage", 
    domain: "https://www.sekundarschulen-berlin.de", 
    abiturUrl: "https://www.sekundarschulen-berlin.de/abitur",
    districtSelector: "#edit-field-bezirk-value",
    districtParam: "field_bezirk_value"
  }
];

async function fetchGrades(source) {
  log(`Fetching Abitur data for ${source.type}…`);
  const res = await fetch(source.abiturUrl);
  if (!res.ok) {
    log(`Failed to fetch Abitur data: ${res.status}`);
    return new Map();
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const grades = new Map();

  $("tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 3) return;

    const titleCell = $(tds[1]);
    const a = titleCell.find("a").first();
    const href = (a.attr("href") || "").trim();
    if (!href) return;

    let gradeText = $(tds[2]).text().trim().replace(",", ".");
    const grade = parseFloat(gradeText);

    if (grade > 0) {
       const absUrl = href.startsWith("http") ? href : `${source.domain}${href}`;
       grades.set(absUrl, grade);
    }
  });

  log(`Found ${grades.size} ${source.type} schools with Abitur grades.`);
  return grades;
}

async function main() {
  log(`Node ${process.version} starting… cwd=${process.cwd()}`);

  const allRows = [];

  for (const source of SOURCES) {
    log(`--- Processing ${source.type} ---`);
    
    // Fetch grades first
    const gradesMap = await fetchGrades(source);

    log(`Fetching main page to find districts for ${source.type}…`);

    const mainRes = await fetch(source.url);
    if (!mainRes.ok) {
        log(`Failed to fetch main page for ${source.type}: ${mainRes.status}`);
        continue;
    }
    const mainHtml = await mainRes.text();
    const $main = cheerio.load(mainHtml);

    const districts = [];
    // Use configured selector
    $main(`${source.districtSelector} option`).each((_, opt) => {
      const val = $main(opt).val();
      if (val && val !== "All") {
        districts.push(val);
      }
    });

    log(`Found ${districts.length} districts: ${districts.join(", ")}`);

    for (const bezirk of districts) {
      const url = `${source.url}?${source.districtParam}=${encodeURIComponent(bezirk)}`;
      // log(`Fetching ${bezirk}…`); // Reduced logging
      const res = await fetch(url);
      if (!res.ok) {
        log(`Failed to fetch ${bezirk}: ${res.status}`);
        continue;
      }
      const html = await res.text();
      const $ = cheerio.load(html);

      const trs = $("tr");
      let count = 0;

      trs.each((_, tr) => {
        const tds = $(tr).find("td");
        if (tds.length < 4) return;

        const titleCell = $(tds[0]);
        const a = titleCell.find("a").first();
        const name = a.text().trim();
        const href = (a.attr("href") || "").trim();
        if (!name || !href) return;

        const titleText = titleCell.text().replace(/\s+/g, " ").trim();
        const ortsteil = titleText.replace(name, "").trim();

        const plaetze = Number($(tds[1]).text().trim());
        const erstwuensche = Number($(tds[2]).text().trim());
        const prozent = Number($(tds[3]).text().trim());

        if (!Number.isFinite(plaetze) || !Number.isFinite(erstwuensche) || !Number.isFinite(prozent)) return;

        const absUrl = href.startsWith("http") ? href : `${source.domain}${href}`;
        
        // Look up grade
        const abiturNote = gradesMap.get(absUrl) || null;

        allRows.push({
          year: "2025/26",
          schoolType: source.type,
          bezirk,
          name,
          url: absUrl,
          ortsteil,
          plaetze,
          erstwuensche,
          nachfrageProzent: prozent,
          abiturNote // Added field
        });
        count++;
      });
      // log(`  -> Found ${count} schools in ${bezirk}`);
    }
  }

  log(`Parsed ${allRows.length} rows total across all sources`);
  log("Fetching detailed historical data for each school (this may take a while)…");

  // Fetch details for each school to get previous year's data
  for (let i = 0; i < allRows.length; i++) {
    const school = allRows[i];
    try {
      // Be polite to the server
      await new Promise(r => setTimeout(r, 100)); 
      
      const res = await fetch(school.url);
      if (!res.ok) continue;
      
      const html = await res.text();
      const $ = cheerio.load(html);

      // Find the "Nachfrage" table
      // It's usually after the heading "Nachfrage und angebotene Plätze"
      // But the HTML structure is a bit messy. 
      // We look for a table that contains "Plätze" and "1. Wünsche" in the header.
      
      let targetTable = null;
      $("table").each((_, table) => {
        const text = $(table).text();
        if (text.includes("Plätze") && text.includes("1. Wünsche") && text.includes("Schuljahr")) {
          targetTable = $(table);
          return false; // break
        }
      });

      if (targetTable) {
        // Look for the row with the previous year (2024/25)
        // We assume the current year is 2025/26
        const prevYear = "2024/25";
        let prevWünsche = null;

        targetTable.find("tr").each((_, tr) => {
          const tds = $(tr).find("td");
          if ($(tds[0]).text().includes(prevYear)) {
             // Column 2 (index 2) is "1. Wünsche" based on visual inspection
             // 0: Schuljahr, 1: Plätze, 2: 1. Wünsche
             const val = Number($(tds[2]).text().trim());
             if (Number.isFinite(val)) {
               prevWünsche = val;
             }
          }
        });

        if (prevWünsche !== null) {
          school.previousYearErstwuensche = prevWünsche;
          school.changeErstwuensche = school.erstwuensche - prevWünsche;
        }
      }

      // 2. Look for Abitur Data Table
      // <table summary="Abiturnotenschnitt"> ... </table>
      let abiTable = null;
      $("table").each((_, table) => {
        if ($(table).attr("summary") === "Abiturnotenschnitt" || $(table).text().includes("Abiturnotendurchschnitt")) {
          abiTable = $(table);
          return false;
        }
      });

      if (abiTable) {
        let bestYear = 0;
        let bestGrade = null;

        abiTable.find("tr").each((_, tr) => {
          const tds = $(tr).find("td");
          if (tds.length < 2) return;
          
          const yearStr = $(tds[0]).text().trim();
          const year = parseInt(yearStr, 10);
          
          if (!isNaN(year)) {
             // Grade is in 2nd column
             let gradeText = $(tds[1]).text().trim().replace(",", ".");
             const grade = parseFloat(gradeText);
             
             // We want the most recent year
             if (!isNaN(grade) && year > bestYear) {
               bestYear = year;
               bestGrade = grade;
             }
          }
        });

        if (bestGrade !== null) {
          // Update the school record. 
          // This overwrites the main page data if found, which is fine (detailed page is likely more accurate/complete)
          school.abiturNote = bestGrade;
          school.abiturYear = bestYear; // Optional: store which year it is
        }
      }

      // 3. Extract Languages and Advanced Courses (Leistungskurse)
      // They are in a table with section headers like <a id="Sprachen"></a>Sprachen
      // We look for the cell containing "Sprachen" or "Leistungskurse" and get the content from the NEXT row.
      
      let languagesRaw = null;
      let coursesRaw = null;

      $("td").each((_, td) => {
        const text = $(td).text().trim();
        
        if (text === "Sprachen" || $(td).find("a[name='Sprachen']").length > 0) {
          // Get next row
          const nextTr = $(td).closest("tr").next("tr");
          if (nextTr.length) {
            languagesRaw = nextTr.text().trim();
          }
        }
        
        if (text === "Leistungskurse" || $(td).find("a[name='Leistungskurse']").length > 0) {
          const nextTr = $(td).closest("tr").next("tr");
          if (nextTr.length) {
            coursesRaw = nextTr.text().trim();
          }
        }
      });

      if (languagesRaw) {
        school.languagesRaw = languagesRaw;
      }

      if (coursesRaw) {
        school.coursesRaw = coursesRaw;
        // Example: "Bildende Kunst/Kunst, Biologie, Chemie, Deutsch..."
        // Split by comma
        school.courses = coursesRaw.split(",").map(c => c.trim()).filter(c => c);
      }

      // 4. Extract "Tag der offenen Tür"
      // Look for <span class="date-display-single"> inside the relevant view or near the header
      // Header: <a id="Tdot">
      
      let tdotRaw = null;
      let tdotDate = null;

      // Try to find the section by ID first to be safe
      const tdotHeader = $("a[name='Tdot']");
      if (tdotHeader.length > 0) {
        
        const dateSpan = $("span.date-display-single").first();
        if (dateSpan.length > 0) {
          tdotRaw = dateSpan.text().trim();
          // Parse "Donnerstag, 29. Januar 2026 - 15:30 bis 19:00"
          // Regex to capture Day, Month, Year
          const dateMatch = tdotRaw.match(/(\d+)\.\s+([A-Za-zä]+)\s+(\d{4})/);
          if (dateMatch) {
            const day = parseInt(dateMatch[1], 10);
            const monthName = dateMatch[2];
            const year = parseInt(dateMatch[3], 10);
            
            const months = {
              "Januar": 0, "Februar": 1, "März": 2, "April": 3, "Mai": 4, "Juni": 5,
              "Juli": 6, "August": 7, "September": 8, "Oktober": 9, "November": 10, "Dezember": 11
            };
            
            if (months[monthName] !== undefined) {
              const d = new Date(year, months[monthName], day);
              // Adjust for timezone? Simple ISO string YYYY-MM-DD is enough
              // Use local time to string
              const pad = (n) => n.toString().padStart(2, '0');
              tdotDate = `${year}-${pad(months[monthName] + 1)}-${pad(day)}`;
            }
          }
        }
      }
      
      if (tdotDate) {
        school.openDayDate = tdotDate;
        school.openDayRaw = tdotRaw;
      }
      
      process.stdout.write("."); // Progress indicator
    } catch (e) {
      // ignore errors for individual pages
    }
  }
  process.stdout.write("\n");

  const output = {
    lastUpdated: new Date().toISOString(),
    schools: allRows
  };

  log("Ensuring data/ exists…");
  await fs.mkdir("data", { recursive: true });

  log("Writing JSON file…");
  await fs.writeFile("data/nachfrage-2025-26.json", JSON.stringify(output, null, 2), "utf8");

  log("Done.");
  log(`Saved ${allRows.length} rows to data/nachfrage-2025-26.json`);
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exitCode = 1;
});
