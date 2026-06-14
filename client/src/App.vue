<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import type { AppConfig, BrowseResponse, MediaItem, MapProvider, GpsWriteMode, Geofence, GeofenceConfig, GeofenceCoordinate } from '@shared/contracts';
import { browseDirectory, getConfig, saveConfig, setMediaGps, getGeofenceConfig, saveGeofenceConfig } from './api';
import { getRandomPointInPolygon } from './lib/geofenceUtils';
import FolderPickerDialog from './components/FolderPickerDialog.vue';
import GeofenceFloatingList from './components/GeofenceFloatingList.vue';
import MapPanel from './components/MapPanel.vue';
import LeftPanel from './components/LeftPanel.vue';
import ResizeHandle from './components/ResizeHandle.vue';

const MEDIA_PAGE_LIMIT = 120;

interface OpenDirectoryOptions {
  append?: boolean;
  offset?: number;
  filter?: string;
}

// Settings block: keeps backend-owned app config and save status together.
const settingsModel = reactive({
  busy: false,
  message: '',
  config: {
    appName: 'Media Location',
    appVersion: '0.1.0',
    port: 6755,
    mapProvider: 'amap' as MapProvider,
    amapKey: '',
    amapSecurityCode: '',
    mapboxAccessToken: '',
    libraryRoots: [] as string[],
    backupBeforeWrite: false,
    loadVideoContent: false,
    gpsWriteMode: 'xmp' as GpsWriteMode,
  },
});

// Browser block: tracks the current root, child folders, and scanned media in one place.
const browserModel = reactive({
  busy: false,
  loadingMore: false,
  error: '',
  currentDir: '',
  parentDir: null as string | null,
  rootDir: null as string | null,
  entries: [] as BrowseResponse['entries'],
  media: [] as MediaItem[],
  mediaTotal: 0,
  mediaOffset: 0,
  mediaLimit: MEDIA_PAGE_LIMIT,
  mediaFilter: '',
  directoryTreeRefreshVersion: 0,
});

// Selection block: owns the item that receives map drop/click writes.
const selectionModel = reactive({
  selectedPath: '',
  saving: '',
  message: '',
});

// Pin block: keeps hand-picked media visible while browsing other folders.
const pinModel = reactive({
  items: [] as MediaItem[],
});

// Layout block: owns split panel width.
const layoutModel = reactive({
  leftPanelWidth: loadLeftPanelWidth(),
  folderPickerOpen: false,
});

// Geofence block: owns围栏配置和编辑状态
const geofenceModel = reactive({
  busy: false,
  enabled: false,
  geofences: [] as Geofence[],
  editingGeofenceId: '',
  drawingMode: false,
});

function loadLeftPanelWidth(): number {
  try {
    const saved = localStorage.getItem('leftPanelWidth');
    if (saved) {
      const width = parseInt(saved, 10);
      if (!isNaN(width) && width >= 420) {
        return width;
      }
    }
  } catch (error) {
    console.warn('Failed to load left panel width:', error);
  }
  return 440;
}

function saveLeftPanelWidth(width: number): void {
  try {
    localStorage.setItem('leftPanelWidth', String(width));
  } catch (error) {
    console.warn('Failed to save left panel width:', error);
  }
}

const roots = computed(() => settingsModel.config.libraryRoots);
const visibleMedia = computed(() => mergeMediaItems(pinModel.items, browserModel.media));
const mediaHasMore = computed(() => browserModel.media.length < browserModel.mediaTotal);
let mediaFilterTimer: number | null = null;

async function loadInitial(): Promise<void> {
  settingsModel.busy = true;
  try {
    const config = await getConfig();
    applyConfig(config);
    const geofenceConfig = await getGeofenceConfig();
    applyGeofenceConfig(geofenceConfig);
    await openPreferredRoot();
  } catch (error) {
    const message = error instanceof Error ? error.message : '加载失败';
    settingsModel.message = message;
    ElMessage.error(message);
  } finally {
    settingsModel.busy = false;
  }
}

function handleMapReady(): void {
  // Map is ready, no action needed
}

function handleMapError(message: string): void {
  settingsModel.message = message;
  ElMessage.error(message);
}

