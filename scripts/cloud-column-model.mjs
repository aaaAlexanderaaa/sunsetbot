// Controlled research variants built from immutable physics source. Production
// imports remain unchanged; the generated modules live under ignored var/.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const snapshot = join(root, 'research/model-snapshots/section-optics-0.3.1');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const quotedUrl = file => JSON.stringify(pathToFileURL(file).href);

async function atomicWrite(file, data) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, data);
  await rename(temporary, file);
}

export async function researchModel(levels, representation) {
  if (!['cumulative', 'adjacent'].includes(representation) || levels.length < 2 ||
      levels.some(v => !Number.isFinite(v) || v <= 0) || new Set(levels).size !== levels.length) {
    throw new Error('Invalid research pressure grid or representation');
  }
  const manifest = JSON.parse(await readFile(join(snapshot, 'manifest.json'), 'utf8'));
  for (const receipt of manifest.files) {
    if (hash(await readFile(join(snapshot, receipt.file))) !== receipt.sha256) throw Error('Immutable model snapshot changed');
  }
  if (hash(await readFile(join(root, 'package-lock.json'))) !== manifest.packageLockSha256) throw Error('Frozen dependency lock changed');
  const adjacentSource = await readFile(join(root, 'src/cloud-column.mjs'));
  const adjacentSha256 = hash(adjacentSource);
  const recipe = { base: manifest.coreSha256, dependencies: manifest.files,
    factorySha256: hash(await readFile(fileURLToPath(import.meta.url))),
    levelsHpa: levels, representation, packageLockSha256: manifest.packageLockSha256,
    adjacentSourceSha256: representation === 'adjacent' ? adjacentSha256 : null,
    opticalPolicy: 'unchanged section-optics-0.3.1 coefficients, threshold, overlap, geometry and score aggregation' };
  const identity = hash(JSON.stringify(recipe));
  const directory = join(root, 'var/reanalysis/research-models', identity);
  await mkdir(directory, { recursive: true });
  let source = await readFile(join(snapshot, 'engine.mjs'), 'utf8');
  for (const name of ['astro.mjs', 'cloud-optics.mjs', 'errors.mjs']) {
    source = source.replace(`'./${name}'`, quotedUrl(join(snapshot, name)));
  }
  if (representation === 'adjacent') {
    const start = source.indexOf('export function cloudDecks('), end = source.indexOf('\nfunction pair(');
    if (start < 0 || end <= start) throw Error('Frozen engine cloud-base boundary changed');
    source = "import { adjacentCloudBases } from './adjacent.mjs';\n" +
      source.slice(0, start) + 'export function cloudDecks(levels, ground = 0) {\n' +
      '  return adjacentCloudBases(levels, ground, ASSUMPTIONS.profileCloudThreshold);\n}\n' + source.slice(end);
  }
  source = source.replace("'section-optics-0.3.1'", JSON.stringify(`repr-${levels.length}-${representation}`));
  const provider = `export const LEVELS = ${JSON.stringify(levels)};\n` +
    `export { interpolate, precedingAccumulation } from ${quotedUrl(join(snapshot, 'provider.mjs'))};\n`;
  await atomicWrite(join(directory, 'provider.mjs'), provider);
  if (representation === 'adjacent') await atomicWrite(join(directory, 'adjacent.mjs'), adjacentSource);
  await atomicWrite(join(directory, 'engine.mjs'), source);
  return { module: await import(pathToFileURL(join(directory, 'engine.mjs')).href), identity, recipe };
}
