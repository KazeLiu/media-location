import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import exifr from 'exifr';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

export interface ThumbnailResult {
  path: string;
  contentType: string;
}

export interface ThumbnailGenerationDetails {
  phase: string;
  mediaType: 'image' | 'video';
  packaged: boolean;
  ffmpegPath?: string;
  sourcePath?: string;
  targetPath?: string;
  args?: string[];
}

export class ThumbnailGenerationError extends Error {
  readonly details: ThumbnailGenerationDetails;
  readonly cause?: unknown;

  constructor(message: string, details: ThumbnailGenerationDetails, cause?: unknown) {
    super(message);
    this.name = 'ThumbnailGenerationError';
    this.details = details;
    this.cause = cause;
  }
}

const CACHE_DIR = path.resolve(process.cwd(), 'data', 'thumb-cache');
const RUNTIME_BIN_DIR = path.resolve(process.cwd(), 'data', 'runtime-bin');
const PREVIEW_MAX_SIZE = 640;
const VIDEO_THUMBNAIL_TIMEOUT_MS = 15000;
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.mts', '.m2ts']);

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
    return generateFfmpegPreview(mediaPath, cachePath);
  }

  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(cachePath, thumbnail);

  return {
    path: cachePath,
    contentType: 'image/jpeg',
  };
}

async function generateFfmpegPreview(mediaPath: string, cachePath: string): Promise<ThumbnailResult | null> {
  const mediaType = getMediaType(mediaPath);
  const ffmpegPath = await resolveFfmpegPath(mediaType);
  const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp.jpg`;
  const inputArgs = isVideoFile(mediaPath) ? ['-ss', '00:00:00', '-i', mediaPath] : ['-i', mediaPath];
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    ...inputArgs,
    '-map',
    '0:v:0',
    '-frames:v',
    '1',
    '-vf',
    `scale=w='min(${PREVIEW_MAX_SIZE},iw)':h='min(${PREVIEW_MAX_SIZE},ih)':force_original_aspect_ratio=decrease`,
    '-q:v',
    '4',
    tempPath,
  ];

  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await runFfmpeg(ffmpegPath, args);

    const tempStat = await fs.stat(tempPath);
    if (!tempStat.isFile() || tempStat.size === 0) {
      throw new ThumbnailGenerationError('ffmpeg did not create a thumbnail image', {
        phase: 'ffmpeg-output',
        mediaType,
        packaged: isPackagedRuntime(),
        ffmpegPath,
        args,
      });
    }

    await fs.rename(tempPath, cachePath);
    return {
      path: cachePath,
      contentType: 'image/jpeg',
    };
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    if (error instanceof ThumbnailGenerationError) {
      throw error;
    }

    throw new ThumbnailGenerationError('ffmpeg failed to generate thumbnail', {
      phase: 'ffmpeg-run',
      mediaType,
      packaged: isPackagedRuntime(),
      ffmpegPath,
      args,
    }, error);
  }
}

async function resolveFfmpegPath(mediaType: 'image' | 'video'): Promise<string> {
  if (process.env.MEDIA_LOCATION_FFMPEG_PATH) {
    return process.env.MEDIA_LOCATION_FFMPEG_PATH;
  }

  try {
    const installer = ffmpegInstaller as { path?: string };
    if (!installer.path) {
      throw new ThumbnailGenerationError('@ffmpeg-installer/ffmpeg did not provide a binary path', {
        phase: 'ffmpeg-resolve',
        mediaType,
        packaged: isPackagedRuntime(),
      });
    }

    if (isPackagedRuntime()) {
      return materializeBundledFfmpeg(installer.path, mediaType);
    }

    return installer.path;
  } catch (error) {
    if (error instanceof ThumbnailGenerationError) {
      throw error;
    }

    throw new ThumbnailGenerationError('Failed to resolve bundled ffmpeg binary', {
      phase: 'ffmpeg-resolve',
      mediaType,
      packaged: isPackagedRuntime(),
    }, error);
  }
}

async function materializeBundledFfmpeg(sourcePath: string, mediaType: 'image' | 'video'): Promise<string> {
  const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const targetPath = path.join(RUNTIME_BIN_DIR, binaryName);

  if (await nonEmptyFileExists(targetPath)) {
    return targetPath;
  }

  await fs.mkdir(RUNTIME_BIN_DIR, { recursive: true });
  const tempPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    const binary = await fs.readFile(sourcePath);
    await fs.writeFile(tempPath, binary);
    if (process.platform !== 'win32') {
      await fs.chmod(tempPath, 0o755);
    }
    await fs.rename(tempPath, targetPath);
    return targetPath;
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw new ThumbnailGenerationError('Failed to materialize bundled ffmpeg binary', {
      phase: 'ffmpeg-materialize',
      mediaType,
      packaged: isPackagedRuntime(),
      sourcePath,
      targetPath,
    }, error);
  }
}

function getMediaType(mediaPath: string): 'image' | 'video' {
  return isVideoFile(mediaPath) ? 'video' : 'image';
}

function isPackagedRuntime(): boolean {
  return Boolean((process as { pkg?: unknown }).pkg);
}

async function runFfmpeg(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
    });
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`ffmpeg timed out after ${VIDEO_THUMBNAIL_TIMEOUT_MS}ms`));
    }, VIDEO_THUMBNAIL_TIMEOUT_MS);

    child.stderr?.on('data', (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-2000);
    });

    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.once('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`ffmpeg exited with code ${code ?? 'unknown'}: ${stderr}`));
    });
  });
}

function isVideoFile(mediaPath: string): boolean {
  return VIDEO_EXTENSIONS.has(path.extname(mediaPath).toLowerCase());
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

async function nonEmptyFileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}
