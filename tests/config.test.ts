import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, saveConfig } from '../server/src/config';

const originalConfigPath = process.env.MEDIA_LOCATION_CONFIG_PATH;

afterEach(() => {
  if (originalConfigPath === undefined) {
    delete process.env.MEDIA_LOCATION_CONFIG_PATH;
  } else {
    process.env.MEDIA_LOCATION_CONFIG_PATH = originalConfigPath;
  }
});

describe('app config', () => {
  it('defaults XMP backup before write to off', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-config-'));
    process.env.MEDIA_LOCATION_CONFIG_PATH = path.join(root, 'missing.config.json');

    const config = await loadConfig();

    expect(config.backupBeforeWrite).toBe(false);
  });

  it('defaults video content loading to off', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-config-'));
    process.env.MEDIA_LOCATION_CONFIG_PATH = path.join(root, 'missing.config.json');

    const config = await loadConfig();

    expect(config.loadVideoContent).toBe(false);
  });

  it('normalizes XMP backup before write to off', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-config-'));
    process.env.MEDIA_LOCATION_CONFIG_PATH = path.join(root, 'app.config.json');

    const saved = await saveConfig({
      backupBeforeWrite: true,
    });

    expect(saved.backupBeforeWrite).toBe(false);
  });

  it('persists the AMap security code independently from the web key', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-config-'));
    process.env.MEDIA_LOCATION_CONFIG_PATH = path.join(root, 'app.config.json');

    const saved = await saveConfig({
      amapKey: 'web-key',
      amapSecurityCode: ' security-code ',
      libraryRoots: [root],
    });

    expect(saved.amapKey).toBe('web-key');
    expect(saved.amapSecurityCode).toBe('security-code');
  });

  it('normalizes video content loading to off', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-config-'));
    process.env.MEDIA_LOCATION_CONFIG_PATH = path.join(root, 'app.config.json');

    const saved = await saveConfig({
      loadVideoContent: true,
    });

    expect(saved.loadVideoContent).toBe(false);
  });
});
