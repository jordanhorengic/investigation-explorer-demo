#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const PACKAGE_KEY = '7c4666c9_d865_45aa_a9ee_dff7470a3153';
const PERSPECTIVE_KEY = 'perspective.local.Polizei-PnE-v2';

function parseEnvFile(filePath) {
  const values = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

async function apiGet(baseUrl, token, apiPath) {
  const response = await fetch(`${baseUrl}${apiPath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, body: text ? JSON.parse(text) : null, text };
}

async function apiPut(baseUrl, token, apiPath) {
  const response = await fetch(`${baseUrl}${apiPath}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  return { ok: response.ok, status: response.status, text: await response.text() };
}

const env = parseEnvFile(path.join(process.env.HOME, 'Projects/celonis/ems-frontend/.local.env'));
const baseUrl = env.EMS_TEAM.replace(/\/$/, '');
const token = env.EMS_TOKEN;
const base =
  `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}` +
  `/targets/development/pig/pql/${encodeURIComponent(PERSPECTIVE_KEY)}`;

console.log('GET load active');
console.log(await apiGet(baseUrl, token, `${base}/load`));

console.log('GET terminal status');
console.log(await apiGet(baseUrl, token, `${base}/load/terminal-status`));

console.log('PUT load');
console.log(await apiPut(baseUrl, token, `${base}/load`));

for (let attempt = 0; attempt < 20; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const status = await apiGet(baseUrl, token, `${base}/load/terminal-status`);
  console.log(`poll ${attempt + 1}:`, status.status, status.body?.phase, status.body?.message || status.text?.slice(0, 100));
  if (status.body?.phase === 'SUCCESS') break;
  if (status.body?.phase === 'FAILED') break;
}

const queryPath = `${base}/classic-query`;
const queryBody = {
  queryType: 'TABLE',
  fields: [
    { pqlExpression: '"Person_File"."ID"', alias: '"ID"' },
    { pqlExpression: '"Person_File"."FILE_NAME"', alias: '"FILE_NAME"' },
    { pqlExpression: '"Person_File"."DOWNLOAD_URL"', alias: '"DOWNLOAD_URL"' },
  ],
  limit: 10,
  offset: 0,
};

const queryResponse = await fetch(`${baseUrl}${queryPath}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(queryBody),
});
const queryResult = await queryResponse.json();
console.log('\nPerson_File after load:');
console.log('rows', queryResult.rows?.length ?? 0);
console.log('error', queryResult.error ? String(queryResult.error).split('\n')[0] : 'none');
if (queryResult.rows?.[0]) console.log(queryResult.rows[0]);
