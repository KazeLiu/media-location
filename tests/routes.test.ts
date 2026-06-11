import express from 'express';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApiRouter } from '../server/src/routes';
import { parseGpsFromXmp } from '../server/src/xmp';

const originalConfigPath = process.env.MEDIA_LOCATION_CONFIG_PATH;

afterEach(() => {
  if (originalConfigPath === undefined) {
    delete process.env.MEDIA_LOCATION_CONFIG_PATH;
  } else {
    process.env.MEDIA_LOCATION_CONFIG_PATH = originalConfigPath;
  }
});

describe('api routes', () => {
  it('writes /media/set-gps coordinates as WGS-84 without GCJ-02 conversion', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-route-'));
    const configPath = path.join(root, 'app.config.json');
    const imagePath = path.join(root, 'photo.jpg');
    process.env.MEDIA_LOCATION_CONFIG_PATH = configPath;

    await writeFile(
      configPath,
      JSON.stringify({
        appName: 'Media Location',
        appVersion: '0.1.0',
        port: 6755,
        amapKey: '',
        libraryRoots: [root],
        backupBeforeWrite: false,
      }),
      'utf8',
    );
    await writeFile(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const app = express();
    app.use(express.json());
    app.use(createApiRouter());
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Test server did not bind to a local port.');
    }

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/media/set-gps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: imagePath,
          longitude: 116.397128,
          latitude: 39.916527,
        }),
      });
      const body = await response.json();
      const xmp = await readFile(`${imagePath}.xmp`, 'utf8');
      const gps = parseGpsFromXmp(xmp);

      expect(response.status).toBe(200);
      expect(body.longitude).toBeCloseTo(116.397128, 6);
      expect(body.latitude).toBeCloseTo(39.916527, 6);
      expect(gps?.longitude).toBeCloseTo(116.397128, 6);
      expect(gps?.latitude).toBeCloseTo(39.916527, 6);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
