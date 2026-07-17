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

function perspectiveKeyFrom(perspective) {
  return `perspective.${perspective.entityIdentifier.namespace}.${perspective.entityIdentifier.name}`;
}

async function apiGet(baseUrl, token, apiPath) {
  const response = await fetch(`${baseUrl}${apiPath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${apiPath} failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

async function apiPut(baseUrl, token, apiPath) {
  const response = await fetch(`${baseUrl}${apiPath}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PUT ${apiPath} failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
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

async function ensurePerspectiveLoaded(baseUrl, token, target, perspectiveKey) {
  const base =
    `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}` +
    `/targets/${encodeURIComponent(target)}/pig/pql/${encodeURIComponent(perspectiveKey)}`;

  const active = await apiGet(baseUrl, token, `${base}/load`);
  console.log(`load active (${target}):`, active);

  const terminal = await apiGet(baseUrl, token, `${base}/load/terminal-status`);
  console.log(`terminal status (${target}):`, terminal);

  if (terminal?.phase === 'SUCCESS') {
    return;
  }

  console.log(`Triggering load for ${target}...`);
  await apiPut(baseUrl, token, `${base}/load`);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const status = await apiGet(baseUrl, token, `${base}/load/terminal-status`);
    console.log(`poll ${attempt + 1}:`, status?.phase, status?.message || '');
    if (status?.phase === 'SUCCESS') {
      return;
    }
    if (status?.phase === 'FAILED') {
      throw new Error(`Perspective load failed: ${status.message || 'unknown'}`);
    }
  }

  throw new Error('Perspective load timed out');
}

async function queryPersonFile(baseUrl, token, target, perspectiveKey) {
  const apiPath =
    `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}` +
    `/targets/${encodeURIComponent(target)}/pig/pql/${encodeURIComponent(perspectiveKey)}/classic-query`;

  const fields = ['ID', 'FILE_NAME', 'DOWNLOAD_URL', 'MIME_TYPE', 'PERSON_ID'];
  const { ok, status, body } = await apiPost(baseUrl, token, apiPath, {
    queryType: 'TABLE',
    fields: fields.map((fieldId) => ({
      pqlExpression: `"Person_File"."${fieldId}"`,
      alias: `"${fieldId}"`,
    })),
    limit: 10,
    offset: 0,
  });

  console.log(`Person_File query (${target}): ok=${ok} status=${status}`);
  console.log('error:', body?.error || 'none');
  console.log('rows:', body?.rows?.length ?? 0);
  if (body?.rows?.[0]) {
    console.log('sample:', JSON.stringify(body.rows[0], null, 2));
  }
}

async function main() {
  const envPath = path.join(process.env.HOME, 'Projects/celonis/ems-frontend/.local.env');
  const env = parseEnvFile(envPath);
  const baseUrl = (env.EMS_TEAM || '').replace(/\/$/, '');
  const token = env.EMS_TOKEN;

  const pig = await apiGet(
    baseUrl,
    token,
    `/pig-semantic-layer/api/v1/package/${encodeURIComponent(PACKAGE_KEY)}/targets/production/pig`,
  );
  const perspective =
    pig.perspectives?.find((entry) => entry.entityIdentifier?.name?.includes('PnE')) ??
    pig.perspectives?.[0];
  const perspectiveKey = perspectiveKeyFrom(perspective);

  await ensurePerspectiveLoaded(baseUrl, token, 'production', perspectiveKey);
  await queryPersonFile(baseUrl, token, 'production', perspectiveKey);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
