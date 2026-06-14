<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import type { MediaItem, Geofence } from '@shared/contracts';
import {
  formatGcj02Wgs84CoordinateText,
  getCoordinateLabelTextForSystem,
  getCoordinateValueTextForSystem,
  type CoordinateSystem,
  wgs84ToGcj02,
} from '@shared/gps';
import { getMediaFileUrl, getMediaThumbnailUrl, writeClientLog } from '@/api';
import { loadMapbox, mapboxgl } from '@/lib/mapbox';
import { searchMapboxAddress, type MapboxSearchSuggestion } from '@/lib/mapboxSearch';
import {
  getMapMarkerMediaMode,
  getNextExpandedPath,
  isMapMarkerExpanded,
  shouldShowMapVideoPlayButton,
  shouldShowMapImagePreviewButton,
} from '@/lib/mapMarkerMedia';

const INITIAL_ZOOM = 11;
const SEARCH_RESULT_ZOOM = 17;
const DEFAULT_CENTER: [number, number] = [116.397428, 39.90923];
type MapLayerMode = 'standard' | 'satellite';

type SearchSuggestion = MapboxSearchSuggestion;

const props = withDefaults(
  defineProps<{
    mapboxAccessToken: string;
    items: MediaItem[];
    selectedPath: string;
    geofences: Geofence[];
    editingGeofenceId: string;
    drawingMode: boolean;
  }>(),
  {
    geofences: () => [],
    editingGeofenceId: '',
    drawingMode: false,
  },
);

const emit = defineEmits<{
  select: [item: MediaItem];
  place: [payload: { path: string; longitude: number; latitude: number }];
  ready: [];
  error: [message: string];
  geofenceDrawn: [id: string, coordinates: Array<{ longitude: number; latitude: number }>];
  geofenceEdited: [id: string, coordinates: Array<{ longitude: number; latitude: number }>];
}>();

const mapEl = ref<HTMLDivElement | null>(null);
let map: mapboxgl.Map | null = null;
let markers: mapboxgl.Marker[] = [];
let searchMarker: mapboxgl.Marker | null = null;
let geofenceSourcesIds: string[] = [];

// 围栏占位函数 - 后续可完善为完整的 Mapbox Draw 实现
function renderGeofences(): void {
  if (!map) return;
  // TODO: 使用 @mapbox/mapbox-gl-draw 实现完整的围栏绘制编辑功能
  console.log('Mapbox 围栏渲染（占位实现）', props.geofences);
}

watch(() => props.geofences, () => {
  renderGeofences();
}, { deep: true });
let markerDragState: {
  item: MediaItem;
  marker: mapboxgl.Marker;
  element: HTMLElement;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  tipOffsetX: number;
  tipOffsetY: number;
  moved: boolean;
} | null = null;

// Map block: owns Mapbox state, search text, mouse coordinate, and expanded marker path.
const mapModel = reactive({
  hint: '未加载',
  searchKeyword: '',
  searching: false,
  mouseCoord: null as { lng: number; lat: number } | null,
  coordinateSystem: 'wgs84' as CoordinateSystem,
  layerMode: 'standard' as MapLayerMode,
  satelliteRoadNet: true,
  expandedPath: '',
  draggingMarkerId: '',
  suppressMarkerClickUntil: 0,
  searchSuggestions: [] as SearchSuggestion[],
});

const mouseCoordText = computed(() => {
  if (!mapModel.mouseCoord) {
    return null;
  }

  // Mapbox 返回的是 WGS84，需要转为 GCJ-02 以便显示双坐标
  const gcj02 = wgs84ToGcj02(mapModel.mouseCoord.lng, mapModel.mouseCoord.lat);
  return formatGcj02Wgs84CoordinateText(gcj02.lng, gcj02.lat);
});

