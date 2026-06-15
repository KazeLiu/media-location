import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppConfig } from '../../shared/contracts';

const DEFAULT_CONFIG: AppConfig = {
  appName: 'Media Location',
  appVersion: '0.4.7',
  port: 6755,
  mapProvider: 'amap',
  amapKey: '',
  amapSecurityCode: '',
  mapboxAccessToken: '',
  libraryRoots: [],
  backupBeforeWrite: false,
  loadVideoContent: false,
  gpsWriteMode: 'xmp',
  enableClickToCopy: false,
  enableMarkerClustering: false, // 默认不启用聚合
};

export function getConfigPath(): string {
  return process.env.MEDIA_LOCATION_CONFIG_PATH
    ? path.resolve(process.env.MEDIA_LOCATION_CONFIG_PATH)
    : path.resolve(process.cwd(), 'data', 'app.config.json');
}

export async function loadConfig(): Promise<AppConfig> {
  const configPath = getConfigPath();

  try {
    const raw = await fs.readFile(configPath, 'utf8');
    return normalizeConfig(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return DEFAULT_CONFIG;
    }
    throw error;
  }
}

export async function saveConfig(input: Partial<AppConfig>): Promise<AppConfig> {
  const previous = await loadConfig();
  const next = normalizeConfig({ ...previous, ...input });
  const configPath = getConfigPath();

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');

  return next;
}

function normalizeConfig(input: Partial<AppConfig>): AppConfig {
  const port = Number(input.port ?? DEFAULT_CONFIG.port);
  const libraryRoots = Array.isArray(input.libraryRoots)
    ? input.libraryRoots.map((entry) => path.resolve(String(entry))).filter(Boolean)
    : DEFAULT_CONFIG.libraryRoots;

  return {
    appName: DEFAULT_CONFIG.appName,
    appVersion: DEFAULT_CONFIG.appVersion,
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_CONFIG.port,
    mapProvider: (input.mapProvider === 'mapbox' ? 'mapbox' : 'amap'),
    amapKey: String(input.amapKey || '').trim(),
    amapSecurityCode: String(input.amapSecurityCode || '').trim(),
    mapboxAccessToken: String(input.mapboxAccessToken || '').trim(),
    libraryRoots,
    // 当前版本不暴露 XMP 写入前备份入口，统一关闭避免隐藏配置生效。
    backupBeforeWrite: false,
    // 历史兼容字段:工作台不再内嵌加载或播放视频，统一关闭。
    loadVideoContent: false,
    gpsWriteMode: (input.gpsWriteMode === 'exif' ? 'exif' : 'xmp'),
    enableClickToCopy: Boolean(input.enableClickToCopy),
    enableMarkerClustering: Boolean(input.enableMarkerClustering),
  };
}
