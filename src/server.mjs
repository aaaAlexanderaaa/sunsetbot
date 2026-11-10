import { createServer } from 'node:http';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { createAcquisitionProvider, createForecastRuntime, REFRESH_KEY } from './refresh.mjs';
import { PRESETS } from './presets.mjs';
import { MODEL_VERSION } from './engine.mjs';
import { evidenceForModel } from './model-evidence.mjs';
import { civilDate, addDays, solarEvent } from './astro.mjs';
import { upcomingEvents } from './refresh-schedule.mjs';
import { AppError } from './errors.mjs';
import { fetch as networkFetch, EnvHttpProxyAgent } from 'undici';

const root = fileURLToPath(new URL('../', import.meta.url));

export function createApp({ service, refresh = null, refreshKey = REFRESH_KEY, now = () => Date.now() }) {
  return createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(value));
    };
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/api/v1/refresh') {
        request.resume();
        if (request.method !== 'POST') {
          response.setHeader('Allow', 'POST');
          return send(405, { error: { code: 'METHOD', message: '更新接口使用带密钥的 POST 请求。' } });
        }
        const supplied = Buffer.from(request.headers['x-refresh-key'] ?? ''), expected = Buffer.from(refreshKey);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
          return send(401, { error: { code: 'REFRESH_UNAUTHORIZED', message: '请提供有效的更新密钥。' } });
        }
        if (!refresh) throw new AppError('REFRESH_UNAVAILABLE', '更新任务暂时待配置。');
        const job = await refresh.trigger('forced');
        return send(202, { job, statusUrl: '/api/v1/status?job=' + encodeURIComponent(job.id) });
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        return send(405, { error: { code: 'METHOD', message: '此接口使用 GET 请求。' } });
      }
      if (url.pathname === '/healthz') return send(200, { status: 'ok', modelVersion: MODEL_VERSION });
      if (url.pathname === '/api/v1/status') return send(200, refresh?.status(url.searchParams.get('job')) ?? { state: 'unconfigured' });
      if (url.pathname === '/api/v1/evaluation') return send(200, { modelVersion: MODEL_VERSION, evidence: evidenceForModel(MODEL_VERSION) });
      if (url.pathname === '/api/v1/locations') {
        const today = civilDate(now());
        const nextEvents = Object.fromEntries(PRESETS.map(location => [location.id,
          Object.fromEntries(upcomingEvents(location, now(), 1).map(input => [input.event,
            { date: input.date, time: solarEvent(input.date, input.event, location.lat, location.lon, location.timezone).time }]))]));
        return send(200, { locations: PRESETS, timezone: 'Asia/Shanghai', today,
          dates: [today, addDays(today, 1), addDays(today, 2), addDays(today, 3)], nextEvents });
      }
      if (url.pathname === '/api/v1/forecast') return send(200, await service.forecast(url.searchParams));
      const assets = { '/': ['index.html', 'text/html'], '/app.mjs': ['app.mjs', 'text/javascript'],
        '/styles.css': ['styles.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
      const asset = assets[url.pathname];
      if (!asset) return send(404, { error: { code: 'NOT_FOUND', message: '请检查访问路径。' } });
      const body = await readFile(join(root, 'web', asset[0]));
      response.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8`, 'Cache-Control': 'no-cache' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      const known = error instanceof AppError;
      if (!known) console.error(JSON.stringify({ event: 'request_error', error: error.stack }));
      if (error.details?.retryAt) response.setHeader('Retry-After', Math.max(1, Math.ceil((Date.parse(error.details.retryAt) - now()) / 1000)));
      send(known ? error.status : 500, { error: { code: known ? error.code : 'INTERNAL',
        message: known ? error.message : '服务遇到异常，请稍后重试并查看服务日志。', ...(known ? error.details : {}) } });
    }
  });
}

function numberSetting(name, fallback, min, max) {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return n;
}

async function main() {
  try { await access(resolve('.env')); process.loadEnvFile(resolve('.env')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const directory = resolve(process.env.DATA_DIR || './var');
  const dispatcher = new EnvHttpProxyAgent();
  const provider = createAcquisitionProvider({ directory,
    fetcher: (url, options) => networkFetch(url, { ...options, dispatcher }),
    timeout: numberSetting('UPSTREAM_TIMEOUT_MS', 20000, 1000, 60000),
    dailyBudget: numberSetting('DAILY_WEATHER_BUDGET', 10000, 1, 10000), apiKey: process.env.OPEN_METEO_API_KEY || '' });
  const runtime = await createForecastRuntime({ directory, provider });
  const app = createApp(runtime);
  const port = numberSetting('PORT', 8787, 0, 65535), host = process.env.HOST || '127.0.0.1';
  app.requestTimeout = 90000;
  app.headersTimeout = 10000;
  app.listen(port, host, () => {
    console.log(`Sunsetbot: http://${host}:${app.address().port}`);
    runtime.refresh.start();
  });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
    runtime.refresh.stop();
    app.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
