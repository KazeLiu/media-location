import type { MediaItem } from '@shared/contracts';
import { getMediaThumbnailUrl } from '@/api';
import { loadMapbox } from '@/lib/mapbox';
import { searchMapboxAddress } from '@/lib/mapboxSearch';
import { MapProvider, type MapProviderConfig, type SearchResult, type ClusterItem } from '../mapProvider';

const INITIAL_ZOOM = 11;
const SEARCH_RESULT_ZOOM = 17;
const DEFAULT_CENTER: [number, number] = [116.397428, 39.90923];

/**
 * Mapbox GL JS 地图实现
 * 使用 WGS-84 坐标系（无需转换）
 */
export class MapboxProvider extends MapProvider {
  private map: any = null;
  private markers: any[] = [];
  private searchMarker: any = null;
  private config: MapProviderConfig | null = null;

  // 拖拽状态
  private restoreMapDragTimer: number | null = null;
  private markerDragState: {
    item: MediaItem;
    marker: any;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    tipOffsetX: number;
    tipOffsetY: number;
    moved: boolean;
  } | null = null;

  // 标记点击抑制（拖拽后短暂禁用点击）
  private suppressMarkerClickUntil = 0;
  private expandedMarkerId = '';
  private currentSelectedId = '';

  constructor(private readonly accessToken: string) {
    super();
  }

  /**
   * 初始化地图实例
   */
  async init(config: MapProviderConfig): Promise<void> {
    this.config = config;

    if (!this.accessToken) {
      throw new Error('Mapbox Access Token 未配置');
    }

    try {
      // 加载 Mapbox GL JS SDK
      await loadMapbox(this.accessToken);
      const mapboxgl = window.mapboxgl;
      if (!mapboxgl) {
        throw new Error('Mapbox GL JS SDK 加载失败');
      }

      // 创建地图实例
      this.map = new mapboxgl.Map({
        container: config.container,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: DEFAULT_CENTER,
        zoom: INITIAL_ZOOM,
      });

      // 等待地图加载完成
      await new Promise<void>((resolve) => {
        this.map.on('load', () => resolve());
      });

      // 添加导航控件
      this.map.addControl(
        new mapboxgl.NavigationControl({
          showCompass: true,
          showZoom: true,
        }),
        'bottom-right'
      );

      // 添加比例尺控件
      this.map.addControl(new mapboxgl.ScaleControl(), 'bottom-left');

      // 绑定地图点击事件
      this.map.on('click', (event: any) => {
        if (this.expandedMarkerId) {
          this.expandedMarkerId = '';
          this.renderMarkers([], this.currentSelectedId);
        }

        this.clearSearchMarker();
        config.onMapClick?.(event.lngLat.lng, event.lngLat.lat);
      });

      // 绑定拖放事件
      const container = this.map.getContainer();
      container.addEventListener('dragover', this.handleDragOver);
      container.addEventListener('drop', this.handleDropBound);

      config.onReady?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Mapbox 地图加载失败';
      config.onError?.(message);
      throw error;
    }
  }

  /**
   * 销毁地图实例
   */
  destroy(): void {
    this.clearMarkers();
    this.clearSearchMarker();
    this.cleanupMarkerDragListeners();

    if (this.restoreMapDragTimer !== null) {
      window.clearTimeout(this.restoreMapDragTimer);
      this.restoreMapDragTimer = null;
    }

    const container = this.map?.getContainer?.();
    container?.removeEventListener?.('dragover', this.handleDragOver);
    container?.removeEventListener?.('drop', this.handleDropBound);

    this.map?.remove?.();
    this.map = null;
    this.config = null;
  }

  /**
   * 设置地图中心点和缩放级别
   */
  setCenter(lng: number, lat: number, zoom?: number): void {
    if (!this.map) {
      return;
    }

    if (zoom !== undefined) {
      this.map.setCenter([lng, lat]);
      this.map.setZoom(zoom);
    } else {
      this.map.setCenter([lng, lat]);
    }
  }

