import { describe, it, expect } from 'vitest';
import { getRandomPointInPolygon } from '../client/src/lib/geofenceUtils';
import type { GeofenceCoordinate } from '../shared/contracts';

describe('geofenceUtils', () => {
  it('should generate random point inside triangle', () => {
    const triangle: GeofenceCoordinate[] = [
      { longitude: 0, latitude: 0 },
      { longitude: 1, latitude: 0 },
      { longitude: 0.5, latitude: 1 },
    ];

    const point = getRandomPointInPolygon(triangle);

    expect(point.longitude).toBeGreaterThanOrEqual(0);
    expect(point.longitude).toBeLessThanOrEqual(1);
    expect(point.latitude).toBeGreaterThanOrEqual(0);
    expect(point.latitude).toBeLessThanOrEqual(1);
  });

  it('should generate random point inside rectangle', () => {
    const rectangle: GeofenceCoordinate[] = [
      { longitude: 116.397428, latitude: 39.90923 },
      { longitude: 116.398428, latitude: 39.90923 },
      { longitude: 116.398428, latitude: 39.91023 },
      { longitude: 116.397428, latitude: 39.91023 },
    ];

    const point = getRandomPointInPolygon(rectangle);

    expect(point.longitude).toBeGreaterThanOrEqual(116.397428);
    expect(point.longitude).toBeLessThanOrEqual(116.398428);
    expect(point.latitude).toBeGreaterThanOrEqual(39.90923);
    expect(point.latitude).toBeLessThanOrEqual(39.91023);
  });
});
