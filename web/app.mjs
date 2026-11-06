const $ = id => document.getElementById(id);
const form = $('forecast-form');
let current = null, sequence = 0, controller, dates = [];
const time = (instant, zone = 'Asia/Shanghai') => new Intl.DateTimeFormat('zh-CN', {
  timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(instant));
const text = (id, value) => { $(id).textContent = value; };
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function status(message, state = '') {
  text('status', message);
  $('status').className = 'status ' + state;
}

async function api(url, signal) {
  let response;
  try { response = await fetch(url, { signal }); }
  catch (error) {
    if (error.name === 'AbortError') throw error;
    throw Error('连接暂时中断，请检查 Sunsetbot 服务是否已启动，再重新获取。');
  }
  let value;
  try { value = await response.json(); }
  catch { throw Error('服务响应暂时无法读取，请重新获取。'); }
  if (!response.ok) throw Error(`${value.error?.message || '请求失败，请稍后重新获取。'}${value.error?.retryAt ? ' 可重试时间 ' + time(value.error.retryAt) : ''}`);
  return value;
}

function invalidate() {
  sequence++;
  controller?.abort();
  current = null;
  $('result').hidden = true;
  $('empty').hidden = false;
  $('query').disabled = false;
  $('forecast-form').setAttribute('aria-busy', 'false');
  status('条件已更新，点击“获取预报”查看结果。');
}

function list(id, values) {
  $(id).replaceChildren(...values.map(value => {
    const li = document.createElement('li'); li.textContent = value; return li;
  }));
}

function timeline(data) {
  const series = data.timeline, w = Math.max(300, $('timeline-chart').clientWidth), h = 210, left = 33, right = 16, top = 15, bottom = 30;
  const x = index => left + index / (series.length - 1) * (w - left - right);
  const y = score => h - bottom - score / 100 * (h - top - bottom);
  const path = series.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.score)}`).join(' ');
  const base = y(0), eventX = left + (Date.parse(data.event.time) - Date.parse(series[0].time)) /
    (Date.parse(series.at(-1).time) - Date.parse(series[0].time)) * (w - left - right);
  $('timeline-chart').innerHTML = `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><defs><linearGradient id="timeline-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7ad80" stop-opacity=".25"/><stop offset="1" stop-color="#f7ad80" stop-opacity="0"/></linearGradient></defs>${[0, 25, 50, 75, 100].map(v => `<path class="chart-grid" d="M${left} ${y(v)}H${w - right}"/><text class="chart-label" x="2" y="${y(v) + 4}">${v}</text>`).join('')}<path class="curve-fill" d="${path} L${x(series.length - 1)},${base} L${left},${base}Z"/><path class="event-line" d="M${eventX} ${top}V${base}"/><path class="curve" d="${path}"/>${series.filter((p, i) => i % 4 === 0).map(p => { const i = series.indexOf(p); return `<text class="chart-label" text-anchor="middle" x="${x(i)}" y="${h - 6}">${time(p.time)}</text>`; }).join('')}<path id="selected-line" class="selected-line"/><circle id="selected-dot" class="selected-dot" r="4"/></svg>`;
  $('time-slider').max = series.length - 1;
  $('time-slider').value = data.peakTime ? series.findIndex(p => p.time === data.peakTime) : Math.floor(series.length / 2);
  const inspect = () => {
    const index = Number($('time-slider').value), p = series[index];
    text('time-value', `${time(p.time)} · ${p.score.toFixed(1)} 分`);
    $('selected-line').setAttribute('d', `M${x(index)} ${top}V${base}`);
    $('selected-dot').setAttribute('cx', x(index)); $('selected-dot').setAttribute('cy', y(p.score));
    $('time-slider').setAttribute('aria-valuetext', `${time(p.time)}，观赏潜力 ${p.score.toFixed(1)} 分`);
  };
  $('time-slider').oninput = inspect;
  inspect();
}

function section(data) {
  const columns = data.section.columns, w = Math.max(580, $('section-chart').clientWidth), h = 300, left = 38, right = 20, top = 15, bottom = 28;
  const min = -150, max = 800, maxHeight = 15;
  const x = distance => left + (distance - min) / (max - min) * (w - left - right);
  const y = height => h - bottom - height / maxHeight * (h - top - bottom);
  const cells = columns.flatMap((c, i) => c.levels.map((level, j) => {
    const start = i === 0 ? min : (columns[i - 1].distanceKm + c.distanceKm) / 2;
    const end = i === columns.length - 1 ? max : (columns[i + 1].distanceKm + c.distanceKm) / 2;
    const low = j === 0 ? c.terrainKm : (c.levels[j - 1].heightKm + level.heightKm) / 2;
    const high = j === c.levels.length - 1 ? Math.min(15, level.heightKm + 0.5) : (c.levels[j + 1].heightKm + level.heightKm) / 2;
    return `<rect class="cloud-cell" x="${x(start)}" y="${y(high)}" width="${x(end) - x(start)}" height="${Math.max(0, y(low) - y(high))}" opacity="${level.cloudCover / 100 * 0.75}"/>`;
  })).join('');
  const grid = [0, 3, 6, 9, 12, 15].map(v => `<path class="chart-grid" d="M${left} ${y(v)}H${w - right}"/><text class="chart-label" x="0" y="${y(v) + 3}">${v}km</text>`).join('');
  const ticks = [-150, 0, 200, 400, 600, 800].map(v => `<text class="chart-label" x="${x(v)}" y="${h - 6}" text-anchor="middle">${v === 0 ? '本地' : v + 'km'}</text>`).join('');
  const rays = data.section.rays.map(ray => `<path class="ray" d="${ray.map((p, i) => `${i ? 'L' : 'M'}${x(p.distanceKm)},${y(p.heightKm)}`).join(' ')}"/>`).join('');
  const targets = data.section.targets.filter(t => t.strength > 0.05).map(t => `<path class="target-cloud" d="M${x(t.x) - 5} ${y(t.baseKm)}h10"/>`).join('');
  const terrain = `M${x(min)} ${y(0)} ` + columns.map(c => `L${x(c.distanceKm)} ${y(c.terrainKm)}`).join(' ') + ` L${x(max)} ${y(0)}Z`;
  $('section-chart').innerHTML = `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><defs><clipPath id="section-clip"><rect x="${left}" y="${top}" width="${w - left - right}" height="${h - top - bottom}"/></clipPath></defs>${grid}<g clip-path="url(#section-clip)">${cells}<path class="ground" d="${terrain}"/>${rays}${targets}<path class="event-line" d="M${x(0)} ${top}V${y(0)}"/></g><circle class="observer" cx="${x(0)}" cy="${y(0) - 3}" r="4"/>${ticks}</svg>`;
  $('profile-table').querySelector('tbody').innerHTML = columns.flatMap(c => c.levels.map(level =>
    `<tr><td>${c.distanceKm}</td><td>${level.pressureHpa}</td><td>${level.heightKm}</td><td>${level.cloudCover}</td><td>${c.aod ?? '待补充'}</td></tr>`)).join('');
  $('section-chart').setAttribute('aria-label', `参考时刻 ${time(data.section.time)} 的大气截面，共 ${columns.length} 个位置、${data.data.weather.pressureLevelCount} 个等压面。表格提供当前截面的插值数据。`);
}

function render(data) {
  if (data.state === 'no_event') { status('当前日期缺少所选日出日落事件，请选择其他日期。'); return; }
  current = data;
  $('result').hidden = false; $('empty').hidden = true;
  const eventName = data.eventType === 'sunrise' ? '日出' : '日落';
  text('result-context', `${data.date} / ${data.eventType === 'sunrise' ? 'MORNING GLOW' : 'EVENING GLOW'}`);
  text('result-title', `${data.location.name} · ${data.eventType === 'sunrise' ? '朝霞' : '晚霞'}预报`);
  text('summary-range', `云层情景 ${data.cloudOverlapSensitivity.minimum}–${data.cloudOverlapSensitivity.maximum} 分 · 待实测校准`);
  text('score', data.score); text('verdict', data.label); text('advice', data.advice);
  text('aod', data.aod === null ? '待补充' : data.aod.toFixed(3));
  text('visibility', data.visibilityKm === null ? '待补充' : `${data.visibilityKm} km`);
  text('model-value', data.model === 'gfs' ? 'GFS' : 'ECMWF');
  text('event-badge', eventName); text('event-clock', `${eventName} ${time(data.event.time)}`);
  text('bearing', `太阳方位 ${data.event.azimuth}° · 北为 0°，顺时针计量`);
  text('window', data.window ? `${time(data.window.start)} — ${time(data.window.end)}` : '尚无明显受光窗口');
  text('window-note', data.window ? `按模型截面推算 · ${data.window.clipped ? '窗口延伸至计算边界' : '窗口随临近云况变化'}` : '可结合临近云图和现场天空再判断');
  text('toward', data.towardSun.toFixed(1)); text('opposite', data.oppositeSun.toFixed(1));
  text('freshness', `${data.weatherModel} · 数据获取 ${time(data.data.weather.fetchedAt)} · ${data.data.weather.ageMinutes} 分钟前`);
  const dataState = data.state === 'stale' ? '使用较早缓存资料' : data.state === 'partial' ? '气溶胶资料待补充' : '垂直云层与气溶胶资料齐备';
  text('data-state', (data.data.aerosol.fetchedAt ? `CAMS 获取 ${time(data.data.aerosol.fetchedAt)} · ${dataState}` : dataState) +
    (data.pathCoverage === 'extrapolated' ? ' · 部分光路含边界外推' : ''));
  text('peak', data.peakTime ? time(data.peakTime) : '暂无明显峰值');
  text('section-title', data.peakTime ? '参考时刻的大气截面' : '日出日落时刻的大气截面');
  text('section-time', `${time(data.section.time)} · 太阳方位 ${data.section.bearing}°`);
  text('section-bearing', `视线中心 ${data.section.bearing}°`);
  list('reasons', data.reasons); list('uncertainty', data.uncertainty);
  text('sensitivity', data.sensitivity.minimum === null ? '待气溶胶资料齐备后评估' : `${data.sensitivity.minimum} — ${data.sensitivity.maximum} 分`);
  text('overlap-sensitivity', `${data.cloudOverlapSensitivity.minimum} — ${data.cloudOverlapSensitivity.maximum} 分`);
  text('cadence', `曲线以 5 分钟推算；原始天气资料约 ${data.data.weather.nativeTimeStepMinutes / 60} 小时、CAMS 约 3 小时，经 API 逐小时插值。窗口用于临近观察参考。`);
  text('forecast-id', `${data.modelVersion} · ${data.id}`);
  $('windy').href = `https://www.windy.com/?clouds,${data.location.lat},${data.location.lon},7`;
  timeline(data); section(data);
  const resultStatus = data.state === 'stale' ? '已显示带时间标记的缓存预报，可稍后重新获取。' : data.state === 'partial' ? '已生成预报，气溶胶缺失影响已列在说明中。' : '预报已更新，可结合临近云图与实际天空观察。';
  status((data.leadTimeHours < 0 ? '所选事件已发生，当前显示资料回算；可选择明天查看预报。' : '') + resultStatus);
}

