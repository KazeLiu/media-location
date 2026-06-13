<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import type { MediaItem, MapProvider } from '@shared/contracts';
import {
  formatGcj02Wgs84CoordinateText,
  gcj02ToWgs84,
  getCoordinateLabelTextForSystem,
  getCoordinateValueTextForSystem,
  type CoordinateSystem,
  wgs84ToGcj02,
} from '@shared/gps';
import { getMediaFileUrl, getMediaThumbnailUrl, writeClientLog } from '@/api';
import { loadAmap, loadAmapPlugins } from '@/lib/amap';
import { formatAmapSuggestions, normalizeAmapLngLat, type AmapSearchSuggestion } from '@/lib/amapSearch';
import {
  getMapMarkerMediaMode,
  getNextExpandedPath,
  isMapMarkerExpanded,
  shouldShowMapVideoPlayButton,
} from '@/lib/mapMarkerMedia';

const INITIAL_ZOOM = 11;
const SEARCH_RESULT_ZOOM = 17;
const DEFAULT_CENTER = [116.397428, 39.90923];
type MapLayerMode = 'standard' | 'satellite';

type SearchSuggestion = AmapSearchSuggestion;

const props = withDefaults(
  defineProps<{
    mapProvider: MapProvider;
    amapKey: string;
    amapSecurityCode?: string;
    mapboxAccessToken?: string;
    items: MediaItem[];
    selectedPath: string;
  }>(),
  {
    amapSecurityCode: '',
    mapboxAccessToken: '',
  },
);

const emit = defineEmits<{
  select: [item: MediaItem];
  place: [payload: { path: string; longitude: number; latitude: number }];
  ready: [];
  error: [message: string];
}>();

const mapEl = ref<HTMLDivElement | null>(null);
let map: any = null;
let autocomplete: any = null;
let placeSearch: any = null;
let standardLayer: any = null;
let satelliteLayer: any = null;
let roadNetLayer: any = null;
let markers: any[] = [];
let searchMarker: any = null;
let restoreMapDragTimer: number | null = null;
let markerDragState: {
  item: MediaItem;
  marker: any;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  tipOffsetX: number;
  tipOffsetY: number;
  moved: boolean;
} | null = null;

// Map block: owns AMap state, search text, raw AMap hover coordinate, and expanded marker path.
const mapModel = reactive({
  hint: '未加载',
  searchKeyword: '',
  searching: false,
  mouseCoord: null as { lng: number; lat: number } | null,
  coordinateSystem: 'gcj02' as CoordinateSystem,
  layerMode: 'standard' as MapLayerMode,
  satelliteRoadNet: false,
  expandedPath: '',
  draggingMarkerId: '',
  suppressMarkerClickUntil: 0,
});

const mouseCoordText = computed(() => {
  if (!mapModel.mouseCoord) {
    return null;
  }

  return formatGcj02Wgs84CoordinateText(mapModel.mouseCoord.lng, mapModel.mouseCoord.lat);
});

async function ensureMap(): Promise<void> {
  if (!mapEl.value || map) {
    return;
  }

  // 检查是否有对应的 key
  if (props.mapProvider === 'amap' && !props.amapKey) {
    mapModel.hint = '需要高德 Key';
    emit('error', '需要高德 Key');
    return;
  }

  if (props.mapProvider === 'mapbox' && !props.mapboxAccessToken) {
    mapModel.hint = '需要 Mapbox Token';
    emit('error', '需要 Mapbox Token');
    return;
  }

  if (props.mapProvider === 'amap') {
    await ensureAmapMap();
  } else if (props.mapProvider === 'mapbox') {
    await ensureMapboxMap();
  }
}

