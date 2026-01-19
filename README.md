# Gymnasium Nachfrage Berlin – V1 (Bezirks- & Ortsteil-Filter)

Dieses Mini-Projekt erzeugt eine statische HTML-Seite, die die Nachfrage-Tabelle von gymnasium-berlin.net nutzt und clientseitig nach **Bezirk**, **Ortsteil** sowie per **Suche** filtert.

## Inhalt

- `index.html` – Modernes UI mit Filterung, Suche und Statistiken
- `data/nachfrage-2025-26.json` – Aktuelle Daten (generiert durch den Scraper)
- `scripts/scrape-nachfrage.mjs` – Node.js Scraper, der Daten für alle Bezirke zieht

## Schnellstart

1. Installiere Abhängigkeiten:
```bash
npm install
```

2. Scrape aktuelle Daten:
```bash
node scripts/scrape-nachfrage.mjs
```

3. Starte einen lokalen Webserver im Projektordner, z. B.:
```bash
python3 -m http.server 8000
```

4. Öffne im Browser:
- `http://localhost:8000/index.html`

## Features

- **Bezirks-Filter**: Filtere Gymnasien nach ihrem Berliner Bezirk.
- **Statistiken**: Automatische Berechnung von Durchschnitts-Nachfrage und Gesamtkapazität.
- **Farbcodes**: Schnelle optische Erfassung der Nachfragequote (Rot > 150%, Grün < 100%).
- **Responsive**: Optimiert für Desktop und mobile Endgeräte.