async function query(event) {
  event?.preventDefault();
  if (!form.reportValidity()) return;
  controller?.abort();
  const requestController = new AbortController(); controller = requestController;
  const id = ++sequence;
  const params = new URLSearchParams(new FormData(form));
  if ($('custom').checked) { params.set('lat', $('lat').value); params.set('lon', $('lon').value); }
  const timeout = setTimeout(() => requestController.abort(), 85000);
  $('query').disabled = true; form.setAttribute('aria-busy', 'true');
  $('result').hidden = true; $('empty').hidden = true;
  status('正在获取空间云层与气溶胶资料，计算光路…', 'loading');
  try {
    const data = await api('/api/v1/forecast?' + params, requestController.signal);
    if (id !== sequence) return;
    render(data);
    history.replaceState(null, '', '/?' + params);
    try { localStorage.setItem('sunsetbot-city', params.get('city')); } catch {}
  } catch (error) {
    if (id !== sequence) return;
    current = null; $('empty').hidden = false;
    status(error.name === 'AbortError' ? '等待超时，请重新获取；已有天气请求会保留缓存。' : error.message, 'error');
  } finally {
    clearTimeout(timeout);
    if (id === sequence) { $('query').disabled = false; form.setAttribute('aria-busy', 'false'); }
  }
}