async function ensureMap(): Promise<void> {
  if (!props.mapboxAccessToken || !mapEl.value || map) {
    if (!props.mapboxAccessToken) {
      mapModel.hint = '需要 Mapbox Access Token';
    }
    return;
  }

  try {
    await loadMapbox(props.mapboxAccessToken);

    map = new mapboxgl.Map({
      container: mapEl.value,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: DEFAULT_CENTER,
      zoom: INITIAL_ZOOM,
      projection: 'mercator',
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new mapboxgl.ScaleControl(), 'bottom-left');

    map.on('mousemove', (event) => {
      mapModel.mouseCoord = {
        lng: event.lngLat.lng,
        lat: event.lngLat.lat,
      };
    });

    map.on('click', (event) => {
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

    mapModel.hint = '已连接';
    emit('ready');

    // 等待地图完全加载后再渲染标记点
    if (map.loaded()) {
      renderMarkers();
    } else {
      map.once('load', () => {
        renderMarkers();
      });
    }
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
  if (!map) {
    return;
  }

  event.preventDefault();
  const droppedPath = event.dataTransfer?.getData('text/plain');
  const item = props.items.find((entry) => entry.path === droppedPath || entry.id === droppedPath);
  if (!item) {
    return;
  }

  clearSearchMarker();
  const rect = map.getContainer().getBoundingClientRect();
  const point = map.unproject([event.clientX - rect.left, event.clientY - rect.top]);

  emit('select', item);
  emit('place', {
    path: item.path,
    longitude: point.lng,
    latitude: point.lat,
  });
}

async function searchAddress(): Promise<void> {
  if (!mapModel.searchKeyword.trim()) {
    return;
  }

  await locateKeyword(mapModel.searchKeyword.trim());
}

async function fetchSearchSuggestions(keyword: string, callback: (items: SearchSuggestion[]) => void): Promise<void> {
  if (!props.mapboxAccessToken || !keyword.trim()) {
    callback([]);
    return;
  }

  try {
    const suggestions = await searchMapboxAddress(keyword.trim(), props.mapboxAccessToken);
    mapModel.searchSuggestions = suggestions;
    callback(suggestions.map(s => ({ ...s, value: s.place_name })));
  } catch (error) {
    console.error('Mapbox 搜索建议失败:', error);
    callback([]);
  }
}

async function handleSuggestionSelect(suggestion: any): Promise<void> {
  mapModel.searchKeyword = suggestion.place_name || suggestion.value;
  const item = mapModel.searchSuggestions.find(s => s.id === suggestion.id || s.place_name === suggestion.value);

  if (item?.center) {
    moveToSearchResult(item.center[0], item.center[1], item.name || item.place_name);
    ElMessage.success('已定位到搜索结果');
  }
}

async function locateKeyword(keyword: string): Promise<void> {
  if (!map || !props.mapboxAccessToken || !keyword.trim()) {
    return;
  }

  mapModel.searching = true;
  try {
    const results = await searchMapboxAddress(keyword.trim(), props.mapboxAccessToken);
    mapModel.searching = false;

    if (results.length > 0) {
      const first = results[0];
      moveToSearchResult(first.center[0], first.center[1], first.name || first.place_name);
      ElMessage.success('已定位到搜索结果');
    } else {
      ElMessage.warning('没有找到这个地址');
    }
  } catch (error) {
    mapModel.searching = false;
    ElMessage.error('搜索失败');
  }
}

function moveToSearchResult(lng: number, lat: number, label: string): void {
  map?.flyTo({ center: [lng, lat], zoom: SEARCH_RESULT_ZOOM });
  showSearchMarker(lng, lat, label);
}

function showSearchMarker(lng: number, lat: number, label: string): void {
  if (!map) {
    return;
  }

  clearSearchMarker();
  const content = createSearchMarkerContent(label);
  searchMarker = new mapboxgl.Marker({ element: content, anchor: 'bottom' })
    .setLngLat([lng, lat])
    .addTo(map);
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
  if (searchMarker) {
    searchMarker.remove();
    searchMarker = null;
  }
}

function switchMapLayer(mode: MapLayerMode): void {
  if (!map) {
    return;
  }

  mapModel.layerMode = mode;
  applyMapStyle();
}

function toggleSatelliteRoadNet(value: boolean): void {
  mapModel.satelliteRoadNet = value;
  applyMapStyle();
}

function applyMapStyle(): void {
  if (!map) {
    return;
  }

  let style = 'mapbox://styles/mapbox/streets-v12';

  if (mapModel.layerMode === 'satellite') {
    // 卫星图：根据路网开关选择样式
    // satellite-streets-v12 使用标准的路网颜色，和 streets-v12 一致
    style = mapModel.satelliteRoadNet
      ? 'mapbox://styles/mapbox/satellite-streets-v12'  // 带路网（标准颜色）
      : 'mapbox://styles/mapbox/satellite-v9';          // 纯卫星图
  }

  map.setStyle(style);
}


async function copyLngLat(lng: number, lat: number): Promise<void> {
  // Mapbox 返回的是 WGS84，需要转为 GCJ-02 以便显示双坐标
  const gcj02 = wgs84ToGcj02(lng, lat);
  const coordinateText = formatGcj02Wgs84CoordinateText(gcj02.lng, gcj02.lat);
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
  if (!map) {
    return;
  }

  markers.forEach((marker) => marker.remove());
  markers = [];

  const currentMap = map; // 类型守卫：确保后续代码使用的是非 null 的 map
  props.items
    .filter((item) => item.hasGps && typeof item.longitude === 'number' && typeof item.latitude === 'number')
    .forEach((item) => {
      // Mapbox 使用 WGS84，数据库存的就是 WGS84，直接使用
      const expanded = isMapMarkerExpanded(mapModel.expandedPath, item.path);
      const markerContent = createMarkerContent(item, expanded);

      const marker = new mapboxgl.Marker({
        element: markerContent,
        anchor: 'bottom',
        draggable: false,
        offset: [0, 0],
      })
        .setLngLat([item.longitude as number, item.latitude as number])
        .addTo(currentMap);

      markers.push(marker);
    });

  const selected = props.items.find((item) => item.path === props.selectedPath);
  if (selected?.hasGps && typeof selected.longitude === 'number' && typeof selected.latitude === 'number') {
    map.setCenter([selected.longitude, selected.latitude]);
  }
}

function createMarkerContent(item: MediaItem, expanded: boolean): HTMLElement {
  const container = document.createElement('div');
  container.setAttribute('role', 'button');
  container.tabIndex = 0;
  container.className = `map-media-marker${item.path === props.selectedPath ? ' selected' : ''}${expanded ? ' expanded' : ''}`;
  container.title = item.name;

  // 设置 z-index：展开或选中的标记点层级更高
  const zIndex = item.path === props.selectedPath || expanded ? 300 : 100;
  container.style.zIndex = String(zIndex);

  // 重置所有可能影响定位的样式
  container.style.position = 'absolute';
  container.style.left = '0';
  container.style.top = '0';
  container.style.transform = 'none';
  container.style.margin = '0';
  container.style.padding = '0 0 12px';
  container.addEventListener('pointerdown', (event) => {
    beginMarkerDrag(item, container, event);
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

  if (shouldShowMapImagePreviewButton(item.mediaType, expanded)) {
    bubble.appendChild(createMarkerImagePreviewLink(item));
  }

  const label = document.createElement('span');
  label.className = expanded ? 'marker-label marker-label-expanded' : 'marker-label';
  label.textContent = item.gpsSource === 'xmp' ? 'XMP' : 'GPS';
  bubble.appendChild(label);

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
  link.className = 'marker-media-action';
  link.href = getMediaFileUrl(item.path);
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.innerHTML = '<svg class="icon" viewBox="0 0 1024 1024"><path fill="currentColor" d="M768 256H353.6a32 32 0 1 1 0-64H800a32 32 0 0 1 32 32v448a32 32 0 0 1-64 0V256z"/><path fill="currentColor" d="M777.344 201.344a32 32 0 0 1 45.312 45.312l-544 544a32 32 0 0 1-45.312-45.312l544-544z"/></svg>';
  link.setAttribute('aria-label', `在新标签页播放 ${item.name}`);
  link.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });
  link.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  return link;
}

function createMarkerImagePreviewLink(item: MediaItem): HTMLElement {
  const link = document.createElement('a');
  link.className = 'marker-media-action';
  link.href = getMediaFileUrl(item.path);
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.innerHTML = '<svg class="icon" viewBox="0 0 1024 1024"><path fill="currentColor" d="M768 256H353.6a32 32 0 1 1 0-64H800a32 32 0 0 1 32 32v448a32 32 0 0 1-64 0V256z"/><path fill="currentColor" d="M777.344 201.344a32 32 0 0 1 45.312 45.312l-544 544a32 32 0 0 1-45.312-45.312l544-544z"/></svg>';
  link.setAttribute('aria-label', `在新标签页查看 ${item.name}`);
  link.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });
  link.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  return link;
}

function beginMarkerDrag(item: MediaItem, element: HTMLElement, event: PointerEvent): void {
  if (!map) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  clearSearchMarker();

  const marker = markers.find(m => {
    const lngLat = m.getLngLat();
    return lngLat.lng === item.longitude && lngLat.lat === item.latitude;
  });

  if (!marker) {
    return;
  }

  const rect = element.getBoundingClientRect();
  markerDragState = {
    item,
    marker,
    element,
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
  if (map.dragPan) {
    map.dragPan.disable();
  }
}

function handleMarkerPointerMove(event: PointerEvent): void {
  if (!markerDragState || markerDragState.pointerId !== event.pointerId || !map) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const movedDistance = Math.hypot(event.clientX - markerDragState.startClientX, event.clientY - markerDragState.startClientY);
  markerDragState.moved = markerDragState.moved || movedDistance > 3;

  const rect = map.getContainer().getBoundingClientRect();
  const point = map.unproject([
    event.clientX + markerDragState.tipOffsetX - rect.left,
    event.clientY + markerDragState.tipOffsetY - rect.top,
  ]);

  markerDragState.marker.setLngLat(point);
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
    restoreMapDrag();
    return;
  }

  cleanupMarkerDragListeners();
  mapModel.draggingMarkerId = '';
  if (state.moved) {
    mapModel.suppressMarkerClickUntil = Date.now() + 350;
  }
  restoreMapDrag();

  if (!state.moved) {
    markerDragState = null;
    return;
  }

  const lnglat = state.marker.getLngLat();
  markerDragState = null;
  if (!lnglat || !Number.isFinite(lnglat.lng) || !Number.isFinite(lnglat.lat)) {
    return;
  }

  emit('select', state.item);
  emit('place', {
    path: state.item.path,
    longitude: lnglat.lng,
    latitude: lnglat.lat,
  });
}

function cancelMarkerDrag(): void {
  cleanupMarkerDragListeners();
  markerDragState = null;
  mapModel.draggingMarkerId = '';
  restoreMapDrag();
}

function cleanupMarkerDragListeners(): void {
  document.removeEventListener('pointermove', handleMarkerPointerMove);
  document.removeEventListener('pointerup', handleMarkerPointerUp);
  document.removeEventListener('pointercancel', handleMarkerPointerCancel);
}

function restoreMapDrag(): void {
  if (map?.dragPan) {
    map.dragPan.enable();
  }
}

watch(
  () => [props.mapboxAccessToken, props.items, props.selectedPath, mapModel.expandedPath],
  async () => {
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
  const container = map?.getContainer?.();
  container?.removeEventListener?.('dragover', handleDragOver);
  container?.removeEventListener?.('drop', handleDrop);
  map?.remove?.();
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
        value-key="place_name"
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
