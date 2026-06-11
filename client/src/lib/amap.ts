let amapLoader: Promise<void> | null = null;
const pluginLoaders = new Map<string, Promise<void>>();

declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: {
      securityJsCode?: string;
    };
  }
}

export function loadAmap(key: string, securityCode = ''): Promise<void> {
  applyAmapSecurityCode(securityCode);

  if (window.AMap) {
    return Promise.resolve();
  }

  if (amapLoader) {
    return amapLoader;
  }

  amapLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load AMap script'));
    document.head.appendChild(script);
  });

  return amapLoader;
}

function applyAmapSecurityCode(securityCode: string): void {
  const normalized = securityCode.trim();
  if (!normalized) {
    return;
  }

  window._AMapSecurityConfig = {
    ...window._AMapSecurityConfig,
    securityJsCode: normalized,
  };
}

export async function loadAmapPlugins(plugins: string[]): Promise<void> {
  if (!window.AMap) {
    throw new Error('AMap script is not loaded.');
  }

  await Promise.all(plugins.map((plugin) => loadAmapPlugin(plugin)));
}

function loadAmapPlugin(plugin: string): Promise<void> {
  const cached = pluginLoaders.get(plugin);
  if (cached) {
    return cached;
  }

  const loader = new Promise<void>((resolve, reject) => {
    window.AMap.plugin(plugin, () => {
      if (isPluginAvailable(plugin)) {
        resolve();
        return;
      }

      reject(new Error(`AMap plugin is unavailable: ${plugin}`));
    });
  });

  pluginLoaders.set(plugin, loader);
  return loader;
}

function isPluginAvailable(plugin: string): boolean {
  const className = plugin.split('.').pop();
  if (className === 'AutoComplete' || className === 'Autocomplete') {
    return Boolean(window.AMap?.Autocomplete || window.AMap?.AutoComplete);
  }

  return Boolean(className && window.AMap?.[className]);
}
