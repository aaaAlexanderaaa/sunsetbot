import { validDate } from './astro.mjs';

export const OBSERVED_GRADES = ['基本不烧', '微烧', '小烧', '小到中烧', '中到大烧', '大烧'];

export function observationRows(payload) {
  if (payload.status !== 'ok' || !Array.isArray(payload.table_content)) throw Error('Original observation response is unavailable');
  const rows = new Map(), excluded = [];
  for (const raw of payload.table_content) {
    const grade = OBSERVED_GRADES.indexOf(raw[4]);
    if (!validDate(raw[0]) || !['日出', '日落'].includes(raw[1]) || grade < 0) {
      excluded.push({ date: raw[0], event: raw[1], label: raw[4] }); continue;
    }
    const eventType = raw[1] === '日出' ? 'sunrise' : 'sunset', id = `${raw[0]}-${eventType}`;
    const row = { id, date: raw[0], eventType, observedGrade: grade, observedLabel: raw[4],
      observedCloud: raw[2], observedColour: raw[3], originalPrediction: raw[5],
      evidenceUrls: raw[8], originalMap: raw[9], originalSection: raw[10] };
    if (rows.has(id) && rows.get(id).observedGrade !== grade) throw Error('Conflicting labels for ' + id);
    rows.set(id, row);
  }
  return { rows: [...rows.values()].sort((a, b) => a.id.localeCompare(b.id)), excluded };
}

// Freeze a matched challenge sample before seeing model scores. Its balanced
// class prevalence belongs to this design, rather than the real event stream.
export function selectChallenge(rows, perClass = 3) {
  const positive = rows.filter(r => r.observedGrade > 0).slice(0, perClass), used = new Set();
  if (positive.length < perClass) throw Error('Insufficient labeled positive events for this challenge');
  const controls = positive.map(p => {
    const candidates = rows.filter(r => r.observedGrade === 0 && r.eventType === p.eventType && !used.has(r.id))
      .sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(p.date)) - Math.abs(Date.parse(b.date) - Date.parse(p.date)) || a.id.localeCompare(b.id));
    if (!candidates.length) throw Error('A same-event labeled control is required');
    used.add(candidates[0].id);
    return { ...candidates[0], matchedTo: p.id };
  });
  return [...positive, ...controls].sort((a, b) => a.id.localeCompare(b.id));
}

function ranks(values) {
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v), out = [];
  for (let i = 0; i < sorted.length;) {
    let end = i + 1;
    while (end < sorted.length && sorted[end].v === sorted[i].v) end++;
    for (let j = i; j < end; j++) out[sorted[j].i] = (i + end - 1) / 2;
    i = end;
  }
  return out;
}

export function rankCorrelation(x, y) {
  if (x.length !== y.length || x.length < 2 || [...x, ...y].some(v => !Number.isFinite(v))) return null;
  const a = ranks(x), b = ranks(y), mean = (x.length - 1) / 2;
  const covariance = a.reduce((s, v, i) => s + (v - mean) * (b[i] - mean), 0);
  const denominator = Math.sqrt(a.reduce((s, v) => s + (v - mean) ** 2, 0) * b.reduce((s, v) => s + (v - mean) ** 2, 0));
  return denominator ? covariance / denominator : null;
}

export function rankingMetrics(cases, scoreKey) {
  const available = cases.filter(c => Number.isFinite(c[scoreKey]));
  const positives = available.filter(c => c.observedGrade > 0), controls = available.filter(c => c.observedGrade === 0);
  let wins = 0, ties = 0;
  for (const p of positives) for (const n of controls) {
    if (p[scoreKey] > n[scoreKey]) wins++;
    else if (p[scoreKey] === n[scoreKey]) ties++;
  }
  const pairs = positives.length * controls.length;
  return { evaluatedCases: available.length, missingScores: cases.length - available.length,
    positiveControlPairs: pairs, correctlyOrderedPairs: wins, tiedPairs: ties,
    pairwiseAuc: pairs ? (wins + ties / 2) / pairs : null,
    ordinalSpearman: rankCorrelation(available.map(c => c[scoreKey]), available.map(c => c.observedGrade)) };
}
