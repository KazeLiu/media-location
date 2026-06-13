export interface MapboxSearchSuggestion {
  id: string;
  name: string;
  place_name: string;
  center: [number, number]; // [lng, lat] WGS84
}

/**
 * 使用 Mapbox Geocoding API 搜索地址
 * @param keyword 搜索关键词
 * @param accessToken Mapbox Access Token
 */
export async function searchMapboxAddress(
  keyword: string,
  accessToken: string,
): Promise<MapboxSearchSuggestion[]> {
  if (!keyword.trim() || !accessToken) {
    return [];
  }

  const encodedKeyword = encodeURIComponent(keyword.trim());
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedKeyword}.json?access_token=${accessToken}&limit=10&language=zh`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Mapbox Geocoding API 请求失败: ${response.status}`);
    }

    const data = await response.json();
    return formatMapboxSuggestions(data);
  } catch (error) {
    console.error('Mapbox 地址搜索失败:', error);
    return [];
  }
}

function formatMapboxSuggestions(result: any): MapboxSearchSuggestion[] {
  if (!result?.features || !Array.isArray(result.features)) {
    return [];
  }

  return result.features.map((feature: any) => ({
    id: feature.id || '',
    name: feature.text || feature.place_name || '',
    place_name: feature.place_name || '',
    center: feature.center || [0, 0],
  }));
}
