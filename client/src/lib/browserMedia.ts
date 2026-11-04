import exifr from 'exifr';
import { strToU8, zipSync } from 'fflate';
import type { MediaItem } from '@shared/contracts';
import { buildXmpWithGps } from '@shared/xmp';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'heic', 'heif', 'tif', 'tiff', 'png']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'mts', 'm2ts']);

export function classifyBrowserMedia(name: string): MediaItem['mediaType'] | null {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  return null;
}

export function safeBrowserMediaName(name: string): string | null {
  if (!name || name === '.' || name === '..' || /[\\/\x00-\x1f]/.test(name)) return null;
  return name;
}

export async function createBrowserMediaItem(file: File, path: string): Promise<MediaItem> {
  const name = safeBrowserMediaName(file.name);
  const mediaType = name ? classifyBrowserMedia(name) : null;
  if (!name || !mediaType) throw new Error(`不支持的媒体文件：${file.name}`);

  let latitude: number | null = null;
  let longitude: number | null = null;
  if (mediaType === 'image') {
    try {
      const gps = await exifr.gps(file);
      if (isUsableGps(gps?.latitude, gps?.longitude)) {
        latitude = gps.latitude;
        longitude = gps.longitude;
      }
    } catch {
      // A readable image can still be placed manually when its EXIF is damaged.
    }
  }

  return {
    id: path,
    name,
    path,
    relativePath: name,
    extension: `.${name.split('.').pop()!.toLowerCase()}`,
    mediaType,
    xmpPath: null,
    hasGps: latitude !== null && longitude !== null,
    latitude,
    longitude,
    gpsSource: latitude !== null ? 'embedded' : null,
  };
}

export function isUsableGps(latitude: unknown, longitude: unknown): latitude is number {
  return typeof latitude === 'number' && typeof longitude === 'number'
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    && !(latitude === 0 && longitude === 0);
}

export interface XmpZipResult {
  archive: Uint8Array;
  exported: number;
  skipped: number;
}

export function createXmpZip(items: MediaItem[]): XmpZipResult {
  const files: Record<string, Uint8Array> = {};
  let skipped = 0;
  let exported = 0;
  const seen = new Set<string>();

  for (const item of items) {
    if (!isUsableGps(item.latitude, item.longitude) || typeof item.longitude !== 'number') {
      skipped++;
      continue;
    }
    const name = safeBrowserMediaName(item.name);
    if (!name) {
      skipped++;
      continue;
    }
    const xmpName = `${name}.xmp`;
    const key = xmpName.toLowerCase();
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    files[xmpName] = strToU8(buildXmpWithGps({ latitude: item.latitude, longitude: item.longitude }));
    exported++;
  }

  return {
    archive: exported ? zipSync(files, { level: 6 }) : new Uint8Array(),
    exported,
    skipped,
  };
}
