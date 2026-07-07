# Investigation Explorer Demo (Standalone)

A **standalone** Palantir Gotham–style investigation prototype with **PnE English object categories** and fake Munich mock data. No Celonis frontend or dev server required.

Inspired by: [palantir-gotham-prototype.html](https://gist.github.com/jordanhorengic/44657449711ffd3b39c7ab3d00602080)

## Run locally

From this folder:

```bash
python3 -m http.server 8080
```

Open: **http://localhost:8080**

Or open `index.html` directly in a browser (some browsers restrict local module loading — the HTTP server is recommended).

## What's included

| Panel | Behavior |
|-------|----------|
| **Object Search** | Global search across all attributes with match context |
| **Incident Map** | Leaflet map; pin objects via **Show in Map** |
| **Network Graph** | Simple radial graph of related objects |
| **Object Details** | Attributes + related objects |

## Mock object categories (15)

Location, Organisation, Identity Record, Person, Case File, Criminal Offence, Regulatory Offence, Traffic Accident, Motor Vehicle, Firearm, Police Measure, Documents, Tip and Lead, Physical Description, Case Event

## Demo searches

- `Hells Wolves` → Organisation HQ
- `green` → matches vehicle colour or offence attribute
- `Raub` → Criminal Offence
- `M-AB 1234` → Motor Vehicle
- `Fahrzeug` → Tip and Lead category

## Files

```
index.html
styles.css
data/mock-data.js      # fake entities + relationships
js/display-names.js    # display name rules (PnE spec)
js/app.js              # map, search, graph, inspector
```

## Notes

- Mock data is fictional and loosely based on the PnE English demo story (Hells Wolves MC München, case VG-2026-0078).
- Display names follow the product rules we documented (e.g. Tip and Lead uses `KATEGORIE + EINGANGSDATUM`, not tip text).
- This prototype is **not** connected to Studio, PIG, or `ems-frontend`.