async function ensureAmapMap(): Promise<void> {
  try {
    await loadAmap(props.amapKey, props.amapSecurityCode);
    const AMap = window.AMap;
    await loadAmapPlugins(['AMap.ToolBar', 'AMap.Scale', 'AMap.AutoComplete', 'AMap.PlaceSearch']);

    map = new AMap.Map(mapEl.value, {
      zoom: INITIAL_ZOOM,
      center: DEFAULT_CENTER,
      viewMode: '2D',
    });
    applyMapLayers();
    const AutocompleteCtor = AMap.AutoComplete || AMap.Autocomplete;
    if (typeof AutocompleteCtor !== 'function' || typeof AMap.PlaceSearch !== 'function') {
      throw new Error('高德搜索插件加载失败');
    }

    autocomplete = new AutocompleteCtor({ city: '全国', citylimit: false });
    placeSearch = new AMap.PlaceSearch({ city: '全国', citylimit: false, autoFitView: false });

    map.addControl(new AMap.ToolBar({ position: { right: '18px', bottom: '96px' } }));
    map.addControl(new AMap.Scale());

    map.on('mousemove', (event: any) => {
      mapModel.mouseCoord = {
        lng: event.lnglat.lng,
        lat: event.lnglat.lat,
      };
    });

    map.on('click', (event: any) => {
      if (mapModel.expandedPath) {
        mapModel.expandedPath = '';
        renderMarkers();
      }

      clearSearchMarker();
      void copyLngLat(event.lnglat.lng, event.lnglat.lat);
    });

    const container = map.getContainer();
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('drop', handleDrop);

    mapModel.hint = '已连接';
    emit('ready');
    renderMarkers();
  } catch (error) {
    const message = error instanceof Error ? error.message : '高德地图加载失败';
    mapModel.hint = message;
    emit('error', message);
  }
}

async function ensureMapboxMap(): Promise<void> {
  try {
    const mapboxgl = await import('mapbox-gl');
    await import('mapbox-gl/dist/mapbox-gl.css');

    (mapboxgl.default as any).accessToken = props.mapboxAccessToken;

    map = new (mapboxgl.default as any).Map({
      container: mapEl.value!,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [DEFAULT_CENTER[0], DEFAULT_CENTER[1]],
      zoom: INITIAL_ZOOM,
    });

    map.on('load', () => {
      mapModel.hint = '已连接';
      emit('ready');
      renderMarkers();
    });

    map.on('mousemove', (event: any) => {
      mapModel.mouseCoord = {
        lng: event.lngLat.lng,
        lat: event.lngLat.lat,
      };
    });

    map.on('click', (event: any) => {
      if (mapModel.expandedPath) {
        mapModel.expandedPath = '';
        renderMarkers();
      }

      clearSearchMarker();
      void copyLngLat(event.lngLat.lng, event.lngLat.lat);
    });

    const container = map.getContainer();
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('drop', handleDrop);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Mapbox 地图加载失败';
    mapModel.hint = message;
    emit('error', message);
  }
}

function handleDragOver(event: DragEvent): void {
  event.preventDefault();
}

function handleDrop(event: DragEvent): void {
  if (!map || !window.AMap) {
    return;
  }

  event.preventDefault();
  const droppedPath = event.dataTransfer?.getData('text/plain');
  const item = props.items.find((entry) => entry.path === droppedPath || entry.id === droppedPath);
  if (!item) {
    return;
  }

  clearSearchMarker();
  const container = map.getContainer();
  const rect = container.getBoundingClientRect();
  const pixel = new window.AMap.Pixel(event.clientX - rect.left, event.clientY - rect.top);
  const lnglat = map.containerToLngLat(pixel);
  const wgs84 = gcj02ToWgs84(lnglat.lng, lnglat.lat);
  emit('select', item);
  emit('place', {
    path: item.path,
    longitude: wgs84.lng,
    latitude: wgs84.lat,
  });
}

async function searchAddress(): Promise<void> {
  if (!mapModel.searchKeyword.trim()) {
    return;
  }

  await locateKeyword(mapModel.searchKeyword.trim());
}

function fetchSearchSuggestions(keyword: string, callback: (items: SearchSuggestion[]) => void): void {
  if (!autocomplete || !keyword.trim()) {
    callback([]);
    return;
  }

  autocomplete.search(keyword.trim(), (status: string, result: any) => {
    if (status !== 'complete') {
      handleAmapSearchError(result);
      callback([]);
      return;
    }

    callback(formatAmapSuggestions(result));
  });
}

async function handleSuggestionSelect(suggestion: SearchSuggestion): Promise<void> {
  mapModel.searchKeyword = suggestion.value;
  const location = normalizeAmapLngLat(suggestion.location);

  if (location) {
    moveToSearchResult(location.lng, location.lat, suggestion.name || suggestion.value);
    ElMessage.success('已定位到搜索结果');
    return;
  }

  await locateKeyword(suggestion.name || suggestion.value);
}

