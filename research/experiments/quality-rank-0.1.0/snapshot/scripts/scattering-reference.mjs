// Expose the frozen heuristic's existing frame for equal-Sun-altitude research
// comparisons. The immutable algorithm and its dependencies remain unchanged.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const snapshot = join(root, 'research/model-snapshots/section-optics-0.3.1');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function referenceModel() {
  const manifest = JSON.parse(await readFile(join(snapshot, 'manifest.json'), 'utf8'));
  for (const receipt of manifest.files) {
    if (hash(await readFile(join(snapshot, receipt.file))) !== receipt.sha256) throw Error('Frozen reference source changed');
  }
  if (hash(await readFile(join(root, 'package-lock.json'))) !== manifest.packageLockSha256) throw Error('Frozen reference dependency lock changed');
  let source = await readFile(join(snapshot, 'engine.mjs'), 'utf8');
  for (const name of ['astro.mjs', 'cloud-optics.mjs', 'provider.mjs', 'errors.mjs']) {
    source = source.replace(`'./${name}'`, JSON.stringify(pathToFileURL(join(snapshot, name)).href));
  }
  source += '\nexport { frame as computeReferenceFrame };\n';
  const identity = hash(source), directory = join(root, 'var/reanalysis/reference-frames', identity);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'engine.mjs'), source);
  return { module: await import(pathToFileURL(join(directory, 'engine.mjs')).href), identity,
    recipe: { model: 'section-optics-0.3.1', snapshotCoreSha256: manifest.coreSha256,
      transformation: 'Redirect imports to the verified snapshot and append an export of its existing frame function',
      factorySha256: hash(await readFile(fileURLToPath(import.meta.url))), dependencies: manifest.files } };
}
