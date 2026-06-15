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
import GeofenceEditPanel from './GeofenceEditPanel.vue';
import ClusterItemList from './ClusterItemList.vue';
import {
  getMapMarkerMediaMode,
  getNextExpandedPath,
  isMapMarkerExpanded,
  shouldShowMapVideoPlayButton,
  shouldShowMapImagePreviewButton,
} from '@/lib/mapMarkerMedia';
// @ts-ignore - Mapbox Draw 类型定义可能不完整
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';

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
    enableClickToCopy: boolean;
  }>(),
  {
    geofences: () => [],
    editingGeofenceId: '',
    drawingMode: false,
    enableClickToCopy: false,
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
let map: mapboxgl.Map | null = null;
let markers: mapboxgl.Marker[] = [];
let searchMarker: mapboxgl.Marker | null = null;
let draw: any = null;
let geofencePolygonIds: Map<string, string> = new Map();
let updateMarkersTimer: number | null = null;
let updateAfterDragTimer: number | null = null;

function renderGeofences(): void {
  if (!map || !draw) return;

  // 清除 Draw 中的围栏
  geofencePolygonIds.forEach((drawId) => {
    try {
      draw.delete(drawId);
    } catch (e) {
      // 忽略删除错误
    }
  });
  geofencePolygonIds.clear();

  // 使用原生 Mapbox GL 图层显示围栏
  const geojson = {
    type: 'FeatureCollection',
    features: props.geofences
      .filter(g => g.coordinates.length >= 3)
      .map(geofence => ({
        type: 'Feature',
        id: geofence.id,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              ...geofence.coordinates.map(coord => [coord.longitude, coord.latitude]),
              [geofence.coordinates[0].longitude, geofence.coordinates[0].latitude], // 闭合
            ],
          ],
        },
        properties: {
          id: geofence.id,
          color: geofence.color,
          name: geofence.name,
        },
      })),
  };

  // 更新数据源
  const source = map.getSource('geofences-source') as mapboxgl.GeoJSONSource;
  if (source) {
    source.setData(geojson as any);
  }
}


function startDrawingGeofence(geofenceId: string): void {
  if (!draw) return;

  draw.changeMode('draw_polygon');
}

function startEditingGeofence(geofenceId: string): void {
  if (!draw) return;

  const geofence = props.geofences.find(g => g.id === geofenceId);
  if (!geofence || geofence.coordinates.length < 3) return;

  // 将围栏添加到 Draw 进行编辑
  const coordinates = geofence.coordinates.map(coord => [coord.longitude, coord.latitude]);
  coordinates.push([geofence.coordinates[0].longitude, geofence.coordinates[0].latitude]); // 闭合

  const polygon = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
    properties: {},
  };

  const featureIds = draw.add(polygon);
  if (featureIds && featureIds.length > 0) {
    const featureId = featureIds[0];
    geofencePolygonIds.set(geofenceId, featureId);
    draw.changeMode('direct_select', { featureId });
  }
}

function stopDrawingOrEditing(): void {
  if (!draw) return;

  draw.changeMode('simple_select');

  // 清除 Draw 中的所有围栏
  geofencePolygonIds.forEach((drawId) => {
    try {
      draw.delete(drawId);
    } catch (e) {
      // 忽略删除错误
    }
  });
  geofencePolygonIds.clear();
}

// 获取当前编辑的坐标
function getCurrentEditingCoordinates() {
  if (!draw || !props.editingGeofenceId) return [];

  const drawId = geofencePolygonIds.get(props.editingGeofenceId);
  if (!drawId) return [];

  const feature = draw.get(drawId);
  if (!feature || feature.geometry.type !== 'Polygon') return [];

  const coordinates = feature.geometry.coordinates[0].map((coord: number[]) => ({
    longitude: coord[0],
    latitude: coord[1],
  }));
  coordinates.pop(); // 移除闭合点

  return coordinates;
}

