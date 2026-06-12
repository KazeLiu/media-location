import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const exifrMock = vi.hoisted(() => ({
  thumbnail: vi.fn(),
}));

vi.mock('exifr', () => ({
  default: exifrMock,
}));

vi.mock('sharp', () => {
  throw new Error('sharp unavailable');
});

describe('media thumbnail fallback without sharp', () => {
  it('does not fail module startup when compressed preview support is unavailable', async () => {
    exifrMock.thumbnail.mockResolvedValueOnce(undefined);
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-no-sharp-'));
    const imagePath = path.join(root, 'plain.png');

    await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const { getCachedThumbnail } = await import('../server/src/thumbnails');

    await expect(getCachedThumbnail(imagePath)).resolves.toBeNull();
  });
});
