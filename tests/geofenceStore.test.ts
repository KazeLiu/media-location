import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadGeofenceConfig, saveGeofenceConfig } from '../server/src/geofenceStore';

const TEST_DATA_DIR = path.join(__dirname, '__test_data__');
const TEST_CONFIG_PATH = path.join(TEST_DATA_DIR, 'geofences.json');

describe('geofenceStore', () => {
  beforeEach(async () => {
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  it('should return default config when file does not exist', async () => {
    const config = await loadGeofenceConfig(TEST_CONFIG_PATH);
    expect(config).toEqual({
      enabled: false,
      geofences: [],
    });
  });

  it('should save and load config', async () => {
    const config: any = {
      enabled: true,
      geofences: [
        {
          id: 'test-id',
          name: '测试围栏',
          color: '#FF5733',
          coordinates: [
            { longitude: 116.397428, latitude: 39.90923 },
            { longitude: 116.398428, latitude: 39.90923 },
            { longitude: 116.398428, latitude: 39.91023 },
          ],
          createdAt: '2026-06-14T10:00:00.000Z',
          updatedAt: '2026-06-14T10:00:00.000Z',
        },
      ],
    };

    await saveGeofenceConfig(TEST_CONFIG_PATH, config);
    const loaded = await loadGeofenceConfig(TEST_CONFIG_PATH);

    expect(loaded).toEqual(config);
  });
});