async function locateKeyword(keyword: string): Promise<void> {
  if (!map || !placeSearch || !keyword.trim()) {
    return;
  }

  mapModel.searching = true;
  placeSearch.search(keyword.trim(), (status: string, result: any) => {
    mapModel.searching = false;
    const location = normalizeAmapLngLat(result?.poiList?.pois?.[0]?.location);

    if (status === 'complete' && location) {
      moveToSearchResult(location.lng, location.lat, result?.poiList?.pois?.[0]?.name || keyword);
      ElMessage.success('已定位到搜索结果');
      return;
    }

    if (status !== 'complete' && handleAmapSearchError(result)) {
      return;
    }

    ElMessage.warning('没有找到这个地址');
  });
}

function handleAmapSearchError(result: unknown): boolean {
  if (result !== 'INVALID_USER_SCODE') {
    return false;
  }

  const message = 'POI 搜索需要填写高德安全密钥';
  mapModel.hint = message;
  emit('error', message);
  return true;
}

function moveToSearchResult(lng: number, lat: number, label: string): void {
  map?.setZoomAndCenter?.(SEARCH_RESULT_ZOOM, [lng, lat]);
  showSearchMarker(lng, lat, label);
}

function showSearchMarker(lng: number, lat: number, label: string): void {
  if (!map || !window.AMap) {
    return;
  }

  clearSearchMarker();
  const content = createSearchMarkerContent(label);
  searchMarker = new window.AMap.Marker({
    position: [lng, lat],
    content,
    anchor: 'bottom-center',
    offset: new window.AMap.Pixel(0, 0),
    cursor: 'default',
    zIndex: 600,
  });
  map.add(searchMarker);
}

function createSearchMarkerContent(label: string): HTMLElement {
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

function clearSearchMarker(): void {
  searchMarker?.remove?.();
  searchMarker = null;
}

function switchMapLayer(mode: MapLayerMode): void {
  if (props.mapProvider !== 'amap') {
    return; // Mapbox 暂不支持图层切换
  }

  if (mode === 'standard') {
    mapModel.layerMode = 'standard';
    mapModel.satelliteRoadNet = false;
    applyMapLayers();
    return;
  }

  mapModel.layerMode = 'satellite';
  applyMapLayers();
}

function toggleSatelliteRoadNet(value: boolean): void {
  if (props.mapProvider !== 'amap') {
    return; // Mapbox 暂不支持
  }

  mapModel.satelliteRoadNet = value;
  applyMapLayers();
}

function applyMapLayers(): void {
  if (!map || !window.AMap) {
    return;
  }

  ensureMapLayers();
  if (mapModel.layerMode === 'satellite') {
    map.setLayers([satelliteLayer]);
    setRoadNetVisible(mapModel.satelliteRoadNet);
    return;
  }

  setRoadNetVisible(false);
  map.setLayers([standardLayer]);
}

function ensureMapLayers(): void {
  if (!window.AMap) {
    return;
  }

  standardLayer ||= new window.AMap.TileLayer();
  satelliteLayer ||= new window.AMap.TileLayer.Satellite();
  roadNetLayer ||= new window.AMap.TileLayer.RoadNet();
}

function setRoadNetVisible(visible: boolean): void {
  if (!roadNetLayer) {
    return;
  }

  if (visible) {
    roadNetLayer.setMap?.(map);
    roadNetLayer.show?.();
    return;
  }

  roadNetLayer.hide?.();
  roadNetLayer.setMap?.(null);
}

async function copyLngLat(lng: number, lat: number): Promise<void> {
  const coordinateText = formatGcj02Wgs84CoordinateText(lng, lat);
  const text = getCoordinateValueTextForSystem(coordinateText, mapModel.coordinateSystem);
  const labelText = getCoordinateLabelTextForSystem(coordinateText, mapModel.coordinateSystem);
  try {
    const result = await copyTextWithFallback(text);
    if (result.method === 'fallback') {
      void writeClientLog({
        level: 'warn',
        action: 'copy:clipboard-fallback',
        message: 'navigator.clipboard was unavailable or rejected; fallback copy succeeded',
        details: createClipboardLogDetails(result.clipboardError),
      }).catch(() => undefined);
    }
    ElMessage.success(`已复制 ${labelText}`);
  } catch (error) {
    void writeClientLog({
      level: 'error',
      action: 'copy:clipboard',
      message: error instanceof Error ? error.message : 'Clipboard copy failed',
      details: createClipboardLogDetails(error),
    }).catch(() => undefined);
    const reason = window.isSecureContext
      ? '浏览器拒绝写入剪贴板，请手动复制坐标'
      : '当前地址不是 HTTPS/localhost，浏览器限制写入剪贴板，请手动复制坐标';
    ElMessage.error(`复制 ${labelText} 失败：${reason}`);
  }
}

async function copyTextWithFallback(text: string): Promise<{ method: 'clipboard' | 'fallback'; clipboardError?: unknown }> {
  let clipboardError: unknown = null;

  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return { method: 'clipboard' };
    } catch (error) {
      clipboardError = error;
    }
  }

  try {
    if (copyTextWithTextarea(text)) {
      return { method: 'fallback', clipboardError };
    }
  } catch (error) {
    throw new Error(buildClipboardFailureMessage(clipboardError, error));
  }

  throw new Error(buildClipboardFailureMessage(clipboardError, new Error('document.execCommand returned false')));
}

