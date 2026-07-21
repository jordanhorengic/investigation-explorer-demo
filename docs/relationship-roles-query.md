# Relationship Roles — How They Are Queried (Investigation Explorer Prototype)

This document explains how relationship roles are sourced, enriched, and used for the `role:` search filter in the [investigation-explorer-demo](https://jordanhorengic.github.io/investigation-explorer-demo/) prototype.

**Repo:** `investigation-explorer-demo`

---

## Summary

There is **no live role query at search time**. Roles are:

1. **Loaded from Data Lake binding tables during export** (offline script)
2. **Written onto each relation** in the static mock data
3. **Indexed in memory at app startup** for `role:` filter and autocomplete

The `role:` search filter is a lookup against an **entity → roles** index built from enriched relations.

---

## Phase 1: Export — Where Roles Come From

**Script:** `scripts/export-context-model.mjs`

Run locally:

```bash
node scripts/export-context-model.mjs --env ~/Projects/celonis/ems-frontend/.local.env
```

Requires `EMS_TEAM` and `EMS_TOKEN` in the env file. Writes:

- `data/context-model-export.json`
- `data/context-model-export.js` (`window.INVESTIGATION_MOCK`)

### Step 1 — Build base relations (no roles yet)

Relations are assembled from:

- Perspective link / junction tables (M2M)
- FK inference on entity objects
- Location links, etc.

At this point relations have `from`, `to`, `label`, `relationshipType` — typically **no role**.

### Step 2 — Discover which relationships have roles

The script calls the **PIG SL Ontology API**:

```
GET /pig-sl-ontology/api/ontology/packages/{PACKAGE_KEY}/semantic-relationships?withContent=true&limit=500
```

Package key used in the script: `7c4666c9_d865_45aa_a9ee_dff7470a3153`

For each semantic relationship it checks:

1. Is there a **table binding** (not SQL)?
2. Does the relationship define a **`ROLLE` attribute** in its ontology content?

If both are true, that relationship has role data in a Data Lake binding table.

### Step 3 — Query binding tables from Data Lake

For each qualifying relationship, the script:

1. Resolves the lake schema for the binding table
2. Fetches all rows via the PIG semantic layer lake APIs
3. Uses **`mappingColumns`** from the binding metadata to read each row:
   - **`ID` mapping** → source entity id (`from`)
   - **Other non-ROLLE mapping** → target entity id (`to`)
   - **`ROLLE` mapping** → role code for that link

Relevant code (`readBindingRole`):

```javascript
function readBindingRole(binding, row) {
  const roleMapping = (binding.mappingColumns ?? []).find(
    (mapping) => mapping.targetColumn === 'ROLLE'
  );
  if (!roleMapping) {
    return null;
  }
  return translateRoleLabel(readField(row, roleMapping.sourceColumn));
}
```

Endpoint resolution uses:

```javascript
function readBindingEndpoints(binding, row) {
  const mappings = binding.mappingColumns ?? [];
  const sourceIdMapping = mappings.find((mapping) => mapping.targetColumn === 'ID');
  const targetIdMapping = mappings.find(
    (mapping) => mapping.targetColumn !== 'ID' && mapping.targetColumn !== 'ROLLE'
  );
  // ... returns { from, to }
}
```

### Step 4 — Build a role index and attach to relations

Each binding row contributes to two indexes:

| Index | Key format | Purpose |
|---|---|---|
| `pairRoles` | `{fromId}\|{toId}` | Match by entity pair |
| `typedRoles` | `{fromId}\|{toId}\|{relationshipKey}` | Match by pair + relationship type |

Then `enrichRelationsWithBindingRoles()` merges those onto already-exported relations. Typed key is tried first, then pair key.

Exported relation shape:

```json
{
  "from": "bbbb-0008-0000-0000-bbbbbbbbbbbb",
  "to": "eeee-0005-0000-0000-eeeeeeeeeeee",
  "label": "Person Motor Vehicle (All)",
  "relationshipType": "Person_Kraftfahrzeug_Alle",
  "roles": ["Vehicle holder", "Driver"],
  "role": "Vehicle holder · Driver"
}
```

- `roles` — array of all roles on that link (used for search indexing)
- `role` — display string for graph edge labels (combined, max 2 shown + overflow count)

### Step 5 — Translate German role codes to English labels

Raw values from binding tables (e.g. `Halter`, `Fahrer`) are mapped via `ROLE_LABEL_MAP`:

```javascript
const ROLE_LABEL_MAP = {
  Halter: 'Vehicle holder',
  Fahrer: 'Driver',
  Zeuge: 'Witness',
  Bearbeiter: 'Case officer',
  // ... see scripts/export-context-model.mjs for full map
};
```

Unknown codes fall back to replacing underscores with spaces.

### Export stats (current mock)

| Metric | Value |
|---|---|
| Total relations | 1,966 |
| Relations with roles | 359 |
| Unique role labels | 14 |

Example role labels: Vehicle holder, Driver, Passenger, Witness, Case officer, Suspect, Accused person, Injured party, Board member, Managing director, Member, Employee, Reporting party, Measure location.

---

## Phase 2: Runtime — How `role:` Search Works

The browser **does not call any API** for roles.

### App startup

From `js/app.js`:

```javascript
const { entities, relations, objectTypes } = window.INVESTIGATION_MOCK;
const roleCatalog = SearchFilters.buildRoleCatalog(relations);
```

### Build entity → roles index

From `js/search-filters.js` — `buildRoleCatalog(relations)`:

- Iterates all relations
- Reads `relation.roles` (array) or falls back to `relation.role` (single string)
- For **both endpoints** (`relation.from` and `relation.to`), adds each role to that entity's set
- Returns:
  - `roles` — sorted list of all distinct role labels (for autocomplete)
  - `index` — `Map<entityId, Set<roleLabel>>`

**Important:** Both endpoints of a relation inherit the role. Example: if Person A → Vehicle B has role `Vehicle holder`, **both** Person A and Vehicle B are indexed with `Vehicle holder`.

### Applying the `role:` filter

When the user adds `role:Vehicle holder`:

1. `smart-search.js` parses the command and adds a pill to `searchFilters.roleRules`
2. `filterEntities()` in `search-filters.js` checks each entity via `entityHasRole(entity.id, rule.role, roleCatalog.index)`
3. Match is **case-insensitive exact match** on the role label
4. Entity matches if it holds that role on **any** relation (either as `from` or `to`)

Multiple `role:` pills combine with **AND** logic (entity must have all listed roles).

### Autocomplete

`smart-search.js` suggests roles from `roleCatalog.roles` when input starts with `role:`.

---

## End-to-End Flow

```
Ontology API (semantic-relationships)
  → Find bindings with ROLLE attribute
    → Data Lake binding tables (read rows via mappingColumns)
      → Translate role codes (Halter → Vehicle holder)
        → Enrich relations in export (roles + role fields)
          → Static INVESTIGATION_MOCK
            → buildRoleCatalog() at app load
              → role: filter + autocomplete
```

---

## Key Files

| File | Purpose |
|---|---|
| `scripts/export-context-model.mjs` | Full export pipeline; `buildBindingRoleIndex()`, `enrichRelationsWithBindingRoles()` |
| `scripts/inspect-pig-relationship-metadata.mjs` | Exploratory dump of PIG relationship metadata |
| `data/context-model-export.js` | Static mock data consumed by the prototype |
| `js/search-filters.js` | `buildRoleCatalog()`, `entityHasRole()`, `filterEntities()` |
| `js/smart-search.js` | `role:` command parsing, pills, autocomplete |
| `js/app.js` | Wires role catalog into search execution |

---

## Production Implications (MET-46)

The prototype pattern implies production needs:

1. **Relation metadata** exposing role(s) per link — sourced from binding-table `ROLLE` (or equivalent), not just perspective FK links
2. A **role catalog** — all distinct roles + entity→roles mapping (or queryable equivalent)
3. **Search backend support** for `role:` — filter entities that participate in any relation with the given role

The export script is the reference implementation for **where** roles live in Metropolis data: ontology binding metadata + Data Lake binding tables, keyed by `ROLLE`.

---

## APIs Used (Export Only)

| API | Path |
|---|---|
| PIG SL Ontology | `/pig-sl-ontology/api/ontology/packages/{PACKAGE_KEY}/semantic-relationships?withContent=true&limit=500` |
| PIG Semantic Layer (Lake schemas) | `/pig-semantic-layer/api/v1/package/{PACKAGE_KEY}/targets/development/pig/lake/schemas` |
| PIG Semantic Layer (Lake tables/rows) | `/pig-semantic-layer/api/v1/package/{PACKAGE_KEY}/targets/development/pig/lake/schemas/{schemaId}/tables/...` |

Perspective/PQL APIs are used for base relations and entities; **roles specifically come from ontology binding tables in Data Lake**, not from perspective link row queries alone.
