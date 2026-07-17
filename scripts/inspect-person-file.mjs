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
  const text = await response.text();
  if (!response.ok) {
    return { ok: false, status: response.status, body: text };
  }
  return { ok: true, status: response.status, body: JSON.parse(text) };
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
  return { ok: response.ok, status: response.status, body: text ? JSON.parse(text) : null };
}

async function main() {
  const envPath = path.join(process.env.HOME, 'Projects/celonis/ems-frontend/.local.env');
  const env = parseEnvFile(envPath);
  const baseUrl = (env.EMS_TEAM || '').replace(/\/$/, '');
  const token = env.EMS_TOKEN;

  const pigResp = await apiGet(
    baseUrl,
    token,
    `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}/targets/development/pig`,
  );
  const pig = pigResp.body;

  const personFile = pig.objects?.find((object) => object.entityIdentifier?.name === 'Person_File');
  console.log('Person_File object:', JSON.stringify(personFile, null, 2));

  const rels = (pig.relationships ?? []).filter((relationship) => {
    const source = relationship.source?.name ?? relationship.source;
    const target = relationship.target?.name ?? relationship.target;
    return source === 'Person_File' || target === 'Person_File';
  });
  console.log('\nPerson_File relationships:', JSON.stringify(rels, null, 2));

  const perspective =
    pig.perspectives?.find((entry) => entry.entityIdentifier?.name?.includes('PnE')) ??
    pig.perspectives?.[0];
  const perspectiveKey = `perspective.${perspective.entityIdentifier.namespace}.${perspective.entityIdentifier.name}`;

  const apiPath =
    `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}` +
    `/targets/development/pig/pql/${encodeURIComponent(perspectiveKey)}/classic-query`;

  for (const tableName of ['Person_File', 'Person_Document_Person_File', 'Person_File_Person']) {
    const result = await apiPost(baseUrl, token, apiPath, {
      queryType: 'TABLE',
      fields: [{ pqlExpression: `"${tableName}"."ID"`, alias: '"ID"' }],
      limit: 3,
      offset: 0,
    });
    console.log(`\n${tableName}: status=${result.status} rows=${result.body?.rows?.length ?? 0}`);
    console.log('error:', result.body?.error?.slice?.(0, 200) || result.body?.error || 'none');
  }
}

main().catch(console.error);
