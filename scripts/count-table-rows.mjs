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

const env = parseEnvFile(path.join(process.env.HOME, 'Projects/celonis/ems-frontend/.local.env'));
const baseUrl = env.EMS_TEAM.replace(/\/$/, '');
const token = env.EMS_TOKEN;
const perspectiveKey = 'perspective.local.Polizei-PnE-v2';

async function count(tableName) {
  const apiPath =
    `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}` +
    `/targets/development/pig/pql/${encodeURIComponent(perspectiveKey)}/classic-query`;

  let offset = 0;
  let total = 0;
  while (true) {
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
        offset,
      }),
    });
    const result = await response.json();
    if (result.error) {
      return { error: result.error };
    }
    const batch = result.rows?.length ?? 0;
    total += batch;
    if (batch < 500) {
      break;
    }
    offset += batch;
  }
  return { total };
}

console.log('Dokumente', await count('Dokumente'));
console.log('Person', await count('Person'));
