import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface GpsValue {
  latitude: number;
  longitude: number;
}

const GPS_TAGS = ['GPSLatitude', 'GPSLatitudeRef', 'GPSLongitude', 'GPSLongitudeRef'];

export function buildXmpWithGps(gps: GpsValue): string {
  const tags = buildGpsTags(gps);
  return [
    "<?xpacket begin='﻿' id='W5M0MpCehiHzreSzNTczkc9d'?>",
    "<x:xmpmeta xmlns:x='adobe:ns:meta/' x:xmptk='Image::ExifTool 12.40'>",
    "<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>",
    '',
    " <rdf:Description rdf:about=''",
    "  xmlns:exif='http://ns.adobe.com/exif/1.0/'>",
    ...tags.map((tag) => `  ${tag}`),
    ' </rdf:Description>',
    '</rdf:RDF>',
    '</x:xmpmeta>',
    "<?xpacket end='w'?>",
    '',
  ].join('\n');
}

export function updateXmpGps(source: string, gps: GpsValue): string {
  if (!source.trim()) {
    return buildXmpWithGps(gps);
  }

  let updated = ensureExifNamespace(source);
  for (const tagName of GPS_TAGS) {
    updated = removeTag(updated, tagName);
  }

  const gpsTags = buildGpsTags(gps).join('\n  ');
  const descriptionClose = /<\/rdf:Description>/i;
  if (descriptionClose.test(updated)) {
    return updated.replace(descriptionClose, `  ${gpsTags}\n </rdf:Description>`);
  }

  return buildXmpWithGps(gps);
}

export function parseGpsFromXmp(source: string): GpsValue | null {
  const latitudeRaw = parseTextTag(source, 'GPSLatitude');
  const longitudeRaw = parseTextTag(source, 'GPSLongitude');
  const latitudeRef = parseTextTag(source, 'GPSLatitudeRef')?.toUpperCase();
  const longitudeRef = parseTextTag(source, 'GPSLongitudeRef')?.toUpperCase();
  const latitude = parseCoordinateTag(latitudeRaw, latitudeRef);
  const longitude = parseCoordinateTag(longitudeRaw, longitudeRef);

  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude, longitude };
}

export async function readGpsFromXmpFile(xmpPath: string): Promise<GpsValue | null> {
  try {
    const source = await fs.readFile(xmpPath, 'utf8');
    return parseGpsFromXmp(source);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeGpsToXmpFile(xmpPath: string, gps: GpsValue, backupBeforeWrite: boolean): Promise<string> {
  let source = '';

  try {
    source = await fs.readFile(xmpPath, 'utf8');
    if (backupBeforeWrite) {
      await fs.copyFile(xmpPath, `${xmpPath}.bak`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    await fs.mkdir(path.dirname(xmpPath), { recursive: true });
  }

  const next = updateXmpGps(source, gps);
  await fs.writeFile(xmpPath, next, 'utf8');
  return xmpPath;
}

function buildGpsTags(gps: GpsValue): string[] {
  return [
    `<exif:GPSLatitude>${formatCoordinateTag(gps.latitude, 'lat')}</exif:GPSLatitude>`,
    `<exif:GPSLongitude>${formatCoordinateTag(gps.longitude, 'lng')}</exif:GPSLongitude>`,
  ];
}

function formatCoordinateTag(value: number, axis: 'lat' | 'lng'): string {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutes = (absolute - degrees) * 60;
  const direction = axis === 'lat'
    ? value < 0 ? 'S' : 'N'
    : value < 0 ? 'W' : 'E';

  return `${degrees},${minutes.toFixed(5)}${direction}`;
}

function parseCoordinateTag(raw: string | null, explicitRef?: string): number | null {
  if (!raw) {
    return null;
  }

  const value = raw.trim();
  const direction = (value.match(/[NSEW]$/i)?.[0] ?? explicitRef ?? '').toUpperCase();
  const decimal = parseExifToolCoordinate(value);

  if (decimal !== null) {
    return direction === 'S' || direction === 'W' ? -Math.abs(decimal) : Math.abs(decimal);
  }

  const fallback = Number(value.replace(/[NSEW]$/i, '').trim());
  if (!Number.isFinite(fallback)) {
    return null;
  }

  return direction === 'S' || direction === 'W' ? -Math.abs(fallback) : Math.abs(fallback);
}

function parseExifToolCoordinate(value: string): number | null {
  const match = value.match(/^(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)([NSEW])?$/i);
  if (!match) {
    return null;
  }

  const degrees = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes)) {
    return null;
  }

  return degrees + minutes / 60;
}

function parseTextTag(source: string, tagName: string): string | null {
  const match = source.match(new RegExp(`<exif:${tagName}[^>]*>([\\s\\S]*?)<\\/exif:${tagName}>`, 'i'));
  return match?.[1]?.trim() ?? null;
}

function removeTag(source: string, tagName: string): string {
  return source.replace(new RegExp(`\\s*<exif:${tagName}[^>]*>[\\s\\S]*?<\\/exif:${tagName}>`, 'gi'), '');
}

function ensureExifNamespace(source: string): string {
  if (/xmlns:exif=/i.test(source)) {
    return source;
  }

  return source.replace(/<rdf:Description\b/i, '<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/"');
}
