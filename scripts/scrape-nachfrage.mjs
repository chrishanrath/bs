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
