import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import exifr from 'exifr';
import sharp from 'sharp';

export interface ThumbnailResult {
  path: string;
  contentType: string;
}

const CACHE_DIR = path.resolve(process.cwd(), 'data', 'thumb-cache');
const PREVIEW_MAX_SIZE = 640;
const PREVIEW_JPEG_QUALITY = 78;

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
    return generateCompressedPreview(mediaPath, cachePath);
  }

  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(cachePath, thumbnail);

  return {
    path: cachePath,
    contentType: 'image/jpeg',
  };
}

async function generateCompressedPreview(mediaPath: string, cachePath: string): Promise<ThumbnailResult | null> {
  if (!isCompressibleImage(mediaPath)) {
    return null;
  }

  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await sharp(mediaPath)
      .rotate()
      .resize({
        width: PREVIEW_MAX_SIZE,
        height: PREVIEW_MAX_SIZE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: PREVIEW_JPEG_QUALITY, mozjpeg: true })
      .toFile(cachePath);

    return {
      path: cachePath,
      contentType: 'image/jpeg',
    };
  } catch {
    return null;
  }
}

function isCompressibleImage(mediaPath: string): boolean {
  const extension = path.extname(mediaPath).toLowerCase();
  switch (extension) {
    case '.jpg':
    case '.jpeg':
    case '.png':
    case '.webp':
    case '.tif':
    case '.tiff':
    case '.heic':
    case '.heif':
      return true;
    default:
      return false;
  }
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