function applyConfig(config: AppConfig): void {
  settingsModel.config.appName = config.appName;
  settingsModel.config.appVersion = config.appVersion;
  settingsModel.config.port = config.port;
  settingsModel.config.mapProvider = config.mapProvider;
  settingsModel.config.amapKey = config.amapKey;
  settingsModel.config.amapSecurityCode = config.amapSecurityCode;
  settingsModel.config.mapboxAccessToken = config.mapboxAccessToken;
  settingsModel.config.libraryRoots = config.libraryRoots;
  settingsModel.config.backupBeforeWrite = config.backupBeforeWrite;
  settingsModel.config.loadVideoContent = config.loadVideoContent;
}

function applyGeofenceConfig(config: GeofenceConfig): void {
  geofenceModel.enabled = config.enabled;
  geofenceModel.geofences = config.geofences;
}

async function saveGeofences(config: GeofenceConfig): Promise<void> {
  geofenceModel.busy = true;
  try {
    const saved = await saveGeofenceConfig(config);
    applyGeofenceConfig(saved);
    ElMessage.success('围栏配置已保存');
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存失败';
    ElMessage.error(message);
  } finally {
    geofenceModel.busy = false;
  }
}

function handleCreateGeofence(data: { name: string; color: string }): void {
  const newGeofence: Geofence = {
    id: crypto.randomUUID(),
    name: data.name,
    color: data.color,
    coordinates: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  geofenceModel.editingGeofenceId = newGeofence.id;
  geofenceModel.drawingMode = true;
  geofenceModel.geofences.push(newGeofence);

  ElMessage.info('请在地图上点击绘制围栏区域');
}

function handleUpdateGeofence(id: string, data: { name: string; color: string }): void {
  const index = geofenceModel.geofences.findIndex(g => g.id === id);
  if (index === -1) return;

  geofenceModel.geofences[index] = {
    ...geofenceModel.geofences[index],
    name: data.name,
    color: data.color,
    updatedAt: new Date().toISOString(),
  };

  void saveGeofences({
    enabled: geofenceModel.enabled,
    geofences: geofenceModel.geofences,
  });
}

async function handleDeleteGeofence(id: string): Promise<void> {
  geofenceModel.geofences = geofenceModel.geofences.filter(g => g.id !== id);
  await saveGeofences({
    enabled: geofenceModel.enabled,
    geofences: geofenceModel.geofences,
  });
}

function handleViewGeofence(geofence: Geofence): void {
  geofenceModel.editingGeofenceId = geofence.id;
  geofenceModel.drawingMode = false;
  // 地图组件会根据 editingGeofenceId 自动显示和缩放
}

function handleEditGeofenceArea(geofence: Geofence): void {
  geofenceModel.editingGeofenceId = geofence.id;
  geofenceModel.drawingMode = true;
  ElMessage.info('请在地图上编辑围栏区域');
}

function handleGeofenceDrawn(id: string, coordinates: GeofenceCoordinate[]): void {
  const index = geofenceModel.geofences.findIndex(g => g.id === id);
  if (index === -1) return;

  geofenceModel.geofences[index].coordinates = coordinates;
  geofenceModel.geofences[index].updatedAt = new Date().toISOString();

  geofenceModel.editingGeofenceId = '';
  geofenceModel.drawingMode = false;

  void saveGeofences({
    enabled: geofenceModel.enabled,
    geofences: geofenceModel.geofences,
  });

  ElMessage.success('围栏绘制完成');
}

function handleGeofenceEdited(id: string, coordinates: GeofenceCoordinate[]): void {
  const index = geofenceModel.geofences.findIndex(g => g.id === id);
  if (index === -1) return;

  geofenceModel.geofences[index].coordinates = coordinates;
  geofenceModel.geofences[index].updatedAt = new Date().toISOString();

  geofenceModel.editingGeofenceId = '';
  geofenceModel.drawingMode = false;

  void saveGeofences({
    enabled: geofenceModel.enabled,
    geofences: geofenceModel.geofences,
  });

  ElMessage.success('围栏编辑完成');
}

async function handleDropToGeofence(geofence: Geofence, mediaPath: string): Promise<void> {
  try {
    if (geofence.coordinates.length < 3) {
      ElMessage.warning('该围栏还未绘制区域');
      return;
    }

    const randomCoord = getRandomPointInPolygon(geofence.coordinates);

    await placeMedia({
      path: mediaPath,
      longitude: randomCoord.longitude,
      latitude: randomCoord.latitude,
    });

    selectionModel.selectedPath = mediaPath;

    ElMessage.success(`已设置到围栏"${geofence.name}"内的随机位置`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '设置失败';
    ElMessage.error(message);
  }
}

async function openPreferredRoot(): Promise<void> {
  const firstRoot = settingsModel.config.libraryRoots[0];
  if (firstRoot) {
    await openDirectory(firstRoot);
    return;
  }

  clearBrowser();
}

function clearBrowser(): void {
  browserModel.currentDir = '';
  browserModel.rootDir = null;
  browserModel.parentDir = null;
  browserModel.entries = [];
  browserModel.media = [];
  browserModel.mediaTotal = 0;
  browserModel.mediaOffset = 0;
  syncSelectionWithVisibleMedia();
}

async function openDirectory(dir: string, options: OpenDirectoryOptions = {}): Promise<void> {
  clearMediaFilterTimer();
  const append = Boolean(options.append);
  const filter = options.filter ?? browserModel.mediaFilter;
  const offset = options.offset ?? (append ? browserModel.media.length : 0);

  if (append) {
    browserModel.loadingMore = true;
  } else {
    browserModel.busy = true;
  }

  browserModel.error = '';
  try {
    const response = await browseDirectory(dir, {
      filter,
      offset,
      limit: browserModel.mediaLimit,
    });
    browserModel.currentDir = response.currentDir;
    browserModel.parentDir = response.parentDir;
    browserModel.rootDir = response.rootDir;
    browserModel.entries = response.entries;
    browserModel.media = append ? mergeMediaItems(browserModel.media, response.media) : response.media;
    browserModel.mediaTotal = response.mediaTotal ?? response.media.length;
    browserModel.mediaOffset = response.mediaOffset ?? offset;
    browserModel.mediaLimit = response.mediaLimit ?? browserModel.mediaLimit;
    browserModel.mediaFilter = response.mediaFilter ?? filter;
    refreshPinnedMedia(response.media);
    syncSelectionWithVisibleMedia();
  } catch (error) {
    const message = error instanceof Error ? error.message : '目录读取失败';
    browserModel.error = message;
    ElMessage.error(message);
  } finally {
    if (append) {
      browserModel.loadingMore = false;
    } else {
      browserModel.busy = false;
    }
  }
}

async function refresh(): Promise<void> {
  try {
    if (browserModel.currentDir) {
      await openDirectory(browserModel.currentDir);
    } else {
      await openPreferredRoot();
    }
  } finally {
    browserModel.directoryTreeRefreshVersion += 1;
  }
}

function handleMediaFilterChange(filter: string): void {
  browserModel.mediaFilter = filter;
  if (!browserModel.currentDir) {
    return;
  }

  clearMediaFilterTimer();
  mediaFilterTimer = window.setTimeout(() => {
    void openDirectory(browserModel.currentDir, {
      filter,
      offset: 0,
    });
  }, 300);
}

async function loadMoreMedia(): Promise<void> {
  if (!browserModel.currentDir || browserModel.loadingMore || !mediaHasMore.value) {
    return;
  }

  await openDirectory(browserModel.currentDir, {
    append: true,
    offset: browserModel.media.length,
    filter: browserModel.mediaFilter,
  });
}

function clearMediaFilterTimer(): void {
  if (mediaFilterTimer === null) {
    return;
  }

  window.clearTimeout(mediaFilterTimer);
  mediaFilterTimer = null;
}

function mergeMediaItems(primary: MediaItem[], secondary: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  const merged: MediaItem[] = [];

  [...primary, ...secondary].forEach((item) => {
    if (seen.has(item.path)) {
      return;
    }

    seen.add(item.path);
    merged.push(item);
  });

  return merged;
}

function refreshPinnedMedia(currentItems: MediaItem[]): void {
  if (!pinModel.items.length) {
    return;
  }

  const currentByPath = new Map(currentItems.map((item) => [item.path, item]));
  pinModel.items = pinModel.items.map((item) => currentByPath.get(item.path) ?? item);
}

function removePinnedMediaUnderRoot(rootPath: string): void {
  if (!pinModel.items.length) {
    return;
  }

  pinModel.items = pinModel.items.filter((item) => !isPathInsideRoot(item.path, rootPath));
}

function isPathInsideRoot(candidatePath: string, rootPath: string): boolean {
  const root = normalizeComparablePath(rootPath);
  const candidate = normalizeComparablePath(candidatePath);

  return candidate === root || candidate.startsWith(`${root}/`);
}

function normalizeComparablePath(source: string): string {
  return source.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
}

function syncSelectionWithVisibleMedia(preferredPath?: string): void {
  const items = visibleMedia.value;
  if (preferredPath && items.some((item) => item.path === preferredPath)) {
    selectionModel.selectedPath = preferredPath;
    return;
  }

  if (selectionModel.selectedPath && items.some((item) => item.path === selectionModel.selectedPath)) {
    return;
  }

  selectionModel.selectedPath = items[0]?.path ?? '';
}

function togglePinnedMedia(item: MediaItem): void {
  const currentIndex = pinModel.items.findIndex((entry) => entry.path === item.path);
  if (currentIndex >= 0) {
    pinModel.items.splice(currentIndex, 1);
    ElMessage.success('已取消固定');
  } else {
    pinModel.items.push(item);
    ElMessage.success('已固定照片');
  }

  syncSelectionWithVisibleMedia(item.path);
}

function pinCurrentDirectory(): void {
  if (!browserModel.media.length) {
    ElMessage.info('当前目录没有媒体');
    return;
  }

  const currentPaths = new Set(browserModel.media.map((item) => item.path));
  const currentItems = browserModel.media.filter((item) => currentPaths.has(item.path));
  const currentPinnedCount = pinModel.items.filter((item) => currentPaths.has(item.path)).length;

  if (currentPinnedCount === currentItems.length) {
    pinModel.items = pinModel.items.filter((item) => !currentPaths.has(item.path));
    syncSelectionWithVisibleMedia();
    ElMessage.success('已取消固定当前目录');
    return;
  }

  const pinnedPaths = new Set(pinModel.items.map((item) => item.path));
  const nextItems = browserModel.media.filter((item) => !pinnedPaths.has(item.path));

  if (!nextItems.length) {
    ElMessage.info('当前目录的媒体都已固定');
    return;
  }

  pinModel.items.push(...nextItems);
  syncSelectionWithVisibleMedia(selectionModel.selectedPath || nextItems[0]?.path);
  ElMessage.success(`已固定当前目录 ${nextItems.length} 个媒体`);
}

async function saveSettings(config: AppConfig): Promise<void> {
  settingsModel.busy = true;
  settingsModel.message = '';
  try {
    const saved = await saveConfig({
      ...config,
      libraryRoots: settingsModel.config.libraryRoots,
    });
    applyConfig(saved);
    settingsModel.message = '已保存设置';
    ElMessage.success('设置已保存');
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存失败';
    settingsModel.message = message;
    ElMessage.error(message);
  } finally {
    settingsModel.busy = false;
  }
}

async function addLibraryRoot(path: string): Promise<void> {
  const nextRoots = Array.from(new Set([...settingsModel.config.libraryRoots, path]));
  settingsModel.busy = true;
  try {
    const saved = await saveConfig({
      ...settingsModel.config,
      libraryRoots: nextRoots,
    });
    applyConfig(saved);
    await openDirectory(path);
    ElMessage.success('目录已添加');
  } catch (error) {
    const message = error instanceof Error ? error.message : '添加目录失败';
    settingsModel.message = message;
    ElMessage.error(message);
  } finally {
    settingsModel.busy = false;
  }
}

async function removeLibraryRoot(path: string): Promise<void> {
  const nextRoots = settingsModel.config.libraryRoots.filter((root) => root !== path);
  settingsModel.busy = true;
  try {
    const removedCurrentRoot = browserModel.rootDir === path;
    const saved = await saveConfig({
      ...settingsModel.config,
      libraryRoots: nextRoots,
    });
    applyConfig(saved);
    removePinnedMediaUnderRoot(path);

    if (removedCurrentRoot) {
      await openPreferredRoot();
    }

    if (!saved.libraryRoots.length) {
      clearBrowser();
    }

    syncSelectionWithVisibleMedia();
    ElMessage.success('目录已移除');
  } catch (error) {
    const message = error instanceof Error ? error.message : '移除目录失败';
    settingsModel.message = message;
    ElMessage.error(message);
  } finally {
    settingsModel.busy = false;
  }
}

async function placeMedia(payload: { path: string; longitude: number; latitude: number }): Promise<void> {
  selectionModel.saving = payload.path;
  selectionModel.message = '';
  try {
    const saved = await setMediaGps(payload);
    applyGpsUpdate(saved);
    const message = `经纬度修改为 WGS-84: ${formatCoordinateText(saved.longitude, saved.latitude)}`;
    selectionModel.message = message;
    ElMessage.success(message);
  } catch (error) {
    const message = error instanceof Error ? error.message : '写入失败';
    selectionModel.message = message;
    ElMessage.error(message);
  } finally {
    selectionModel.saving = '';
  }
}

function formatCoordinateText(longitude: number, latitude: number): string {
  return `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
}

function applyGpsUpdate(updated: { path: string; xmpPath?: string; latitude: number; longitude: number }): void {
  const patchItem = (item: MediaItem): MediaItem =>
    item.path === updated.path
      ? {
          ...item,
          xmpPath: updated.xmpPath ?? item.xmpPath,
          hasGps: true,
          latitude: updated.latitude,
          longitude: updated.longitude,
          gpsSource: 'xmp',
        }
      : item;

  browserModel.media = browserModel.media.map(patchItem);
  pinModel.items = pinModel.items.map(patchItem);
}

function handleDragStart(item: MediaItem, event: DragEvent): void {
  event.dataTransfer?.setData('text/plain', item.path);
  selectionModel.selectedPath = item.path;
}

function handleSelectItem(item: MediaItem): void {
  selectionModel.selectedPath = item.path;
}

function handlePanelResize(width: number): void {
  layoutModel.leftPanelWidth = width;
  saveLeftPanelWidth(width);
}

onMounted(loadInitial);
onBeforeUnmount(clearMediaFilterTimer);
</script>

<template>
  <div class="app-shell">
    <div class="app-split-layout">
      <div class="left-section" :style="{ width: `${layoutModel.leftPanelWidth}px` }">
        <LeftPanel
          :current-dir="browserModel.currentDir"
          :parent-dir="browserModel.parentDir"
          :root-dir="browserModel.rootDir"
          :entries="browserModel.entries"
          :browser-loading="browserModel.busy"
          :directory-tree-refresh-version="browserModel.directoryTreeRefreshVersion"
          :media="browserModel.media"
          :pinned-items="pinModel.items"
          :media-total="browserModel.mediaTotal"
          :media-filter="browserModel.mediaFilter"
          :has-more="mediaHasMore"
          :selected-path="selectionModel.selectedPath"
          :media-loading="browserModel.busy"
          :loading-more="browserModel.loadingMore"
          :config="settingsModel.config"
          :settings-busy="settingsModel.busy"
          :geofence-enabled="geofenceModel.enabled"
          :geofences="geofenceModel.geofences"
          :geofence-busy="geofenceModel.busy"
          @add-root="layoutModel.folderPickerOpen = true"
          @open-dir="openDirectory"
          @remove-root="removeLibraryRoot"
          @refresh="refresh"
          @select-media="handleSelectItem"
          @drag-start="handleDragStart"
          @manual-place="placeMedia"
          @toggle-pin="togglePinnedMedia"
          @pin-current-dir="pinCurrentDirectory"
          @filter-change="handleMediaFilterChange"
          @load-more="loadMoreMedia"
          @save-settings="saveSettings"
          @save-geofences="saveGeofences"
          @create-geofence="handleCreateGeofence"
          @update-geofence="handleUpdateGeofence"
          @delete-geofence="handleDeleteGeofence"
          @view-geofence="handleViewGeofence"
          @edit-geofence-area="handleEditGeofenceArea"
        />
      </div>

      <ResizeHandle @resize="handlePanelResize" />

      <div class="right-section">
        <div class="floating-brand">
          <span>{{ settingsModel.config.appName }}</span>
          <small>{{ settingsModel.config.appVersion }}</small>
        </div>

        <MapPanel
          class="map-layer"
          :map-provider="settingsModel.config.mapProvider"
          :amap-key="settingsModel.config.amapKey"
          :amap-security-code="settingsModel.config.amapSecurityCode"
          :mapbox-access-token="settingsModel.config.mapboxAccessToken"
          :items="visibleMedia"
          :selected-path="selectionModel.selectedPath"
          :geofences="geofenceModel.geofences"
          :editing-geofence-id="geofenceModel.editingGeofenceId"
          :drawing-mode="geofenceModel.drawingMode"
          @select="handleSelectItem"
          @place="placeMedia"
          @ready="handleMapReady"
          @error="handleMapError"
          @geofence-drawn="handleGeofenceDrawn"
          @geofence-edited="handleGeofenceEdited"
        >
          <GeofenceFloatingList
            v-if="geofenceModel.enabled"
            :geofences="geofenceModel.geofences"
            @drop="handleDropToGeofence"
          />
        </MapPanel>
      </div>
    </div>

    <FolderPickerDialog v-model="layoutModel.folderPickerOpen" @confirm="addLibraryRoot" />
  </div>
</template>
