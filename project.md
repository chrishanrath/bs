# Projekt-Dokumentation: Gymnasium Nachfrage Berlin

Dieses Projekt ist ein interaktives Dashboard zur Analyse der Nachfrage nach Berliner Gymnasien für das Schuljahr 2025/26. Es nutzt einen Node.js-Scraper, um Daten von `gymnasium-berlin.net` zu extrahieren und in einer sauberen, filterbaren Weboberfläche darzustellen.

## Architektur

- **Frontend**: Single-Page Application (`index.html`) basierend auf modernem Vanilla JS, CSS und HTML.
- **Scraper**: Node.js Skript (`scripts/scrape-nachfrage.mjs`) unter Verwendung von `cheerio`.
- **Daten**: Strukturierte JSON-Datei (`data/nachfrage-2025-26.json`).

## Features

### 1. Daten-Scraper
- **Bezirks-Erkennung**: Findet automatisch alle 12 Berliner Bezirke und lädt die entsprechenden Daten.
- **Detail-Scraping**: Besucht jede einzelne Schulseite (~90+), um:
    - Den **Trend zum Vorjahr** (Vergleich 2025/26 vs. 2024/25) zu berechnen.
    - Den aktuellsten **Abiturnotendurchschnitt** zu extrahieren.
- **Zeitstempel**: Speichert das Datum des letzten Scrapes.
- **Robustheit**: Integrierte Timeouts (Politeness) und Fehlerbehandlung.

### 2. Weboberfläche (UI)
- **Minimalistisches Design**: Komprimierter Header ("Gymnasien Berlin") und aufgeräumtes Layout.
- **Erweiterte Filterung**:
    - **Bezirk**: Dropdown-Auswahl.
    - **Ortsteil**: Ausklappbare Checkbox-Liste mit Mehrfachauswahl. Standardmäßig aktiviert für Pankow, Prenzlauer Berg, Mitte, Friedrichshain und Weißensee.
    - **Suche**: Echtzeit-Namenssuche.
- **Live-Statistiken**: Automatische Berechnung von Anzahl der Schulen, Durchschnitts-Nachfrage und Gesamtkapazität basierend auf aktiven Filtern.
- **Interaktive Tabelle**:
    - Alle Spalten sortierbar (inkl. intelligenter Sortierung für Trends und Noten).
    - Farblich kodierte Badges für die Nachfragequote (Rot > 150%, Orange > 100%, Grün < 100%).
    - Trend-Indikatoren (↑/↓) für die Veränderung der Anmeldezahlen zum Vorjahr.
- **Persistenz**: Speichert alle Filtereinstellungen im `localStorage`, sodass die Ansicht beim Neuladen erhalten bleibt.

## Installation & Betrieb

### Voraussetzungen
- Node.js (Version 18+)

### Schnellstart
1. Abhängigkeiten installieren: `npm install`
2. Scraper ausführen: `node scripts/scrape-nachfrage.mjs`
3. Webserver starten (z.B. `python3 -m http.server 8000`)
4. Im Browser öffnen: `http://localhost:8000/index.html`

## Datenstruktur (JSON)
```json
{
  "lastUpdated": "2026-01-19T13:20:52.700Z",
  "schools": [
    {
      "year": "2025/26",
      "bezirk": "Pankow",
      "name": "Käthe-Kollwitz-Gymnasium",
      "url": "...",
      "ortsteil": "Prenzlauer Berg",
      "plaetze": 64,
      "erstwuensche": 95,
      "nachfrageProzent": 148,
      "abiturNote": 1.66,
      "previousYearErstwuensche": 92,
      "changeErstwuensche": 3,
      "abiturYear": 2025
    }
  ]
}
```
