import { promises as fs } from 'node:fs';
import path from 'node:path';
import exifr from 'exifr';
import type { MediaItem } from '../../shared/contracts';
import { readGpsFromXmpFile, type GpsValue } from './xmp';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.heic', '.heif', '.tif', '.tiff', '.png']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.mts', '.m2ts']);

export async function scanMediaDirectory(dir: string): Promise<MediaItem[]> {
  const files = await collectDirectMediaFiles(path.resolve(dir));
  const items = await Promise.all(files.map((filePath) => buildMediaItem(filePath, dir)));

  return items.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'zh-Hans-CN', { numeric: true }));
}

export function getSameNameXmpPath(mediaPath: string): string {
  return `${mediaPath}.xmp`;
}

export function isMediaFile(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension);
}

async function collectDirectMediaFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && isMediaFile(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

async function buildMediaItem(filePath: string, scanRoot: string): Promise<MediaItem> {
  const extension = path.extname(filePath).toLowerCase();
  const mediaType: MediaItem['mediaType'] = IMAGE_EXTENSIONS.has(extension) ? 'image' : 'video';
  const xmpPath = getSameNameXmpPath(filePath);
  const xmpExists = await fileExists(xmpPath);
  const xmpGps = xmpExists ? await readGpsFromXmpFile(xmpPath) : null;
  const embeddedGps = !xmpExists && mediaType === 'image' ? await readEmbeddedGps(filePath) : null;
  const gps = pickUsableGps(xmpGps, embeddedGps);

  return {
    id: path.relative(scanRoot, filePath).replaceAll(path.sep, '/'),
    name: path.basename(filePath),
    path: filePath,
    relativePath: path.relative(scanRoot, filePath).replaceAll(path.sep, '/'),
    extension,
    mediaType,
    xmpPath: xmpExists ? xmpPath : null,
    hasGps: gps !== null,
    latitude: gps?.latitude ?? null,
    longitude: gps?.longitude ?? null,
    gpsSource: gps && gps === xmpGps ? 'xmp' : gps && gps === embeddedGps ? 'embedded' : null,
  };
}

async function readEmbeddedGps(filePath: string): Promise<GpsValue | null> {
  try {
    const gps = await exifr.gps(filePath);
    if (typeof gps?.latitude === 'number' && typeof gps?.longitude === 'number') {
      return {
        latitude: gps.latitude,
        longitude: gps.longitude,
      };
    }
    return null;
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

function pickUsableGps(...candidates: Array<GpsValue | null>): GpsValue | null {
  for (const candidate of candidates) {
    if (isUsableGps(candidate)) {
      return candidate;
    }
  }

  return null;
}

function isUsableGps(candidate: GpsValue | null): candidate is GpsValue {
  if (!candidate) {
    return false;
  }

  return !(candidate.latitude === 0 && candidate.longitude === 0);
}
