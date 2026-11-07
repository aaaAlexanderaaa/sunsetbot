// Align archived control fields to the reanalysis window before a field-only
// intervention. Early control captures contain surplus days; later ones are
// already bounded to the scored window.
export function mixPressureFields(controlRows, reanalysisRows, pattern) {
  if (controlRows.length !== reanalysisRows.length) throw Error('Intervention point counts differ');
  return controlRows.map((row, index) => {
    const target = reanalysisRows[index].hourly;
    const indices = target.time.map(time => row.hourly.time.indexOf(time));
    if (indices.some(i => i < 0)) throw Error('Intervention UTC hour absent from the control');
    const hourly = Object.fromEntries(Object.entries(row.hourly).map(([field, values]) => {
      if (!Array.isArray(values) || values.length !== row.hourly.time.length) throw Error('Control hourly arrays are misaligned');
      return [field, indices.map(i => values[i])];
    }));
    for (const [field, values] of Object.entries(target)) {
      if (!pattern.test(field)) continue;
      if (values.length !== target.time.length) throw Error('Intervention hourly arrays are misaligned');
      hourly[field] = [...values];
    }
    return { ...row, hourly };
  });
}
