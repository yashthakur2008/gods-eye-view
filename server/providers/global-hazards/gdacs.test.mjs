import test from 'node:test';
import assert from 'node:assert/strict';

import { parseGdacsRss, fetchGdacsHazards } from './gdacs.js';

const SAMPLE_RSS = `<?xml version="1.0"?><rss><channel>
<item>
<title><![CDATA[Flood in Testland]]></title>
<link>https://www.gdacs.org/report.aspx?eventtype=FL&amp;eventid=1</link>
<description><![CDATA[Public flood awareness record]]></description>
<pubDate>Sun, 20 Sep 2026 10:00:00 GMT</pubDate>
<guid>test-guid</guid>
<gdacs:eventtype>FL</gdacs:eventtype>
<gdacs:alertlevel>Orange</gdacs:alertlevel>
<gdacs:eventid>1001</gdacs:eventid>
<gdacs:fromdate>Sun, 20 Sep 2026 09:00:00 GMT</gdacs:fromdate>
<gdacs:todate>Sun, 20 Sep 2026 12:00:00 GMT</gdacs:todate>
<georss:point>12.5 77.6</georss:point>
</item>
<item><title>No point</title><gdacs:eventtype>EQ</gdacs:eventtype></item>
</channel></rss>`;

test('parseGdacsRss normalizes GDACS items into safe hazard records', () => {
  const hazards = parseGdacsRss(SAMPLE_RSS);
  assert.equal(hazards.length, 1);
  assert.equal(hazards[0].source, 'GDACS');
  assert.equal(hazards[0].type, 'FL');
  assert.equal(hazards[0].typeLabel, 'Flood');
  assert.equal(hazards[0].alertLevel, 'orange');
  assert.equal(hazards[0].severity, 2);
  assert.equal(hazards[0].latitude, 12.5);
  assert.equal(hazards[0].longitude, 77.6);
  assert.match(hazards[0].advisory, /Awareness only/);
  assert.match(hazards[0].sourceUrl, /eventtype=FL&eventid=1/);
});

test('fetchGdacsHazards reports upstream HTTP failures', async () => {
  await assert.rejects(
    fetchGdacsHazards({
      fetchImpl: async () => ({ ok: false, status: 503 }),
      timeoutMs: 1000,
    }),
    /GDACS HTTP 503/,
  );
});

test('fetchGdacsHazards returns source counts for successful RSS', async () => {
  const result = await fetchGdacsHazards({
    fetchImpl: async () => ({ ok: true, text: async () => SAMPLE_RSS }),
    timeoutMs: 1000,
  });
  assert.equal(result.sources[0].source, 'GDACS');
  assert.equal(result.sources[0].count, 1);
  assert.equal(result.hazards[0].confidence, 'official-source');
});