// 处理确认保存
function handleConfirmEdit(): void {
  if (!props.editingGeofenceId) return;

  const coordinates = getCurrentEditingCoordinates();
  if (coordinates.length < 3) {
    ElMessage.error('多边形至少需要3个顶点');
    return;
  }

  const geofence = props.geofences.find(g => g.id === props.editingGeofenceId);
  if (geofence && geofence.coordinates.length === 0) {
    // 新建模式
    emit('geofenceDrawn', props.editingGeofenceId, coordinates);
  } else {
    // 编辑模式
    emit('geofenceEdited', props.editingGeofenceId, coordinates);
  }

  stopDrawingOrEditing();
}

// 处理取消编辑
function handleCancelEdit(): void {
  stopDrawingOrEditing();
  emit('cancelEdit');
}

function handleDrawCreate(event: any): void {
  const feature = event.features[0];
  if (!feature || feature.geometry.type !== 'Polygon') return;

  const coordinates = feature.geometry.coordinates[0].map((coord: number[]) => ({
    longitude: coord[0],
    latitude: coord[1],
  }));
  coordinates.pop(); // 移除闭合点

  if (coordinates.length < 3) {
    ElMessage.error('多边形至少需要3个顶点');
    draw.delete(feature.id);
    return;
  }

  // 新建围栏时，保存映射关系
  if (props.editingGeofenceId) {
    geofencePolygonIds.set(props.editingGeofenceId, feature.id);

    // 切换到选择模式，允许继续编辑
    draw.changeMode('simple_select', { featureIds: [feature.id] });
  }
}

function handleDrawUpdate(event: any): void {
  // 不再自动保存，改为通过面板按钮手动保存
  // 只在这里做基本的验证，不触发保存事件
}

