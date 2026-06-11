import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import exifr from 'exifr';

export interface ThumbnailResult {
  path: string;
  contentType: string;
}

const CACHE_DIR = path.resolve(process.cwd(), 'data', 'thumb-cache');

export async function getCachedThumbnail(mediaPath: string): Promise<ThumbnailResult | null> {
  const stat = await fs.stat(mediaPath);
  const cachePath = path.join(CACHE_DIR, `${buildCacheKey(mediaPath, stat.mtimeMs, stat.size)}.jpg`);

  if (await fileExists(cachePath)) {
    return {
      path: cachePath,
      contentType: 'image/jpeg',
    };
  }

  const thumbnail = await extractEmbeddedThumbnail(mediaPath);
  if (!thumbnail) {
    return null;
  }

  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(cachePath, thumbnail);

  return {
    path: cachePath,
    contentType: 'image/jpeg',
  };
}

function buildCacheKey(mediaPath: string, mtimeMs: number, size: number): string {
  return createHash('sha1')
    .update(path.resolve(mediaPath))
    .update(String(mtimeMs))
    .update(String(size))
    .digest('hex');
}

async function extractEmbeddedThumbnail(mediaPath: string): Promise<Buffer | null> {
  try {
    const thumbnail = await exifr.thumbnail(mediaPath);
    return thumbnail ? Buffer.from(thumbnail) : null;
  } catch {
    return null;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
