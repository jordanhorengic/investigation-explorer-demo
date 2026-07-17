#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const PACKAGE_KEY = '7c4666c9_d865_45aa_a9ee_dff7470a3153';

function parseEnvFile(filePath) {
  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) {
      values[match[1]] = match[2].trim();
    }
  }
  return values;
}

async function apiGet(baseUrl, token, apiPath) {
  const response = await fetch(`${baseUrl}${apiPath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
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
  const text = await response.text();
  return JSON.parse(text);
}

async function countRows(baseUrl, token, perspectiveKey, tableName, fieldIds) {
  const apiPath =
    `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}` +
    `/targets/development/pig/pql/${encodeURIComponent(perspectiveKey)}/classic-query`;

  const result = await apiPost(baseUrl, token, apiPath, {
    queryType: 'TABLE',
    fields: fieldIds.slice(0, 3).map((fieldId) => ({
      pqlExpression: `"${tableName}"."${fieldId}"`,
      alias: `"${fieldId}"`,
    })),
    limit: 500,
    offset: 0,
  });

  if (result.error) {
    return { error: String(result.error).split('\n')[0] };
  }
  return { rows: result.rows?.length ?? 0, hasMore: (result.rows?.length ?? 0) >= 500 };
}

async function main() {
  const envPath = path.join(process.env.HOME, 'Projects/celonis/ems-frontend/.local.env');
  const env = parseEnvFile(envPath);
  const baseUrl = (env.EMS_TEAM || '').replace(/\/$/, '');
  const token = env.EMS_TOKEN;

  const pig = await apiGet(
    baseUrl,
    token,
    `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}/targets/development/pig`,
  );

  const perspectiveKey = 'perspective.local.Polizei-PnE-v2';
  const relationshipObjects = (pig.objects ?? []).filter(
    (object) => object.entityIdentifier?.entityType === 'RELATIONSHIP',
  );

  console.log(`Relationship objects: ${relationshipObjects.length}`);
  const results = [];
  for (const object of relationshipObjects) {
    const tableName = object.entityIdentifier.name;
    const fieldIds = (object.fields ?? []).map((field) => field.id).filter(Boolean);
    const count = await countRows(baseUrl, token, perspectiveKey, tableName, fieldIds);
    results.push({ tableName, fieldIds, ...count });
  }

  results.sort((a, b) => (b.rows || 0) - (a.rows || 0));
  for (const entry of results) {
    if (entry.error) {
      console.log(`${entry.tableName}: ERROR`);
    } else {
      console.log(`${entry.tableName}: ${entry.rows}${entry.hasMore ? '+' : ''} fields=${entry.fieldIds.join(',')}`);
    }
  }
}

main().catch(console.error);