function copyTextWithTextarea(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
    window.getSelection()?.removeAllRanges();
  }
}

function buildClipboardFailureMessage(clipboardError: unknown, fallbackError: unknown): string {
  const clipboardMessage = errorToMessage(clipboardError);
  const fallbackMessage = errorToMessage(fallbackError);
  return `Clipboard copy failed. clipboard=${clipboardMessage}; fallback=${fallbackMessage}`;
}

function createClipboardLogDetails(error: unknown): Record<string, unknown> {
  return {
    error: errorToPlainObject(error),
    isSecureContext: window.isSecureContext,
    clipboardAvailable: Boolean(navigator.clipboard?.writeText),
    href: window.location.href,
    userAgent: navigator.userAgent,
  };
}

function errorToPlainObject(error: unknown): Record<string, unknown> | null {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

function errorToMessage(error: unknown): string {
  if (!error) {
    return 'none';
  }

  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function renderMarkers(): void {
  if (!map || !window.AMap) {
    return;
  }

  markers.forEach((marker) => marker.remove());
  markers = [];

  props.items
    .filter((item) => item.hasGps && typeof item.longitude === 'number' && typeof item.latitude === 'number')
    .forEach((item) => {
      const point = wgs84ToGcj02(item.longitude as number, item.latitude as number);
      const expanded = isMapMarkerExpanded(mapModel.expandedPath, item.path);
      let marker: any = null;
      const markerContent = createMarkerContent(item, expanded, () => marker);
      marker = new window.AMap.Marker({
        position: [point.lng, point.lat],
        content: markerContent,
        anchor: 'bottom-center',
        offset: new window.AMap.Pixel(0, 0),
        cursor: 'move',
        zIndex: item.path === props.selectedPath || expanded ? 300 : 100,
      });

      map.add(marker);
      markers.push(marker);
    });

  const selected = props.items.find((item) => item.path === props.selectedPath);
  if (selected?.hasGps && typeof selected.longitude === 'number' && typeof selected.latitude === 'number') {
    const point = wgs84ToGcj02(selected.longitude, selected.latitude);
    map.setCenter([point.lng, point.lat]);
  }
}

function createMarkerContent(item: MediaItem, expanded: boolean, getMarker: () => any): HTMLElement {
  const container = document.createElement('div');
  container.setAttribute('role', 'button');
  container.tabIndex = 0;
  container.className = `map-media-marker${item.path === props.selectedPath ? ' selected' : ''}${expanded ? ' expanded' : ''}`;
  container.title = item.name;
  container.addEventListener('pointerdown', (event) => {
    beginMarkerDrag(item, getMarker(), container, event);
  });
  container.addEventListener('pointerup', () => {
    finishMarkerDragFromPointer();
  });
  container.addEventListener('pointercancel', () => {
    cancelMarkerDrag();
  });
  container.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (Date.now() < mapModel.suppressMarkerClickUntil) {
      return;
    }

    clearSearchMarker();
    emit('select', item);
    mapModel.expandedPath = getNextExpandedPath(mapModel.expandedPath, item.path);
    renderMarkers();
  });
  container.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    clearSearchMarker();
    emit('select', item);
    mapModel.expandedPath = getNextExpandedPath(mapModel.expandedPath, item.path);
    renderMarkers();
  });

  const bubble = document.createElement('span');
  bubble.className = 'marker-bubble';
  container.appendChild(bubble);

  const media = createMarkerMediaElement(item);
  bubble.appendChild(media);

  if (shouldShowMapVideoPlayButton(item.mediaType, expanded)) {
    bubble.appendChild(createMarkerVideoPlayLink(item));
  }

  const label = document.createElement('span');
  label.className = 'marker-label';
  label.textContent = item.gpsSource === 'xmp' ? 'XMP' : 'GPS';
  if (item.mediaType !== 'video' || !expanded) {
    bubble.appendChild(label);
  }

  const pointer = document.createElement('span');
  pointer.className = 'marker-pointer';
  container.appendChild(pointer);

  return container;
}

