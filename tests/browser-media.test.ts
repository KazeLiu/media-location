// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { classifyBrowserMedia, createBrowserMediaItem, createXmpZip, safeBrowserMediaName } from '../client/src/lib/browserMedia';
import { parseGpsFromXmp } from '../server/src/xmp';
import { GPS_JPEG } from './fixtures/gpsJpeg';

describe('browser-only media workflow', () => {
  it('reads the uploaded File locally and puts a readable XMP into ZIP', async () => {
    const file = new File([Buffer.from(GPS_JPEG, 'base64')], 'photo.jpg', { type: 'image/jpeg' });
    const item = await createBrowserMediaItem(file, 'browser:1');

    expect(item.mediaType).toBe('image');
    expect(item.hasGps).toBe(true);
    const result = createXmpZip([item]);
    const entries = unzipSync(result.archive);

    expect(result).toMatchObject({ exported: 1, skipped: 0 });
    expect(Object.keys(entries)).toEqual(['photo.jpg.xmp']);
    expect(parseGpsFromXmp(strFromU8(entries['photo.jpg.xmp']))).toEqual({ latitude: 39.5, longitude: 116.25 });
  });

  it('includes placed media and skips items without coordinates or duplicate names', async () => {
    const file = new File([Buffer.from(GPS_JPEG, 'base64')], 'clip.mov', { type: 'video/quicktime' });
    const video = await createBrowserMediaItem(file, 'browser:2');
    expect(video.hasGps).toBe(false);

    const result = createXmpZip([
      video,
      { ...video, path: 'browser:3', hasGps: true, latitude: -33.8688, longitude: 151.2093 },
      { ...video, path: 'browser:4', hasGps: true, latitude: 1, longitude: 2 },
    ]);
    const entries = unzipSync(result.archive);
    expect(result.exported).toBe(1);
    expect(result.skipped).toBe(2);
    expect(parseGpsFromXmp(strFromU8(entries['clip.mov.xmp']))).toEqual({ latitude: expect.any(Number), longitude: expect.any(Number) });
  });

  it('rejects unsafe names and unsupported formats', () => {
    expect(safeBrowserMediaName('../photo.jpg')).toBeNull();
    expect(classifyBrowserMedia('photo.jpg')).toBe('image');
    expect(classifyBrowserMedia('clip.mov')).toBe('video');
    expect(classifyBrowserMedia('note.txt')).toBeNull();
    expect(createXmpZip([]).exported).toBe(0);
  });
});
