#!/usr/bin/env node
/**
 * Export PnE English context model instances from Metropolis into INVESTIGATION_MOCK format.
 *
 * Usage:
 *   node scripts/export-context-model.mjs
 *   node scripts/export-context-model.mjs --env ~/Projects/celonis/ems-frontend/.local.env
 *
 * Writes:
 *   data/context-model-export.json
 *   data/context-model-export.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PACKAGE_KEY = '7c4666c9_d865_45aa_a9ee_dff7470a3153';
const TARGET = 'development';
const PAGE_SIZE = 500;

const OBJECT_TYPES = [
  { id: 'Location', technicalName: 'Oertlichkeit', color: '#2d72d2' },
  { id: 'Organisation', technicalName: 'Organisation', color: '#8f398f' },
  { id: 'Identity Record', technicalName: 'Personalie', color: '#48aff0' },
  { id: 'Person', technicalName: 'Person', color: '#0f9960' },
  { id: 'Case File', technicalName: 'Vorgang', color: '#d9822b' },
  { id: 'Criminal Offence', technicalName: 'Straftat', color: '#c23030' },
  { id: 'Regulatory Offence', technicalName: 'Ordnungswidrigkeit', color: '#db3737' },
  { id: 'Traffic Accident', technicalName: 'Verkehrsunfall', color: '#a66321' },
  { id: 'Motor Vehicle', technicalName: 'Kraftfahrzeug', color: '#106ba3' },
  { id: 'Firearm', technicalName: 'Schusswaffe', color: '#9b110e' },
  { id: 'Police Measure', technicalName: 'HoheitlicheMassnahme', color: '#634dbf' },
  { id: 'Documents', technicalName: 'Dokumente', color: '#5c7080' },
  { id: 'Tip and Lead', technicalName: 'Hinweis', color: '#00b3a4' },
  { id: 'Physical Description', technicalName: 'Personenbeschreibung', color: '#7a5195' },
  { id: 'Case Event', technicalName: 'VorgangEreignis', color: '#d9822b' },
];

const TYPE_BY_TECH = new Map(OBJECT_TYPES.map((type) => [type.technicalName, type.id]));
const TECH_BY_TYPE = new Map(OBJECT_TYPES.map((type) => [type.id, type.technicalName]));

const M2M_LINK_FIELD_GUESSES = {
  Person_Wohnsitz_Oertlichkeit: ['ID', 'PERSON_ID', 'OERTLICHKEIT_ID'],
  Person_Arbeitsstaette_Oertlichkeit: ['ID', 'PERSON_ID', 'OERTLICHKEIT_ID'],
  Person_Aufenthaltsort_Oertlichkeit: ['ID', 'PERSON_ID', 'OERTLICHKEIT_ID'],
  Person_Vorgang_Alle: ['ID', 'PERSON_ID', 'VORGANG_ID'],
  Person_Taeter_Vorgang: ['ID', 'PERSON_ID', 'VORGANG_ID'],
  Person_Geschaedigter_Vorgang: ['ID', 'PERSON_ID', 'VORGANG_ID'],
  Person_Zeuge_Vorgang: ['ID', 'PERSON_ID', 'VORGANG_ID'],
  Person_Bearbeiter_Vorgang: ['ID', 'PERSON_ID', 'VORGANG_ID'],
  Person_Netzwerk_Person: ['ID', 'PERSON_ID', 'RELATED_PERSON_ID'],
  Person_Kraftfahrzeug_Alle: ['ID', 'PERSON_ID', 'KRAFTFAHRZEUG_ID'],
  Person_Organisation_Alle: ['ID', 'PERSON_ID', 'ORGANISATION_ID'],
  Dokumente_Person: ['ID', 'DOKUMENTE_ID', 'PERSON_ID'],
  Dokumente_Vorgang: ['ID', 'DOKUMENTE_ID', 'VORGANG_ID'],
  Dokumente_Oertlichkeit: ['ID', 'DOKUMENTE_ID', 'OERTLICHKEIT_ID'],
  Dokumente_Straftat: ['ID', 'DOKUMENTE_ID', 'STRAFTAT_ID'],
  Dokumente_Kraftfahrzeug: ['ID', 'DOKUMENTE_ID', 'KRAFTFAHRZEUG_ID'],
  Hinweis_Person: ['ID', 'HINWEIS_ID', 'PERSON_ID'],
  HoheitlicheMassnahme_Person: ['ID', 'HOHEITLICHEMASSNAHME_ID', 'PERSON_ID'],
  Verkehrsunfall_Person_Beteiligter: ['ID', 'VERKEHRSUNFALL_ID', 'PERSON_ID'],
};
const LOCATION_FIELD_BY_TYPE = {
  Organisation: 'SITZ_OERTLICHKEIT_ID',
  Straftat: 'TATORT_ID',
  Ordnungswidrigkeit: 'TATORT_ID',
  Verkehrsunfall: 'ORT_ID',
  HoheitlicheMassnahme: 'ORT_ID',
  Schusswaffe: 'FUNDORT_ID',
};

const RELATIONSHIP_OBJECT_TYPES = new Set([
  'Person_Wohnsitz_Oertlichkeit',
  'Person_Arbeitsstaette_Oertlichkeit',
  'Person_Aufenthaltsort_Oertlichkeit',
  'Organisation_Sitz_Oertlichkeit',
  'Organisation_Niederlassung_Oertlichkeit',
]);

const LOCATION_ROLE_BY_REL = {
  Person_Wohnsitz_Oertlichkeit: 'Home',
  Person_Arbeitsstaette_Oertlichkeit: 'Work',
  Person_Aufenthaltsort_Oertlichkeit: 'Whereabouts',
  Organisation_Sitz_Oertlichkeit: 'Headquarter',
  Organisation_Niederlassung_Oertlichkeit: 'Branch',
};

const CONNECTION_TYPE_BY_RELATIONSHIP = {
  Person_Wohnsitz_Oertlichkeit: 'residence',
  Person_Arbeitsstaette_Oertlichkeit: 'workplace',
  Person_Aufenthaltsort_Oertlichkeit: 'last sighting',
  Organisation_Sitz_Oertlichkeit: 'headquarters',
  Organisation_Niederlassung_Oertlichkeit: 'branch',
  Straftat_Tatort_Oertlichkeit: 'crime scene',
  Ordnungswidrigkeit_Tatort_Oertlichkeit: 'offence scene',
  Verkehrsunfall_Ort_Oertlichkeit: 'accident location',
  Verkehrsunfall_Unfallort_Oertlichkeit: 'accident location',
  Massnahme_Massnahmeort_Oertlichkeit: 'measure location',
  Straftat_Fluchtweg_Oertlichkeit: 'escape route',
  Straftat_Vorbereitungsort_Oertlichkeit: 'preparation site',
  Dokumente_Oertlichkeit: 'found at',
};

const CONNECTION_TYPE_BY_ROLE = {
  Home: 'residence',
  Work: 'workplace',
  Whereabouts: 'last sighting',
  Headquarter: 'headquarters',
  Branch: 'branch',
  'Measure location': 'measure location',
  'Preparation site': 'preparation site',
};

const FK_LOCATION_CONNECTIONS = [
  { types: ['Organisation'], field: 'SITZ_OERTLICHKEIT_ID', type: 'headquarters' },
  { types: ['Criminal Offence'], field: 'TATORT_ID', type: 'crime scene' },
  { types: ['Regulatory Offence'], field: 'TATORT_ID', type: 'offence scene' },
  { types: ['Traffic Accident'], field: 'ORT_ID', type: 'accident location' },
  { types: ['Police Measure'], field: 'ORT_ID', type: 'measure location' },
  { types: ['Firearm'], field: 'FUNDORT_OERTLICHKEIT_ID', type: 'found at' },
  { types: ['Firearm'], field: 'FUNDORT_ID', type: 'found at' },
  { types: ['Documents'], field: 'FUNDORT_OERTLICHKEIT_ID', type: 'found at' },
];

const ROLE_LABEL_MAP = {
  Halter: 'Vehicle holder',
  Fahrer: 'Driver',
  Mitfahrer: 'Passenger',
  Bearbeiter: 'Case officer',
  Beschuldigter: 'Accused person',
  Geschädigter: 'Injured party',
  Tatverdächtiger: 'Suspect',
  Zeuge: 'Witness',
  Wohnsitz: 'Home',
  Arbeitsstätte: 'Work',
  Aufenthaltsort: 'Whereabouts',
  Massnahmeort: 'Measure location',
  Vorbereitungsort: 'Preparation site',
  Fluchtfahrzeug: 'Escape vehicle',
  Tatfahrzeug: 'Offence vehicle',
  VU_Beteiligter: 'Accident participant',
  VU_Fahrzeug: 'Accident vehicle',
  VU_Verletzter: 'Injured person',
  VU_Beteiligte_Organisation: 'Involved organisation',
  Komplize: 'Accomplice',
  Bekannter: 'Associate',
  Familie: 'Family',
  Mitglied: 'Member',
  Mitarbeiter: 'Employee',
  Geschäftsführer: 'Managing director',
  Vorstand: 'Board member',
  Personaldokument: 'Identity document',
  Anlage: 'Attachment',
  Anzeige: 'Report',
  Anzeigender: 'Reporting party',
  BetroffenePerson: 'Affected person',
  Hinweis_betrifft_Person: 'Tip relates to person',
  Geschäftsbeziehung: 'Business relationship',
};

function translateRoleLabel(rawRole) {
  const value = String(rawRole ?? '').trim();
  if (!value) {
    return null;
  }
  if (ROLE_LABEL_MAP[value]) {
    return ROLE_LABEL_MAP[value];
  }
  return value.replaceAll('_', ' ');
}

function isTableBinding(binding) {
  return Boolean(binding?.table?.trim()) && !binding?.sql;
}

function parseEnvFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const values = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      values[match[1]] = match[2].trim();
    }
  }
  return values;
}

function readField(row, fieldId) {
  const direct = row[fieldId] ?? row[`"${fieldId}"`] ?? row[`${fieldId}`];
  if (direct !== undefined && direct !== null && direct !== '') {
    return direct;
  }
  for (const [key, value] of Object.entries(row)) {
    const normalized = key.replaceAll('"', '');
    if (normalized === fieldId || normalized.endsWith(`.${fieldId}`)) {
      return value;
    }
  }
  return null;
}

function buildPerspectiveKey(perspective) {
  const namespace = perspective?.entityIdentifier?.namespace ?? '';
  const name = perspective?.entityIdentifier?.name ?? '';
  return `perspective.${namespace}.${name}`;
}

function tableNameFor(entityIdentifier) {
  return entityIdentifier?.name ?? '';
}

async function apiGet(baseUrl, token, apiPath) {
  const response = await fetch(`${baseUrl}${apiPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GET ${apiPath} failed (${response.status}): ${body.slice(0, 400)}`);
  }
  return response.json();
}

async function apiPost(baseUrl, token, apiPath, payload) {
  const response = await fetch(`${baseUrl}${apiPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`POST ${apiPath} failed (${response.status}): ${body.slice(0, 400)}`);
  }
  return response.json();
}

async function apiPut(baseUrl, token, apiPath) {
  const response = await fetch(`${baseUrl}${apiPath}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`PUT ${apiPath} failed (${response.status}): ${body.slice(0, 400)}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function perspectiveApiBase(perspectiveKey) {
  return (
    `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}` +
    `/targets/${encodeURIComponent(TARGET)}/pig/pql/${encodeURIComponent(perspectiveKey)}`
  );
}

async function probePerspectiveQuery(baseUrl, token, perspectiveKey) {
  try {
    const result = await queryTable(baseUrl, token, perspectiveKey, 'Person', ['ID'], 0);
    return !result.error && (result.rows?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

async function ensurePerspectiveLoaded(baseUrl, token, perspectiveKey) {
  const base = perspectiveApiBase(perspectiveKey);

  const currentStatus = await apiGet(baseUrl, token, `${base}/load/terminal-status`).catch(() => null);
  if (currentStatus?.phase === 'SUCCESS' || currentStatus?.status === 'COMPLETED') {
    console.log('Perspective cache already ready');
    return;
  }

  console.log('Loading perspective cache...');
  await apiPut(baseUrl, token, `${base}/load`);

  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const status = await apiGet(baseUrl, token, `${base}/load/terminal-status`);
    if (status.phase === 'SUCCESS' || status.status === 'COMPLETED') {
      console.log('Perspective cache ready');
      return;
    }
    if (status.phase === 'FAILED' || status.status === 'FAILED') {
      if (await probePerspectiveQuery(baseUrl, token, perspectiveKey)) {
        console.warn(
          'Perspective reload failed, but existing cache is queryable — continuing export.',
        );
        if (status.errors?.[0]) {
          console.warn(status.errors[0].split('\n')[0]);
        }
        return;
      }
      throw new Error(`Perspective load failed: ${status.errors?.[0] ?? status.message ?? JSON.stringify(status)}`);
    }
    if (attempt % 10 === 9) {
      console.log(`Still loading perspective cache (${status.phase ?? status.status ?? 'unknown'})...`);
    }
  }

  if (await probePerspectiveQuery(baseUrl, token, perspectiveKey)) {
    console.warn('Perspective reload timed out, but existing cache is queryable — continuing export.');
    return;
  }

  throw new Error('Perspective load timed out');
}

async function fetchPerspectiveSchema(baseUrl, token, perspectiveKey) {
  return apiGet(
    baseUrl,
    token,
    `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}` +
      `/targets/${encodeURIComponent(TARGET)}/pig/perspectives/${encodeURIComponent(perspectiveKey)}/schema`,
  );
}

const PERSPECTIVE_JUNCTION_TO_RELATIONSHIP = {
  Person__Vorgang: 'Person_Vorgang_Alle',
  Person__Organisation: 'Person_Organisation_Alle',
  Person__Kraftfahrzeug: 'Person_Kraftfahrzeug_Alle',
};

function junctionRelationMeta(pig, sourceTable, targetTable, junctionTableName) {
  const preferredName = PERSPECTIVE_JUNCTION_TO_RELATIONSHIP[junctionTableName];
  const candidates = (pig.relationships ?? []).filter((relationship) => {
    if (relationship.cardinality !== 'MANY_TO_MANY') {
      return false;
    }
    const sourceName = relationship.source?.name ?? relationship.source;
    const targetName = relationship.target?.name ?? relationship.target;
    return sourceName === sourceTable && targetName === targetTable;
  });

  const match =
    (preferredName ? candidates.find((rel) => rel.entityIdentifier?.name === preferredName) : null) ??
    candidates.find((rel) => String(rel.entityIdentifier?.name ?? '').includes('_Alle')) ??
    candidates[0];

  if (match) {
    return {
      label: match.displayName ?? junctionTableName,
      relationshipType: match.entityIdentifier?.name ?? junctionTableName,
    };
  }

  return {
    label: `${sourceTable} ↔ ${targetTable}`,
    relationshipType: junctionTableName,
  };
}

async function exportPerspectiveJunctionTables(pig, baseUrl, token, perspectiveKey, schema) {
  const relations = [];
  const junctionTables = new Map();

  for (const foreignKey of schema.foreignKeys ?? []) {
    const junctionTableName = foreignKey.factTableName;
    if (!junctionTableName || !String(junctionTableName).includes('__')) {
      continue;
    }

    if (!junctionTables.has(junctionTableName)) {
      junctionTables.set(junctionTableName, { sides: [] });
    }

    junctionTables.get(junctionTableName).sides.push({
      dimensionTable: foreignKey.dimensionTableName,
      junctionColumn: foreignKey.factTableColumns?.[0],
    });
  }

  for (const [junctionTableName, meta] of junctionTables) {
    const sides = meta.sides.filter((side) => side.junctionColumn);
    const sourceSide = sides.find((side) => side.junctionColumn === 'ID') ?? sides[0];
    const targetSide = sides.find((side) => side.junctionColumn !== 'ID') ?? sides[1];
    if (!sourceSide || !targetSide) {
      continue;
    }

    const fieldIds = ['ID'];
    if (targetSide.junctionColumn !== 'ID') {
      fieldIds.push(targetSide.junctionColumn);
    }

    try {
      const rows = await fetchAllRows(baseUrl, token, perspectiveKey, junctionTableName, fieldIds);
      const relationMeta = junctionRelationMeta(
        pig,
        sourceSide.dimensionTable,
        targetSide.dimensionTable,
        junctionTableName,
      );
      console.log(`Perspective junction ${junctionTableName}: ${rows.length} rows`);

      for (const row of rows) {
        const fromId = readField(row, sourceSide.junctionColumn);
        const toId = readField(row, targetSide.junctionColumn);
        if (!fromId || !toId) {
          continue;
        }
        relations.push({
          from: String(fromId),
          to: String(toId),
          label: relationMeta.label,
          relationshipType: relationMeta.relationshipType,
        });
      }
    } catch (error) {
      console.warn(`Perspective junction ${junctionTableName} unavailable: ${error.message.split('\n')[0]}`);
    }
  }

  return relations;
}

async function queryTable(baseUrl, token, perspectiveKey, tableName, fields, offset = 0) {
  const apiPath =
    `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}` +
    `/targets/${encodeURIComponent(TARGET)}/pig/pql/${encodeURIComponent(perspectiveKey)}/classic-query`;

  const pqlFields = fields.map((fieldId) => ({
    pqlExpression: `"${tableName}"."${fieldId}"`,
    alias: `"${fieldId}"`,
  }));

  return apiPost(baseUrl, token, apiPath, {
    queryType: 'TABLE',
    fields: pqlFields,
    limit: PAGE_SIZE,
    offset,
  });
}

async function fetchAllRows(baseUrl, token, perspectiveKey, tableName, fieldIds) {
  const rows = [];
  let offset = 0;
  while (true) {
    const result = await queryTable(baseUrl, token, perspectiveKey, tableName, fieldIds, offset);
    if (result.error) {
      throw new Error(`Query ${tableName} failed: ${result.error}`);
    }
    rows.push(...(result.rows ?? []));
    const batchSize = result.rows?.length ?? 0;
    if (batchSize < PAGE_SIZE) {
      break;
    }
    offset += batchSize;
  }
  return rows;
}

async function fetchOntologyRelationships(baseUrl, token) {
  return apiGet(
    baseUrl,
    token,
    `/pig-sl-ontology/api/ontology/packages/${encodeURIComponent(PACKAGE_KEY)}/semantic-relationships?withContent=true&limit=500`,
  );
}

async function fetchLakeSchemas(baseUrl, token) {
  return apiGet(
    baseUrl,
    token,
    `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}/targets/${encodeURIComponent(TARGET)}/pig/lake/schemas`,
  );
}

async function fetchLakeTableNames(baseUrl, token, schemaId) {
  return apiGet(
    baseUrl,
    token,
    `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}` +
      `/targets/${encodeURIComponent(TARGET)}/pig/lake/schemas/${encodeURIComponent(schemaId)}/tables`,
  );
}

async function buildLakeTableIndex(baseUrl, token, lakeSchemas) {
  const tableToSchemaId = new Map();
  for (const schema of [...(lakeSchemas ?? [])].reverse()) {
    if (!schema?.id) {
      continue;
    }
    try {
      const tables = await fetchLakeTableNames(baseUrl, token, schema.id);
      for (const tableName of tables ?? []) {
        if (!tableToSchemaId.has(tableName)) {
          tableToSchemaId.set(tableName, schema.id);
        }
      }
    } catch (error) {
      console.warn(`Lake tables unavailable for schema ${schema.name ?? schema.id}: ${error.message.split('\n')[0]}`);
    }
  }
  return tableToSchemaId;
}

async function queryLakeTable(baseUrl, token, schemaId, sql) {
  const apiPath =
    `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}` +
    `/targets/${encodeURIComponent(TARGET)}/pig/lake/schemas/${encodeURIComponent(schemaId)}/query`;
  return apiPost(baseUrl, token, apiPath, { query: sql });
}

async function fetchAllLakeRows(baseUrl, token, schemaId, tableName, sourceColumns) {
  const uniqueColumns = [...new Set(sourceColumns.filter(Boolean))];
  const columnSql = uniqueColumns.join(', ');
  const rows = [];
  let offset = 0;

  while (true) {
    const result = await queryLakeTable(
      baseUrl,
      token,
      schemaId,
      `SELECT ${columnSql} FROM ${tableName} LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    );
    if (!Array.isArray(result)) {
      throw new Error(`Lake query ${tableName} failed: ${JSON.stringify(result).slice(0, 300)}`);
    }
    rows.push(...result);
    if (result.length < PAGE_SIZE) {
      break;
    }
    offset += result.length;
  }

  return rows;
}

function resolveLakeSchemaId(binding, lakeSchemas, tableToSchemaId) {
  const indexed = tableToSchemaId.get(binding.table);
  if (indexed) {
    return indexed;
  }
  if (binding?.schema) {
    const direct = (lakeSchemas ?? []).find((schema) => schema.id === binding.schema);
    if (direct) {
      return direct.id;
    }
  }
  return null;
}

function readBindingEndpoints(binding, row) {
  const mappings = binding.mappingColumns ?? [];
  const sourceIdMapping = mappings.find((mapping) => mapping.targetColumn === 'ID');
  const targetIdMapping = mappings.find(
    (mapping) => mapping.targetColumn !== 'ID' && mapping.targetColumn !== 'ROLLE',
  );
  if (!sourceIdMapping || !targetIdMapping) {
    return null;
  }

  const fromId = readField(row, sourceIdMapping.sourceColumn);
  const toId = readField(row, targetIdMapping.sourceColumn);
  if (!fromId || !toId) {
    return null;
  }

  return { from: String(fromId), to: String(toId) };
}

function readBindingRole(binding, row) {
  const roleMapping = (binding.mappingColumns ?? []).find((mapping) => mapping.targetColumn === 'ROLLE');
  if (!roleMapping) {
    return null;
  }
  return translateRoleLabel(readField(row, roleMapping.sourceColumn));
}

function addRoleToIndex(index, key, role) {
  if (!role) {
    return;
  }
  if (!index.has(key)) {
    index.set(key, new Set());
  }
  index.get(key).add(role);
}

function formatCombinedRolesForExport(roles) {
  const unique = [...roles];
  if (unique.length <= 2) {
    return unique.join(' · ');
  }
  return `${unique.slice(0, 2).join(' · ')} +${unique.length - 2}`;
}

async function buildBindingRoleIndex(baseUrl, token, lakeSchemas, tableToSchemaId, entityById = null) {
  const pairRoles = new Map();
  const typedRoles = new Map();
  const locationConnections = new Map();
  const ontologyNodes = await fetchOntologyRelationships(baseUrl, token);

  for (const node of ontologyNodes ?? []) {
    const relationshipKey = node.key ?? node.name;
    const content = node.content ?? node;
    const binding = (content.bindings ?? []).find(isTableBinding);
    if (!relationshipKey || !binding) {
      continue;
    }

    const hasRoleAttribute = (content.attributes ?? []).some((attribute) => attribute.id === 'ROLLE');
    if (!hasRoleAttribute) {
      continue;
    }

    const schemaId = resolveLakeSchemaId(binding, lakeSchemas, tableToSchemaId);
    if (!schemaId) {
      console.warn(`Binding table ${binding.table} has no accessible lake schema`);
      continue;
    }

    const sourceColumns = (binding.mappingColumns ?? []).map((mapping) => mapping.sourceColumn).filter(Boolean);
    if (sourceColumns.length === 0) {
      continue;
    }

    try {
      const rows = await fetchAllLakeRows(baseUrl, token, schemaId, binding.table, sourceColumns);
      console.log(`Binding roles ${binding.table} (${relationshipKey}): ${rows.length} rows`);

      for (const row of rows) {
        const endpoints = readBindingEndpoints(binding, row);
        const role = readBindingRole(binding, row);
        if (!endpoints || !role) {
          continue;
        }
        addRoleToIndex(pairRoles, `${endpoints.from}|${endpoints.to}`, role);
        addRoleToIndex(typedRoles, `${endpoints.from}|${endpoints.to}|${relationshipKey}`, role);

        if (entityById) {
          appendBindingLocationConnection(
            locationConnections,
            entityById,
            endpoints.from,
            endpoints.to,
            relationshipKey,
            role,
          );
        }
      }
    } catch (error) {
      console.warn(`Binding table ${binding.table} unavailable: ${error.message.split('\n')[0]}`);
    }
  }

  return { pairRoles, typedRoles, locationConnections };
}

function enrichRelationsWithBindingRoles(relations, roleIndex) {
  let enriched = 0;

  for (const relation of relations) {
    const typedKey = `${relation.from}|${relation.to}|${relation.relationshipType || relation.label || ''}`;
    const pairKey = `${relation.from}|${relation.to}`;
    const roles = new Set([
      ...(roleIndex.typedRoles.get(typedKey) ?? []),
      ...(roleIndex.pairRoles.get(pairKey) ?? []),
    ]);

    if (roles.size === 0) {
      continue;
    }

    const roleList = [...roles];
    relation.roles = roleList;
    relation.role = formatCombinedRolesForExport(roleList);
    enriched += 1;

    if (RELATIONSHIP_OBJECT_TYPES.has(relation.relationshipType)) {
      relation.kind = 'location';
    }
  }

  return enriched;
}

function dedupeRelations(relations) {
  const byFullKey = new Map();
  const basesWithRole = new Set();

  for (const relation of relations) {
    const baseKey = `${relation.from}|${relation.to}|${relation.relationshipType || relation.label}`;
    const fullKey = `${baseKey}|${relation.role || ''}`;
    if (!byFullKey.has(fullKey)) {
      byFullKey.set(fullKey, relation);
    }
    if (relation.role) {
      basesWithRole.add(baseKey);
    }
  }

  const deduped = [];
  for (const relation of byFullKey.values()) {
    const baseKey = `${relation.from}|${relation.to}|${relation.relationshipType || relation.label}`;
    if (!relation.role && basesWithRole.has(baseKey)) {
      continue;
    }
    deduped.push(relation);
  }

  return deduped;
}

function rowToAttributes(row, fieldIds) {
  const attributes = {};
  for (const fieldId of fieldIds) {
    const value = readField(row, fieldId);
    if (value === null || value === undefined || value === '') {
      continue;
    }
    attributes[fieldId] = value;
  }
  return attributes;
}

function enrichGeo(entity, technicalName, attributes) {
  const lat =
    attributes.GEO_LAT ??
    attributes.FUNDORT_GEO_LAT ??
    readNumber(attributes.GEO_LAT) ??
    readNumber(attributes.FUNDORT_GEO_LAT);
  const lon =
    attributes.GEO_LON ??
    attributes.FUNDORT_GEO_LON ??
    readNumber(attributes.GEO_LON) ??
    readNumber(attributes.FUNDORT_GEO_LON);

  if (lat != null && lon != null) {
    entity.geo = { lat: Number(lat), lon: Number(lon) };
  }

  const locationField = LOCATION_FIELD_BY_TYPE[technicalName];
  if (locationField && attributes[locationField]) {
    entity.locationId = String(attributes[locationField]);
  }
}

function readNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function entityFromRow(technicalName, englishType, row, fieldIds) {
  const id = String(readField(row, 'ID') ?? '');
  if (!id) {
    return null;
  }
  const attributes = rowToAttributes(row, fieldIds);
  const entity = { id, type: englishType, attributes };
  enrichGeo(entity, technicalName, attributes);
  return entity;
}

function buildFkRelationIndex(pig) {
  const index = new Map();
  for (const relationship of pig.relationships ?? []) {
    const sourceName = relationship.source?.name ?? relationship.source;
    if (!sourceName || relationship.source?.entityType !== 'OBJECT') {
      continue;
    }
    for (const mapping of relationship.foreignKeyMappings ?? []) {
      const sourceFieldId = mapping.sourceField?.id;
      if (!sourceFieldId) {
        continue;
      }
      index.set(`${sourceName}|${sourceFieldId}`, {
        label: relationship.displayName ?? relationship.entityIdentifier?.name ?? `${sourceName} ${sourceFieldId}`,
        relationshipType: relationship.entityIdentifier?.name ?? `${sourceName} ${sourceFieldId}`,
        targetName: relationship.target?.name ?? relationship.target,
        cardinality: relationship.cardinality,
      });
    }
  }
  return index;
}

function inferRelationsFromForeignKeys(entities, entityById, fkRelationIndex = new Map()) {
  const relations = [];
  for (const entity of entities) {
    const technicalName = TECH_BY_TYPE.get(entity.type);
    for (const [key, value] of Object.entries(entity.attributes ?? {})) {
      if (!key.endsWith('_ID') || !value) {
        continue;
      }
      if (['GEO_LAT', 'GEO_LON', 'FUNDORT_GEO_LAT', 'FUNDORT_GEO_LON'].includes(key)) {
        continue;
      }
      const targetId = String(value);
      if (!entityById.has(targetId) || targetId === entity.id) {
        continue;
      }
      const meta = technicalName ? fkRelationIndex.get(`${technicalName}|${key}`) : null;
      relations.push({
        from: entity.id,
        to: targetId,
        label: meta?.label ?? `${entity.type} ${key}`,
        relationshipType: meta?.relationshipType ?? `${entity.type} ${key}`,
      });
    }
  }
  return relations;
}

function relationFromManyToManyRow(tableName, row, sourceName, targetName, relationshipMeta) {
  const fieldIds = Object.keys(row).map((key) => key.replaceAll('"', ''));
  const sourceField =
    fieldIds.find((field) => field === `${sourceName}_ID`) ??
    fieldIds.find((field) => field.endsWith('_ID') && field.includes(String(sourceName).slice(0, 4)));
  const targetField =
    fieldIds.find((field) => field === `${targetName}_ID`) ??
    fieldIds.find((field) => field.endsWith('_ID') && field !== sourceField && field !== 'ID');

  const fromId = sourceField ? readField(row, sourceField) : null;
  const toId = targetField ? readField(row, targetField) : null;
  if (!fromId || !toId) {
    return relationFromLinkRow(tableName, row);
  }

  const relation = {
    from: String(fromId),
    to: String(toId),
    label: relationshipMeta.displayName ?? tableName,
    relationshipType: tableName,
  };

  if (LOCATION_ROLE_BY_REL[tableName]) {
    relation.kind = 'location';
    relation.role = LOCATION_ROLE_BY_REL[tableName];
  }

  return relation;
}

async function exportManyToManyLinkTables(pig, baseUrl, token, perspectiveKey) {
  const relations = [];
  for (const relationship of pig.relationships ?? []) {
    if (relationship.cardinality !== 'MANY_TO_MANY') {
      continue;
    }
    const tableName = relationship.entityIdentifier?.name;
    if (!tableName) {
      continue;
    }

    const sourceName = relationship.source?.name ?? relationship.source;
    const targetName = relationship.target?.name ?? relationship.target;
    const fieldIds =
      M2M_LINK_FIELD_GUESSES[tableName] ??
      [
        'ID',
        `${sourceName}_ID`,
        `${targetName}_ID`,
        'SOURCE_ID',
        'TARGET_ID',
      ];

    try {
      const rows = await fetchAllRows(baseUrl, token, perspectiveKey, tableName, fieldIds);
      console.log(`Link table ${tableName}: ${rows.length} rows`);
      for (const row of rows) {
        const relation = relationFromManyToManyRow(tableName, row, sourceName, targetName, relationship);
        if (relation) {
          relations.push(relation);
        }
      }
    } catch (error) {
      console.warn(`Link table ${tableName} unavailable: ${error.message.split('\n')[0]}`);
    }
  }
  return relations;
}

function relationFromLinkRow(tableName, row) {
  const keys = Object.keys(row).map((key) => key.replaceAll('"', ''));
  const idFields = keys.filter((key) => key.endsWith('_ID') || key === 'ID');
  const values = idFields
    .map((field) => ({ field, value: readField(row, field) }))
    .filter((entry) => entry.value);

  if (values.length < 2) {
    return null;
  }

  const left = values[0];
  const right = values[1];
  const relation = {
    from: String(left.value),
    to: String(right.value),
    label: tableName,
    relationshipType: tableName,
  };

  if (RELATIONSHIP_OBJECT_TYPES.has(tableName)) {
    relation.kind = 'location';
    relation.role = LOCATION_ROLE_BY_REL[tableName] ?? 'Location';
  }

  return relation;
}

function applyPersonLocations(entities, relations) {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  for (const relation of relations) {
    if (relation.kind !== 'location' || !relation.role) {
      continue;
    }
    const person = entityById.get(relation.from);
    if (!person || person.type !== 'Person') {
      continue;
    }
    if (!person.personLocations) {
      person.personLocations = [];
    }
    if (!person.personLocations.some((entry) => entry.locationId === relation.to && entry.label === relation.role)) {
      person.personLocations.push({ label: relation.role, locationId: relation.to });
    }
  }
}

function connectionTypeFromRelation(relation) {
  const relationshipType = relation.relationshipType || relation.label || '';
  if (CONNECTION_TYPE_BY_RELATIONSHIP[relationshipType]) {
    return CONNECTION_TYPE_BY_RELATIONSHIP[relationshipType];
  }
  if (relation.role && CONNECTION_TYPE_BY_ROLE[relation.role]) {
    return CONNECTION_TYPE_BY_ROLE[relation.role];
  }
  if (relation.role) {
    return String(relation.role).trim().toLowerCase();
  }
  if (/crime scene|tatort/i.test(relationshipType)) {
    return 'crime scene';
  }
  if (/offence scene|ordnungswidrigkeit/i.test(relationshipType)) {
    return 'offence scene';
  }
  if (/accident|unfall/i.test(relationshipType)) {
    return 'accident location';
  }
  if (/found|fundort|dokumente/i.test(relationshipType)) {
    return 'found at';
  }
  return 'location';
}

function upsertOertlichkeitConnection(connections, seen, { type, id, primary = false }) {
  const locationId = String(id || '').trim();
  const connectionType = String(type || '').trim();
  if (!locationId || !connectionType) {
    return;
  }

  const key = `${connectionType}|${locationId}`;
  if (seen.has(key)) {
    if (primary) {
      const existing = connections.find((entry) => entry.type === connectionType && entry.id === locationId);
      if (existing) {
        existing.primary = true;
      }
    }
    return;
  }

  seen.add(key);
  const entry = { type: connectionType, id: locationId };
  if (primary) {
    entry.primary = true;
  }
  connections.push(entry);
}

function normalizeOertlichkeitPrimary(connections) {
  if (!connections.length) {
    return;
  }
  const primaryEntries = connections.filter((entry) => entry.primary);
  if (primaryEntries.length === 0) {
    connections[0].primary = true;
    return;
  }
  if (primaryEntries.length === 1) {
    return;
  }
  let kept = false;
  for (const entry of connections) {
    if (!entry.primary) {
      continue;
    }
    if (kept) {
      delete entry.primary;
    } else {
      kept = true;
    }
  }
}

function appendBindingLocationConnection(
  locationConnections,
  entityById,
  fromId,
  toId,
  relationshipKey,
  role,
) {
  const fromEntity = entityById.get(fromId);
  const toEntity = entityById.get(toId);
  if (!fromEntity || !toEntity || toEntity.type !== 'Location') {
    return;
  }

  let connectionType = CONNECTION_TYPE_BY_RELATIONSHIP[relationshipKey];
  if (!connectionType && role) {
    connectionType = CONNECTION_TYPE_BY_ROLE[role] || String(role).trim().toLowerCase();
  }
  if (!connectionType) {
    return;
  }

  if (!locationConnections.has(fromEntity.id)) {
    locationConnections.set(fromEntity.id, []);
  }

  const connections = locationConnections.get(fromEntity.id);
  const seen = new Set(connections.map((entry) => `${entry.type}|${entry.id}`));
  upsertOertlichkeitConnection(connections, seen, {
    type: connectionType,
    id: toId,
    primary:
      connectionType === 'residence' ||
      connectionType === 'headquarters' ||
      connectionType === 'found at' ||
      connectionType === 'crime scene' ||
      connectionType === 'offence scene' ||
      connectionType === 'accident location',
  });
}

function mergeBindingLocationConnections(entities, locationConnections) {
  let merged = 0;
  for (const entity of entities) {
    const bindingConnections = locationConnections.get(entity.id);
    if (!bindingConnections?.length) {
      continue;
    }
    if (!entity.Oertlichkeiten) {
      entity.Oertlichkeiten = [];
    }
    const seen = new Set(entity.Oertlichkeiten.map((entry) => `${entry.type}|${entry.id}`));
    for (const connection of bindingConnections) {
      upsertOertlichkeitConnection(entity.Oertlichkeiten, seen, connection);
    }
    normalizeOertlichkeitPrimary(entity.Oertlichkeiten);
    merged += 1;
  }
  return merged;
}

function applyOertlichkeiten(entities, relations, entityById) {
  let enriched = 0;

  for (const entity of entities) {
    if (entity.type === 'Location') {
      continue;
    }

    const connections = [];
    const seen = new Set();

    for (const rule of FK_LOCATION_CONNECTIONS) {
      if (!rule.types.includes(entity.type)) {
        continue;
      }
      const locationId = entity.attributes?.[rule.field] || (rule.field === 'locationId' ? entity.locationId : null);
      if (!locationId) {
        continue;
      }
      const location = entityById.get(String(locationId));
      if (!location || location.type !== 'Location') {
        continue;
      }
      upsertOertlichkeitConnection(connections, seen, {
        type: rule.type,
        id: String(locationId),
        primary: true,
      });
    }

    for (const relation of relations) {
      if (relation.from !== entity.id) {
        continue;
      }
      const location = entityById.get(relation.to);
      if (!location || location.type !== 'Location') {
        continue;
      }
      upsertOertlichkeitConnection(connections, seen, {
        type: connectionTypeFromRelation(relation),
        id: relation.to,
        primary: relation.role === 'Home' || relation.role === 'Headquarter',
      });
    }

    normalizeOertlichkeitPrimary(connections);
    if (connections.length > 0) {
      entity.Oertlichkeiten = connections;
      enriched += 1;
    }
  }

  return enriched;
}

function attachmentFromFileRow(tableName, row, parentEntity) {
  const fileName = readField(row, 'FILE_NAME') || readField(row, 'DATEINAME') || readField(row, 'NAME');
  if (!fileName) {
    return null;
  }

  const mimeType =
    readField(row, 'MIME_TYPE') ||
    readField(row, 'MEDIENFORMAT') ||
    (String(fileName).toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');

  const tag =
    readField(row, 'TAG') ||
    readField(row, 'DATEITYP') ||
    readField(row, 'DOKUMENTTYP') ||
    (tableName.includes('Person') ? 'Person photo' : 'Document');

  const attachment = {
    id: String(readField(row, 'ID') || `${parentEntity.id}-${fileName}`),
    fileName: String(fileName),
    mimeType: String(mimeType),
    kind: String(mimeType).startsWith('image/') ? 'image' : 'document',
    tag: String(tag),
    uploadedAt: formatDate(readField(row, 'EXTRAKTIONSDATUM') || readField(row, 'UPLOAD_DATUM')),
    url: readField(row, 'FILE_URL') || readField(row, 'DOWNLOAD_URL') || readField(row, 'STORAGE_URL') || null,
  };

  if (parentEntity.type === 'Person' && (tableName.includes('Person') || /mugshot|photo|portrait/i.test(String(tag)))) {
    attachment.isPersonPhoto = true;
  }

  if (!attachment.url) {
    return null;
  }

  return attachment;
}

function formatDate(value) {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 10_000_000_000) {
    return new Date(parsed).toISOString().slice(0, 10);
  }
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function attachFileRows(tableName, rows, entityById) {
  let attached = 0;
  for (const row of rows) {
    const parentField = Object.keys(row)
      .map((key) => key.replaceAll('"', ''))
      .find((key) => key.endsWith('_ID') && key !== 'ID' && !key.includes('FILE'));
    if (!parentField) {
      continue;
    }
    const parentId = String(readField(row, parentField) || '');
    const parentEntity = entityById.get(parentId);
    if (!parentEntity) {
      continue;
    }
    const attachment = attachmentFromFileRow(tableName, row, parentEntity);
    if (!attachment) {
      continue;
    }
    if (!parentEntity.attachments) {
      parentEntity.attachments = [];
    }
    parentEntity.attachments.push(attachment);
    attached += 1;
  }
  return attached;
}

function attachDocumentsFromAttributes(entities, entityById) {
  let attached = 0;
  for (const entity of entities) {
    if (entity.type !== 'Documents') {
      continue;
    }
    const attrs = entity.attributes ?? {};
    const docType = attrs.URKUNDENTYP || attrs.DOKUMENTTYP_ISO;
    const docNumber = attrs.URKUNDENNUMMER;
    if (!docType && !docNumber) {
      continue;
    }

    const identityId = attrs.AUSGESTELLT_AUF_PERSONALIE_ID;
    if (identityId) {
      const identity = entityById.get(String(identityId));
      const personId = identity?.attributes?.PERSON_ID;
      if (personId && entityById.has(String(personId))) {
        attached += 1;
      }
    }
  }
  return attached;
}

function writeExportFiles(payload) {
  const jsonPath = path.join(ROOT, 'data/context-model-export.json');
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);

  const jsPath = path.join(ROOT, 'data/context-model-export.js');
  fs.writeFileSync(
    jsPath,
    `window.INVESTIGATION_MOCK = ${JSON.stringify(
      {
        objectTypes: payload.objectTypes,
        entities: payload.entities,
        relations: payload.relations,
      },
      null,
      2,
    )};\n`,
  );

  console.log(`- ${jsonPath}`);
  console.log(`- ${jsPath}`);
}

function enrichLocationsOnly() {
  const jsonPath = path.join(ROOT, 'data/context-model-export.json');
  const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const entityById = new Map(payload.entities.map((entity) => [entity.id, entity]));

  for (const entity of payload.entities) {
    delete entity.Oertlichkeiten;
  }

  applyPersonLocations(payload.entities, payload.relations);
  const oertlichkeitenCount = applyOertlichkeiten(payload.entities, payload.relations, entityById);
  payload.exportedAt = new Date().toISOString();

  console.log(`Entities with Oertlichkeiten: ${oertlichkeitenCount}`);
  writeExportFiles(payload);
  console.log(`Wrote ${payload.entities.length} entities and ${payload.relations.length} relations`);
}

async function enrichLocationsFromBindingTables(envPath) {
  const env = parseEnvFile(envPath);
  const baseUrl = (env.EMS_TEAM || '').replace(/\/$/, '');
  const token = env.EMS_TOKEN;
  if (!baseUrl || !token) {
    throw new Error(`Missing EMS_TEAM or EMS_TOKEN in ${envPath}`);
  }

  const jsonPath = path.join(ROOT, 'data/context-model-export.json');
  const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const entityById = new Map(payload.entities.map((entity) => [entity.id, entity]));

  for (const entity of payload.entities) {
    delete entity.Oertlichkeiten;
  }

  const lakeSchemas = await fetchLakeSchemas(baseUrl, token);
  const lakeTableIndex = await buildLakeTableIndex(baseUrl, token, lakeSchemas);
  const bindingRoleIndex = await buildBindingRoleIndex(
    baseUrl,
    token,
    lakeSchemas,
    lakeTableIndex,
    entityById,
  );

  applyPersonLocations(payload.entities, payload.relations);
  applyOertlichkeiten(payload.entities, payload.relations, entityById);
  const bindingMerged = mergeBindingLocationConnections(payload.entities, bindingRoleIndex.locationConnections);
  payload.exportedAt = new Date().toISOString();

  console.log(`Binding-table Oertlichkeiten merged: ${bindingMerged}`);
  console.log(`Entities with Oertlichkeiten: ${payload.entities.filter((entity) => entity.Oertlichkeiten?.length).length}`);
  writeExportFiles(payload);
  console.log(`Wrote ${payload.entities.length} entities and ${payload.relations.length} relations`);
}

async function main() {
  if (process.argv.includes('--enrich-locations-only')) {
    const envArgIndex = process.argv.indexOf('--env');
    if (envArgIndex >= 0) {
      await enrichLocationsFromBindingTables(process.argv[envArgIndex + 1]);
    } else {
      enrichLocationsOnly();
    }
    return;
  }

  const envArgIndex = process.argv.indexOf('--env');
  const envPath =
    envArgIndex >= 0 ? process.argv[envArgIndex + 1] : path.join(process.env.HOME, 'Projects/celonis/ems-frontend/.local.env');

  const env = parseEnvFile(envPath);
  const baseUrl = (env.EMS_TEAM || '').replace(/\/$/, '');
  const token = env.EMS_TOKEN;

  if (!baseUrl || !token) {
    throw new Error(`Missing EMS_TEAM or EMS_TOKEN in ${envPath}`);
  }

  console.log(`Exporting from ${baseUrl} ...`);

  const pig = await apiGet(
    baseUrl,
    token,
    `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}/targets/${encodeURIComponent(TARGET)}/pig`,
  );

  const perspective =
    (pig.perspectives ?? []).find((entry) => entry.entityIdentifier?.name?.includes('PnE')) ??
    pig.perspectives?.[0];
  if (!perspective) {
    throw new Error('No queryable perspective found in package.');
  }

  const perspectiveKey = buildPerspectiveKey(perspective);
  console.log(`Using perspective ${perspectiveKey}`);

  await ensurePerspectiveLoaded(baseUrl, token, perspectiveKey);
  const perspectiveSchema = await fetchPerspectiveSchema(baseUrl, token, perspectiveKey);

  const entities = [];
  const relations = [];
  const entityById = new Map();

  for (const pigObject of pig.objects ?? []) {
    const technicalName = pigObject.entityIdentifier?.name;
    const englishType = TYPE_BY_TECH.get(technicalName);
    if (!englishType) {
      continue;
    }

    const fieldIds = (pigObject.fields ?? [])
      .map((field) => field.id)
      .filter(Boolean);
    if (!fieldIds.includes('ID')) {
      fieldIds.unshift('ID');
    }

    const rows = await fetchAllRows(baseUrl, token, perspectiveKey, technicalName, fieldIds);
    console.log(`${englishType}: ${rows.length} rows`);

    for (const row of rows) {
      const entity = entityFromRow(technicalName, englishType, row, fieldIds);
      if (!entity || entityById.has(entity.id)) {
        continue;
      }
      entityById.set(entity.id, entity);
      entities.push(entity);
    }
  }

  for (const pigObject of pig.objects ?? []) {
    const tableName = tableNameFor(pigObject.entityIdentifier);
    if (!RELATIONSHIP_OBJECT_TYPES.has(tableName)) {
      continue;
    }
    const fieldIds = (pigObject.fields ?? []).map((field) => field.id).filter(Boolean);
    if (fieldIds.length === 0) {
      continue;
    }
    try {
      const rows = await fetchAllRows(baseUrl, token, perspectiveKey, tableName, fieldIds);
      console.log(`Relationship ${tableName}: ${rows.length} rows`);
      for (const row of rows) {
        const relation = relationFromLinkRow(tableName, row);
        if (relation) {
          relations.push(relation);
        }
      }
    } catch (error) {
      console.warn(`Skipping ${tableName}: ${error.message.split('\n')[0]}`);
    }
  }

  for (const relationship of pig.relationships ?? []) {
    const tableName = relationship.entityIdentifier?.name;
    if (!tableName || !RELATIONSHIP_OBJECT_TYPES.has(tableName)) {
      continue;
    }
    const fieldIds = (relationship.fields ?? []).map((field) => field.id).filter(Boolean);
    if (fieldIds.length === 0) {
      continue;
    }
    try {
      const rows = await fetchAllRows(baseUrl, token, perspectiveKey, tableName, fieldIds);
      console.log(`Relationship (metadata) ${tableName}: ${rows.length} rows`);
      for (const row of rows) {
        const relation = relationFromLinkRow(tableName, row);
        if (relation) {
          relations.push(relation);
        }
      }
    } catch (error) {
      console.warn(`Skipping ${tableName}: ${error.message.split('\n')[0]}`);
    }
  }

  for (const pigObject of pig.objects ?? []) {
    const tableName = tableNameFor(pigObject.entityIdentifier);
    if (!tableName.endsWith('_File')) {
      continue;
    }
    const fieldIds = (pigObject.fields ?? []).map((field) => field.id).filter(Boolean);
    if (!fieldIds.includes('ID')) {
      fieldIds.unshift('ID');
    }
    if (fieldIds.length === 0) {
      continue;
    }
    try {
      const rows = await fetchAllRows(baseUrl, token, perspectiveKey, tableName, fieldIds);
      const attached = attachFileRows(tableName, rows, entityById);
      console.log(`File object ${tableName}: ${rows.length} rows, ${attached} attachments linked`);
    } catch (error) {
      console.warn(`Skipping ${tableName}: ${error.message.split('\n')[0]}`);
    }
  }

  relations.push(...await exportPerspectiveJunctionTables(pig, baseUrl, token, perspectiveKey, perspectiveSchema));
  relations.push(...await exportManyToManyLinkTables(pig, baseUrl, token, perspectiveKey));

  const fkRelationIndex = buildFkRelationIndex(pig);
  relations.push(...inferRelationsFromForeignKeys(entities, entityById, fkRelationIndex));

  const lakeSchemas = await fetchLakeSchemas(baseUrl, token);
  const lakeTableIndex = await buildLakeTableIndex(baseUrl, token, lakeSchemas);
  const bindingRoleIndex = await buildBindingRoleIndex(
    baseUrl,
    token,
    lakeSchemas,
    lakeTableIndex,
    entityById,
  );
  const enrichedCount = enrichRelationsWithBindingRoles(relations, bindingRoleIndex);
  console.log(`Relations enriched with binding roles: ${enrichedCount}`);

  applyPersonLocations(entities, relations);

  const documentsEnriched = attachDocumentsFromAttributes(entities, entityById);
  console.log(`Document attachments synthesized: ${documentsEnriched}`);

  const dedupedRelations = dedupeRelations(relations);
  const withRole = dedupedRelations.filter((relation) => relation.role).length;
  console.log(`Relations with role label: ${withRole}`);

  const oertlichkeitenCount = applyOertlichkeiten(entities, dedupedRelations, entityById);
  const bindingMerged = mergeBindingLocationConnections(entities, bindingRoleIndex.locationConnections);
  console.log(`Entities with Oertlichkeiten: ${entities.filter((entity) => entity.Oertlichkeiten?.length).length}`);
  console.log(`Binding-table Oertlichkeiten merged: ${bindingMerged}`);

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    packageKey: PACKAGE_KEY,
    perspectiveKey,
    objectTypes: OBJECT_TYPES,
    entities,
    relations: dedupedRelations,
  };

  writeExportFiles(exportPayload);
  console.log(`Wrote ${entities.length} entities and ${dedupedRelations.length} relations`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
