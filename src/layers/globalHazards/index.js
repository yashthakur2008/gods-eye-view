import * as Cesium from 'cesium';
export { createGlobalHazardsSource } from './source.js';
const COLORS = Object.freeze({
  red: Cesium.Color.RED,
  orange: Cesium.Color.ORANGE,
  green: Cesium.Color.LIME,
  unknown: Cesium.Color.CYAN,
});
const POINT_SIZE_BY_SEVERITY = Object.freeze([10, 12, 15, 18]);

export function createGlobalHazardsLayer({ source } = {}) {
  if (typeof source?.getSnapshot !== 'function')
    throw new TypeError('Global hazards require a snapshot source');
  let _viewer = null;
  let _request = null;
  let _dataSource = null;
  let _enabled = false;
  let _count = 0;
  let _lastUpdate = null;
  let _lastError = null;
  return {
    id: 'global-hazards',
    name: 'Global Hazards',
    icon: '⚠',
    source: 'GDACS · Awareness only',
    updateInterval: 5 * 60_000,
    init(viewer) {
      if (_viewer)
        throw new Error('Global hazards layer is already initialized');
      _viewer = viewer;
      _dataSource = new Cesium.CustomDataSource('global-hazards');
      _dataSource.show = false;
      viewer.dataSources.add(_dataSource);
    },
    enable() {
      _enabled = true;
      if (_dataSource) _dataSource.show = true;
    },
    disable() {
      _request?.abort();
      _request = null;
      _enabled = false;
      if (_dataSource) _dataSource.show = false;
    },
    async update() {
      if (!_enabled || !_dataSource) return false;
      _request?.abort();
      const request = new AbortController();
      _request = request;
      try {
        const hazards = await source.getSnapshot({ signal: request.signal });
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        _dataSource.entities.removeAll();
        let count = 0;
        for (const hazard of hazards) {
          const lon = Number(hazard.longitude);
          const lat = Number(hazard.latitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
          const severity = Math.max(
            0,
            Math.min(3, Math.trunc(Number(hazard.severity) || 0)),
          );
          const alertLevel = String(
            hazard.alertLevel || 'unknown',
          ).toLowerCase();
          const color = COLORS[alertLevel] || COLORS.unknown;
          _dataSource.entities.add(
            new Cesium.Entity({
              id: `global-hazard:${hazard.id || count}`,
              name: hazard.title || hazard.typeLabel || 'Global hazard',
              position: Cesium.Cartesian3.fromDegrees(lon, lat),
              point: {
                pixelSize: POINT_SIZE_BY_SEVERITY[severity] || 10,
                color: color.withAlpha(0.86),
                outlineColor: Cesium.Color.WHITE.withAlpha(0.9),
                outlineWidth: 2,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              },
              label:
                severity >= 2
                  ? {
                      text: hazard.type || 'HZ',
                      font: '13px sans-serif',
                      fillColor: Cesium.Color.WHITE,
                      outlineColor: Cesium.Color.BLACK,
                      outlineWidth: 3,
                      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                      pixelOffset: new Cesium.Cartesian2(0, -22),
                      distanceDisplayCondition:
                        new Cesium.DistanceDisplayCondition(0, 5_000_000),
                    }
                  : undefined,
              properties: {
                type: hazard.type,
                typeLabel: hazard.typeLabel,
                source: hazard.source,
                sourceUrl: hazard.sourceUrl,
                alertLevel: hazard.alertLevel,
                severity,
                confidence: hazard.confidence,
                updatedAt: hazard.updatedAt,
                advisory: hazard.advisory,
              },
              description: `${hazard.description || hazard.title || 'Global hazard'}<br><br><strong>Awareness only:</strong> Follow official emergency services and local authorities for protective action.`,
            }),
          );
          count++;
        }
        _count = count;
        _lastUpdate = Date.now();
        _lastError = null;
        console.log(`[Data:GlobalHazards] Updated: ${_count} events`);
        return true;
      } catch (err) {
        if (request.signal.aborted || _request !== request || !_enabled)
          return false;
        _lastError = err?.message || 'Global hazards source unavailable';
        console.warn('[Data:GlobalHazards] Fetch error:', err);
        return false;
      } finally {
        if (_request === request) _request = null;
      }
    },
    destroy(viewer = _viewer) {
      _request?.abort();
      _request = null;
      _viewer = null;
      _enabled = false;
      if (_dataSource) {
        viewer.dataSources.remove(_dataSource, true);
        _dataSource = null;
      }
    },
    getStats() {
      return { count: _count, lastUpdate: _lastUpdate, error: _lastError };
    },
  };
}
