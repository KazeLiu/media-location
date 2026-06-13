import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

let mapboxLoaded = false;

/**
 * 加载 Mapbox GL JS
 * @param accessToken Mapbox Access Token
 */
export async function loadMapbox(accessToken: string): Promise<void> {
  if (!accessToken) {
    throw new Error('Mapbox Access Token 不能为空');
  }

  if (mapboxLoaded) {
    return;
  }

  mapboxgl.accessToken = accessToken;
  mapboxLoaded = true;
}

/**
 * 创建 Mapbox 地图实例
 */
export function createMapboxMap(
  container: string | HTMLElement,
  options: {
    center: [number, number];
    zoom: number;
    style?: string;
  },
): mapboxgl.Map {
  return new mapboxgl.Map({
    container,
    style: options.style || 'mapbox://styles/mapbox/streets-v12',
    center: options.center,
    zoom: options.zoom,
  });
}

export { mapboxgl };
