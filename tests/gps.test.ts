import { describe, expect, it } from 'vitest';
import { gcj02ToWgs84, wgs84ToGcj02 } from '@shared/gps';

describe('gps coordinate conversion', () => {
  it('converts WGS84 to GCJ-02 inside mainland China', () => {
    const converted = wgs84ToGcj02(116.397128, 39.916527);

    expect(converted.lng).not.toBeCloseTo(116.397128, 6);
    expect(converted.lat).not.toBeCloseTo(39.916527, 6);
    expect(converted.lng).toBeCloseTo(116.403372, 3);
    expect(converted.lat).toBeCloseTo(39.917931, 3);
  });

  it('keeps coordinates unchanged outside mainland China', () => {
    const converted = wgs84ToGcj02(-122.4194, 37.7749);

    expect(converted.lng).toBeCloseTo(-122.4194, 8);
    expect(converted.lat).toBeCloseTo(37.7749, 8);
  });

  it('round-trips AMap coordinates back to WGS84 with useful precision', () => {
    const gcj = wgs84ToGcj02(116.397128, 39.916527);
    const wgs = gcj02ToWgs84(gcj.lng, gcj.lat);

    expect(wgs.lng).toBeCloseTo(116.397128, 5);
    expect(wgs.lat).toBeCloseTo(39.916527, 5);
  });
});
