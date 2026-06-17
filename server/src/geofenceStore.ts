import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { GeofenceConfig } from '../../shared/contracts';

const DEFAULT_CONFIG: GeofenceConfig = {
  enabled: true, // 默认在基本功能页面显示围栏列表
  showGeofencesOnMap: false, // 默认不在基本功能页面显示地图围栏
  geofences: [],
};

export async function loadGeofenceConfig(configPath: string): Promise<GeofenceConfig> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as GeofenceConfig;
    // 兼容旧版本配置，如果没有 showGeofencesOnMap 字段，默认为 true
    if (config.showGeofencesOnMap === undefined) {
      config.showGeofencesOnMap = true;
    }
    return config;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return DEFAULT_CONFIG;
    }
    throw error;
  }
}

export async function saveGeofenceConfig(configPath: string, config: GeofenceConfig): Promise<GeofenceConfig> {
  const dir = path.dirname(configPath);
  await fs.mkdir(dir, { recursive: true });

  const tempPath = `${configPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(config, null, 2), 'utf-8');
  await fs.rename(tempPath, configPath);

  return config;
}
