import type { MediaItem } from '@shared/contracts';

export interface MapProviderConfig {
  container: HTMLElement;
  onReady?: () => void;
  onError?: (message: string) => void;
  onMarkerClick?: (item: MediaItem) => void;
  onMapClick?: (lng: number, lat: number) => void;
  onMarkerDragEnd?: (item: MediaItem, lng: number, lat: number) => void;
  onMouseMove?: (lng: number, lat: number) => void;
}

export interface SearchResult {
  name: string;
  lng: number;
  lat: number;
}

export interface ClusterItem {
  item: MediaItem;
  lng: number;
  lat: number;
}

export abstract class MapProvider {
  // 生命周期
  abstract init(config: MapProviderConfig): Promise<void>;
  abstract destroy(): void;

  // 地图操作
  abstract setCenter(lng: number, lat: number, zoom?: number): void;
  abstract setLayerMode(mode: 'standard' | 'satellite'): void;
  abstract setSatelliteRoadNet?(enabled: boolean): void;

  // 标记管理
  abstract renderMarkers(items: MediaItem[], selectedId: string): void;
  abstract clearMarkers(): void;

  // 聚合功能
  abstract enableClustering(enabled: boolean): void;
  abstract showClusterPopup(items: ClusterItem[]): void;
  abstract hideClusterPopup(): void;

  // 搜索功能
  abstract search(keyword: string): Promise<SearchResult | null>;
  abstract showSearchMarker(result: SearchResult): void;
  abstract clearSearchMarker(): void;

  // 坐标系统
  abstract getCoordinateSystemName(): string;
  abstract formatCoordinate(lng: number, lat: number): string;
  abstract supportsCoordinateSystemSwitch(): boolean;

  // 拖放支持
  abstract handleDrop(event: DragEvent, items: MediaItem[]): void;
}
