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

    console.log(`\n=== TARGET ${target} | ${perspectiveKey} ===`);
    console.log(
      'File objects:',
      (pig.objects ?? [])
        .filter((object) => object.entityIdentifier?.name?.endsWith('_File'))
        .map((object) => object.entityIdentifier.name),
    );

    const documents = pig.objects?.find((object) => object.entityIdentifier?.name === 'Dokumente');
    console.log('Dokumente field count:', documents?.fields?.length ?? 0);
    console.log(
      'Dokumente file-like fields:',
      (documents?.fields ?? [])
        .map((field) => field.id)
        .filter((fieldId) => /file|datei|anhang|attachment|mime|url|storage|bild|image|pdf/i.test(fieldId)),
    );

    const relationships = (pig.relationships ?? []).filter((relationship) => {
      const source = relationship.source?.name ?? relationship.source;
      const target = relationship.target?.name ?? relationship.target;
      return (
        source === 'Dokumente' ||
        target === 'Dokumente' ||
        String(source).includes('File') ||
        String(target).includes('File')
      );
    });
    console.log('Dokumente/File relationships:', relationships.length);
    for (const relationship of relationships.slice(0, 20)) {
      console.log(
        ' -',
        relationship.displayName || relationship.entityIdentifier?.name,
        '|',
        relationship.source?.name ?? relationship.source,
        '->',
        relationship.target?.name ?? relationship.target,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
