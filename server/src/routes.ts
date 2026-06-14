import express from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BrowseResponse, ClientLogPayload } from '../../shared/contracts';
import { loadConfig, saveConfig } from './config';
import { ensureWithinRoots, findRootForPath, getParentInsideRoot, listDirectoryEntries } from './fs';
import { browseFolders, getFolderPickerShortcuts, listChildFolders } from './folders';
import { isMediaFile, resolveXmpPathForWrite, scanMediaDirectoryPage } from './media';
import { readRecentLogs, writeOperationLog } from './operationLog';
import { getCachedThumbnail, ThumbnailGenerationError } from './thumbnails';
import { writeGpsToXmpFile } from './xmp';
import { writeGpsToExif, checkExiftoolAvailable } from './exif';
import { loadGeofenceConfig, saveGeofenceConfig } from './geofenceStore';

export interface ApiRouterOptions {
  shutdown?: () => void | Promise<void>;
}

export function createApiRouter(options: ApiRouterOptions = {}): express.Router {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  router.get('/geofences', async (_req, res, next) => {
    const startedAt = Date.now();
    try {
      const config = await loadConfig();
      const geofencePath = path.join(path.dirname(config._configPath || 'data/app.config.json'), 'geofences.json');
      const geofenceConfig = await loadGeofenceConfig(geofencePath);

      await writeOperationLog({
        level: 'info',
        action: 'geofences:get',
        status: 'ok',
        durationMs: Date.now() - startedAt,
      });

      res.json(geofenceConfig);
    } catch (error) {
      await writeOperationLog({
        level: 'error',
        action: 'geofences:get',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startedAt,
      });
      next(error);
    }
  });

  router.post('/geofences', async (req, res, next) => {
    const startedAt = Date.now();
    try {
      const config = await loadConfig();
      const geofencePath = path.join(path.dirname(config._configPath || 'data/app.config.json'), 'geofences.json');

      const geofenceConfig = req.body;
      if (!geofenceConfig || typeof geofenceConfig.enabled !== 'boolean' || !Array.isArray(geofenceConfig.geofences)) {
        res.status(400).json({ error: 'Invalid geofence config format' });
        return;
      }

      const saved = await saveGeofenceConfig(geofencePath, geofenceConfig);

      await writeOperationLog({
        level: 'info',
        action: 'geofences:save',
        status: 'ok',
        details: { count: saved.geofences.length },
        durationMs: Date.now() - startedAt,
      });

      res.json(saved);
    } catch (error) {
      await writeOperationLog({
        level: 'error',
        action: 'geofences:save',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startedAt,
      });
      next(error);
    }
  });

  router.post('/shutdown', async (_req, res, next) => {
    const startedAt = Date.now();
    try {
      await writeOperationLog({
        level: 'info',
        action: 'shutdown:request',
        target: 'server',
        status: 'ok',
        durationMs: Date.now() - startedAt,
      });
      res.json({ ok: true });
      setTimeout(() => {
        Promise.resolve(options.shutdown?.()).catch((error) => {
          void writeOperationLog({
            level: 'error',
            action: 'shutdown',
            target: 'server',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown shutdown error',
            details: error instanceof Error ? { stack: error.stack } : undefined,
          }).catch(() => undefined);
        });
      }, 10);
    } catch (error) {
      next(error);
    }
  });

  router.get('/logs', async (_req, res, next) => {
    const startedAt = Date.now();
    try {
      const logs = await readRecentLogs();
      await logSuccess('read:logs', logs.path, startedAt);
      res.json(logs);
    } catch (error) {
      next(error);
    }
  });

  router.post('/client-log', async (req, res, next) => {
    const startedAt = Date.now();
    try {
      const payload = normalizeClientLogPayload(req.body);
      await writeOperationLog({
        level: payload.level,
        action: payload.action,
        target: 'browser',
        status: payload.level === 'error' ? 'error' : 'ok',
        message: payload.message,
        durationMs: Date.now() - startedAt,
        details: payload.details,
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get('/config', async (_req, res, next) => {
    const startedAt = Date.now();
    try {
      const config = await loadConfig();
      await logSuccess('read:config', 'app.config.json', startedAt);
      res.json(config);
    } catch (error) {
      next(error);
    }
  });

  router.get('/folders', async (req, res, next) => {
    const startedAt = Date.now();
    try {
      const requestedPath = typeof req.query.path === 'string' ? req.query.path : undefined;
      const response = await browseFolders(requestedPath);
      await logSuccess('read:folders', requestedPath ?? 'default', startedAt);
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  router.get('/folders/shortcuts', async (_req, res, next) => {
    const startedAt = Date.now();
    try {
      const shortcuts = await getFolderPickerShortcuts();
      await logSuccess('read:folder-shortcuts', 'system', startedAt);
      res.json(shortcuts);
    } catch (error) {
      next(error);
    }
  });

  router.post('/config', async (req, res, next) => {
    const startedAt = Date.now();
    try {
      const saved = await saveConfig(req.body);
      await logSuccess('write:config', 'app.config.json', startedAt, {
        libraryRootCount: saved.libraryRoots.length,
      });
      res.json(saved);
    } catch (error) {
      next(error);
    }
  });

  router.get('/library/browse', async (req, res, next) => {
    const startedAt = Date.now();
    try {
      const config = await loadConfig();
      const requestedDir = typeof req.query.dir === 'string' ? req.query.dir : config.libraryRoots[0];
      const mediaFilter = typeof req.query.filter === 'string' ? req.query.filter : '';
      const mediaOffset = toNonNegativeInteger(req.query.offset, 0);
      const mediaLimit = toPositiveInteger(req.query.limit, 120);

      if (!requestedDir) {
        res.json({
          currentDir: '',
          parentDir: null,
          rootDir: null,
          entries: [],
          media: [],
          mediaTotal: 0,
          mediaOffset,
          mediaLimit,
          mediaFilter,
        } satisfies BrowseResponse);
        return;
      }

      const currentDir = ensureWithinRoots(requestedDir, config.libraryRoots);
      const rootDir = findRootForPath(currentDir, config.libraryRoots);

      if (!rootDir) {
        throw new Error('Current directory is not under any configured root.');
      }

      const stat = await fs.stat(currentDir);
      if (!stat.isDirectory()) {
        throw new Error(`Path is not a directory: ${currentDir}`);
      }

      const mediaPage = await scanMediaDirectoryPage(currentDir, {
        filter: mediaFilter,
        offset: mediaOffset,
        limit: mediaLimit,
      });
      const entries = await listDirectoryEntries(currentDir);

      await logSuccess('read:library', currentDir, startedAt, {
        filter: mediaFilter,
        offset: mediaPage.offset,
        limit: mediaPage.limit,
        total: mediaPage.total,
        returned: mediaPage.items.length,
      });

      res.json({
        currentDir,
        parentDir: getParentInsideRoot(currentDir, rootDir),
        rootDir,
        entries,
        media: mediaPage.items,
        mediaTotal: mediaPage.total,
        mediaOffset: mediaPage.offset,
        mediaLimit: mediaPage.limit,
        mediaFilter: mediaPage.filter,
      } satisfies BrowseResponse);
    } catch (error) {
      next(error);
    }
  });

  router.get('/library/directories', async (req, res, next) => {
    const startedAt = Date.now();
    try {
      const config = await loadConfig();
      const requestedDir = typeof req.query.dir === 'string' ? req.query.dir : config.libraryRoots[0];

      if (!requestedDir) {
        res.json([]);
        return;
      }

      const currentDir = ensureWithinRoots(requestedDir, config.libraryRoots);
      const stat = await fs.stat(currentDir);
      if (!stat.isDirectory()) {
        throw new Error(`Path is not a directory: ${currentDir}`);
      }

      const folders = await listChildFolders(currentDir);
      await logSuccess('read:child-directories', currentDir, startedAt, {
        count: folders.length,
      });
      res.json(folders);
    } catch (error) {
      next(error);
    }
  });

  router.get('/media/thumbnail', async (req, res, next) => {
    const startedAt = Date.now();
    try {
      const config = await loadConfig();
      const mediaPath = ensureWithinRoots(String(req.query.path || ''), config.libraryRoots);
      const stat = await fs.stat(mediaPath);

      if (!stat.isFile()) {
        throw new Error(`Path is not a file: ${mediaPath}`);
      }

      let thumbnail;
      try {
        thumbnail = await getCachedThumbnail(mediaPath);
      } catch (error) {
        if (error instanceof ThumbnailGenerationError) {
          await writeOperationLog({
            level: 'error',
            action: 'thumbnail:ffmpeg',
            target: mediaPath,
            status: 'error',
            message: error.message,
            durationMs: Date.now() - startedAt,
            details: {
              ...error.details,
              cause: normalizeErrorForLog(error.cause),
            },
          });
          res.status(500).json({ error: 'Thumbnail generation failed. Check logs for ffmpeg details.' });
          return;
        }

        throw error;
      }

      if (!thumbnail) {
        await writeOperationLog({
          level: 'warn',
          action: 'read:thumbnail',
          target: mediaPath,
          status: 'miss',
          message: 'No embedded thumbnail found.',
          durationMs: Date.now() - startedAt,
        });
        res.status(404).json({ error: 'No embedded thumbnail found.' });
        return;
      }

      await logSuccess('read:thumbnail', mediaPath, startedAt);
      res.type(thumbnail.contentType);
      res.sendFile(thumbnail.path);
    } catch (error) {
      next(error);
    }
  });

  router.get('/media/file', async (req, res, next) => {
    const startedAt = Date.now();
    try {
      const config = await loadConfig();
      const mediaPath = ensureWithinRoots(String(req.query.path || ''), config.libraryRoots);
      const stat = await fs.stat(mediaPath);

      if (!stat.isFile()) {
        throw new Error(`Path is not a file: ${mediaPath}`);
      }

      if (!isMediaFile(mediaPath)) {
        throw new Error(`Path is not a media file: ${mediaPath}`);
      }

      res.sendFile(mediaPath);
    } catch (error) {
      next(error);
    }
  });

  router.post('/media/set-gps', async (req, res, next) => {
    const startedAt = Date.now();
    try {
      const config = await loadConfig();
      const mediaPath = ensureWithinRoots(String(req.body.path || ''), config.libraryRoots);
      const wgsLng = Number(req.body.longitude);
      const wgsLat = Number(req.body.latitude);

      if (!Number.isFinite(wgsLng) || !Number.isFinite(wgsLat)) {
        throw new Error('Invalid WGS-84 coordinate.');
      }

      const gpsData = {
        latitude: wgsLat,
        longitude: wgsLng,
      };

      let writtenPath: string;
      let writeMode: string;

      if (config.gpsWriteMode === 'exif') {
        // 直接写入图片 EXIF
        const ext = path.extname(mediaPath).toLowerCase();
        if (ext === '.mp4' || ext === '.mov' || ext === '.avi' || ext === '.mkv') {
          // 视频文件不支持直接写入 EXIF，降级到 XMP
          const xmpPath = await resolveXmpPathForWrite(mediaPath);
          writtenPath = await writeGpsToXmpFile(xmpPath, gpsData, config.backupBeforeWrite);
          writeMode = 'xmp-fallback';
        } else {
          // 图片文件使用 exiftool 写入
          writtenPath = await writeGpsToExif(mediaPath, gpsData, config.backupBeforeWrite);
          writeMode = 'exif';
        }
      } else {
        // 默认写入 XMP 侧车文件
        const xmpPath = await resolveXmpPathForWrite(mediaPath);
        writtenPath = await writeGpsToXmpFile(xmpPath, gpsData, config.backupBeforeWrite);
        writeMode = 'xmp';
      }

      await logSuccess('write:gps', mediaPath, startedAt, {
        writtenPath,
        writeMode,
        latitude: wgsLat,
        longitude: wgsLng,
      });
      res.json({
        path: mediaPath,
        writtenPath,
        writeMode,
        latitude: wgsLat,
        longitude: wgsLng,
      });
    } catch (error) {
      next(error);
    }
  });

  router.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    void writeOperationLog({
      level: 'error',
      action: `error:${req.method.toLowerCase()} ${req.path}`,
      target: req.originalUrl,
      status: 'error',
      message,
      details: error instanceof Error ? { stack: error.stack } : undefined,
    }).catch(() => undefined);
    res.status(400).json({ error: message });
  });

  return router;
}

async function logSuccess(action: string, target: string, startedAt: number, details?: unknown): Promise<void> {
  await writeOperationLog({
    level: 'info',
    action,
    target,
    status: 'ok',
    durationMs: Date.now() - startedAt,
    details,
  });
}

function normalizeClientLogPayload(input: unknown): ClientLogPayload {
  const source: Record<string, unknown> = isRecord(input) ? input : {};
  const rawLevel = String(source.level ?? 'info');
  const level: ClientLogPayload['level'] =
    rawLevel === 'warn' || rawLevel === 'error' || rawLevel === 'info' ? rawLevel : 'info';
  const action = String(source.action || 'client:event').slice(0, 120);
  const message = typeof source.message === 'string' ? source.message.slice(0, 2000) : undefined;

  return {
    level,
    action,
    message,
    details: source.details,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeErrorForLog(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return error;
  }

  const nodeError = error as NodeJS.ErrnoException;
  return {
    name: error.name,
    message: error.message,
    code: nodeError.code,
    path: nodeError.path,
    stack: error.stack,
  };
}

function toNonNegativeInteger(value: unknown, fallback: number): number {
  const numberValue = Number(value ?? fallback);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.max(0, Math.floor(numberValue));
}

function toPositiveInteger(value: unknown, fallback: number): number {
  const numberValue = Number(value ?? fallback);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return fallback;
  }

  return Math.floor(numberValue);
}

export function createStaticRouter(clientDist: string): express.Router {
  const router = express.Router();
  router.use(express.static(clientDist));
  router.use((_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  return router;
}
