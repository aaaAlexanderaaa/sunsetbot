import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export class DiskCache {
  constructor(directory, { now = () => Date.now(), maxEntries = 120 } = {}) {
    this.directory = directory;
    this.now = now;
    this.maxEntries = maxEntries;
    this.pending = new Map();
  }
  path(key) {
    return join(this.directory, createHash('sha256').update(key).digest('hex') + '.json');
  }
  async get(key) {
    try { return JSON.parse(await readFile(this.path(key), 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
      throw error;
    }
  }
  async put(key, value) {
    await mkdir(this.directory, { recursive: true });
    const path = this.path(key), temp = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(value), { mode: 0o600 });
      await rename(temp, path);
    } finally { await unlink(temp).catch(() => {}); }
    await this.prune();
  }
  async prune() {
    const files = (await readdir(this.directory)).filter(f => f.endsWith('.json'));
    if (files.length <= this.maxEntries) return;
    const records = await Promise.all(files.map(async f => {
      try { const j = JSON.parse(await readFile(join(this.directory, f), 'utf8')); return { f, time: j.fetchedAt ?? 0 }; }
      catch { return { f, time: 0 }; }
    }));
    records.sort((a, b) => a.time - b.time);
    await Promise.all(records.slice(0, records.length - this.maxEntries).map(r => unlink(join(this.directory, r.f)).catch(() => {})));
  }
  async load(key, loader, { ttl = 3600000, staleFor = 6 * 3600000 } = {}) {
    if (this.pending.has(key)) return this.pending.get(key);
    const operation = (async () => {
      const cached = await this.get(key);
      const age = cached ? this.now() - cached.fetchedAt : Infinity;
      if (age >= 0 && age < ttl) return { ...cached, cache: 'fresh' };
      try {
        const value = { data: await loader(), fetchedAt: this.now() };
        await this.put(key, value);
        return { ...value, cache: 'miss' };
      } catch (error) {
        if (age >= 0 && age < staleFor && error.status !== 400) {
          return { ...cached, cache: 'stale', staleReason: error.code ?? 'UPSTREAM_UNAVAILABLE' };
        }
        throw error;
      }
    })();
    this.pending.set(key, operation);
    try { return await operation; } finally { this.pending.delete(key); }
  }
}
