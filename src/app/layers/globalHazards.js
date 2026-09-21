import { createGlobalHazardsLayer } from '../../layers/globalHazards/index.js';
export function createApplicationGlobalHazards({ source }) {
  return createGlobalHazardsLayer({ source });
}
