import { promises as fs } from 'node:fs';
import path from 'node:path';
import exifr from 'exifr';
import type { MediaItem, MediaPage } from '../../shared/contracts';
import { readGpsFromXmpFile, type GpsValue } from './xmp';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.heic', '.heif', '.tif', '.tiff', '.png']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.mts', '.m2ts']);

interface XmpPathCandidate {
  xmpPath: string;
  ownerMediaPath: string;
  exact: boolean;
}

export async function scanMediaDirectory(dir: string): Promise<MediaItem[]> {
  const page = await scanMediaDirectoryPage(dir, {
    offset: 0,
    limit: Number.MAX_SAFE_INTEGER,
  });

  return page.items;
}

export async function scanMediaDirectoryPage(
  dir: string,
  options: {
    filter?: string;
    offset?: number;
    limit?: number;
  } = {},
): Promise<MediaPage> {
  const scanRoot = path.resolve(dir);
  const files = await collectDirectMediaFiles(scanRoot);
  const filter = String(options.filter ?? '').trim().toLowerCase();
  const offset = toNonNegativeInteger(options.offset, 0);
  const limit = toNonNegativeInteger(options.limit, 120);
  const sortedFiles = files.sort((a, b) =>
    path.relative(scanRoot, a).localeCompare(path.relative(scanRoot, b), 'zh-Hans-CN', { numeric: true }),
  );
  const filteredFiles = filter
    ? sortedFiles.filter((filePath) => path.basename(filePath).toLowerCase().includes(filter))
    : sortedFiles;
  const pageFiles = filteredFiles.slice(offset, offset + limit);
  const items = await Promise.all(pageFiles.map((filePath) => buildMediaItem(filePath, scanRoot)));

  return {
    items,
    total: filteredFiles.length,
    offset,
    limit,
    filter,
  };
}

export function getSameNameXmpPath(mediaPath: string): string {
  return `${mediaPath}.xmp`;
}

export function getXmpPathCandidates(mediaPath: string): string[] {
  return getXmpPathCandidateEntries(mediaPath).map((candidate) => candidate.xmpPath);
}

function getXmpPathCandidateEntries(mediaPath: string): XmpPathCandidate[] {
  const parsed = path.parse(mediaPath);
  const candidates: XmpPathCandidate[] = [
    {
      xmpPath: getSameNameXmpPath(mediaPath),
      ownerMediaPath: mediaPath,
      exact: true,
    },
  ];
  const nameParts = parsed.name.split('.').filter(Boolean);

  for (let end = nameParts.length - 1; end >= 1; end -= 1) {
    const ownerMediaPath = path.join(parsed.dir, `${nameParts.slice(0, end).join('.')}${parsed.ext}`);
    candidates.push({
      xmpPath: `${ownerMediaPath}.xmp`,
      ownerMediaPath,
      exact: false,
    });
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.xmpPath)) {
      return false;
    }
    seen.add(candidate.xmpPath);
    return true;
  });
}

export async function resolveExistingXmpPath(mediaPath: string): Promise<string | null> {
  for (const candidate of getXmpPathCandidateEntries(mediaPath)) {
    if (!candidate.exact && (await mediaFileExists(candidate.ownerMediaPath))) {
      continue;
    }

    if (await fileExists(candidate.xmpPath)) {
      return candidate.xmpPath;
    }
  }

  return null;
}

export async function resolveXmpPathForWrite(mediaPath: string): Promise<string> {
  return (await resolveExistingXmpPath(mediaPath)) ?? getSameNameXmpPath(mediaPath);
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
  const xmpPath = await resolveExistingXmpPath(filePath);
  const xmpGps = xmpPath ? await readGpsFromXmpFile(xmpPath) : null;
  const embeddedGps = !xmpPath && mediaType === 'image' ? await readEmbeddedGps(filePath) : null;
  const gps = pickUsableGps(xmpGps, embeddedGps);

  return {
    id: path.relative(scanRoot, filePath).replaceAll(path.sep, '/'),
    name: path.basename(filePath),
    path: filePath,
    relativePath: path.relative(scanRoot, filePath).replaceAll(path.sep, '/'),
    extension,
    mediaType,
    xmpPath,
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

async function mediaFileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() && isMediaFile(filePath);
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

function toNonNegativeInteger(value: unknown, fallback: number): number {
  const numberValue = Number(value ?? fallback);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.max(0, Math.floor(numberValue));
}
