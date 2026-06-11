import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { getCachedThumbnail } from '../server/src/thumbnails';

const exifrMock = vi.hoisted(() => ({
  thumbnail: vi.fn(),
}));

vi.mock('exifr', () => ({
  default: exifrMock,
}));

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

  it('generates and caches a compressed preview when no embedded thumbnail exists', async () => {
    exifrMock.thumbnail.mockResolvedValueOnce(undefined);
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-thumb-'));
    const imagePath = path.join(root, 'plain.png');

    await writeFile(
      imagePath,
      await sharp({
        create: {
          width: 24,
          height: 16,
          channels: 3,
          background: '#1b7f68',
        },
      }).png().toBuffer(),
    );

    const result = await getCachedThumbnail(imagePath);

    expect(result?.contentType).toBe('image/jpeg');
    expect(result?.path).not.toBe(imagePath);
    expect(result?.path.endsWith('.jpg')).toBe(true);
  });
});
