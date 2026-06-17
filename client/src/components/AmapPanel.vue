<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import type { MediaItem, Geofence } from '@shared/contracts';
import {
  formatGcj02Wgs84CoordinateText,
  gcj02ToWgs84,
  getCoordinateLabelTextForSystem,
  getCoordinateValueTextForSystem,
  type CoordinateSystem,
  wgs84ToGcj02,
} from '@shared/gps';
import { writeClientLog } from '@/api';
import { loadAmap } from '@/lib/amap';
import {
  copyTextWithFallback,
  createClipboardLogDetails,
} from '@/lib/clipboard';
import {
  createMarkerContent as createMarkerContentDom,
  createSearchMarkerContent,
} from '@/lib/amapMarkerDom';
import GeofenceEditPanel from './GeofenceEditPanel.vue';
import ClusterItemList from './ClusterItemList.vue';
import { formatAmapSuggestions, normalizeAmapLngLat, type AmapSearchSuggestion } from '@/lib/amapSearch';
import {
  getNextExpandedPath,
  isMapMarkerExpanded,
} from '@/lib/mapMarkerMedia';

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
    selectedPath: string;
    geofences: Geofence[];
    editingGeofenceId: string;
    drawingMode: boolean;
    enableClickToCopy: boolean;
    enableMarkerClustering: boolean;
  }>(),
  {
    amapSecurityCode: '',
    geofences: () => [],
    editingGeofenceId: '',
    drawingMode: false,
    enableClickToCopy: false,
    enableMarkerClustering: false,
  },
);

const emit = defineEmits<{
  select: [item: MediaItem];
  place: [payload: { path: string; longitude: number; latitude: number }];
  ready: [];
  error: [message: string];
  geofenceDrawn: [id: string, coordinates: Array<{ longitude: number; latitude: number }>];
  geofenceEdited: [id: string, coordinates: Array<{ longitude: number; latitude: number }>];
  cancelEdit: [];
}>();

const mapEl = ref<HTMLDivElement | null>(null);
let map: any = null;
let autocomplete: any = null;
let placeSearch: any = null;
let standardLayer: any = null;
let satelliteLayer: any = null;
let roadNetLayer: any = null;
let markers: any[] = [];
let markerCluster: any = null;
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

let geofencePolygons: Map<string, any> = new Map();
let mouseTool: any = null;
let polygonEditor: any = null;
const currentEditingPolygon = ref<any>(null);
const polygonUpdateTrigger = ref(0); // 用于触发面板更新

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

// Cluster block: owns cluster list state
const clusterModel = reactive({
  listVisible: false,
  listItems: [] as MediaItem[],
  listPosition: null as { x: number; y: number } | null,
  currentClusterKey: '', // 当前聚合点的唯一标识（用于追踪）
  activeClusterElement: null as HTMLElement | null, // 当前激活的聚合点 DOM 元素
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
    await loadAmap(props.amapKey, props.amapSecurityCode, [
      'AMap.ToolBar',
      'AMap.Scale',
      'AMap.AutoComplete',
      'AMap.PlaceSearch',
      'AMap.MouseTool',
      'AMap.PolygonEditor',
      'AMap.MarkerCluster',
    ]);
    const AMap = window.AMap;

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

      // 检查是否点击了聚合点
      const target = event.originEvent?.target;
      if (target && target.classList && target.classList.contains('cluster-marker')) {
        // 聚合点点击由其自己的事件处理
        return;
      }

      if (props.enableClickToCopy) {
        void copyLngLat(event.lnglat.lng, event.lnglat.lat);
      }
    });

    // 监听 zoom 变化，关闭聚合列表
    map.on('zoomend', () => {
      if (clusterModel.listVisible) {
        handleCloseClusterList();
      }
    });

    const container = map.getContainer();
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('drop', handleDrop);

    mapModel.hint = '已连接';
    emit('ready');
    renderMarkers();
    renderGeofences();
  } catch (error) {
    const message = error instanceof Error ? error.message : '高德地图加载失败';
    mapModel.hint = message;
    emit('error', message);
  }
}

