#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
  if (!response.ok) {
    throw new Error(`GET ${apiPath} failed (${response.status})`);
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
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST ${apiPath} failed (${response.status}): ${text.slice(0, 400)}`);
  }
  return JSON.parse(text);
}

async function queryTable(baseUrl, token, perspectiveKey, tableName, fields, target) {
  const apiPath =
    `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}` +
    `/targets/${encodeURIComponent(target)}/pig/pql/${encodeURIComponent(perspectiveKey)}/classic-query`;

  return apiPost(baseUrl, token, apiPath, {
    queryType: 'TABLE',
    fields: fields.map((fieldId) => ({
      pqlExpression: `"${tableName}"."${fieldId}"`,
      alias: `"${fieldId}"`,
    })),
    limit: 5,
    offset: 0,
  });
}

async function main() {
  const envPath = path.join(process.env.HOME, 'Projects/celonis/ems-frontend/.local.env');
  const env = parseEnvFile(envPath);
  const baseUrl = (env.EMS_TEAM || '').replace(/\/$/, '');
  const token = env.EMS_TOKEN;

  for (const target of ['development', 'production']) {
    const pig = await apiGet(
      baseUrl,
      token,
      `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}/targets/${encodeURIComponent(target)}/pig`,
    );
    const perspective =
      pig.perspectives?.find((entry) => entry.entityIdentifier?.name?.includes('PnE')) ??
      pig.perspectives?.[0];
    const perspectiveKey = `perspective.${perspective.entityIdentifier.namespace}.${perspective.entityIdentifier.name}`;

    console.log(`\n=== ${target} ===`);
    for (const tableName of ['Person_File', 'Dokumente']) {
      const pigObject = pig.objects?.find((object) => object.entityIdentifier?.name === tableName);
      const fieldIds = (pigObject?.fields ?? []).map((field) => field.id).filter(Boolean);
      console.log(`\n${tableName} fields (${fieldIds.length}):`, fieldIds.join(', '));
      try {
        const sampleFields = fieldIds.slice(0, 12);
        if (!sampleFields.includes('ID')) {
          sampleFields.unshift('ID');
        }
        const result = await queryTable(baseUrl, token, perspectiveKey, tableName, sampleFields, target);
        console.log(`${tableName} query: rows=${result.rows?.length ?? 0} error=${result.error ?? 'none'}`);
        if (result.rows?.[0]) {
          console.log('sample row keys:', Object.keys(result.rows[0]).join(', '));
          console.log('sample row:', JSON.stringify(result.rows[0], null, 2).slice(0, 800));
        }
      } catch (error) {
        console.log(`${tableName} query failed:`, error.message.split('\n')[0]);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
