export interface GeoPoint {
  lng: number;
  lat: number;
}

const PI = Math.PI;
const AXIS = 6378245.0;
const OFFSET = 0.00669342162296594323;

export function wgs84ToGcj02(lng: number, lat: number): GeoPoint {
  if (isOutsideMainlandChina(lng, lat)) {
    return { lng, lat };
  }

  const delta = transformDelta(lng - 105.0, lat - 35.0, lng, lat);
  return {
    lng: lng + delta.lng,
    lat: lat + delta.lat,
  };
}

export function gcj02ToWgs84(lng: number, lat: number): GeoPoint {
  if (isOutsideMainlandChina(lng, lat)) {
    return { lng, lat };
  }

  let minLng = lng - 0.1;
  let maxLng = lng + 0.1;
  let minLat = lat - 0.1;
  let maxLat = lat + 0.1;
  let wgsLng = lng;
  let wgsLat = lat;

  for (let i = 0; i < 30; i += 1) {
    wgsLng = (minLng + maxLng) / 2;
    wgsLat = (minLat + maxLat) / 2;
    const converted = wgs84ToGcj02(wgsLng, wgsLat);
    const deltaLng = converted.lng - lng;
    const deltaLat = converted.lat - lat;

    if (Math.abs(deltaLng) < 1e-7 && Math.abs(deltaLat) < 1e-7) {
      return { lng: wgsLng, lat: wgsLat };
    }

    if (deltaLng > 0) {
      maxLng = wgsLng;
    } else {
      minLng = wgsLng;
    }

    if (deltaLat > 0) {
      maxLat = wgsLat;
    } else {
      minLat = wgsLat;
    }
  }

  return { lng: wgsLng, lat: wgsLat };
}

function isOutsideMainlandChina(lng: number, lat: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformDelta(x: number, y: number, lng: number, lat: number): GeoPoint {
  let deltaLat = transformLat(x, y);
  let deltaLng = transformLng(x, y);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - OFFSET * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  deltaLat = (deltaLat * 180.0) / (((AXIS * (1 - OFFSET)) / (magic * sqrtMagic)) * PI);
  deltaLng = (deltaLng * 180.0) / ((AXIS / sqrtMagic) * Math.cos(radLat) * PI);
  return { lng: deltaLng, lat: deltaLat };
}

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}
