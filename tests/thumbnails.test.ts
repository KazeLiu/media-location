import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getCachedThumbnail } from '../server/src/thumbnails';

const exifrMock = vi.hoisted(() => ({
  thumbnail: vi.fn(),
}));
const spawnMock = vi.hoisted(() => vi.fn());

vi.mock('exifr', () => ({
  default: exifrMock,
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

function mockSuccessfulFfmpeg(): void {
  spawnMock.mockImplementation((_command: string, args: string[]) => {
    const child = new EventEmitter() as EventEmitter & {
      stderr: EventEmitter;
      kill: () => void;
    };
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    process.nextTick(async () => {
      await writeFile(args.at(-1) as string, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
      child.emit('close', 0);
    });
    return child;
  });
}

describe('media thumbnails', () => {
  it('extracts and caches embedded thumbnails for previews', async () => {
    exifrMock.thumbnail.mockResolvedValueOnce(Buffer.from([1, 2, 3]));
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-thumb-'));
    const imagePath = path.join(root, 'photo.jpg');

    await writeFile(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const result = await getCachedThumbnail(imagePath);

    expect(result?.contentType).toBe('image/jpeg');
    expect(result?.path.endsWith('.jpg')).toBe(true);
  });

  it('generates and caches a proportional ffmpeg preview for images when no embedded thumbnail exists', async () => {
    exifrMock.thumbnail.mockResolvedValueOnce(undefined);
    process.env.MEDIA_LOCATION_FFMPEG_PATH = 'mock-ffmpeg';
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-thumb-'));
    const imagePath = path.join(root, 'plain.png');

    await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    mockSuccessfulFfmpeg();

    try {
      const result = await getCachedThumbnail(imagePath);

      expect(result?.contentType).toBe('image/jpeg');
      expect(result?.path).not.toBe(imagePath);
      expect(result?.path.endsWith('.jpg')).toBe(true);
      expect(spawnMock).toHaveBeenCalledWith(
        'mock-ffmpeg',
        expect.arrayContaining([
          '-i',
          imagePath,
          '-vf',
          "scale=w='min(640,iw)':h='min(640,ih)':force_original_aspect_ratio=decrease",
        ]),
        expect.objectContaining({ windowsHide: true }),
      );
    } finally {
      delete process.env.MEDIA_LOCATION_FFMPEG_PATH;
      spawnMock.mockReset();
    }
  });

  it('generates and caches a first-frame preview for videos when no embedded thumbnail exists', async () => {
    exifrMock.thumbnail.mockResolvedValueOnce(undefined);
    process.env.MEDIA_LOCATION_FFMPEG_PATH = 'mock-ffmpeg';
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-video-thumb-'));
    const videoPath = path.join(root, 'clip.mp4');

    await writeFile(videoPath, Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]));
    mockSuccessfulFfmpeg();

    try {
      const result = await getCachedThumbnail(videoPath);

      expect(result?.contentType).toBe('image/jpeg');
      expect(result?.path).not.toBe(videoPath);
      expect(result?.path.endsWith('.jpg')).toBe(true);
      expect(spawnMock).toHaveBeenCalledWith(
        'mock-ffmpeg',
        expect.arrayContaining(['-i', videoPath]),
        expect.objectContaining({ windowsHide: true }),
      );
    } finally {
      delete process.env.MEDIA_LOCATION_FFMPEG_PATH;
      spawnMock.mockReset();
    }
  });
});
