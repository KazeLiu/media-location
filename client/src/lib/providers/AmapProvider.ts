import type { MediaItem } from '@shared/contracts';
import {
  formatGcj02Wgs84CoordinateText,
  gcj02ToWgs84,
  wgs84ToGcj02,
} from '@shared/gps';
import { getMediaThumbnailUrl } from '@/api';
import { loadAmap, loadAmapPlugins } from '@/lib/amap';
import { formatAmapSuggestions, normalizeAmapLngLat } from '@/lib/amapSearch';
import { MapProvider, type MapProviderConfig, type SearchResult, type ClusterItem } from '../MapProvider';

const INITIAL_ZOOM = 11;
const SEARCH_RESULT_ZOOM = 17;
const DEFAULT_CENTER = [116.397428, 39.90923];

/**
 * 高德地图实现
 * 使用 GCJ-02 坐标系（火星坐标系）
 */
export class AmapProvider extends MapProvider {
  private map: any = null;
  private autocomplete: any = null;
  private placeSearch: any = null;
  private standardLayer: any = null;
  private satelliteLayer: any = null;
  private roadNetLayer: any = null;
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
  private currentItems: MediaItem[] = [];

  // 卫星图路网开关状态
  private satelliteRoadNetEnabled = false;

  constructor(
    private readonly apiKey: string,
    private readonly securityCode?: string,
  ) {
    super();
  }

  /**
   * 初始化地图实例
   */
  async init(config: MapProviderConfig): Promise<void> {
    this.config = config;

    if (!this.apiKey) {
      throw new Error('高德地图 API Key 未配置');
    }

    try {
      // 加载高德地图 SDK
      await loadAmap(this.apiKey, this.securityCode);
      const AMap = window.AMap;
      if (!AMap) {
        throw new Error('高德地图 SDK 加载失败');
      }

      // 加载高德地图插件（搜索、工具栏等）
      await loadAmapPlugins(['AMap.ToolBar', 'AMap.Scale', 'AMap.AutoComplete', 'AMap.PlaceSearch']);

      // 创建地图实例
      this.map = new AMap.Map(config.container, {
        zoom: INITIAL_ZOOM,
        center: DEFAULT_CENTER,
        viewMode: '2D',
      });

      // 初始化图层
      this.applyMapLayers();

      // 初始化搜索插件
      const AutocompleteCtor = AMap.AutoComplete || AMap.Autocomplete;
      if (typeof AutocompleteCtor !== 'function' || typeof AMap.PlaceSearch !== 'function') {
        throw new Error('高德搜索插件加载失败');
      }

      this.autocomplete = new AutocompleteCtor({ city: '全国', citylimit: false });
      this.placeSearch = new AMap.PlaceSearch({ city: '全国', citylimit: false, autoFitView: false });

      // 添加地图控件
      this.map.addControl(new AMap.ToolBar({ position: { right: '18px', bottom: '96px' } }));
      this.map.addControl(new AMap.Scale());

      // 绑定地图点击事件
      this.map.on('click', (event: any) => {
        if (this.expandedMarkerId) {
          this.expandedMarkerId = '';
          this.renderMarkers(this.currentItems, this.currentSelectedId);
        }

        this.clearSearchMarker();
        config.onMapClick?.(event.lnglat.lng, event.lnglat.lat);
      });

      // 绑定鼠标移动事件
      this.map.on('mousemove', (event: any) => {
        config.onMouseMove?.(event.lnglat.lng, event.lnglat.lat);
      });

      // 绑定拖放事件
      const container = this.map.getContainer();
      container.addEventListener('dragover', this.handleDragOver);
      container.addEventListener('drop', this.handleDropBound);

      config.onReady?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : '高德地图加载失败';
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

    this.map?.destroy?.();
    this.map = null;
    this.autocomplete = null;
    this.placeSearch = null;
    this.standardLayer = null;
    this.satelliteLayer = null;
    this.roadNetLayer = null;
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
      this.map.setZoomAndCenter?.(zoom, [lng, lat]);
    } else {
      this.map.setCenter?.([lng, lat]);
    }
  }

  /**
   * 切换地图图层模式（标准图/卫星图）
   */
  setLayerMode(mode: 'standard' | 'satellite'): void {
    if (!this.map || !window.AMap) {
      return;
    }

    this.ensureMapLayers();

    if (mode === 'satellite') {
      this.map.setLayers([this.satelliteLayer]);
      this.setRoadNetVisible(this.satelliteRoadNetEnabled);
    } else {
      this.setRoadNetVisible(false);
      this.map.setLayers([this.standardLayer]);
    }
  }

  /**
   * 设置卫星图路网显示状态
   */
  setSatelliteRoadNet(enabled: boolean): void {
    this.satelliteRoadNetEnabled = enabled;
    this.setRoadNetVisible(enabled);
  }

