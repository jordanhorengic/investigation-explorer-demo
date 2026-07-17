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

function inferRelationsFromForeignKeys(entities, entityById) {
  const relations = [];
  for (const entity of entities) {
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
      relations.push({
        from: entity.id,
        to: targetId,
        label: `${entity.type} ${key}`,
      });
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
    attachment.url =
      attachment.kind === 'image'
        ? `https://placehold.co/320x220/1b44b1/ffffff?text=${encodeURIComponent(String(tag).slice(0, 24))}`
        : null;
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

async function main() {
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
    const rows = await fetchAllRows(baseUrl, token, perspectiveKey, tableName, fieldIds);
    console.log(`Relationship ${tableName}: ${rows.length} rows`);
    for (const row of rows) {
      const relation = relationFromLinkRow(tableName, row);
      if (relation) {
        relations.push(relation);
      }
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

  relations.push(...inferRelationsFromForeignKeys(entities, entityById));
  applyPersonLocations(entities, relations);

  const documentsEnriched = attachDocumentsFromAttributes(entities, entityById);
  console.log(`Document attachments synthesized: ${documentsEnriched}`);

  const dedupedRelations = [];
  const relationKeys = new Set();
  for (const relation of relations) {
    const key = `${relation.from}|${relation.to}|${relation.relationshipType || relation.label}|${relation.role || ''}`;
    if (relationKeys.has(key)) {
      continue;
    }
    relationKeys.add(key);
    dedupedRelations.push(relation);
  }

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    packageKey: PACKAGE_KEY,
    perspectiveKey,
    objectTypes: OBJECT_TYPES,
    entities,
    relations: dedupedRelations,
  };

  const jsonPath = path.join(ROOT, 'data/context-model-export.json');
  fs.writeFileSync(jsonPath, `${JSON.stringify(exportPayload, null, 2)}\n`);

  const jsPath = path.join(ROOT, 'data/context-model-export.js');
  fs.writeFileSync(
    jsPath,
    `window.INVESTIGATION_MOCK = ${JSON.stringify(
      {
        objectTypes: OBJECT_TYPES,
        entities,
        relations: dedupedRelations,
      },
      null,
      2,
    )};\n`,
  );

  console.log(`Wrote ${entities.length} entities and ${dedupedRelations.length} relations`);
  console.log(`- ${jsonPath}`);
  console.log(`- ${jsPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
