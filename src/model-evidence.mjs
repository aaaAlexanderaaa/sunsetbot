import { readFileSync } from 'node:fs';

const evidence = JSON.parse(readFileSync(new URL('./evidence/section-optics-0.3.1.json', import.meta.url), 'utf8'));

export function evidenceForModel(modelVersion) {
  return evidence.modelVersion === modelVersion ? structuredClone(evidence) : null;
}
