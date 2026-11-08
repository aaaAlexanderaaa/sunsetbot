// Empirical numerical sensitivity, kept separate from label uncertainty and
// statistical confidence. Intervals come from each retained numerical result.
export function numericalOrdering(cases) {
  const labelled = cases.filter(c => Number.isFinite(c.observedGrade));
  const positives = labelled.filter(c => c.observedGrade > 0), zeros = labelled.filter(c => c.observedGrade === 0);
  const interval = c => {
    if (!Number.isFinite(c.score) || c.score < 0 || !Number.isFinite(c.errorEstimate) || c.errorEstimate < 0 ||
        c.numericalStatus !== 'estimated_converged') return null;
    return [Math.max(0, c.score - c.errorEstimate), c.score + c.errorEstimate];
  };
  let wins = 0, losses = 0, overlap = 0, unavailable = 0;
  for (const positive of positives) for (const zero of zeros) {
    const a = interval(positive), b = interval(zero);
    if (!a || !b) unavailable++;
    else if (a[0] > b[1]) wins++;
    else if (a[1] < b[0]) losses++;
    else overlap++;
  }
  const pairs = positives.length * zeros.length;
  return { labelledEvents: labelled.length, unlabelledEvents: cases.length - labelled.length,
    numericallyUnavailableEvents: labelled.filter(c => !interval(c)).length,
    pairs, wins, losses, numericalTies: overlap, unavailablePairs: unavailable,
    tieAwareAuc: pairs && !unavailable ? (wins + overlap / 2) / pairs : null,
    allLabelledAucSensitivityRange: pairs ? [wins / pairs, (wins + overlap + unavailable) / pairs] : null,
    scope: 'Intervals express retained numerical error estimates/control variation. Overlap is a numerical tie; missing numerical predictions retain fully unresolved ordering. Label error and statistical confidence have separate scopes.' };
}