function createMarkerMediaElement(item: MediaItem): HTMLElement {
  const mediaMode = getMapMarkerMediaMode(item.mediaType);

  if (mediaMode === 'image') {
    const media = document.createElement('img');
    media.className = 'marker-media';
    media.src = getMediaThumbnailUrl(item.path);
    media.alt = item.name;
    media.draggable = false;
    media.onerror = () => {
      media.classList.add('marker-media-fallback');
    };
    return media;
  }

  const thumbnail = document.createElement('span');
  thumbnail.className = 'marker-media marker-video-thumbnail';
  thumbnail.setAttribute('role', 'img');
  thumbnail.setAttribute('aria-label', `${item.name} 视频缩略图`);

  const image = document.createElement('img');
  image.className = 'marker-video-frame';
  image.src = getMediaThumbnailUrl(item.path);
  image.alt = item.name;
  image.draggable = false;
  image.onerror = () => {
    image.remove();
    thumbnail.classList.add('marker-video-placeholder');
    if (!thumbnail.querySelector('.marker-video-cover-icon')) {
      const fallbackIcon = document.createElement('span');
      fallbackIcon.className = 'marker-video-cover-icon';
      thumbnail.appendChild(fallbackIcon);
    }
  };
  thumbnail.appendChild(image);
  return thumbnail;
}

function createMarkerVideoPlayLink(item: MediaItem): HTMLElement {
  const link = document.createElement('a');
  link.className = 'marker-video-play';
  link.href = getMediaFileUrl(item.path);
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = '新标签页播放';
  link.setAttribute('aria-label', `在新标签页播放 ${item.name}`);
  link.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });
  link.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  return link;
}