function fitGeofenceBounds(geofence: Geofence): void {
  if (!map || geofence.coordinates.length === 0) return;

  const bounds = new mapboxgl.LngLatBounds();
  geofence.coordinates.forEach(coord => {
    bounds.extend([coord.longitude, coord.latitude]);
  });

  map.fitBounds(bounds, { padding: 50 });
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

// Cluster block: owns cluster list state
const clusterModel = reactive({
  listVisible: false,
  listItems: [] as MediaItem[],
  listPosition: null as { x: number; y: number } | null,
  currentClusterId: null as number | null, // 当前聚合点的 cluster_id
  currentClusterLngLat: null as { lng: number; lat: number } | null, // 当前聚合点的位置
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

    // 初始化 MapboxDraw
    draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      clickBuffer: 0, // 禁用点击缓冲
      touchBuffer: 0, // 禁用触摸缓冲
      defaultMode: 'simple_select',
      styles: [
        // 自定义样式以支持不同颜色
        {
          id: 'gl-draw-polygon-fill-inactive',
          type: 'fill',
          filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          paint: {
            'fill-color': ['coalesce', ['get', 'user_color'], '#3bb2d0'],
            'fill-outline-color': ['coalesce', ['get', 'user_color'], '#3bb2d0'],
            'fill-opacity': 0.3,
          },
        },
        {
          id: 'gl-draw-polygon-stroke-inactive',
          type: 'line',
          filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': ['coalesce', ['get', 'user_color'], '#3bb2d0'],
            'line-width': 2,
          },
        },
        {
          id: 'gl-draw-polygon-fill-active',
          type: 'fill',
          filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
          paint: { 'fill-color': '#fbb03b', 'fill-outline-color': '#fbb03b', 'fill-opacity': 0.3 },
        },
        {
          id: 'gl-draw-polygon-stroke-active',
          type: 'line',
          filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#fbb03b', 'line-dasharray': [0.2, 2], 'line-width': 2 },
        },
        {
          id: 'gl-draw-polygon-midpoint',
          type: 'circle',
          filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
          paint: { 'circle-radius': 3, 'circle-color': '#fbb03b' },
        },
        {
          id: 'gl-draw-polygon-vertex-inactive',
          type: 'circle',
          filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
          paint: { 'circle-radius': 5, 'circle-color': '#fff' },
        },
        {
          id: 'gl-draw-polygon-vertex-stroke-inactive',
          type: 'circle',
          filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point'], ['!=', 'mode', 'static']],
          paint: { 'circle-radius': 7, 'circle-color': '#fbb03b' },
        },
      ],
    });

    map.addControl(draw as any);

    // 添加围栏图层
    map.on('load', () => {
      if (!map) return;

      // 添加围栏数据源
      map.addSource('geofences-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });

      // 添加围栏填充图层
      map.addLayer({
        id: 'geofences-fill',
        type: 'fill',
        source: 'geofences-source',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.3,
        },
      });

      // 添加围栏边框图层
      map.addLayer({
        id: 'geofences-line',
        type: 'line',
        source: 'geofences-source',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
        },
      });

      // 添加媒体点位聚合数据源
      map.addSource('media-points', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
        cluster: true,
        clusterMaxZoom: 16, // 最大聚合层级
        clusterRadius: 60, // 聚合半径
      });

      // 添加聚合点圆形图层（只在 zoom <= 16 时显示）
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'media-points',
        filter: ['has', 'point_count'],
        maxzoom: 17, // 超过 zoom 17 隐藏聚合图层
        paint: {
          'circle-color': [
            'case',
            ['boolean', ['feature-state', 'active'], false],
            '#67c23a', // 激活时绿色
            '#409eff'  // 默认蓝色
          ],
          'circle-radius': 20,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      });

      // 添加聚合点数字图层
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'media-points',
        filter: ['has', 'point_count'],
        maxzoom: 17,
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 14,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });

      // 添加未聚合点的图层（使用 symbol 显示占位符，真正的渲染用 Marker）
      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'media-points',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 0, // 隐藏圆圈，只用来触发事件
          'circle-opacity': 0,
        },
      });

      // 点击聚合点显示列表
      map.on('click', 'clusters', handleClusterClick);

      // 监听未聚合点的渲染，使用自定义 Marker
      map.on('data', (e) => {
        if (e.sourceId === 'media-points' && e.isSourceLoaded) {
          updateCustomMarkers();
        }
      });

      // 监听 zoom 变化，关闭聚合列表并更新自定义 Marker
      map.on('zoomend', () => {
        if (clusterModel.listVisible) {
          handleCloseClusterList();
        }
        // 强制更新自定义 Marker，确保图片图层和聚合图层同步
        updateCustomMarkers();
      });

      // 监听地图移动结束，确保投影矩阵更新后再渲染 Marker
      map.on('moveend', () => {
        updateCustomMarkers();
      });

      // 鼠标悬停样式
      map.on('mouseenter', 'clusters', () => {
        if (map) map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'clusters', () => {
        if (map) map.getCanvas().style.cursor = '';
      });

      // 初始渲染围栏和标记
      renderGeofences();
      updateMediaPointsSource();
    });

    // 监听绘制事件
    map.on('draw.create', handleDrawCreate);
    map.on('draw.update', handleDrawUpdate);

    // 阻止非编辑模式下选择围栏
    map.on('draw.selectionchange', (event: any) => {
      if (!props.drawingMode && event.features.length > 0) {
        // 取消选择
        draw.changeMode('simple_select');
      }
    });

    map.on('mousemove', (event) => {
      mapModel.mouseCoord = {
        lng: event.lngLat.lng,
        lat: event.lngLat.lat,
      };
    });

    map.on('click', (event) => {
      // 检查是否点击了围栏（非编辑模式）
      if (!props.drawingMode && map) {
        const features = map.queryRenderedFeatures(event.point, {
          layers: ['geofences-fill', 'geofences-line'],
        });

        if (features && features.length > 0) {
          const feature = features[0];
          const geofenceId = feature.properties?.id;
          if (geofenceId) {
            const geofence = props.geofences.find(g => g.id === geofenceId);
            if (geofence) {
              fitGeofenceBounds(geofence);
              return;
            }
          }
        }
      }

      if (mapModel.expandedPath) {
        mapModel.expandedPath = '';
        renderMarkers();
      }

      clearSearchMarker();

      if (props.enableClickToCopy) {
        void copyLngLat(event.lngLat.lng, event.lngLat.lat);
      }
    });

    const container = map.getContainer();
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('drop', handleDrop);

    mapModel.hint = '已连接';
    emit('ready');

    // 等待地图完全加载后再渲染标记点和围栏
    if (map.loaded()) {
      renderMarkers();
      renderGeofences();
    } else {
      map.once('load', () => {
        renderMarkers();
        renderGeofences();
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Mapbox 地图加载失败';
    mapModel.hint = message;
    emit('error', message);
  }
}

// 关闭聚合列表
function handleCloseClusterList(): void {
  // 移除聚合点高亮
  if (map && clusterModel.currentClusterId !== null) {
    map.removeFeatureState({
      source: 'media-points',
      id: clusterModel.currentClusterId,
    });
  }

  clusterModel.listVisible = false;
  clusterModel.listItems = [];
  clusterModel.listPosition = null;
  clusterModel.currentClusterId = null;
  clusterModel.currentClusterLngLat = null;
}

// 更新聚合列表（当媒体项变化时）
function updateClusterListAfterChange(): void {
  if (!map || !clusterModel.currentClusterLngLat) {
    return;
  }

  // 获取所有有 GPS 的媒体项
  const allItemsWithGps = props.items.filter(
    (item) => item.hasGps && typeof item.longitude === 'number' && typeof item.latitude === 'number'
  );

  // 如果没有 GPS 点了，关闭列表
  if (allItemsWithGps.length === 0) {
    handleCloseClusterList();
    return;
  }

  // 计算聚合半径（根据当前 zoom 和 clusterRadius 配置）
  const zoom = map.getZoom();
  const metersPerPixel = 156543.03392 * Math.cos(clusterModel.currentClusterLngLat.lat * Math.PI / 180) / Math.pow(2, zoom);
  const clusterRadiusPixels = 60; // 与配置的 clusterRadius 一致
  const clusterRadiusMeters = clusterRadiusPixels * metersPerPixel;

  // 将米转换为经纬度（粗略估算：1度约等于111km）
  const radiusDegrees = clusterRadiusMeters / 111000;

  // 找出在聚合范围内的所有点
  const centerLng = clusterModel.currentClusterLngLat.lng;
  const centerLat = clusterModel.currentClusterLngLat.lat;

  const itemsInCluster = allItemsWithGps.filter((item) => {
    const lng = item.longitude as number;
    const lat = item.latitude as number;
    const distance = Math.sqrt(
      Math.pow(lng - centerLng, 2) + Math.pow(lat - centerLat, 2)
    );
    return distance <= radiusDegrees;
  });

  // 如果聚合内只剩 1 个或 0 个点了，关闭列表
  if (itemsInCluster.length <= 1) {
    handleCloseClusterList();
    return;
  }

  // 更新列表内容
  clusterModel.listItems = itemsInCluster;
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

  // 更新聚合数据源
  updateMediaPointsSource();

  const selected = props.items.find((item) => item.path === props.selectedPath);
  if (selected?.hasGps && typeof selected.longitude === 'number' && typeof selected.latitude === 'number') {
    map.setCenter([selected.longitude, selected.latitude]);
  }
}

// 更新媒体点位数据源
function updateMediaPointsSource(): void {
  if (!map) return;

  // 如果正在拖拽，不要更新数据源
  if (mapModel.draggingMarkerId) {
    console.log('[Mapbox Debug] skipping updateMediaPointsSource because marker is being dragged, id:', mapModel.draggingMarkerId);
    return;
  }

  console.log('[Mapbox Debug] updateMediaPointsSource called');

  const source = map.getSource('media-points') as mapboxgl.GeoJSONSource;
  if (!source) return;

  const itemsWithGps = props.items.filter(
    (item) => item.hasGps && typeof item.longitude === 'number' && typeof item.latitude === 'number'
  );

  // 构建 GeoJSON 数据
  const geojson = {
    type: 'FeatureCollection',
    features: itemsWithGps.map((item) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [item.longitude as number, item.latitude as number],
      },
      properties: {
        id: item.id,
        path: item.path,
        name: item.name,
        mediaType: item.mediaType,
        gpsSource: item.gpsSource,
      },
    })),
  };

  source.setData(geojson as any);

  // 渲染非聚合的标记点（使用自定义 Marker）
  // 只有在非拖拽状态时才渲染
  if (!mapModel.draggingMarkerId) {
    renderUnclusteredMarkers();
  }
}

