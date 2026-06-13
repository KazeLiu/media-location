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
} from '@shared/gps';
import type { MapProvider } from '@/lib/mapProvider';
import { AmapProvider } from '@/lib/providers';

const SEARCH_RESULT_ZOOM = 17;
type MapLayerMode = 'standard' | 'satellite';

const props = withDefaults(
  defineProps<{
    mapProvider: 'amap' | 'mapbox';
    amapKey: string;
    amapSecurityCode?: string;
    mapboxToken?: string;
    items: MediaItem[];
    selectedId: string;
    loading: boolean;
  }>(),
  {
    amapSecurityCode: '',
    mapboxToken: '',
  },
);

const emit = defineEmits<{
  select: [item: MediaItem];
  place: [payload: { path: string; longitude: number; latitude: number }];
  ready: [];
  error: [message: string];
}>();

const mapEl = ref<HTMLDivElement | null>(null);
let provider: MapProvider | null = null;

// Map block: owns search text, mouse coordinate, and UI state
const mapModel = reactive({
  hint: '未加载',
  searchKeyword: '',
  searching: false,
  mouseCoord: null as { lng: number; lat: number } | null,
  coordinateSystem: 'gcj02' as CoordinateSystem,
  layerMode: 'standard' as MapLayerMode,
  satelliteRoadNet: false,
});

const mouseCoordText = computed(() => {
  if (!mapModel.mouseCoord) {
    return null;
  }

  return formatGcj02Wgs84CoordinateText(mapModel.mouseCoord.lng, mapModel.mouseCoord.lat);
});

/**
 * 初始化地图 Provider
 */
async function initMap(): Promise<void> {
  if (!mapEl.value) {
    return;
  }

  try {
    // 根据配置创建对应的 Provider
    if (props.mapProvider === 'amap') {
      if (!props.amapKey) {
        mapModel.hint = '需要高德 Key';
        emit('error', '需要高德 Key');
        return;
      }
      provider = new AmapProvider(props.amapKey, props.amapSecurityCode);
    } else {
      // TODO: Mapbox Provider
      throw new Error('Mapbox 地图暂未实现');
    }

    // 初始化地图
    await provider.init({
      container: mapEl.value,
      onReady: () => {
        mapModel.hint = '已连接';
        emit('ready');
        // 初始渲染标记
        provider?.renderMarkers(props.items, props.selectedId);
      },
      onError: (message) => {
        mapModel.hint = message;
        emit('error', message);
      },
      onMarkerClick: (item) => {
        emit('select', item);
      },
      onMapClick: (lng, lat) => {
        handleMapClick(lng, lat);
      },
      onMarkerDragEnd: (item, lng, lat) => {
        emit('select', item);
        emit('place', {
          path: item.path,
          longitude: lng,
          latitude: lat,
        });
      },
      onMouseMove: (lng, lat) => {
        mapModel.mouseCoord = { lng, lat };
      },
    });

    // 绑定拖放事件（需要访问 props.items）
    const container = mapEl.value;
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('drop', handleDrop);
  } catch (error) {
    const message = error instanceof Error ? error.message : '地图加载失败';
    mapModel.hint = message;
    emit('error', message);
  }
}

/**
 * 处理地图点击
 */
async function handleMapClick(lng: number, lat: number): Promise<void> {
  provider?.clearSearchMarker();
  await copyLngLat(lng, lat);
}

/**
 * 处理拖放悬停
 */
function handleDragOver(event: DragEvent): void {
  event.preventDefault();
}

/**
 * 处理拖放释放
 */
function handleDrop(event: DragEvent): void {
  if (!provider) {
    return;
  }

  provider.handleDrop(event, props.items);
}

/**
 * 搜索地址
 */
async function searchAddress(): Promise<void> {
  if (!provider || !mapModel.searchKeyword.trim()) {
    return;
  }

  mapModel.searching = true;
  try {
    const result = await provider.search(mapModel.searchKeyword.trim());
    if (result) {
      provider.showSearchMarker(result);
      ElMessage.success('已定位到搜索结果');
    } else {
      ElMessage.warning('没有找到这个地址');
    }
  } catch (error) {
    ElMessage.error('搜索失败');
  } finally {
    mapModel.searching = false;
  }
}

/**
 * 切换地图图层
 */
function switchMapLayer(mode: MapLayerMode): void {
  if (mode === 'standard') {
    mapModel.layerMode = 'standard';
    mapModel.satelliteRoadNet = false;
    provider?.setLayerMode('standard');
    return;
  }

  mapModel.layerMode = 'satellite';
  provider?.setLayerMode('satellite');
}

/**
 * 切换卫星图路网
 */
function toggleSatelliteRoadNet(value: boolean): void {
  mapModel.satelliteRoadNet = value;
  provider?.setSatelliteRoadNet?.(value);
}

/**
 * 复制经纬度到剪贴板
 */
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

/**
 * 监听 items 和 selectedId 变化，重新渲染标记
 */
watch(
  () => [props.items, props.selectedId] as const,
  () => {
    provider?.renderMarkers(props.items, props.selectedId);
  },
  { deep: true },
);

/**
 * 监听地图 Provider 切换
 */
watch(
  () => [props.mapProvider, props.amapKey, props.mapboxToken] as const,
  async () => {
    // 销毁旧 Provider
    if (provider) {
      const container = mapEl.value;
      container?.removeEventListener('dragover', handleDragOver);
      container?.removeEventListener('drop', handleDrop);
      provider.destroy();
      provider = null;
    }

    // 重新初始化
    await initMap();
  },
);

onMounted(initMap);

onBeforeUnmount(() => {
  const container = mapEl.value;
  container?.removeEventListener('dragover', handleDragOver);
  container?.removeEventListener('drop', handleDrop);
  provider?.destroy();
  provider = null;
});
</script>

<template>
  <section class="map-panel" v-loading="loading">
    <div ref="mapEl" class="map-canvas"></div>

    <div class="map-search">
      <el-input
        v-model="mapModel.searchKeyword"
        placeholder="搜索地址（暂不支持建议）"
        clearable
        @keydown.enter="searchAddress"
      >
        <template #append>
          <el-button :icon="Search" :loading="mapModel.searching" @click="searchAddress" />
        </template>
      </el-input>
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
```
