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

const pig = await fetch(
  `${baseUrl}/pig-semantic-layer/api/v1/package/${PACKAGE_KEY}/targets/development/pig`,
  { headers: { Authorization: `Bearer ${token}` } },
).then((response) => response.json());

console.log('objects count', pig.objects?.length);
console.log('relationships count', pig.relationships?.length);

for (const object of pig.objects ?? []) {
  const name = object.entityIdentifier?.name;
  if (name?.includes('Wohnsitz') || name?.includes('Dokumente') || name?.includes('_rel')) {
    console.log('object:', name, object.entityIdentifier?.entityType);
  }
}

for (const relationship of pig.relationships ?? []) {
  const name = relationship.entityIdentifier?.name;
  if (name?.includes('Dokumente') || name?.includes('Person') || name?.includes('File')) {
    console.log('rel:', name, '|', relationship.source?.name, '->', relationship.target?.name, '| junction:', relationship.junctionTable);
  }
}