function renderGeofences(): void {
  if (!map) return;

  clearGeofencePolygons();

  for (const geofence of props.geofences) {
    if (geofence.coordinates.length < 3) continue;

    const gcj02Path = geofence.coordinates.map(coord => {
      const gcj = wgs84ToGcj02(coord.longitude, coord.latitude);
      return [gcj.lng, gcj.lat];
    });

    const polygon = new (window as any).AMap.Polygon({
      path: gcj02Path,
      fillColor: geofence.color,
      fillOpacity: 0.3,
      strokeColor: geofence.color,
      strokeWeight: 2,
      strokeOpacity: 0.8,
      bubble: true,
    });

    polygon.setMap(map);
    geofencePolygons.set(geofence.id, polygon);

    polygon.on('click', () => {
      if (!props.drawingMode && props.editingGeofenceId !== geofence.id) {
        fitGeofenceBounds(geofence);
      }
    });
  }
}

function clearGeofencePolygons(): void {
  geofencePolygons.forEach(polygon => {
    polygon.setMap(null);
  });
  geofencePolygons.clear();
}

function fitGeofenceBounds(geofence: Geofence): void {
  if (!map || geofence.coordinates.length === 0) return;

  const gcj02Bounds = geofence.coordinates.map(coord => {
    const gcj = wgs84ToGcj02(coord.longitude, coord.latitude);
    return [gcj.lng, gcj.lat];
  });

  map.setFitView([geofencePolygons.get(geofence.id)]);
}

function startDrawingGeofence(geofenceId: string): void {
  if (!map) return;

  const AMap = (window as any).AMap;

  if (!mouseTool) {
    mouseTool = new AMap.MouseTool(map);
  }

  // 清理旧的事件监听
  mouseTool.off('draw');

  const geofence = props.geofences.find(g => g.id === geofenceId);
  const color = geofence?.color || '#FF5733';

  // 先监听绘制完成事件
  mouseTool.on('draw', (event: any) => {
    const polygon = event.obj;
    const path = polygon.getPath();

    if (path.length < 3) {
      ElMessage.error('多边形至少需要3个顶点');
      map?.remove(polygon);
      return;
    }
    // 新建围栏时，保存临时多边形并切换到编辑模式
    // 不自动保存，等待用户点击面板的确认按钮
    currentEditingPolygon.value = polygon;

    // 创建编辑器并打开编辑模式
    if (!polygonEditor) {
      const AMap = (window as any).AMap;
      polygonEditor = new AMap.PolygonEditor(map);
    }

    // 监听编辑器事件，实时更新面板
    polygonEditor.off('adjust');
    polygonEditor.off('addnode');
    polygonEditor.off('removenode');
    polygonEditor.off('move');

    polygonEditor.on('adjust', () => {
      polygonUpdateTrigger.value++;
    });

    polygonEditor.on('addnode', () => {
      polygonUpdateTrigger.value++;
    });

    polygonEditor.on('removenode', () => {
      polygonUpdateTrigger.value++;
    });

    polygonEditor.on('move', () => {
      polygonUpdateTrigger.value++;
    });

    polygonEditor.setTarget(polygon);
    polygonEditor.open();

    // 关闭绘制工具
    mouseTool.close(false);
  });

  // 最后启动绘制模式
  mouseTool.polygon({
    fillColor: color,
    fillOpacity: 0.3,
    strokeColor: color,
    strokeWeight: 2,
  });
}

