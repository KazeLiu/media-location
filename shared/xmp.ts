export interface GpsValue {
  latitude: number;
  longitude: number;
}

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

export function buildGpsTags(gps: GpsValue): string[] {
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