function beginMarkerDrag(item: MediaItem, marker: any, element: HTMLElement, event: PointerEvent): void {
  if (!marker || !map || !window.AMap) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  clearSearchMarker();

  const rect = element.getBoundingClientRect();
  markerDragState = {
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
  document.addEventListener('pointermove', handleMarkerPointerMove);
  document.addEventListener('pointerup', handleMarkerPointerUp);
  document.addEventListener('pointercancel', handleMarkerPointerCancel);

  mapModel.draggingMarkerId = item.id;
  setMapDragEnabled(false);

  if (restoreMapDragTimer !== null) {
    window.clearTimeout(restoreMapDragTimer);
    restoreMapDragTimer = null;
  }
}

function handleMarkerPointerMove(event: PointerEvent): void {
  if (!markerDragState || markerDragState.pointerId !== event.pointerId || !map || !window.AMap) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const movedDistance = Math.hypot(event.clientX - markerDragState.startClientX, event.clientY - markerDragState.startClientY);
  markerDragState.moved = markerDragState.moved || movedDistance > 3;

  const container = map.getContainer();
  const rect = container.getBoundingClientRect();
  const pixel = new window.AMap.Pixel(
    event.clientX + markerDragState.tipOffsetX - rect.left,
    event.clientY + markerDragState.tipOffsetY - rect.top,
  );
  const lnglat = map.containerToLngLat(pixel);
  markerDragState.marker.setPosition(lnglat);
}

function handleMarkerPointerUp(event: PointerEvent): void {
  if (markerDragState?.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  finishMarkerDragFromPointer();
}

function handleMarkerPointerCancel(event: PointerEvent): void {
  if (markerDragState?.pointerId !== event.pointerId) {
    return;
  }

  cancelMarkerDrag();
}

function finishMarkerDragFromPointer(): void {
  const state = markerDragState;
  if (!state) {
    scheduleRestoreMapDrag();
    return;
  }

  cleanupMarkerDragListeners();
  mapModel.draggingMarkerId = '';
  if (state.moved) {
    mapModel.suppressMarkerClickUntil = Date.now() + 350;
  }
  scheduleRestoreMapDrag();

  if (!state.moved) {
    markerDragState = null;
    return;
  }

  const lnglat = state.marker.getPosition?.();
  markerDragState = null;
  if (!lnglat || !Number.isFinite(lnglat.lng) || !Number.isFinite(lnglat.lat)) {
    return;
  }

  emit('select', state.item);
  const wgs84 = gcj02ToWgs84(lnglat.lng, lnglat.lat);
  emit('place', {
    path: state.item.path,
    longitude: wgs84.lng,
    latitude: wgs84.lat,
  });
}

function cancelMarkerDrag(): void {
  cleanupMarkerDragListeners();
  markerDragState = null;
  mapModel.draggingMarkerId = '';
  scheduleRestoreMapDrag();
}

function cleanupMarkerDragListeners(): void {
  document.removeEventListener('pointermove', handleMarkerPointerMove);
  document.removeEventListener('pointerup', handleMarkerPointerUp);
  document.removeEventListener('pointercancel', handleMarkerPointerCancel);
}

function scheduleRestoreMapDrag(): void {
  if (restoreMapDragTimer !== null) {
    window.clearTimeout(restoreMapDragTimer);
  }

  restoreMapDragTimer = window.setTimeout(() => {
    if (!mapModel.draggingMarkerId) {
      setMapDragEnabled(true);
    }
    restoreMapDragTimer = null;
  }, 0);
}

function setMapDragEnabled(enabled: boolean): void {
  map?.setStatus?.({ dragEnable: enabled });
}

watch(
  () => [props.mapProvider, props.amapKey, props.amapSecurityCode, props.mapboxAccessToken, props.items, props.selectedPath, mapModel.expandedPath],
  async (newVal, oldVal) => {
    // 检查地图引擎是否切换
    if (oldVal && newVal[0] !== oldVal[0]) {
      // 地图引擎切换了，需要销毁旧地图
      if (map) {
        try {
          if (typeof map.destroy === 'function') {
            map.destroy();
          } else if (typeof map.remove === 'function') {
            map.remove();
          }
        } catch (error) {
          console.error('销毁地图失败:', error);
        }
        map = null;
        markers = [];
        searchMarker = null;
      }
    }

    await ensureMap();
    renderMarkers();
  },
  { deep: true, immediate: true },
);

onMounted(ensureMap);

onBeforeUnmount(() => {
  markers.forEach((marker) => marker.remove());
  clearSearchMarker();
  cleanupMarkerDragListeners();
  if (restoreMapDragTimer !== null) {
    window.clearTimeout(restoreMapDragTimer);
  }
  const container = map?.getContainer?.();
  container?.removeEventListener?.('dragover', handleDragOver);
  container?.removeEventListener?.('drop', handleDrop);
  map?.destroy?.();
});
</script>

<template>
  <section class="map-panel">
    <div ref="mapEl" class="map-canvas"></div>

    <div class="map-search">
      <el-autocomplete
        v-model="mapModel.searchKeyword"
        placeholder="搜索地址"
        :fetch-suggestions="fetchSearchSuggestions"
        clearable
        value-key="value"
        popper-class="map-search-popper"
        @select="handleSuggestionSelect"
        @keydown.enter="searchAddress"
      >
        <template #append>
          <el-button :icon="Search" :loading="mapModel.searching" @click="searchAddress" />
        </template>
      </el-autocomplete>
    </div>

    <div class="map-coordinate">
      <el-button-group>
        <el-button
          :type="mapModel.coordinateSystem === 'gcj02' ? 'primary' : 'default'"
          @click="mapModel.coordinateSystem = 'gcj02'"
        >
          {{ mouseCoordText?.gcj02Text ?? 'GCJ-02' }}
        </el-button>
        <el-button
          :type="mapModel.coordinateSystem === 'wgs84' ? 'primary' : 'default'"
          @click="mapModel.coordinateSystem = 'wgs84'"
        >
          {{ mouseCoordText?.wgs84Text ?? 'WGS-84' }}
        </el-button>
      </el-button-group>
    </div>

    <div class="map-layer-switch">
      <el-checkbox
        v-if="mapModel.layerMode === 'satellite'"
        :model-value="mapModel.satelliteRoadNet"
        @update:model-value="toggleSatelliteRoadNet(Boolean($event))"
      >
        路网
      </el-checkbox>
      <el-button-group>
        <el-button
          :type="mapModel.layerMode === 'satellite' ? 'primary' : 'default'"
          @click="switchMapLayer('satellite')"
        >
          卫星图
        </el-button>
        <el-button
          :type="mapModel.layerMode === 'standard' ? 'primary' : 'default'"
          @click="switchMapLayer('standard')"
        >
          标准图
        </el-button>
      </el-button-group>
    </div>

    <el-tag class="map-hint" effect="light">{{ mapModel.hint }}</el-tag>
  </section>
</template>