// 更新自定义 Marker（未聚合的点）
function updateCustomMarkers(): void {
  if (!map) return;

  // 如果正在拖拽，不要重新创建 Marker
  if (mapModel.draggingMarkerId) {
    console.log('[Mapbox Debug] skipping updateCustomMarkers because marker is being dragged, id:', mapModel.draggingMarkerId);
    return;
  }

  // 清除之前的定时器，防止重复调用
  if (updateMarkersTimer !== null) {
    cancelAnimationFrame(updateMarkersTimer);
    updateMarkersTimer = null;
  }

  console.log('[Mapbox Debug] updateCustomMarkers called, current markers count:', markers.length);

  // 获取当前地图视野范围
  const zoom = map.getZoom();

  console.log('[Mapbox Debug] current zoom:', zoom, 'clusterMaxZoom: 16');

  // 获取所有媒体项
  const itemsWithGps = props.items.filter(
    (item) => item.hasGps && typeof item.longitude === 'number' && typeof item.latitude === 'number'
  );

  console.log('[Mapbox Debug] items with GPS:', itemsWithGps.length);

  // 清理旧标记
  markers.forEach((marker) => {
    marker.remove();
  });
  markers = [];

  console.log('[Mapbox Debug] cleared old markers, count before:', markers.length);

  // 获取当前视野内未聚合的点
  const features = map.querySourceFeatures('media-points', {
    sourceLayer: undefined,
  });

  // 筛选出未聚合的点（没有 point_count 属性）
  const unclusteredFeatures = features.filter((feature: any) => !feature.properties.cluster);

  console.log('[Mapbox Debug] unclustered features in view:', unclusteredFeatures.length);

  // 对 features 去重（querySourceFeatures 可能返回重复的点）
  const uniqueFeaturesMap = new Map<string, any>();
  unclusteredFeatures.forEach((feature: any) => {
    const id = feature.properties.id;
    if (id && !uniqueFeaturesMap.has(id)) {
      uniqueFeaturesMap.set(id, feature);
    }
  });

  const uniqueFeatures = Array.from(uniqueFeaturesMap.values());
  console.log('[Mapbox Debug] unique unclustered features:', uniqueFeatures.length);

  // 为每个未聚合的点创建自定义 Marker
  uniqueFeatures.forEach((feature: any) => {
    const coordinates = feature.geometry.coordinates as [number, number];
    const properties = feature.properties;

    // 找到对应的媒体项
    const item = itemsWithGps.find((item) => item.id === properties.id);
    if (!item) return;

    const expanded = isMapMarkerExpanded(mapModel.expandedPath, item.path);
    const markerContent = createMarkerContent(item, expanded);

    console.log('[Mapbox Debug] creating marker for:', item.name, 'lng:', coordinates[0], 'lat:', coordinates[1]);

    const marker = new mapboxgl.Marker({
      element: markerContent,
      anchor: 'bottom',
      draggable: false,
    })
      .setLngLat([coordinates[0], coordinates[1]])
      .addTo(map);

    // 存储 item 引用到 marker 对象上，方便拖拽时查找
    (marker as any)._mediaItem = item;

    markers.push(marker);
  });

  console.log('[Mapbox Debug] created custom markers:', markers.length);
}

