import express from 'express';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readRecentLogs } from '../server/src/operationLog';
import { createApiRouter } from '../server/src/routes';
import { parseGpsFromXmp } from '../server/src/xmp';

const originalConfigPath = process.env.MEDIA_LOCATION_CONFIG_PATH;
const originalLogDir = process.env.MEDIA_LOCATION_LOG_DIR;
const originalFfmpegPath = process.env.MEDIA_LOCATION_FFMPEG_PATH;

afterEach(() => {
  if (originalConfigPath === undefined) {
    delete process.env.MEDIA_LOCATION_CONFIG_PATH;
  } else {
    process.env.MEDIA_LOCATION_CONFIG_PATH = originalConfigPath;
  }

  if (originalLogDir === undefined) {
    delete process.env.MEDIA_LOCATION_LOG_DIR;
  } else {
    process.env.MEDIA_LOCATION_LOG_DIR = originalLogDir;
  }

  if (originalFfmpegPath === undefined) {
    delete process.env.MEDIA_LOCATION_FFMPEG_PATH;
  } else {
    process.env.MEDIA_LOCATION_FFMPEG_PATH = originalFfmpegPath;
  }
});

describe('api routes', () => {
  it('accepts shutdown requests and calls the configured shutdown handler', async () => {
    let shutdownCalled = false;
    const app = express();
    app.use(express.json());
    app.use(
      createApiRouter({
        shutdown: async () => {
          shutdownCalled = true;
        },
      }),
    );
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Test server did not bind to a local port.');
    }

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/shutdown`, {
        method: 'POST',
      });
      const body = await response.json();
      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(shutdownCalled).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('accepts client-side diagnostic log entries for clipboard failures', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-route-'));
    const configPath = path.join(root, 'app.config.json');
    const logDir = path.join(root, 'logs');
    process.env.MEDIA_LOCATION_CONFIG_PATH = configPath;
    process.env.MEDIA_LOCATION_LOG_DIR = logDir;

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
      const response = await fetch(`http://127.0.0.1:${address.port}/client-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'error',
          action: 'copy:clipboard',
          message: 'navigator.clipboard is unavailable',
        }),
      });
      const body = await response.json();
      const logs = await fetch(`http://127.0.0.1:${address.port}/logs`);
      const logBody = await logs.json();

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(logBody.content).toContain('copy:clipboard');
      expect(logBody.content).toContain('navigator.clipboard is unavailable');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('serves media files from configured roots for video playback', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-route-'));
    const configPath = path.join(root, 'app.config.json');
    const logDir = path.join(root, 'logs');
    const videoPath = path.join(root, 'clip.mp4');
    const videoBytes = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50]);
    process.env.MEDIA_LOCATION_CONFIG_PATH = configPath;
    process.env.MEDIA_LOCATION_LOG_DIR = logDir;

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
    await writeFile(videoPath, videoBytes);

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
      const response = await fetch(`http://127.0.0.1:${address.port}/media/file?path=${encodeURIComponent(videoPath)}`);
      const body = Buffer.from(await response.arrayBuffer());
      const logs = await readRecentLogs();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('video/mp4');
      expect(body).toEqual(videoBytes);
      expect(logs.content).not.toContain('read:media-file');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('logs ffmpeg diagnostics when thumbnail generation fails', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-route-'));
    const configPath = path.join(root, 'app.config.json');
    const logDir = path.join(root, 'logs');
    const videoPath = path.join(root, 'clip.mp4');
    process.env.MEDIA_LOCATION_CONFIG_PATH = configPath;
    process.env.MEDIA_LOCATION_LOG_DIR = logDir;
    process.env.MEDIA_LOCATION_FFMPEG_PATH = path.join(root, 'missing-ffmpeg.exe');

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
    await writeFile(videoPath, Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50]));

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
      const response = await fetch(`http://127.0.0.1:${address.port}/media/thumbnail?path=${encodeURIComponent(videoPath)}`);
      const body = await response.json();
      const logs = await readRecentLogs();

      expect(response.status).toBe(500);
      expect(body.error).toBe('Thumbnail generation failed. Check logs for ffmpeg details.');
      expect(logs.content).toContain('thumbnail:ffmpeg');
      expect(logs.content).toContain('missing-ffmpeg.exe');
      expect(logs.content).not.toContain('No embedded thumbnail found.');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

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

  it('updates an existing stripped-suffix video sidecar xmp without creating an exact sidecar', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-route-'));
    const configPath = path.join(root, 'app.config.json');
    const videoPath = path.join(root, 'VID_20260211_105222_00_422_095615.pano.motion.mp4');
    const panoSidecarPath = path.join(root, 'VID_20260211_105222_00_422_095615.mp4.xmp');
    const exactPanoSidecarPath = `${videoPath}.xmp`;
    process.env.MEDIA_LOCATION_CONFIG_PATH = configPath;

    await writeFile(
      configPath,
      JSON.stringify({
        appName: 'Media Location',
        appVersion: '0.1.0',
        port: 6755,
        amapKey: '',
        amapSecurityCode: '',
        libraryRoots: [root],
        backupBeforeWrite: false,
        loadVideoContent: false,
      }),
      'utf8',
    );
    await writeFile(videoPath, Buffer.from([0, 0, 0, 24]));
    await writeFile(
      panoSidecarPath,
      '<?xml version="1.0" encoding="UTF-8"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/"><exif:GPSLatitude>31.23040000</exif:GPSLatitude><exif:GPSLongitude>121.47370000</exif:GPSLongitude></rdf:Description></rdf:RDF></x:xmpmeta>',
      'utf8',
    );

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
          path: videoPath,
          longitude: 116.397128,
          latitude: 39.916527,
        }),
      });
      const body = await response.json();
      const xmp = await readFile(panoSidecarPath, 'utf8');
      const gps = parseGpsFromXmp(xmp);

      expect(response.status).toBe(200);
      expect(body.xmpPath).toBe(panoSidecarPath);
      expect(gps?.longitude).toBeCloseTo(116.397128, 6);
      expect(gps?.latitude).toBeCloseTo(39.916527, 6);
      await expect(readFile(exactPanoSidecarPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('creates an exact sidecar instead of updating stripped-suffix sidecar owned by an existing media file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-route-'));
    const configPath = path.join(root, 'app.config.json');
    const sourceVideoPath = path.join(root, 'A.foo.bar.mp4');
    const ownerVideoPath = path.join(root, 'A.foo.mp4');
    const ownerSidecarPath = path.join(root, 'A.foo.mp4.xmp');
    const exactSourceSidecarPath = `${sourceVideoPath}.xmp`;
    process.env.MEDIA_LOCATION_CONFIG_PATH = configPath;

    await writeFile(
      configPath,
      JSON.stringify({
        appName: 'Media Location',
        appVersion: '0.1.0',
        port: 6755,
        amapKey: '',
        amapSecurityCode: '',
        libraryRoots: [root],
        backupBeforeWrite: false,
        loadVideoContent: false,
      }),
      'utf8',
    );
    await writeFile(sourceVideoPath, Buffer.from([0, 0, 0, 24]));
    await writeFile(ownerVideoPath, Buffer.from([0, 0, 0, 24]));
    await writeFile(
      ownerSidecarPath,
      '<?xml version="1.0" encoding="UTF-8"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/"><exif:GPSLatitude>31.23040000</exif:GPSLatitude><exif:GPSLatitudeRef>N</exif:GPSLatitudeRef><exif:GPSLongitude>121.47370000</exif:GPSLongitude><exif:GPSLongitudeRef>E</exif:GPSLongitudeRef></rdf:Description></rdf:RDF></x:xmpmeta>',
      'utf8',
    );

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
          path: sourceVideoPath,
          longitude: 116.397128,
          latitude: 39.916527,
        }),
      });
      const body = await response.json();
      const ownerXmp = await readFile(ownerSidecarPath, 'utf8');
      const ownerGps = parseGpsFromXmp(ownerXmp);
      const sourceXmp = await readFile(exactSourceSidecarPath, 'utf8');
      const sourceGps = parseGpsFromXmp(sourceXmp);

      expect(response.status).toBe(200);
      expect(body.xmpPath).toBe(exactSourceSidecarPath);
      expect(ownerGps?.longitude).toBeCloseTo(121.4737, 6);
      expect(ownerGps?.latitude).toBeCloseTo(31.2304, 6);
      expect(sourceGps?.longitude).toBeCloseTo(116.397128, 6);
      expect(sourceGps?.latitude).toBeCloseTo(39.916527, 6);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
