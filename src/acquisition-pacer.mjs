import { DiskCache } from './cache.mjs';
import { AppError } from './errors.mjs';

// Persist admissions before effects so a restart also honors the minute limit.
export class AcquisitionPacer {
  constructor(directory, { now = () => Date.now(), wait = ms => new Promise(resolve => setTimeout(resolve, ms)), limit = 480, hourlyLimit = 4800 } = {}) {
    Object.assign(this, { now, wait, limit, hourlyLimit });
    this.disk = new DiskCache(directory, { maxEntries: 1 });
    this.queue = Promise.resolve();
  }
  run(units, action) {
    const task = this.queue.then(async () => {
      if (units > this.limit) throw new AppError('ACQUISITION_BATCH', '单次取数超出分钟预算，请检查批次设置。');
      const saved = await this.disk.get('minute');
      let entries = saved?.entries ?? [];
      if (!Array.isArray(entries) || entries.some(e => !Number.isFinite(e.time) || !Number.isInteger(e.units) || e.units < 1)) {
        throw new AppError('ACQUISITION_STATE', '取数频率记录需要检查，请查看服务日志。');
      }
      for (;;) {
        entries = entries.filter(e => e.time > this.now() - 3600000);
        const minute = entries.filter(e => e.time > this.now() - 60000), delays = [];
        if (minute.reduce((sum, e) => sum + e.units, 0) + units > this.limit) delays.push(minute[0].time + 60000 - this.now());
        if (entries.reduce((sum, e) => sum + e.units, 0) + units > this.hourlyLimit) delays.push(entries[0].time + 3600000 - this.now());
        if (!delays.length) break;
        await this.wait(Math.max(1, ...delays));
      }
      entries.push({ time: this.now(), units });
      await this.disk.put('minute', { fetchedAt: this.now(), entries });
      return action();
    });
    this.queue = task.catch(() => {});
    return task;
  }
}