// 渲染非聚合的标记点
function renderUnclusteredMarkers(): void {
  if (!map) return;

  console.log('[Mapbox Debug] renderUnclusteredMarkers called');

  // 清理旧标记
  markers.forEach((marker) => marker.remove());
  markers = [];

  console.log('[Mapbox Debug] cleared old markers');

  // 数据源更新后，会触发 'data' 事件，那时再更新自定义 Marker
}

// 处理聚合点点击事件
function handleClusterClick(e: any): void {
  if (!map) return;

  const features = map.queryRenderedFeatures(e.point, {
    layers: ['clusters'],
  });

  if (!features || features.length === 0) return;

  const clusterId = features[0].properties?.cluster_id;
  if (clusterId === undefined) return;

  // 移除之前的高亮
  if (clusterModel.currentClusterId !== null) {
    map.removeFeatureState({
      source: 'media-points',
      id: clusterModel.currentClusterId,
    });
  }

  // 设置当前聚合点为激活状态（绿色高亮）
  map.setFeatureState(
    {
      source: 'media-points',
      id: clusterId,
    },
    { active: true }
  );

  const source = map.getSource('media-points') as mapboxgl.GeoJSONSource;

  // 获取聚合点内的所有点
  (source as any).getClusterLeaves(clusterId, Infinity, 0, (err: any, clusterFeatures: any[]) => {
    if (err || !clusterFeatures) return;

    // 提取媒体项
    const items = clusterFeatures
      .map((feature) => {
        const properties = feature.properties;
        if (!properties) return null;

        return props.items.find((item) => item.id === properties.id);
      })
      .filter(Boolean) as MediaItem[];

    if (items.length === 0) return;

    // 获取聚合点的坐标
    const coordinates = features[0].geometry.coordinates as [number, number];

    // 显示列表并记录当前聚合点
    clusterModel.listItems = items;
    clusterModel.listPosition = { x: e.point.x, y: e.point.y };
    clusterModel.currentClusterId = clusterId;
    clusterModel.currentClusterLngLat = { lng: coordinates[0], lat: coordinates[1] };
    clusterModel.listVisible = true;
  });
}

