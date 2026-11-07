// A base face exists where a cloudy layer follows a clearer adjacent layer.
// Its occurrence interval is (previous fraction, current fraction]. Earlier,
// more distant lower layers are handled by the subsequent visibility path.
// The caller owns the detection threshold and all optical assumptions.
export function adjacentCloudBases(levels, ground = 0, minimumFraction) {
  if (!Number.isFinite(minimumFraction) || minimumFraction < 0 || minimumFraction > 1) {
    throw new TypeError('An explicit cloud detection fraction in [0,1] is required');
  }
  const decks = [];
  let previousCover = 0;
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    if (level.height < ground) continue;
    const lower = previousCover;
    previousCover = level.cover;
    if (level.cover < minimumFraction || level.cover <= lower) continue;
    const previous = levels[i - 1], next = levels[i + 1];
    const base = Math.max(ground + 0.05, previous ?
      (previous.height + level.height) / 2 : level.height - 0.3);
    const top = next ? (level.height + next.height) / 2 : level.height + 0.5;
    if (top > base) decks.push({ base, top, cover: level.cover - lower, lower, upper: level.cover });
  }
  return decks;
}
