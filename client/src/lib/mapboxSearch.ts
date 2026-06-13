/**
 * Mapbox Geocoding API 搜索结果类型定义
 */
export interface MapboxSearchResult {
  name: string;
  address: string;
  lng: number;
  lat: number;
}

/**
 * 使用 Mapbox Geocoding API 搜索地址
 * @param keyword 搜索关键词
 * @param token Mapbox Access Token
 * @returns 搜索结果数组
 */
export async function searchMapboxAddress(
  keyword: string,
  token: string
): Promise<MapboxSearchResult[]> {
  // 参数校验
  if (!keyword.trim() || !token) {
    return [];
  }

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(keyword)}.json`;
    const params = new URLSearchParams({
      access_token: token,
      limit: '5',
      language: 'zh',
    });

    const response = await fetch(`${url}?${params}`);
    if (!response.ok) {
      throw new Error(`Mapbox Geocoding API error: ${response.status}`);
    }

    const data = await response.json();
    return formatMapboxResults(data);
  } catch (error) {
    console.error('Mapbox search error:', error);
    return [];
  }
}

/**
 * 格式化 Mapbox Geocoding API 返回的搜索结果
 * @param data Mapbox API 返回的原始数据
 * @returns 格式化后的搜索结果数组
 */
function formatMapboxResults(data: unknown): MapboxSearchResult[] {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const candidate = data as { features?: unknown };
  if (!Array.isArray(candidate.features)) {
    return [];
  }

  return candidate.features
    .filter((feature) => feature && typeof feature === 'object')
    .map((feature: any) => ({
      name: typeof feature.text === 'string' ? feature.text : '',
      address: typeof feature.place_name === 'string' ? feature.place_name : '',
      lng: Array.isArray(feature.center) && typeof feature.center[0] === 'number' ? feature.center[0] : 0,
      lat: Array.isArray(feature.center) && typeof feature.center[1] === 'number' ? feature.center[1] : 0,
    }))
    .filter((result) => result.name || result.address); // 过滤无效结果
}
