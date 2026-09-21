export function createGlobalHazardsSource({
  apiUrl = '/api/global-hazards',
  fetchImpl = fetch,
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      const res = await fetchImpl(apiUrl, {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`Global hazards HTTP ${res.status}`);
      const body = await res.json();
      return Array.isArray(body?.hazards) ? body.hazards : [];
    },
  };
}
