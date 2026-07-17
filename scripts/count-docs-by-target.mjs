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

async function count(baseUrl, token, target, tableName) {
  const apiPath =
    `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}` +
    `/targets/${encodeURIComponent(target)}/pig/pql/${encodeURIComponent(PERSPECTIVE_KEY)}/classic-query`;

  const response = await fetch(`${baseUrl}${apiPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      queryType: 'TABLE',
      fields: [{ pqlExpression: `"${tableName}"."ID"`, alias: '"ID"' }],
      limit: 500,
      offset: 0,
    }),
  });
  const result = await response.json();
  return { rows: result.rows?.length ?? 0, error: result.error ? String(result.error).split('\n')[0] : null };
}

const env = parseEnvFile(path.join(process.env.HOME, 'Projects/celonis/ems-frontend/.local.env'));
const baseUrl = env.EMS_TEAM.replace(/\/$/, '');
const token = env.EMS_TOKEN;

for (const target of ['development', 'production']) {
  console.log(target, await count(baseUrl, token, target, 'Dokumente'));
}