  /**
   * 切换地图图层模式（标准图/卫星图）
   */
  setLayerMode(mode: 'standard' | 'satellite'): void {
    if (!this.map) {
      return;
    }

    const style = mode === 'satellite'
      ? 'mapbox://styles/mapbox/satellite-streets-v12'
      : 'mapbox://styles/mapbox/streets-v12';

    this.map.setStyle(style);

    // 等待样式加载完成后重新渲染标记
    this.map.once('style.load', () => {
      this.renderMarkers([], this.currentSelectedId);
    });
  }

  /**
   * 设置卫星图路网显示状态（Mapbox 的卫星图已包含路网）
   */
  setSatelliteRoadNet(enabled: boolean): void {
    // Mapbox 的 satellite-streets-v12 样式已包含路网
    // 如需切换纯卫星图，可使用 satellite-v9
    // 此处保留接口，暂不实现
  }

  /**
   * 渲染照片标记
   */
  renderMarkers(items: MediaItem[], selectedId: string): void {
    if (!this.map || !window.mapboxgl) {
      return;
    }

    this.currentSelectedId = selectedId;

    // 清除旧标记
    this.clearMarkers();

    // 渲染新标记
    items
      .filter((item) => item.hasGps && typeof item.longitude === 'number' && typeof item.latitude === 'number')
      .forEach((item) => {
        const expanded = this.expandedMarkerId === item.id;
        let marker: any = null;
        const markerContent = this.createMarkerContent(item, expanded, () => marker);

        // 创建 Mapbox Marker（WGS-84 坐标，无需转换）
        marker = new window.mapboxgl.Marker({
          element: markerContent,
          anchor: 'bottom',
        })
          .setLngLat([item.longitude as number, item.latitude as number])
          .addTo(this.map);

        this.markers.push(marker);
      });

    // 如果选中的项有 GPS，则居中显示
    const selected = items.find((item) => item.id === selectedId);
    if (selected?.hasGps && typeof selected.longitude === 'number' && typeof selected.latitude === 'number') {
      this.map.setCenter([selected.longitude, selected.latitude]);
    }
  }

  /**
   * 清除所有标记
   */
  clearMarkers(): void {
    this.markers.forEach((marker) => marker.remove?.());
    this.markers = [];
  }

  /**
   * 启用/禁用聚合功能
   * 注意：当前实现不支持聚合，保持为空实现
   */
  enableClustering(enabled: boolean): void {
    // Mapbox 暂不支持聚合功能，保留接口
    // 如需实现可使用 Supercluster 库
  }

  /**
   * 显示聚合点弹窗
   */
  showClusterPopup(items: ClusterItem[]): void {
    // 保留接口，暂不实现
  }

  /**
   * 隐藏聚合点弹窗
   */
  hideClusterPopup(): void {
    // 保留接口，暂不实现
  }

  /**
   * 搜索地址（Mapbox Geocoding API）
   */
  async search(keyword: string): Promise<SearchResult | null> {
    if (!keyword.trim()) {
      return null;
    }

    const results = await searchMapboxAddress(keyword.trim(), this.accessToken);
    if (results.length === 0) {
      return null;
    }

    const first = results[0];
    return {
      name: first.name || first.address,
      lng: first.lng,
      lat: first.lat,
    };
  }

  /**
   * 显示搜索结果标记
   */
  showSearchMarker(result: SearchResult): void {
    if (!this.map || !window.mapboxgl) {
      return;
    }

    this.clearSearchMarker();
    this.setCenter(result.lng, result.lat, SEARCH_RESULT_ZOOM);

    const content = this.createSearchMarkerContent(result.name);
    this.searchMarker = new window.mapboxgl.Marker({
      element: content,
      anchor: 'bottom',
    })
      .setLngLat([result.lng, result.lat])
      .addTo(this.map);
  }

  /**
   * 清除搜索结果标记
   */
  clearSearchMarker(): void {
    this.searchMarker?.remove?.();
    this.searchMarker = null;
  }

  /**
   * 获取坐标系统名称
   */
  getCoordinateSystemName(): string {
    return 'WGS-84';
  }

  /**
   * 格式化坐标（WGS-84）
   */
  formatCoordinate(lng: number, lat: number): string {
    return `WGS-84: ${lng.toFixed(6)}, ${lat.toFixed(6)}`;
  }

  /**
   * 是否支持坐标系切换
   */
  supportsCoordinateSystemSwitch(): boolean {
    return false; // Mapbox 仅使用 WGS-84，不支持切换
  }

