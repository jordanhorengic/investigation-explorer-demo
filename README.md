# Investigation Explorer Demo

A **standalone** Palantir Gotham–style investigation prototype with **PnE English object categories** and fake Munich mock data. No Celonis frontend or dev server required.

Inspired by: [palantir-gotham-prototype.html](https://gist.github.com/jordanhorengic/44657449711ffd3b39c7ab3d00602080)

## Share with others

**Live demo:** https://jordanhorengic.github.io/investigation-explorer-demo/

**Repository:** https://github.com/jordanhorengic/investigation-explorer-demo

Send colleagues the live link above, or clone the repo and run it locally (see below).

### Share a geographic area

On the **Map** tab, after selecting or drawing a geographic area, click **Share area** in the map toolbar. That copies a link which restores the same area filter and map highlight when opened.

Shared links encode the area in the URL (`?area=…`), including custom drawn shapes (rectangle, circle, polygon, lasso, and line corridor).

## Run locally

From this folder:

```bash
python3 -m http.server 8080
```

Open: **http://localhost:8080**

Or open `index.html` directly in a browser (some browsers restrict local module loading — the HTTP server is recommended).

## What's included

| Feature | Behavior |
|---------|----------|
| **Object Search** | Global search with smart filters (`type:`, `area:`, attribute rules) |
| **Map** | Leaflet map, pin objects, draw custom geographic areas, heatmap |
| **Network Graph** | Radial graph with shift+click multi-select |
| **New Object** | Create instances with attributes, attachments, and relationships |
| **Object Details** | Inspector panel with attributes and related objects |

### Map area drawing modes

Draw area → **Circle**, **Polygon**, **Rectangle**, **Lasso**, or **Line** (multi-segment corridor).

Geographic area search is available on the map only (not in global Search or Graph tabs).

## Mock object categories (15)

Location, Organisation, Identity Record, Person, Case File, Criminal Offence, Regulatory Offence, Traffic Accident, Motor Vehicle, Firearm, Police Measure, Documents, Tip and Lead, Physical Description, Case Event

## Demo searches

- `Hells Wolves` → Organisation HQ
- `area:München` → geographic area filter (map)
- `green` → matches vehicle colour or offence attribute
- `Raub` → Criminal Offence
- `M-AB 1234` → Motor Vehicle
- `type:Person` → filter by object type

## Files

```
index.html
styles.css
variant-styles.css
variants.html              # compare map search UI layouts
data/mock-data.js          # fake entities + relationships
data/geo-boundaries.js     # Munich polygon boundary
js/app.js                  # map, search, graph, workbench
js/map-locations.js        # geographic areas + draw helpers
js/smart-search.js         # filter pills and command menu
js/place-search.js         # Nominatim place search
js/new-object.js           # new object form
```

## Notes

- Mock data is fictional and loosely based on the PnE English demo story (Hells Wolves MC München, case VG-2026-0078).
- Display names follow the product rules we documented (e.g. Tip and Lead uses `KATEGORIE + EINGANGSDATUM`, not tip text).
- This prototype is **not** connected to Studio, PIG, or `ems-frontend`.
