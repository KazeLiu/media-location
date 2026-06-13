let mapboxLoader: Promise<void> | null = null;

declare global {
  interface Window {
    mapboxgl?: any;
  }
}

/**
 * 加载 Mapbox GL JS SDK
 * @param token Mapbox Access Token
 * @returns Promise，SDK 加载完成后 resolve
 */
export function loadMapbox(token: string): Promise<void> {
  // 如果已经加载完成，直接返回
  if (window.mapboxgl) {
    window.mapboxgl.accessToken = token;
    return Promise.resolve();
  }

  // 如果正在加载中，返回现有的 Promise
  if (mapboxLoader) {
    return mapboxLoader;
  }

  // 开始加载
  mapboxLoader = loadMapboxImpl(token);
  return mapboxLoader;
}

async function loadMapboxImpl(token: string): Promise<void> {
  // 加载 CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.1.0/mapbox-gl.css';
  document.head.appendChild(link);

  // 加载 JS SDK
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.1.0/mapbox-gl.js';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.mapboxgl) {
        window.mapboxgl.accessToken = token;
        resolve();
      } else {
        reject(new Error('Failed to load Mapbox GL JS'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load Mapbox GL JS'));
    document.head.appendChild(script);
  });
}