  /**
   * 处理拖放事件（从媒体列表拖放照片到地图）
   */
  handleDrop(event: DragEvent, items: MediaItem[]): void {
    if (!this.map) {
      return;
    }

    event.preventDefault();
    const droppedPath = event.dataTransfer?.getData('text/plain');
    const item = items.find((entry) => entry.path === droppedPath || entry.id === droppedPath);
    if (!item) {
      return;
    }

    this.clearSearchMarker();
    const container = this.map.getContainer();
    const rect = container.getBoundingClientRect();
    const point = this.map.unproject([event.clientX - rect.left, event.clientY - rect.top]);

    // WGS-84 坐标，无需转换
    this.config?.onMarkerClick?.(item);
    this.config?.onMarkerDragEnd?.(item, point.lng, point.lat);
  }

  // ========== 私有方法 ==========

  /**
   * 创建照片标记内容（带缩略图）
   */
  private createMarkerContent(item: MediaItem, expanded: boolean, getMarker: () => any): HTMLElement {
    const container = document.createElement('button');
    container.type = 'button';
    container.className = `map-media-marker${item.id === this.currentSelectedId ? ' selected' : ''}${expanded ? ' expanded' : ''}`;
    container.title = item.name;

    // 绑定拖拽事件
    container.addEventListener('pointerdown', (event) => {
      this.beginMarkerDrag(item, getMarker(), container, event);
    });
    container.addEventListener('pointerup', () => {
      this.finishMarkerDragFromPointer();
    });
    container.addEventListener('pointercancel', () => {
      this.cancelMarkerDrag();
    });

    // 绑定点击事件
    container.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (Date.now() < this.suppressMarkerClickUntil) {
        return;
      }

      this.clearSearchMarker();
      this.config?.onMarkerClick?.(item);
      this.expandedMarkerId = this.expandedMarkerId === item.id ? '' : item.id;
      this.renderMarkers([], this.currentSelectedId);
    });

    // 创建标记气泡
    const bubble = document.createElement('span');
    bubble.className = 'marker-bubble';
    container.appendChild(bubble);

    // 创建缩略图
    const media = item.mediaType === 'image' ? document.createElement('img') : document.createElement('div');
    media.className = 'marker-media';
    if (media instanceof HTMLImageElement) {
      media.src = getMediaThumbnailUrl(item.path);
      media.alt = item.name;
      media.draggable = false;
      media.onerror = () => {
        media.classList.add('marker-media-fallback');
      };
    } else {
      media.classList.add('marker-video-fallback');
      media.textContent = 'VIDEO';
    }
    bubble.appendChild(media);

    // 创建标签（GPS/XMP）
    const label = document.createElement('span');
    label.className = 'marker-label';
    label.textContent = item.gpsSource === 'xmp' ? 'XMP' : 'GPS';
    bubble.appendChild(label);

    // 创建指针
    const pointer = document.createElement('span');
    pointer.className = 'marker-pointer';
    container.appendChild(pointer);

    return container;
  }

  /**
   * 创建搜索结果标记内容
   */
  private createSearchMarkerContent(label: string): HTMLElement {
    const container = document.createElement('button');
    container.type = 'button';
    container.className = 'map-search-marker';
    container.title = label || '搜索结果';
    container.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    container.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    const pin = document.createElement('span');
    pin.className = 'search-marker-pin';
    container.appendChild(pin);

    const dot = document.createElement('span');
    dot.className = 'search-marker-dot';
    pin.appendChild(dot);

    return container;
  }

  // ========== 标记拖拽相关 ==========

  /**
   * 开始拖拽标记
   */
  private beginMarkerDrag(item: MediaItem, marker: any, element: HTMLElement, event: PointerEvent): void {
    if (!marker || !this.map) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.clearSearchMarker();

    const rect = element.getBoundingClientRect();
    this.markerDragState = {
      item,
      marker,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      tipOffsetX: rect.left + rect.width / 2 - event.clientX,
      tipOffsetY: rect.bottom - event.clientY,
      moved: false,
    };

    element.setPointerCapture?.(event.pointerId);
    document.addEventListener('pointermove', this.handleMarkerPointerMove);
    document.addEventListener('pointerup', this.handleMarkerPointerUp);
    document.addEventListener('pointercancel', this.handleMarkerPointerCancel);

    this.setMapDragEnabled(false);

    if (this.restoreMapDragTimer !== null) {
      window.clearTimeout(this.restoreMapDragTimer);
      this.restoreMapDragTimer = null;
    }
  }

  /**
   * 处理标记指针移动
   */
  private handleMarkerPointerMove = (event: PointerEvent): void => {
    if (!this.markerDragState || this.markerDragState.pointerId !== event.pointerId || !this.map) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const movedDistance = Math.hypot(
      event.clientX - this.markerDragState.startClientX,
      event.clientY - this.markerDragState.startClientY,
    );
    this.markerDragState.moved = this.markerDragState.moved || movedDistance > 3;

    const container = this.map.getContainer();
    const rect = container.getBoundingClientRect();
    const point = this.map.unproject([
      event.clientX + this.markerDragState.tipOffsetX - rect.left,
      event.clientY + this.markerDragState.tipOffsetY - rect.top,
    ]);
    this.markerDragState.marker.setLngLat([point.lng, point.lat]);
  };

  /**
   * 处理标记指针抬起
   */
  private handleMarkerPointerUp = (event: PointerEvent): void => {
    if (this.markerDragState?.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.finishMarkerDragFromPointer();
  };

  /**
   * 处理标记指针取消
   */
  private handleMarkerPointerCancel = (event: PointerEvent): void => {
    if (this.markerDragState?.pointerId !== event.pointerId) {
      return;
    }

    this.cancelMarkerDrag();
  };

  /**
   * 完成标记拖拽（从指针事件）
   */
  private finishMarkerDragFromPointer(): void {
    const state = this.markerDragState;
    if (!state) {
      this.scheduleRestoreMapDrag();
      return;
    }

    this.cleanupMarkerDragListeners();
    if (state.moved) {
      this.suppressMarkerClickUntil = Date.now() + 350;
    }
    this.scheduleRestoreMapDrag();

    if (!state.moved) {
      this.markerDragState = null;
      return;
    }

    const lnglat = state.marker.getLngLat?.();
    this.markerDragState = null;
    if (!lnglat || !Number.isFinite(lnglat.lng) || !Number.isFinite(lnglat.lat)) {
      return;
    }

    this.config?.onMarkerClick?.(state.item);
    // WGS-84 坐标，无需转换
    this.config?.onMarkerDragEnd?.(state.item, lnglat.lng, lnglat.lat);
  };

  /**
   * 取消标记拖拽
   */
  private cancelMarkerDrag(): void {
    this.cleanupMarkerDragListeners();
    this.markerDragState = null;
    this.scheduleRestoreMapDrag();
  }

  /**
   * 清理标记拖拽监听器
   */
  private cleanupMarkerDragListeners(): void {
    document.removeEventListener('pointermove', this.handleMarkerPointerMove);
    document.removeEventListener('pointerup', this.handleMarkerPointerUp);
    document.removeEventListener('pointercancel', this.handleMarkerPointerCancel);
  }

  /**
   * 延迟恢复地图拖拽
   */
  private scheduleRestoreMapDrag(): void {
    if (this.restoreMapDragTimer !== null) {
      window.clearTimeout(this.restoreMapDragTimer);
    }

    this.restoreMapDragTimer = window.setTimeout(() => {
      if (!this.markerDragState) {
        this.setMapDragEnabled(true);
      }
      this.restoreMapDragTimer = null;
    }, 0);
  }

  /**
   * 设置地图拖拽启用状态
   */
  private setMapDragEnabled(enabled: boolean): void {
    if (!this.map) {
      return;
    }

    if (enabled) {
      this.map.dragPan.enable();
    } else {
      this.map.dragPan.disable();
    }
  }

  // ========== 拖放事件处理 ==========

  /**
   * 处理拖放悬停事件
   */
  private handleDragOver = (event: DragEvent): void => {
    event.preventDefault();
  };

  /**
   * 处理拖放释放事件（绑定版本）
   */
  private handleDropBound = (event: DragEvent): void => {
    // 由于需要传递 items，这里需要外部调用 handleDrop
    // 这个方法主要用于移除监听器
  };
}
