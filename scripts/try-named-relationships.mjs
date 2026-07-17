#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const PACKAGE_KEY = '7c4666c9_d865_45aa_a9ee_dff7470a3153';

function parseEnvFile(filePath) {
  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

async function query(baseUrl, token, tableName, fields) {
  const apiPath =
    `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}` +
    `/targets/development/pig/pql/perspective.local.Polizei-PnE-v2/classic-query`;

  const response = await fetch(`${baseUrl}${apiPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      queryType: 'TABLE',
      fields: fields.map((fieldId) => ({
        pqlExpression: `"${tableName}"."${fieldId}"`,
        alias: `"${fieldId}"`,
      })),
      limit: 5,
      offset: 0,
    }),
  });
  return response.json();
}

const env = parseEnvFile(path.join(process.env.HOME, 'Projects/celonis/ems-frontend/.local.env'));
const baseUrl = env.EMS_TEAM.replace(/\/$/, '');
const token = env.EMS_TOKEN;

const pig = await fetch(
  `${baseUrl}/pig-semantic-layer/api/v1/package/${PACKAGE_KEY}/targets/development/pig`,
  { headers: { Authorization: `Bearer ${token}` } },
).then((response) => response.json());

const targets = [
  'Dokumente_Person',
  'Dokumente_Vorgang',
  'Person_Wohnsitz_Oertlichkeit',
  'Personalie_gehoert_zu_Person',
  'Person_Netzwerk_Person',
];

for (const tableName of targets) {
  const relationship = pig.relationships?.find((entry) => entry.entityIdentifier?.name === tableName);
  const fieldIds = (relationship?.fields ?? []).map((field) => field.id).filter(Boolean);
  if (fieldIds.length === 0) {
    fieldIds.push('ID');
  }
  const result = await query(baseUrl, token, tableName, fieldIds);
  console.log(`\n${tableName} fields=${fieldIds.join(',')}`);
  console.log('rows', result.rows?.length ?? 0, 'error', result.error ? String(result.error).split('\n')[0] : 'none');
  if (result.rows?.[0]) {
    console.log(JSON.stringify(result.rows[0], null, 2));
  }
}
