#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const PACKAGE_KEY = '7c4666c9_d865_45aa_a9ee_dff7470a3153';
const MAIN = new Set([
  'Oertlichkeit', 'Organisation', 'Personalie', 'Person', 'Vorgang', 'Straftat',
  'Ordnungswidrigkeit', 'Verkehrsunfall', 'Kraftfahrzeug', 'Schusswaffe',
  'HoheitlicheMassnahme', 'Dokumente', 'Hinweis', 'Personenbeschreibung', 'VorgangEreignis',
]);

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

const others = (pig.objects ?? [])
  .map((object) => object.entityIdentifier?.name)
  .filter((name) => name && !MAIN.has(name) && !name.endsWith('_File'));

console.log('non-main objects:', others.length);
for (const name of others) {
  console.log(name);
}
