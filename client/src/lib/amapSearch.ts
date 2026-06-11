export interface AmapSearchSuggestion {
  value: string;
  name: string;
  district?: string;
  address?: string;
  location?: { lng: number; lat: number } | string;
}

export function formatAmapSuggestions(result: unknown): AmapSearchSuggestion[] {
  const tips = getAmapTips(result);

  return tips
    .filter((tip) => typeof tip?.name === 'string' && tip.name.trim())
    .map((tip) => ({
      value: formatSuggestionValue(tip),
      name: tip.name.trim(),
      district: typeof tip.district === 'string' ? tip.district.trim() : '',
      address: typeof tip.address === 'string' ? tip.address.trim() : '',
      location: tip.location,
    }));
}

export function normalizeAmapLngLat(location: unknown): { lng: number; lat: number } | null {
  if (!location) {
    return null;
  }

  if (typeof location === 'string') {
    const [lng, lat] = location.split(',').map(Number);
    return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
  }

  const candidate = location as { lng?: unknown; lat?: unknown; getLng?: () => unknown; getLat?: () => unknown };
  const lng = Number(typeof candidate.getLng === 'function' ? candidate.getLng() : candidate.lng);
  const lat = Number(typeof candidate.getLat === 'function' ? candidate.getLat() : candidate.lat);
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
}

function getAmapTips(result: unknown): any[] {
  if (!result || typeof result !== 'object') {
    return [];
  }

  const candidate = result as { tips?: unknown };
  return Array.isArray(candidate.tips) ? candidate.tips : [];
}

function formatSuggestionValue(tip: any): string {
  const parts = [tip.name, tip.district, tip.address]
    .filter((part) => typeof part === 'string' && part.trim())
    .map((part) => part.trim());

  return Array.from(new Set(parts)).join(' ');
}
