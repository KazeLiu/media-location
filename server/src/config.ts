import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppConfig } from '../../shared/contracts';

const DEFAULT_CONFIG: AppConfig = {
  appName: 'Media Location',
  appVersion: '0.1.0',
  port: 6755,
  amapKey: '',
  amapSecurityCode: '',
  mapProvider: 'amap',
  mapboxToken: '',
  libraryRoots: [],
  backupBeforeWrite: false,
  largeWorkspace: false,
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
    amapKey: String(input.amapKey || '').trim(),
    amapSecurityCode: String(input.amapSecurityCode || '').trim(),
    mapProvider: input.mapProvider === 'mapbox' ? 'mapbox' : 'amap',
    mapboxToken: String(input.mapboxToken || '').trim(),
    libraryRoots,
    backupBeforeWrite: Boolean(input.backupBeforeWrite ?? DEFAULT_CONFIG.backupBeforeWrite),
    largeWorkspace: Boolean(input.largeWorkspace ?? DEFAULT_CONFIG.largeWorkspace),
  };
}