function createMarkerContent(item: MediaItem, expanded: boolean): HTMLElement {
  console.log('[Mapbox Debug] createMarkerContent called for:', item.name, 'expanded:', expanded);

  const container = document.createElement('div');
  container.setAttribute('role', 'button');
  container.tabIndex = 0;
  container.className = `map-media-marker${item.path === props.selectedPath ? ' selected' : ''}${expanded ? ' expanded' : ''}`;
  container.title = item.name;

  console.log('[Mapbox Debug] container className:', container.className);

  // 设置 z-index：展开或选中的标记点层级更高
  const zIndex = item.path === props.selectedPath || expanded ? 300 : 100;
  container.style.zIndex = String(zIndex);

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

  console.log('[Mapbox Debug] bubble created');

  const media = createMarkerMediaElement(item);
  bubble.appendChild(media);

  console.log('[Mapbox Debug] media appended');

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

  console.log('[Mapbox Debug] marker content complete, children:', container.children.length);

  return container;
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

  // 通过存储的 _mediaItem 查找对应的 Marker
  const marker = markers.find(m => (m as any)._mediaItem?.id === item.id);

  if (!marker) {
    console.warn('[Mapbox Debug] Marker not found for item:', item.id);
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

  // 拖拽完成后，使用防抖延迟更新，避免重复调用
  if (updateAfterDragTimer !== null) {
    clearTimeout(updateAfterDragTimer);
  }
  updateAfterDragTimer = window.setTimeout(() => {
    console.log('[Mapbox Debug] updating after drag completed');
    updateMediaPointsSource();
    updateCustomMarkers();
    updateAfterDragTimer = null;
  }, 150);
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

    // 如果聚合列表正在显示，检查是否需要更新列表
    if (clusterModel.listVisible && clusterModel.currentClusterLngLat) {
      updateClusterListAfterChange();
    }

    renderMarkers();
  },
  { deep: true, immediate: true },
);

onMounted(ensureMap);

onBeforeUnmount(() => {
  markers.forEach((marker) => marker.remove());
  clearSearchMarker();
  cleanupMarkerDragListeners();
  if (updateMarkersTimer !== null) {
    cancelAnimationFrame(updateMarkersTimer);
  }
  if (updateAfterDragTimer !== null) {
    clearTimeout(updateAfterDragTimer);
  }
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

    <GeofenceEditPanel
      v-if="drawingMode && editingGeofenceId"
      :geofence="geofences.find(g => g.id === editingGeofenceId)!"
      :coordinates="getCurrentEditingCoordinates()"
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
  </section>
</template>
