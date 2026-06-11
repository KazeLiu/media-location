import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getSameNameXmpPath, scanMediaDirectory } from '../server/src/media';

vi.mock('exifr', () => ({
  default: {
    gps: vi.fn(async () => ({
      latitude: 12.345678,
      longitude: 98.765432,
    })),
  },
}));

describe('media directory scanning', () => {
  it('matches sidecar xmp by full media filename plus .xmp', () => {
    const mediaPath = path.resolve('album/IMG_20260214_165452_00_441.jpg');

    expect(getSameNameXmpPath(mediaPath)).toBe(path.resolve('album/IMG_20260214_165452_00_441.jpg.xmp'));
  });

  it('uses same-name xmp gps before embedded gps', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-'));
    const album = path.join(root, 'album');
    await mkdir(album, { recursive: true });

    const imagePath = path.join(album, 'photo.jpg');
    const xmpPath = path.join(album, 'photo.jpg.xmp');

    await writeFile(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    await writeFile(
      xmpPath,
      '<?xml version="1.0" encoding="UTF-8"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/"><exif:GPSLatitude>39.91652700</exif:GPSLatitude><exif:GPSLatitudeRef>N</exif:GPSLatitudeRef><exif:GPSLongitude>116.39712800</exif:GPSLongitude><exif:GPSLongitudeRef>E</exif:GPSLongitudeRef></rdf:Description></rdf:RDF></x:xmpmeta>',
      'utf8',
    );

    const items = await scanMediaDirectory(album);
    const item = items.find((entry) => entry.path === imagePath);

    expect(item?.xmpPath).toBe(xmpPath);
    expect(item?.hasGps).toBe(true);
    expect(item?.latitude).toBeCloseTo(39.916527, 6);
    expect(item?.longitude).toBeCloseTo(116.397128, 6);
    expect(item?.gpsSource).toBe('xmp');
  });

  it('treats 0,0 xmp coordinates as missing gps without falling back to embedded gps', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-'));
    const album = path.join(root, 'album');
    await mkdir(album, { recursive: true });

    const imagePath = path.join(album, 'zero.jpg');
    const xmpPath = path.join(album, 'zero.jpg.xmp');

    await writeFile(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    await writeFile(
      xmpPath,
      '<?xml version="1.0" encoding="UTF-8"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/"><exif:GPSLatitude>0,0.00000N</exif:GPSLatitude><exif:GPSLongitude>0,0.00000E</exif:GPSLongitude></rdf:Description></rdf:RDF></x:xmpmeta>',
      'utf8',
    );

    const items = await scanMediaDirectory(album);
    const item = items.find((entry) => entry.path === imagePath);

    expect(item?.xmpPath).toBe(xmpPath);
    expect(item?.hasGps).toBe(false);
    expect(item?.latitude).toBeNull();
    expect(item?.longitude).toBeNull();
    expect(item?.gpsSource).toBeNull();
  });

  it('uses embedded gps when no same-name xmp exists', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-'));
    const album = path.join(root, 'album');
    await mkdir(album, { recursive: true });

    const imagePath = path.join(album, 'embedded.jpg');
    await writeFile(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const items = await scanMediaDirectory(album);
    const item = items.find((entry) => entry.path === imagePath);

    expect(item?.xmpPath).toBeNull();
    expect(item?.hasGps).toBe(true);
    expect(item?.latitude).toBeCloseTo(12.345678, 6);
    expect(item?.longitude).toBeCloseTo(98.765432, 6);
    expect(item?.gpsSource).toBe('embedded');
  });

  it('does not scan media files from nested child directories', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-'));
    const album = path.join(root, 'album');
    const nested = path.join(album, 'nested');
    await mkdir(nested, { recursive: true });

    const directImagePath = path.join(album, 'direct.jpg');
    const nestedImagePath = path.join(nested, 'nested.jpg');
    await writeFile(directImagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    await writeFile(nestedImagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const items = await scanMediaDirectory(album);

    expect(items.map((item) => item.path)).toEqual([directImagePath]);
  });
});
