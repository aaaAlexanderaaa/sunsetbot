import { DiskCache } from './cache.mjs';

export class ForecastArchive {
  constructor(directory, { now = () => Date.now(), maxEntries = 180 } = {}) {
    this.cache = new DiskCache(directory, { now, maxEntries });
    this.now = now;
    this.maxEntries = maxEntries;
    this.queue = Promise.resolve();
  }
  save({ result, ...inputs }) {
    const operation = this.queue.then(async () => {
      const stored = await this.cache.get(result.id);
      const previous = stored?.schemaVersion === 1 && stored.result?.id === result.id && stored.inputs?.weather &&
        Number.isFinite(Date.parse(stored.retainedAt)) ? stored : null;
      const retainedAt = previous?.retainedAt ?? new Date(this.now()).toISOString();
      if (!previous) await this.cache.put(result.id, {
        schemaVersion: 1, fetchedAt: this.now(), retainedAt, result, inputs,
      });
      return { state: 'saved', retainedAt, limit: this.maxEntries };
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
