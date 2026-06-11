import { describe, expect, it } from 'vitest';
import { formatAmapSuggestions, normalizeAmapLngLat } from '@/lib/amapSearch';

describe('AMap search helpers', () => {
  it('formats autocomplete tips for Element Plus suggestions', () => {
    const suggestions = formatAmapSuggestions({
      tips: [
        {
          name: '北京大学',
          district: '北京市海淀区',
          address: '颐和园路5号',
          location: { lng: 116.31088, lat: 39.99281 },
        },
        {
          name: '北京大学东门',
          district: '北京市海淀区',
          address: '成府路',
          location: '116.31968,39.99295',
        },
        {
          name: '   ',
          district: '北京市',
          address: '无效项',
        },
      ],
    });

    expect(suggestions).toEqual([
      {
        value: '北京大学 北京市海淀区 颐和园路5号',
        name: '北京大学',
        district: '北京市海淀区',
        address: '颐和园路5号',
        location: { lng: 116.31088, lat: 39.99281 },
      },
      {
        value: '北京大学东门 北京市海淀区 成府路',
        name: '北京大学东门',
        district: '北京市海淀区',
        address: '成府路',
        location: '116.31968,39.99295',
      },
    ]);
  });

  it('normalizes object and string AMap coordinates', () => {
    expect(normalizeAmapLngLat({ lng: 116.31088, lat: 39.99281 })).toEqual({
      lng: 116.31088,
      lat: 39.99281,
    });
    expect(normalizeAmapLngLat('116.31968,39.99295')).toEqual({
      lng: 116.31968,
      lat: 39.99295,
    });
    expect(normalizeAmapLngLat(undefined)).toBeNull();
  });
});
