// scripts/scrape-nachfrage.mjs
import * as cheerio from "cheerio";
import fs from "node:fs/promises";
import process from "node:process";

function log(msg) {
  process.stderr.write(`[${new Date().toISOString()}] ${msg}\n`);
}

// IMPORTANT: do not name a variable `URL` (it shadows Node's global URL constructor).
const SOURCE_URL = "https://www.gymnasium-berlin.net/nachfrage";
const ABITUR_URL = "https://www.gymnasium-berlin.net/abiturdaten";

async function fetchGrades() {
  log("Fetching Abitur data…");
  const res = await fetch(ABITUR_URL);
  if (!res.ok) {
    log(`Failed to fetch Abitur data: ${res.status}`);
    return new Map();
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const grades = new Map();

  $("tr").each((_, tr) => {
    const tds = $(tr).find("td");
    // Expecting at least: Counter, Name (with link), Grade
    if (tds.length < 3) return;

    const titleCell = $(tds[1]); // 2nd column usually has the name link
    const a = titleCell.find("a").first();
    const href = (a.attr("href") || "").trim();
    if (!href) return;

    // Grade is usually in the 3rd column (index 2)
    // The text might be "1,4" -> replace comma with dot
    let gradeText = $(tds[2]).text().trim().replace(",", ".");
    const grade = parseFloat(gradeText);

    if (grade > 0) {
       const absUrl = href.startsWith("http") ? href : `https://www.gymnasium-berlin.net${href}`;
       grades.set(absUrl, grade);
    }
  });

  log(`Found ${grades.size} schools with Abitur grades.`);
  return grades;
}

async function main() {
  log(`Node ${process.version} starting… cwd=${process.cwd()}`);

  // Fetch grades first
  const gradesMap = await fetchGrades();

  log("Fetching main page to find districts…");

  const mainRes = await fetch(SOURCE_URL);
  if (!mainRes.ok) throw new Error(`Fetch failed: ${mainRes.status}`);
  const mainHtml = await mainRes.text();
  const $main = cheerio.load(mainHtml);

  const districts = [];
  $main("#edit-bezirk option").each((_, opt) => {
    const val = $main(opt).val();
    if (val && val !== "All") {
      districts.push(val);
    }
  });

  log(`Found ${districts.length} districts: ${districts.join(", ")}`);

  const allRows = [];

  for (const bezirk of districts) {
    const url = `${SOURCE_URL}?bezirk=${encodeURIComponent(bezirk)}`;
    log(`Fetching ${bezirk}…`);
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

      const absUrl = href.startsWith("http") ? href : `https://www.gymnasium-berlin.net${href}`;
      
      // Look up grade
      const abiturNote = gradesMap.get(absUrl) || null;

      allRows.push({
        year: "2025/26",
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
    log(`  -> Found ${count} schools in ${bezirk}`);
  }

  log(`Parsed ${allRows.length} rows total across all districts`);
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
