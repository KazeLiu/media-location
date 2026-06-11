import express from 'express';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BrowseResponse } from '../../shared/contracts';
import { loadConfig, saveConfig } from './config';
import { ensureWithinRoots, findRootForPath, getParentInsideRoot, listDirectoryEntries } from './fs';
import { browseFolders, getFolderPickerShortcuts, listChildFolders } from './folders';
import { getSameNameXmpPath, scanMediaDirectory } from './media';
import { getCachedThumbnail } from './thumbnails';
import { writeGpsToXmpFile } from './xmp';

export function createApiRouter(): express.Router {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  router.get('/config', async (_req, res, next) => {
    try {
      res.json(await loadConfig());
    } catch (error) {
      next(error);
    }
  });

  router.get('/folders', async (req, res, next) => {
    try {
      const requestedPath = typeof req.query.path === 'string' ? req.query.path : undefined;
      res.json(await browseFolders(requestedPath));
    } catch (error) {
      next(error);
    }
  });

  router.get('/folders/shortcuts', async (_req, res, next) => {
    try {
      res.json(await getFolderPickerShortcuts());
    } catch (error) {
      next(error);
    }
  });

  router.post('/config', async (req, res, next) => {
    try {
      res.json(await saveConfig(req.body));
    } catch (error) {
      next(error);
    }
  });

  router.get('/library/browse', async (req, res, next) => {
    try {
      const config = await loadConfig();
      const requestedDir = typeof req.query.dir === 'string' ? req.query.dir : config.libraryRoots[0];

      if (!requestedDir) {
        res.json({
          currentDir: '',
          parentDir: null,
          rootDir: null,
          entries: [],
          media: [],
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

      res.json({
        currentDir,
        parentDir: getParentInsideRoot(currentDir, rootDir),
        rootDir,
        entries: await listDirectoryEntries(currentDir),
        media: await scanMediaDirectory(currentDir),
      } satisfies BrowseResponse);
    } catch (error) {
      next(error);
    }
  });

  router.get('/library/directories', async (req, res, next) => {
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

      res.json(await listChildFolders(currentDir));
    } catch (error) {
      next(error);
    }
  });

  router.get('/media/thumbnail', async (req, res, next) => {
    try {
      const config = await loadConfig();
      const mediaPath = ensureWithinRoots(String(req.query.path || ''), config.libraryRoots);
      const stat = await fs.stat(mediaPath);

      if (!stat.isFile()) {
        throw new Error(`Path is not a file: ${mediaPath}`);
      }

      const thumbnail = await getCachedThumbnail(mediaPath);
      if (!thumbnail) {
        res.status(404).json({ error: 'No embedded thumbnail found.' });
        return;
      }

      res.type(thumbnail.contentType);
      res.sendFile(thumbnail.path);
    } catch (error) {
      next(error);
    }
  });

  router.post('/media/set-gps', async (req, res, next) => {
    try {
      const config = await loadConfig();
      const mediaPath = ensureWithinRoots(String(req.body.path || ''), config.libraryRoots);
      const wgsLng = Number(req.body.longitude);
      const wgsLat = Number(req.body.latitude);

      if (!Number.isFinite(wgsLng) || !Number.isFinite(wgsLat)) {
        throw new Error('Invalid WGS-84 coordinate.');
      }

      const xmpPath = getSameNameXmpPath(mediaPath);
      const writtenPath = await writeGpsToXmpFile(xmpPath, {
        latitude: wgsLat,
        longitude: wgsLng,
      }, config.backupBeforeWrite);

      res.json({
        path: mediaPath,
        xmpPath: writtenPath,
        latitude: wgsLat,
        longitude: wgsLng,
      });
    } catch (error) {
      next(error);
    }
  });

  router.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    res.status(400).json({ error: message });
  });

  return router;
}

export function createStaticRouter(clientDist: string): express.Router {
  const router = express.Router();
  router.use(express.static(clientDist));
  router.use((_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  return router;
}
