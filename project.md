# Projekt-Dokumentation: Gymnasium Nachfrage Berlin

Dieses Projekt ist ein interaktives Dashboard zur Analyse der Nachfrage nach Berliner Gymnasien für das Schuljahr 2025/26. Es nutzt einen Node.js-Scraper, um Daten von `gymnasium-berlin.net` zu extrahieren und in einer sauberen, filterbaren Weboberfläche darzustellen.

## Architektur

- **Frontend**: Single-Page Application (`index.html`) basierend auf modernem Vanilla JS, CSS und HTML.
- **Scraper**: Node.js Skript (`scripts/scrape-nachfrage.mjs`) unter Verwendung von `cheerio`.
- **Daten**: Strukturierte JSON-Datei (`data/nachfrage-2025-26.json`).

## Features

### 1. Daten-Scraper
- **Bezirks-Erkennung**: Findet automatisch alle 12 Berliner Bezirke und lädt die entsprechenden Daten.
- **Tiefen-Analyse**: Besucht jede einzelne Schulseite (~90+), um:
    - Den **Trend zum Vorjahr** (Vergleich 2025/26 vs. 2024/25) zu berechnen.
    - Den aktuellsten **Abiturnotendurchschnitt** zu extrahieren.
    - **Leistungskurse & Sprachen** zu erfassen.
    - Das Datum des **Tags der offenen Tür** zu finden.
- **Zeitstempel**: Speichert das Datum des letzten Scrapes.
- **Robustheit**: Integrierte Timeouts (Politeness) und Fehlerbehandlung.

### 2. Weboberfläche (UI)
- **Minimalistisches Design**: Komprimierter Header ("Gymnasien Berlin") und aufgeräumtes Layout.
- **Erweiterte Filterung**:
    - **Bezirk**: Dropdown-Auswahl.
    - **Ortsteil**: Ausklappbare Checkbox-Liste mit Mehrfachauswahl.
    - **Suche**: Echtzeit-Namenssuche.
    - **Persistenz**: Speichert alle Filtereinstellungen im `localStorage`.
- **Intelligente Highlights**:
    - **Besonderheiten**: Automatische Erkennung und Anzeige von seltenen Leistungskursen (angeboten von < 25% der Schulen).
    - **TdoT-Status**: Große Icons zeigen an, ob der Tag der offenen Tür noch bevorsteht (✓) oder bereits vorbei ist (✕). Tooltip zeigt das genaue Datum.
- **Live-Statistiken**: Automatische Berechnung von Durchschnittswerten basierend auf aktiven Filtern.
- **Interaktive Tabelle**: Vollständig sortierbar über alle Spalten.

## Installation & Betrieb

### Voraussetzungen
- Node.js (Version 18+)

### Schnellstart
1. Abhängigkeiten installieren: `npm install`
2. Scraper ausführen: `node scripts/scrape-nachfrage.mjs`
3. Webserver starten (z.B. `python3 -m http.server 8000`)
4. Im Browser öffnen: `http://localhost:8000/index.html`