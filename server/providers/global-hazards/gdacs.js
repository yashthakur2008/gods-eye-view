const GDACS_RSS_URL = 'https://www.gdacs.org/xml/rss.xml';
const DEFAULT_FETCH_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_ITEMS = 200;
const ALERT_SEVERITY = Object.freeze({ green: 1, orange: 2, red: 3 });

function textBetween(xml, tag) {
  const match = xml.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'),
  );
  return match ? decodeXml(match[1].trim()) : null;
}

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseDate(value) {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? ms : null;
}

function eventTypeLabel(code) {
  return (
    {
      EQ: 'Earthquake',
      TC: 'Tropical cyclone',
      FL: 'Flood',
      WF: 'Wildfire',
      VO: 'Volcano',
      DR: 'Drought',
    }[String(code || '').toUpperCase()] || 'Disaster event'
  );
}

function normalizeAlertLevel(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return ALERT_SEVERITY[normalized] ? normalized : 'unknown';
}

function alertSeverity(alertLevel) {
  return ALERT_SEVERITY[alertLevel] || 0;
}

export function parseGdacsRss(xml, { maxItems = DEFAULT_MAX_ITEMS } = {}) {
  const items = String(xml || '').match(/<item[\s\S]*?<\/item>/gi) || [];
  const hazards = [];
  for (const item of items.slice(0, maxItems)) {
    const point = item.match(/<georss:point[^>]*>([\s\S]*?)<\/georss:point>/i);
    const coords = point ? point[1].trim().split(/\s+/).map(Number) : [];
    const lat = coords[0];
    const lon = coords[1];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const eventType = textBetween(item, 'gdacs:eventtype') || 'UN';
    const alertLevel = normalizeAlertLevel(
      textBetween(item, 'gdacs:alertlevel'),
    );
    const eventId =
      textBetween(item, 'gdacs:eventid') ||
      textBetween(item, 'guid') ||
      textBetween(item, 'link');
    const pubDate = parseDate(textBetween(item, 'pubDate'));
    const title =
      textBetween(item, 'title') ||
      `${eventTypeLabel(eventType)} near ${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    hazards.push({
      id: `gdacs:${String(eventType).toUpperCase()}:${eventId || `${lat},${lon},${pubDate || ''}`}`,
      source: 'GDACS',
      sourceUrl: textBetween(item, 'link'),
      title,
      description: textBetween(item, 'description'),
      type: String(eventType).toUpperCase(),
      typeLabel: eventTypeLabel(eventType),
      alertLevel,
      severity: alertSeverity(alertLevel),
      confidence: alertLevel === 'unknown' ? 'unknown' : 'official-source',
      latitude: lat,
      longitude: lon,
      startedAt: parseDate(textBetween(item, 'gdacs:fromdate')),
      endedAt: parseDate(textBetween(item, 'gdacs:todate')),
      updatedAt: pubDate,
      officialAlert: true,
      advisory:
        'Awareness only. Follow official emergency services and local authorities for protective action.',
    });
  }
  return hazards;
}

export async function fetchGdacsHazards({
  fetchImpl = fetch,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  signal,
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (signal)
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const res = await fetchImpl(GDACS_RSS_URL, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`GDACS HTTP ${res.status}`);
    const hazards = parseGdacsRss(await res.text());
    return {
      at: Date.now(),
      sources: [{ source: 'GDACS', ok: true, count: hazards.length }],
      hazards,
    };
  } finally {
    clearTimeout(timeout);
  }
}