  /**
   * 渲染照片标记
   */
  renderMarkers(items: MediaItem[], selectedId: string): void {
    if (!this.map || !window.AMap) {
      return;
    }

    this.currentSelectedId = selectedId;
    this.currentItems = items;

    // 清除旧标记
    this.clearMarkers();

    // 渲染新标记
    items
      .filter((item) => item.hasGps && typeof item.longitude === 'number' && typeof item.latitude === 'number')
      .forEach((item) => {
        // WGS-84 转 GCJ-02
        const point = wgs84ToGcj02(item.longitude as number, item.latitude as number);
        const expanded = this.expandedMarkerId === item.id;
        let marker: any = null;
        const markerContent = this.createMarkerContent(item, expanded, () => marker);

        marker = new window.AMap.Marker({
          position: [point.lng, point.lat],
          content: markerContent,
          anchor: 'bottom-center',
          offset: new window.AMap.Pixel(0, 0),
          cursor: 'move',
          zIndex: item.id === selectedId || expanded ? 300 : 100,
        });

        this.map.add(marker);
        this.markers.push(marker);
      });

    // 如果选中的项有 GPS，则居中显示
    const selected = items.find((item) => item.id === selectedId);
    if (selected?.hasGps && typeof selected.longitude === 'number' && typeof selected.latitude === 'number') {
      const point = wgs84ToGcj02(selected.longitude, selected.latitude);
      this.map.setCenter([point.lng, point.lat]);
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
    // 高德地图暂不支持聚合功能，保留接口
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
   * 搜索地址（POI 搜索）
   */
  async search(keyword: string): Promise<SearchResult | null> {
    if (!this.placeSearch || !keyword.trim()) {
      return null;
    }

    return new Promise((resolve) => {
      this.placeSearch.search(keyword.trim(), (status: string, result: any) => {
        const location = normalizeAmapLngLat(result?.poiList?.pois?.[0]?.location);

        if (status === 'complete' && location) {
          resolve({
            name: result?.poiList?.pois?.[0]?.name || keyword,
            lng: location.lng,
            lat: location.lat,
          });
          return;
        }

        resolve(null);
      });
    });
  }

  /**
   * 显示搜索结果标记
   */
  showSearchMarker(result: SearchResult): void {
    if (!this.map || !window.AMap) {
      return;
    }

    this.clearSearchMarker();
    this.setCenter(result.lng, result.lat, SEARCH_RESULT_ZOOM);

    const content = this.createSearchMarkerContent(result.name);
    this.searchMarker = new window.AMap.Marker({
      position: [result.lng, result.lat],
      content,
      anchor: 'bottom-center',
      offset: new window.AMap.Pixel(0, 0),
      cursor: 'default',
      zIndex: 600,
    });
    this.map.add(this.searchMarker);
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
    return 'GCJ-02';
  }

  /**
   * 格式化坐标（GCJ-02 和 WGS-84 双显示）
   */
  formatCoordinate(lng: number, lat: number): string {
    const text = formatGcj02Wgs84CoordinateText(lng, lat);
    return `${text.gcj02Text} | ${text.wgs84Text}`;
  }

  /**
   * 是否支持坐标系切换
   */
  supportsCoordinateSystemSwitch(): boolean {
    return true; // 高德地图支持 GCJ-02 和 WGS-84 转换
  }

  /**
   * 处理拖放事件（从媒体列表拖放照片到地图）
   */
  handleDrop(event: DragEvent, items: MediaItem[]): void {
    if (!this.map || !window.AMap) {
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
    const pixel = new window.AMap.Pixel(event.clientX - rect.left, event.clientY - rect.top);
    const lnglat = this.map.containerToLngLat(pixel);

    // GCJ-02 转 WGS-84
    const wgs84 = gcj02ToWgs84(lnglat.lng, lnglat.lat);

    this.config?.onMarkerClick?.(item);
    this.config?.onMarkerDragEnd?.(item, wgs84.lng, wgs84.lat);
  }

  // ========== 私有方法 ==========

  /**
   * 确保地图图层已创建
   */
  private ensureMapLayers(): void {
    if (!window.AMap) {
      return;
    }

    this.standardLayer ||= new window.AMap.TileLayer();
    this.satelliteLayer ||= new window.AMap.TileLayer.Satellite();
    this.roadNetLayer ||= new window.AMap.TileLayer.RoadNet();
  }

  /**
   * 应用地图图层
   */
  private applyMapLayers(): void {
    if (!this.map || !window.AMap) {
      return;
    }

    this.ensureMapLayers();
    this.map.setLayers([this.standardLayer]);
  }

  /**
   * 设置路网图层可见性
   */
  private setRoadNetVisible(visible: boolean): void {
    if (!this.roadNetLayer) {
      return;
    }

    if (visible) {
      this.roadNetLayer.setMap?.(this.map);
      this.roadNetLayer.show?.();
    } else {
      this.roadNetLayer.hide?.();
      this.roadNetLayer.setMap?.(null);
    }
  }

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
      this.renderMarkers(this.currentItems, this.currentSelectedId);
    });

    // 创建标记气泡
    const bubble = document.createElement('span');
    bubble.className = 'marker-bubble';
    container.appendChild(bubble);

    // 创建缩略图
    const media = document.createElement('img');
    media.className = 'marker-media';
    media.src = getMediaThumbnailUrl(item.path);
    media.alt = item.name;
    media.draggable = false;
    media.onerror = () => {
      media.classList.add(item.mediaType === 'image' ? 'marker-media-fallback' : 'marker-video-fallback');
    };
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
    if (!marker || !this.map || !window.AMap) {
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
    if (!this.markerDragState || this.markerDragState.pointerId !== event.pointerId || !this.map || !window.AMap) {
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
    const pixel = new window.AMap.Pixel(
      event.clientX + this.markerDragState.tipOffsetX - rect.left,
      event.clientY + this.markerDragState.tipOffsetY - rect.top,
    );
    const lnglat = this.map.containerToLngLat(pixel);
    this.markerDragState.marker.setPosition(lnglat);
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

    const lnglat = state.marker.getPosition?.();
    this.markerDragState = null;
    if (!lnglat || !Number.isFinite(lnglat.lng) || !Number.isFinite(lnglat.lat)) {
      return;
    }

    this.config?.onMarkerClick?.(state.item);
    // GCJ-02 转 WGS-84
    const wgs84 = gcj02ToWgs84(lnglat.lng, lnglat.lat);
    this.config?.onMarkerDragEnd?.(state.item, wgs84.lng, wgs84.lat);
  }

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
    this.map?.setStatus?.({ dragEnable: enabled });
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

