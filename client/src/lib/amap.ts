import AMapLoader from '@amap/amap-jsapi-loader';

declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: {
      securityJsCode?: string;
      serviceHost?: string;
    };
  }
}

// loader 单例：首次加载后缓存 Promise；失败置 null 允许重试
let amapPromise: Promise<void> | null = null;

/**
 * 加载高德 JSAPI v2.0（官方 loader 一次性加载）。
 * - 加载前必须先配置安全密钥（skill 安全铁律）
 * - 单例守卫；HMR 下 window.AMap 已存在则直接 resolve，避免重复 load 报错
 * @param key 高德 Web 端 Key
 * @param securityCode 安全密钥（开发环境明文）
 * @param plugins 预加载插件列表，并入单次 load 调用
 */
export function loadAmap(key: string, securityCode = '', plugins: string[] = []): Promise<void> {
  applyAmapSecurityCode(securityCode);

  // HMR / 重复加载守卫：官方 loader 二次 load 会抛「重复加载JSAPI」
  if (window.AMap) {
    return Promise.resolve();
  }

  if (amapPromise) {
    return amapPromise;
  }

  amapPromise = AMapLoader.load({
    key,
    version: '2.0',
    plugins,
  })
    .then(() => {
      // 加载完成：window.AMap 由 loader 挂到全局
    })
    .catch((error: unknown) => {
      // 失败时置空，允许后续重试
      amapPromise = null;
      throw error instanceof Error
        ? error
        : new Error('Failed to load AMap script');
    });

  return amapPromise;
}

/** 配置高德安全密钥；必须在 load 之前执行。空值跳过。 */
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
