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
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function tryQuery(baseUrl, token, perspectiveKey, tableName, fields) {
  const apiPath =
    `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}` +
    `/targets/development/pig/pql/${encodeURIComponent(perspectiveKey)}/classic-query`;

  const result = await apiPost(baseUrl, token, apiPath, {
    queryType: 'TABLE',
    fields: fields.map((fieldId) => ({
      pqlExpression: `"${tableName}"."${fieldId}"`,
      alias: `"${fieldId}"`,
    })),
    limit: 5,
    offset: 0,
  });

  const error = result.body?.error ? String(result.body.error).split('\n')[0] : 'none';
  console.log(`${tableName}: rows=${result.body?.rows?.length ?? 0} | ${error}`);
  if (result.body?.rows?.length) {
    console.log(' sample:', JSON.stringify(result.body.rows[0]).slice(0, 400));
  }
}

async function main() {
  const envPath = path.join(process.env.HOME, 'Projects/celonis/ems-frontend/.local.env');
  const env = parseEnvFile(envPath);
  const baseUrl = (env.EMS_TEAM || '').replace(/\/$/, '');
  const token = env.EMS_TOKEN;
  const perspectiveKey = 'perspective.local.Polizei-PnE-v2';

  const tables = [
    ['Person_File_Person_rel', ['ID', 'SOURCE_ID', 'TARGET_ID']],
    ['Person_File', ['ID', 'FILE_NAME', 'DOWNLOAD_URL', 'MIME_TYPE']],
    ['Dokumente_Person_rel', ['ID', 'SOURCE_ID', 'TARGET_ID']],
    ['Dokumente_Vorgang_rel', ['ID', 'SOURCE_ID', 'TARGET_ID']],
    ['Vorgang_File', ['ID', 'FILE_NAME', 'DOWNLOAD_URL']],
    ['Unassigned_File', ['ID', 'FILE_NAME', 'DOWNLOAD_URL']],
  ];

  for (const [tableName, fields] of tables) {
    await tryQuery(baseUrl, token, perspectiveKey, tableName, fields);
  }
}

main().catch(console.error);
