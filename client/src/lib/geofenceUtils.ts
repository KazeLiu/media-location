import earcut from 'earcut';
import type { GeofenceCoordinate } from '@shared/contracts';

export function getRandomPointInPolygon(coordinates: GeofenceCoordinate[]): GeofenceCoordinate {
  if (coordinates.length < 3) {
    throw new Error('Polygon must have at least 3 vertices');
  }

  const flatCoords: number[] = [];
  for (const coord of coordinates) {
    flatCoords.push(coord.longitude, coord.latitude);
  }

  const triangles = earcut(flatCoords);

  const triangleAreas: number[] = [];
  let totalArea = 0;

  for (let i = 0; i < triangles.length; i += 3) {
    const i0 = triangles[i] * 2;
    const i1 = triangles[i + 1] * 2;
    const i2 = triangles[i + 2] * 2;

    const x0 = flatCoords[i0];
    const y0 = flatCoords[i0 + 1];
    const x1 = flatCoords[i1];
    const y1 = flatCoords[i1 + 1];
    const x2 = flatCoords[i2];
    const y2 = flatCoords[i2 + 1];

    const area = Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)) / 2;
    triangleAreas.push(area);
    totalArea += area;
  }

  let random = Math.random() * totalArea;
  let selectedTriangleIndex = 0;

  for (let i = 0; i < triangleAreas.length; i++) {
    random -= triangleAreas[i];
    if (random <= 0) {
      selectedTriangleIndex = i;
      break;
    }
  }

  const i0 = triangles[selectedTriangleIndex * 3] * 2;
  const i1 = triangles[selectedTriangleIndex * 3 + 1] * 2;
  const i2 = triangles[selectedTriangleIndex * 3 + 2] * 2;

  const x0 = flatCoords[i0];
  const y0 = flatCoords[i0 + 1];
  const x1 = flatCoords[i1];
  const y1 = flatCoords[i1 + 1];
  const x2 = flatCoords[i2];
  const y2 = flatCoords[i2 + 1];

  const r1 = Math.random();
  const r2 = Math.random();
  const sqrtR1 = Math.sqrt(r1);

  const longitude = (1 - sqrtR1) * x0 + sqrtR1 * (1 - r2) * x1 + sqrtR1 * r2 * x2;
  const latitude = (1 - sqrtR1) * y0 + sqrtR1 * (1 - r2) * y1 + sqrtR1 * r2 * y2;

  return { longitude, latitude };
}