function startEditingGeofence(geofenceId: string): void {
  if (!map) return;

  const geofence = props.geofences.find(g => g.id === geofenceId);
  if (!geofence || geofence.coordinates.length < 3) return;

  const AMap = (window as any).AMap;

  // 先隐藏原有的围栏多边形，避免重复显示
  const existingPolygon = geofencePolygons.get(geofenceId);
  if (existingPolygon) {
    existingPolygon.setMap(null);
  }

  const gcj02Path = geofence.coordinates.map(coord => {
    const gcj = wgs84ToGcj02(coord.longitude, coord.latitude);
    return new AMap.LngLat(gcj.lng, gcj.lat);
  });

  // 创建多边形用于编辑
  const polygon = new AMap.Polygon({
    path: gcj02Path,
    fillColor: geofence.color,
    fillOpacity: 0.3,
    strokeColor: geofence.color,
    strokeWeight: 2,
    draggable: true, // 允许拖动整个多边形
  });

  map.add(polygon);
  currentEditingPolygon.value = polygon;

  // 创建编辑器
  if (!polygonEditor) {
    polygonEditor = new AMap.PolygonEditor(map);
  }

  // 监听编辑器事件，实时更新面板
  polygonEditor.off('adjust');
  polygonEditor.off('addnode');
  polygonEditor.off('removenode');
  polygonEditor.off('move');

  polygonEditor.on('adjust', () => {
    polygonUpdateTrigger.value++;
  });

  polygonEditor.on('addnode', () => {
    polygonUpdateTrigger.value++;
  });

  polygonEditor.on('removenode', () => {
    polygonUpdateTrigger.value++;
  });

  polygonEditor.on('move', () => {
    polygonUpdateTrigger.value++;
  });

  polygonEditor.setTarget(polygon);
  polygonEditor.open();

  // 不再监听 end 事件，改为通过面板按钮手动保存
}

function stopDrawingOrEditing(): void {
  if (mouseTool) {
    mouseTool.close(true);
  }

  if (polygonEditor) {
    polygonEditor.close();
  }

  if (currentEditingPolygon.value) {
    currentEditingPolygon.value.setMap(null);
    currentEditingPolygon.value = null;
  }

  renderGeofences();
}

// 获取当前编辑的坐标（响应式计算）
const currentEditingCoordinates = computed(() => {
  // 依赖 polygonUpdateTrigger 来触发更新
  polygonUpdateTrigger.value;

  if (!currentEditingPolygon.value) return [];

  const path = currentEditingPolygon.value.getPath();
  return path.map((lngLat: any) => {
    const wgs = gcj02ToWgs84(lngLat.lng, lngLat.lat);
    return { longitude: wgs.lng, latitude: wgs.lat };
  });
});

// 处理确认保存
function handleConfirmEdit(): void {
  if (!props.editingGeofenceId || !currentEditingPolygon.value) return;

  const coordinates = currentEditingCoordinates.value;
  if (coordinates.length < 3) {
    ElMessage.error('多边形至少需要3个顶点');
    return;
  }

  // 必须先关闭编辑器
  if (polygonEditor) {
    polygonEditor.close();
  }

  if (mouseTool) {
    mouseTool.close(true);
  }

  // 使用 setMap(null) 而不是 map.remove() 来移除多边形
  if (currentEditingPolygon.value) {
    currentEditingPolygon.value.setMap(null);
    currentEditingPolygon.value = null;
  }

  const geofence = props.geofences.find(g => g.id === props.editingGeofenceId);
  if (geofence && geofence.coordinates.length === 0) {
    // 新建模式
    emit('geofenceDrawn', props.editingGeofenceId, coordinates);
  } else {
    // 编辑模式
    emit('geofenceEdited', props.editingGeofenceId, coordinates);
  }

  // 父组件更新后，watch 会自动触发 renderGeofences，这里不需要再调用
}

// 处理取消编辑
function handleCancelEdit(): void {
  stopDrawingOrEditing();
  emit('cancelEdit');
}

function handleDragOver(event: DragEvent): void {
  event.preventDefault();
}