async function prepare() {
  const value = await api('/api/v1/locations');
  $('city').replaceChildren(...value.locations.map(p => new Option(p.name, p.id)));
  dates = value.dates;
  $('date').replaceChildren(...dates.map((d, i) => new Option(`${['今天', '明天', '后天'][i]} · ${d.slice(5)}`, d)));
  const params = new URLSearchParams(location.search);
  let saved;
  try { saved = localStorage.getItem('sunsetbot-city'); } catch {}
  const selectedCity = params.get('city') ?? saved ?? 'shanghai';
  if (value.locations.some(p => p.id === selectedCity)) $('city').value = selectedCity;
  if (dates.includes(params.get('date'))) $('date').value = params.get('date');
  for (const name of ['model', 'event']) {
    const element = [...form.elements].find(e => e.name === name && e.value === params.get(name));
    if (element) element.checked = true;
  }
  if (params.has('lat') && params.has('lon')) {
    $('custom').checked = true; $('lat').value = params.get('lat'); $('lon').value = params.get('lon');
    $('lat').disabled = false; $('lon').disabled = false;
  }
  await query();
}

form.onsubmit = query;
form.addEventListener('change', () => {
  $('lat').disabled = !$('custom').checked; $('lon').disabled = !$('custom').checked;
  invalidate();
});
$('download').onclick = () => {
  if (!current) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url;
  a.download = `sunsetbot-${current.location.id}-${current.date}-${current.eventType}-${current.model}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  try {
    const value = await api('/api/v1/locations');
    if (value.dates[0] !== dates[0]) {
      const previous = $('date').value; dates = value.dates;
      $('date').replaceChildren(...dates.map((d, i) => new Option(`${['今天', '明天', '后天'][i]} · ${d.slice(5)}`, d)));
      if (dates.includes(previous)) $('date').value = previous;
      invalidate(); status('当地日期已更新，请重新获取预报。');
    }
  } catch { if (current) status('网络连接暂时中断，已显示的预报保留获取时间。', 'error'); }
});
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!current) return;
    const selected = $('time-slider').value;
    timeline(current); section(current);
    $('time-slider').value = selected;
    $('time-slider').oninput();
  }, 100);
});
prepare().catch(error => { $('empty').hidden = false; status(error.message, 'error'); });
