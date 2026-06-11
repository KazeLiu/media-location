import { describe, expect, it } from 'vitest';
import { buildXmpWithGps, parseGpsFromXmp, updateXmpGps } from '../server/src/xmp';

describe('xmp gps sidecar handling', () => {
  it('writes and reads ExifTool-style WGS84 GPS tags', () => {
    const xmp = buildXmpWithGps({ latitude: 39.916527, longitude: 116.397128 });
    const gps = parseGpsFromXmp(xmp);

    expect(xmp).toContain("<?xpacket begin='");
    expect(xmp).toContain("<x:xmpmeta xmlns:x='adobe:ns:meta/' x:xmptk='Image::ExifTool 12.40'>");
    expect(xmp).toContain('<exif:GPSLatitude>39,54.99162N</exif:GPSLatitude>');
    expect(xmp).toContain('<exif:GPSLongitude>116,23.82768E</exif:GPSLongitude>');
    expect(gps?.latitude).toBeCloseTo(39.916527, 6);
    expect(gps?.longitude).toBeCloseTo(116.397128, 6);
  });

  it('parses the sidecar format produced by ExifTool', () => {
    const xmp = [
      "<?xpacket begin='﻿' id='W5M0MpCehiHzreSzNTczkc9d'?>",
      "<x:xmpmeta xmlns:x='adobe:ns:meta/' x:xmptk='Image::ExifTool 12.40'>",
      "<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>",
      '',
      " <rdf:Description rdf:about=''",
      "  xmlns:exif='http://ns.adobe.com/exif/1.0/'>",
      '  <exif:GPSLatitude>29,27.94314N</exif:GPSLatitude>',
      '  <exif:GPSLongitude>113,26.50596E</exif:GPSLongitude>',
      ' </rdf:Description>',
      '</rdf:RDF>',
      '</x:xmpmeta>',
      "<?xpacket end='w'?>",
    ].join('\n');

    const gps = parseGpsFromXmp(xmp);

    expect(gps?.latitude).toBeCloseTo(29.465719, 6);
    expect(gps?.longitude).toBeCloseTo(113.441766, 6);
  });

  it('updates existing gps tags without dropping unrelated metadata text', () => {
    const source = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
      '<rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/">',
      '<dc:title>Keep Me</dc:title>',
      '<exif:GPSLatitude>1,0.00000N</exif:GPSLatitude>',
      '<exif:GPSLongitude>2,0.00000E</exif:GPSLongitude>',
      '</rdf:Description>',
      '</rdf:RDF>',
      '</x:xmpmeta>',
    ].join('');

    const updated = updateXmpGps(source, { latitude: -33.8688, longitude: 151.2093 });
    const gps = parseGpsFromXmp(updated);

    expect(updated).toContain('Keep Me');
    expect(updated).toContain('<exif:GPSLatitude>33,52.12800S</exif:GPSLatitude>');
    expect(updated).toContain('<exif:GPSLongitude>151,12.55800E</exif:GPSLongitude>');
    expect(gps?.latitude).toBeCloseTo(-33.8688, 6);
    expect(gps?.longitude).toBeCloseTo(151.2093, 6);
  });
});