function handleDrop(event: DragEvent): void {
  if (!map || !window.AMap) {
    return;
  }

  event.preventDefault();

  // 尝试解析批量拖拽数据
  const jsonData = event.dataTransfer?.getData('application/json');
  if (jsonData) {
    try {
      const batchData = JSON.parse(jsonData);
      if (batchData.type === 'batch' && Array.isArray(batchData.paths)) {
        handleBatchDrop(batchData.paths, event);
        return;
      }
    } catch (e) {
      // 不是有效的批量数据，继续单个处理
    }
  }

  // 单个拖拽处理（原有逻辑）
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

function handleBatchDrop(paths: string[], event: DragEvent): void {
  if (!map || !window.AMap) return;

  clearSearchMarker();
  const container = map.getContainer();
  const rect = container.getBoundingClientRect();
  const pixel = new window.AMap.Pixel(event.clientX - rect.left, event.clientY - rect.top);
  const lnglat = map.containerToLngLat(pixel);
  const wgs84 = gcj02ToWgs84(lnglat.lng, lnglat.lat);

  const positions = generateRandomPositions(wgs84.lng, wgs84.lat, paths.length);

  // 批量触发 place 事件
  positions.forEach((pos, index) => {
    emit('place', {
      path: paths[index],
      longitude: pos.longitude,
      latitude: pos.latitude,
    });
  });
}

function generateRandomPositions(
  centerLng: number,
  centerLat: number,
  count: number
): Array<{ longitude: number; latitude: number }> {
  const positions = [];
  const radiusMeters = 10;

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * 2 * Math.PI;
    const radius = Math.sqrt(Math.random()) * radiusMeters;

    const latOffset = (radius * Math.cos(angle)) / 111320;
    const lngOffset = (radius * Math.sin(angle)) / (111320 * Math.cos(centerLat * Math.PI / 180));

    positions.push({
      longitude: centerLng + lngOffset,
      latitude: centerLat + latOffset,
    });
  }

  return positions;
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

function renderMarkers(): void {
  if (!map || !window.AMap) {
    return;
  }

  // 清理旧的标记和聚合
  markers.forEach((marker) => marker.remove());
  markers = [];

  if (markerCluster) {
    markerCluster.setMap(null);
    markerCluster = null;
  }

  // 清除聚合点高亮
  if (clusterModel.activeClusterElement) {
    clusterModel.activeClusterElement.classList.remove('active');
    clusterModel.activeClusterElement = null;
  }

  const itemsWithGps = props.items.filter(
    (item) => item.hasGps && typeof item.longitude === 'number' && typeof item.latitude === 'number'
  );

  // 如果不启用聚合，使用旧的渲染方式
  if (!props.enableMarkerClustering) {
    itemsWithGps.forEach((item) => {
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
    return;
  }

  // 启用聚合：创建聚合数据点
  const clusterData = itemsWithGps.map((item) => {
    const point = wgs84ToGcj02(item.longitude as number, item.latitude as number);
    return {
      lnglat: [point.lng, point.lat],
      weight: 1,
      item: item, // 存储媒体项数据
    };
  });

  // 创建聚合实例
  if (clusterData.length > 0) {
    markerCluster = new window.AMap.MarkerCluster(map, clusterData, {
      gridSize: 60,
      maxZoom: 16,
      renderClusterMarker: renderClusterMarker,
      renderMarker: renderSingleMarker,
    });

    // 监听聚合点点击事件
    markerCluster.on('click', (event: any) => {
      // 移除之前的高亮
      if (clusterModel.activeClusterElement) {
        clusterModel.activeClusterElement.classList.remove('active');
      }

      // 直接从 event.clusterData 获取数据（这是高德提供的聚合数据）
      const clusterData = event.clusterData;
      if (!clusterData || !Array.isArray(clusterData)) {
        return;
      }

      // 从 clusterData 中提取媒体项
      const items = clusterData
        .map((data: any) => data.item)
        .filter(Boolean) as MediaItem[];

      if (items.length === 0) {
        return;
      }

      // 生成聚合点的唯一标识（仅基于位置，不包含数量，以便拖拽后保持激活）
      const position = event.lnglat;
      const clusterKey = `${position.lng.toFixed(5)}_${position.lat.toFixed(5)}`;

      // 获取被点击的聚合点 DOM 元素并高亮
      const clusterElement = event.marker?.getContent?.();
      if (clusterElement && clusterElement.classList) {
        clusterElement.classList.add('active');
        clusterModel.activeClusterElement = clusterElement;
      }

      // 显示列表
      clusterModel.listItems = items;
      clusterModel.listPosition = null;
      clusterModel.currentClusterKey = clusterKey;
      clusterModel.listVisible = true;
    });
  }

  const selected = props.items.find((item) => item.path === props.selectedPath);
  if (selected?.hasGps && typeof selected.longitude === 'number' && typeof selected.latitude === 'number') {
    const point = wgs84ToGcj02(selected.longitude, selected.latitude);
    map.setCenter([point.lng, point.lat]);
  }
}

// 渲染聚合点标记
function renderClusterMarker(context: any): void {
  const count = context.count;
  const marker = context.marker;

  const div = document.createElement('div');
  div.className = 'cluster-marker';
  div.textContent = String(count);
  div.style.cursor = 'pointer';

  // 检查当前聚合点是否应该是激活状态（仅比较位置，不比较数量）
  if (clusterModel.listVisible && clusterModel.currentClusterKey) {
    const position = marker.getPosition();
    if (position) {
      const clusterKey = `${position.lng.toFixed(5)}_${position.lat.toFixed(5)}`;
      if (clusterKey === clusterModel.currentClusterKey) {
        div.classList.add('active');
        clusterModel.activeClusterElement = div;
      }
    }
  }

  context.marker.setContent(div);
  context.marker.setAnchor('center');
  context.marker.setOffset(new window.AMap.Pixel(0, 0));
}

// 渲染单个标记点
function renderSingleMarker(context: any): void {
  const data = context.data[0]; // 单个点的数据
  if (!data || !data.item) return;

  const item = data.item as MediaItem;
  const expanded = isMapMarkerExpanded(mapModel.expandedPath, item.path);

  let marker: any = context.marker;
  const markerContent = createMarkerContent(item, expanded, () => marker);

  // 重要：先设置锚点，再设置内容
  context.marker.setAnchor('bottom-center');
  context.marker.setOffset(new window.AMap.Pixel(0, 0));
  context.marker.setContent(markerContent);

  markers.push(context.marker);
}

function createMarkerContent(item: MediaItem, expanded: boolean, getMarker: () => any): HTMLElement {
  const container = createMarkerContentDom(item, expanded, item.path === props.selectedPath);

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

    // 切换展开状态
    const newExpandedPath = getNextExpandedPath(mapModel.expandedPath, item.path);
    const willExpand = newExpandedPath === item.path;
    const wasExpanded = mapModel.expandedPath === item.path;

    mapModel.expandedPath = newExpandedPath;

    // 如果是展开/收起操作，直接更新当前标记的内容，不重新渲染整个聚合
    if (willExpand || wasExpanded) {
      const marker = getMarker();
      if (marker) {
        const newContent = createMarkerContent(item, willExpand, () => marker);
        marker.setContent(newContent);
      }
    } else {
      // 如果是切换到不同的标记，需要重新渲染
      renderMarkers();
    }
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

// 关闭聚合列表并恢复聚合点样式
function handleCloseClusterList(): void {
  clusterModel.listVisible = false;
  clusterModel.currentClusterKey = '';
  if (clusterModel.activeClusterElement) {
    clusterModel.activeClusterElement.classList.remove('active');
    clusterModel.activeClusterElement = null;
  }
}

watch(() => props.geofences, () => {
  renderGeofences();
}, { deep: true });

watch(() => [props.editingGeofenceId, props.drawingMode] as const, ([id, drawing]) => {
  if (!id) {
    stopDrawingOrEditing();
    return;
  }

  const geofence = props.geofences.find(g => g.id === id);
  if (!geofence) return;

  if (drawing) {
    if (geofence.coordinates.length === 0) {
      startDrawingGeofence(id);
    } else {
      startEditingGeofence(id);
    }
  } else {
    stopDrawingOrEditing();
    fitGeofenceBounds(geofence);
  }
});

// 更新聚合列表（当媒体项变化时）
function updateClusterListAfterChange(): void {
  if (!clusterModel.currentClusterKey || !map) {
    return;
  }

  // 先从当前列表中获取最新数据
  const listPaths = clusterModel.listItems.map((item) => item.path);
  const updatedItems = listPaths
    .map((path) => props.items.find((item) => item.path === path))
    .filter(Boolean) as MediaItem[];

  // 获取所有有 GPS 的媒体项（不限于列表中的）
  const allItemsWithGps = props.items.filter(
    (item) => item.hasGps && typeof item.longitude === 'number' && typeof item.latitude === 'number'
  );

  // 如果列表中的媒体项都没有 GPS 了
  const listItemsWithGps = updatedItems.filter(
    (item) => item.hasGps && typeof item.longitude === 'number' && typeof item.latitude === 'number'
  );

  if (listItemsWithGps.length === 0) {
    handleCloseClusterList();
    return;
  }

  // 计算当前列表媒体项的中心位置
  let sumLng = 0;
  let sumLat = 0;
  listItemsWithGps.forEach((item) => {
    const point = wgs84ToGcj02(item.longitude as number, item.latitude as number);
    sumLng += point.lng;
    sumLat += point.lat;
  });
  const centerLng = sumLng / listItemsWithGps.length;
  const centerLat = sumLat / listItemsWithGps.length;

  // 计算聚合半径
  const zoom = map.getZoom();
  const metersPerPixel = (40075000 * Math.cos(centerLat * Math.PI / 180)) / (256 * Math.pow(2, zoom));
  const radiusMeters = 60 * metersPerPixel; // gridSize = 60
  const radiusDegrees = radiusMeters / 111320;

  // 从所有媒体项中，找出在聚合范围内的（包括新拖进来的）
  const itemsInCluster = allItemsWithGps.filter((item) => {
    const point = wgs84ToGcj02(item.longitude as number, item.latitude as number);
    const distance = Math.sqrt(
      Math.pow(point.lng - centerLng, 2) + Math.pow(point.lat - centerLat, 2)
    );
    return distance <= radiusDegrees;
  });

  if (itemsInCluster.length <= 1) {
    // 只剩 1 个或 0 个点了，关闭列表
    handleCloseClusterList();
    return;
  }

  // 更新列表内容（包括新增的和移除的）
  clusterModel.listItems = itemsInCluster;
}

watch(
  () => [props.amapKey, props.amapSecurityCode, props.items, props.selectedPath, mapModel.expandedPath],
  async () => {
    // 如果列表正在显示，需要检查当前聚合点是否还存在
    if (clusterModel.listVisible && clusterModel.currentClusterKey) {
      updateClusterListAfterChange();
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
  if (markerCluster) {
    markerCluster.setMap(null);
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
    <GeofenceEditPanel
      v-if="drawingMode && editingGeofenceId && currentEditingPolygon"
      :geofence="geofences.find(g => g.id === editingGeofenceId)!"
      :coordinates="currentEditingCoordinates"
      @confirm="handleConfirmEdit"
      @cancel="handleCancelEdit"
    />

    <ClusterItemList
      :visible="clusterModel.listVisible"
      :items="clusterModel.listItems"
      :position="clusterModel.listPosition"
      :fixed-position="true"
      @close="handleCloseClusterList"
    />

    <el-tag class="map-hint" effect="light">{{ mapModel.hint }}</el-tag>

    <slot />
  </section>
</template>
