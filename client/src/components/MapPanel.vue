<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import type { MediaItem } from '@shared/contracts';
import {
  formatGcj02Wgs84CoordinateText,
  gcj02ToWgs84,
  getCoordinateLabelTextForSystem,
  getCoordinateValueTextForSystem,
  type CoordinateSystem,
  wgs84ToGcj02,
} from '@shared/gps';
import { getMediaThumbnailUrl } from '@/api';
import { loadAmap, loadAmapPlugins } from '@/lib/amap';
import { formatAmapSuggestions, normalizeAmapLngLat, type AmapSearchSuggestion } from '@/lib/amapSearch';

const INITIAL_ZOOM = 11;
const SEARCH_RESULT_ZOOM = 17;
const DEFAULT_CENTER = [116.397428, 39.90923];
type MapLayerMode = 'standard' | 'satellite';

type SearchSuggestion = AmapSearchSuggestion;

const props = withDefaults(
  defineProps<{
    amapKey: string;
    amapSecurityCode?: string;
    items: MediaItem[];
    selectedId: string;
    loading: boolean;
  }>(),
  {
    amapSecurityCode: '',
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

// Map block: owns AMap state, search text, raw AMap hover coordinate, and expanded marker id.
const mapModel = reactive({
  hint: '未加载',
  searchKeyword: '',
  searching: false,
  mouseCoord: null as { lng: number; lat: number } | null,
  coordinateSystem: 'gcj02' as CoordinateSystem,
  layerMode: 'standard' as MapLayerMode,
  satelliteRoadNet: false,
  expandedId: '',
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
  if (!props.amapKey || !mapEl.value || map) {
    if (!props.amapKey) {
      mapModel.hint = '需要高德 Key';
    }
    return;
  }

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
      if (mapModel.expandedId) {
        mapModel.expandedId = '';
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
    await navigator.clipboard.writeText(text);
    ElMessage.success(`已复制 ${labelText}`);
  } catch {
    ElMessage.error(`复制 ${labelText} 失败`);
  }
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
      const expanded = mapModel.expandedId === item.id;
      let marker: any = null;
      const markerContent = createMarkerContent(item, expanded, () => marker);
      marker = new window.AMap.Marker({
        position: [point.lng, point.lat],
        content: markerContent,
        anchor: 'bottom-center',
        offset: new window.AMap.Pixel(0, 0),
        cursor: 'move',
        zIndex: item.id === props.selectedId || expanded ? 300 : 100,
      });

      map.add(marker);
      markers.push(marker);
    });

  const selected = props.items.find((item) => item.id === props.selectedId);
  if (selected?.hasGps && typeof selected.longitude === 'number' && typeof selected.latitude === 'number') {
    const point = wgs84ToGcj02(selected.longitude, selected.latitude);
    map.setCenter([point.lng, point.lat]);
  }
}

function createMarkerContent(item: MediaItem, expanded: boolean, getMarker: () => any): HTMLElement {
  const container = document.createElement('button');
  container.type = 'button';
  container.className = `map-media-marker${item.id === props.selectedId ? ' selected' : ''}${expanded ? ' expanded' : ''}`;
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
    mapModel.expandedId = mapModel.expandedId === item.id ? '' : item.id;
    renderMarkers();
  });

  const bubble = document.createElement('span');
  bubble.className = 'marker-bubble';
  container.appendChild(bubble);

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

  const label = document.createElement('span');
  label.className = 'marker-label';
  label.textContent = item.gpsSource === 'xmp' ? 'XMP' : 'GPS';
  bubble.appendChild(label);

  const pointer = document.createElement('span');
  pointer.className = 'marker-pointer';
  container.appendChild(pointer);

  return container;
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
  () => [props.amapKey, props.amapSecurityCode, props.items, props.selectedId, mapModel.expandedId],
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
  <section class="map-panel" v-loading="loading">
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
