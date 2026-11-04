<script setup lang="ts">
import { computed, onBeforeUnmount, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { Download } from '@element-plus/icons-vue';
import type { AppConfig, Geofence, GeofenceConfig, GeofenceCoordinate, MediaItem } from '@shared/contracts';
import BrowserMediaUpload from './components/BrowserMediaUpload.vue';
import GeofenceFloatingList from './components/GeofenceFloatingList.vue';
import GeofenceTab from './components/GeofenceTab.vue';
import AmapPanel from './components/AmapPanel.vue';
import MediaTable from './components/MediaTable.vue';
import ResizeHandle from './components/ResizeHandle.vue';
import SettingTab from './components/SettingTab.vue';
import { classifyBrowserMedia, createBrowserMediaItem, createXmpZip, isUsableGps, safeBrowserMediaName } from './lib/browserMedia';
import { clearBrowserMedia, registerBrowserMedia, removeBrowserMedia } from './lib/browserMediaRegistry';
import { getRandomPointInPolygon } from './lib/geofenceUtils';

const SETTINGS_KEY = 'media-location:browser-settings:v1';
const GEOFENCES_KEY = 'media-location:browser-geofences:v1';
const WIDTH_KEY = 'media-location:browser-left-width';
const PAGE_SIZE = 120;

const settingsModel = reactive({ config: loadSettings(), busy: false });
const mediaModel = reactive({
  items: [] as MediaItem[],
  filter: '',
  visibleLimit: PAGE_SIZE,
  busy: false,
  progress: '',
  selectedPath: '',
  collapsed: false,
  disposed: false,
});
const geofenceModel = reactive({
  ...loadGeofences(),
  busy: false,
  editingGeofenceId: '',
  drawingMode: false,
});
const layoutModel = reactive({
  activeTab: '基本功能',
  leftPanelWidth: loadLeftWidth(),
});

const filteredItems = computed(() => {
  const filter = mediaModel.filter.trim().toLowerCase();
  return filter ? mediaModel.items.filter((item) => item.name.toLowerCase().includes(filter)) : mediaModel.items;
});
const visibleItems = computed(() => filteredItems.value.slice(0, mediaModel.visibleLimit));
const exportableCount = computed(() => mediaModel.items.filter((item) => isUsableGps(item.latitude, item.longitude)).length);
const hasMore = computed(() => visibleItems.value.length < filteredItems.value.length);
const visibleGeofences = computed(() =>
  layoutModel.activeTab === '电子围栏' || geofenceModel.showGeofencesOnMap ? geofenceModel.geofences : [],
);

function loadSettings(): AppConfig {
  const defaults: AppConfig = {
    appName: '媒体经纬度标注',
    appVersion: '0.1.0',
    port: 0,
    mapProvider: 'amap',
    amapKey: '',
    amapSecurityCode: '',
    mapboxAccessToken: '',
    libraryRoots: [],
    backupBeforeWrite: false,
    loadVideoContent: false,
    gpsWriteMode: 'xmp',
    enableClickToCopy: false,
    enableMarkerClustering: false,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<AppConfig>;
    return { ...defaults, ...saved, appName: defaults.appName, mapProvider: 'amap', libraryRoots: [], port: 0, gpsWriteMode: 'xmp' };
  } catch {
    return defaults;
  }
}

function loadGeofences(): GeofenceConfig {
  const defaults: GeofenceConfig = { enabled: false, showGeofencesOnMap: false, geofences: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(GEOFENCES_KEY) ?? '{}') as Partial<GeofenceConfig>;
    return {
      enabled: saved.enabled === true,
      showGeofencesOnMap: saved.showGeofencesOnMap === true,
      geofences: Array.isArray(saved.geofences) ? saved.geofences : [],
    };
  } catch {
    return defaults;
  }
}

function loadLeftWidth(): number {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(saved) && saved >= 420) return saved;
  } catch { /* storage may be disabled */ }
  return 440;
}

function saveSettings(config: AppConfig): void {
  try {
    const next = { ...config, appName: settingsModel.config.appName, mapProvider: 'amap' as const, libraryRoots: [], port: 0, gpsWriteMode: 'xmp' as const };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    settingsModel.config = next;
    ElMessage.success('设置已保存在当前浏览器');
  } catch {
    ElMessage.error('浏览器无法保存设置，请检查站点存储权限');
  }
}

function persistGeofences(): void {
  try {
    localStorage.setItem(GEOFENCES_KEY, JSON.stringify({
      enabled: geofenceModel.enabled,
      showGeofencesOnMap: geofenceModel.showGeofencesOnMap,
      geofences: geofenceModel.geofences,
    }));
  } catch {
    ElMessage.warning('围栏未能保存到浏览器，刷新后可能丢失');
  }
}

function saveGeofences(config: GeofenceConfig): void {
  geofenceModel.enabled = config.enabled;
  geofenceModel.showGeofencesOnMap = config.showGeofencesOnMap;
  geofenceModel.geofences = config.geofences;
  persistGeofences();
}

function newId(): string {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function importFiles(files: File[]): Promise<void> {
  if (!files.length || mediaModel.busy) return;
  mediaModel.busy = true;
  const names = new Set(mediaModel.items.map((item) => item.name.toLowerCase()));
  let imported = 0;
  let skipped = 0;

  try {
    for (const [index, file] of files.entries()) {
      if (mediaModel.disposed) break;
      const name = safeBrowserMediaName(file.name);
      if (!name || !classifyBrowserMedia(name) || names.has(name.toLowerCase())) {
        skipped++;
        continue;
      }
      mediaModel.progress = `正在读取 ${index + 1}/${files.length}：${name}`;
      try {
        const path = `browser:${newId()}`;
        const item = await createBrowserMediaItem(file, path);
        if (mediaModel.disposed) break;
        registerBrowserMedia(path, file, item.mediaType);
        mediaModel.items.push(item);
        names.add(name.toLowerCase());
        imported++;
        if (!mediaModel.selectedPath) mediaModel.selectedPath = path;
      } catch {
        skipped++;
      }
      if (index % 20 === 19) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
    if (mediaModel.disposed) return;
    mediaModel.progress = `已导入 ${imported} 个${skipped ? `，跳过 ${skipped} 个重复或不支持的文件` : ''}`;
    if (imported) ElMessage.success(mediaModel.progress);
    else ElMessage.warning(mediaModel.progress);
  } finally {
    mediaModel.busy = false;
  }
}

function removeMedia(item: MediaItem): void {
  mediaModel.items = mediaModel.items.filter((entry) => entry.path !== item.path);
  removeBrowserMedia(item.path);
  if (mediaModel.selectedPath === item.path) mediaModel.selectedPath = mediaModel.items[0]?.path ?? '';
}

function placeMedia(payload: { path: string; longitude: number; latitude: number }, notify = true): void {
  if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)
    || Math.abs(payload.latitude) > 90 || Math.abs(payload.longitude) > 180
    || (payload.latitude === 0 && payload.longitude === 0)) {
    ElMessage.error('坐标超出有效范围');
    return;
  }
  const index = mediaModel.items.findIndex((item) => item.path === payload.path);
  if (index < 0) return;
  const item = mediaModel.items[index];
  mediaModel.items[index] = {
    ...item,
    latitude: payload.latitude,
    longitude: payload.longitude,
    hasGps: true,
    gpsSource: 'xmp',
    xmpPath: `${item.name}.xmp`,
  };
  mediaModel.selectedPath = payload.path;
  if (notify) ElMessage.success('位置已更新');
}

function handleDragStart(item: MediaItem, event: DragEvent): void {
  event.dataTransfer?.setData('text/plain', item.path);
  mediaModel.selectedPath = item.path;
}

function downloadXmpZip(): void {
  const result = createXmpZip(mediaModel.items);
  if (!result.exported) {
    ElMessage.warning('当前没有可导出的定位 XMP');
    return;
  }
  const url = URL.createObjectURL(new Blob([new Uint8Array(result.archive)], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'media-location-xmp.zip';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  ElMessage.success(`已打包 ${result.exported} 个 XMP${result.skipped ? `，跳过 ${result.skipped} 个无坐标媒体` : ''}`);
}

function updateLeftWidth(width: number): void {
  layoutModel.leftPanelWidth = width;
  try { localStorage.setItem(WIDTH_KEY, String(width)); } catch { /* storage may be disabled */ }
}

function createGeofence(data: { name: string; color: string }): void {
  const geofence: Geofence = {
    id: newId(), name: data.name, color: data.color, coordinates: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  geofenceModel.geofences.push(geofence);
  geofenceModel.editingGeofenceId = geofence.id;
  geofenceModel.drawingMode = true;
  persistGeofences();
}

function updateGeofence(id: string, data: { name: string; color: string }): void {
  const index = geofenceModel.geofences.findIndex((item) => item.id === id);
  if (index < 0) return;
  geofenceModel.geofences[index] = { ...geofenceModel.geofences[index], ...data, updatedAt: new Date().toISOString() };
  persistGeofences();
}

function deleteGeofence(id: string): void {
  geofenceModel.geofences = geofenceModel.geofences.filter((item) => item.id !== id);
  if (geofenceModel.editingGeofenceId === id) geofenceModel.editingGeofenceId = '';
  persistGeofences();
}

function updateGeofenceArea(id: string, coordinates: GeofenceCoordinate[]): void {
  const index = geofenceModel.geofences.findIndex((item) => item.id === id);
  if (index < 0) return;
  geofenceModel.geofences[index] = { ...geofenceModel.geofences[index], coordinates, updatedAt: new Date().toISOString() };
  geofenceModel.editingGeofenceId = '';
  geofenceModel.drawingMode = false;
  persistGeofences();
}

function cancelGeofenceEdit(): void {
  const id = geofenceModel.editingGeofenceId;
  geofenceModel.geofences = geofenceModel.geofences.filter((item) => item.id !== id || item.coordinates.length > 0);
  geofenceModel.editingGeofenceId = '';
  geofenceModel.drawingMode = false;
  persistGeofences();
}

function dropToGeofence(geofence: Geofence, paths: string[]): void {
  if (geofence.coordinates.length < 3) {
    ElMessage.warning('该围栏还未绘制区域');
    return;
  }
  for (const path of paths) {
    const point = getRandomPointInPolygon(geofence.coordinates);
    placeMedia({ path, longitude: point.longitude, latitude: point.latitude }, false);
  }
  ElMessage.success(`已将 ${paths.length} 个媒体设置到围栏内`);
}

onBeforeUnmount(() => {
  mediaModel.disposed = true;
  clearBrowserMedia();
});
</script>

<template>
  <div class="app-shell browser-app">
    <div class="app-split-layout">
      <div class="left-section" :style="{ width: `${layoutModel.leftPanelWidth}px` }">
        <aside class="browser-left-panel">
          <el-tabs v-model="layoutModel.activeTab" class="browser-tabs" type="border-card">
            <el-tab-pane label="基本功能" name="基本功能">
              <div class="browser-basic">
                <BrowserMediaUpload :busy="mediaModel.busy" :progress="mediaModel.progress" @files="importFiles" />
                <div class="browser-export-bar">
                  <span>可导出 {{ exportableCount }} / {{ mediaModel.items.length }} 个 XMP</span>
                  <el-button type="primary" :icon="Download" :disabled="!exportableCount || mediaModel.busy" @click="downloadXmpZip">下载 XMP ZIP</el-button>
                </div>
                <MediaTable
                  browser-mode
                  current-dir="已导入媒体"
                  :items="visibleItems"
                  :pinned-items="[]"
                  :media-total="filteredItems.length"
                  :media-filter="mediaModel.filter"
                  :has-more="hasMore"
                  :selected-path="mediaModel.selectedPath"
                  :loading="mediaModel.busy"
                  :loading-more="false"
                  :collapsed="mediaModel.collapsed"
                  @select="mediaModel.selectedPath = $event.path"
                  @drag-start="handleDragStart"
                  @manual-place="placeMedia"
                  @filter-change="mediaModel.filter = $event; mediaModel.visibleLimit = PAGE_SIZE"
                  @load-more="mediaModel.visibleLimit += PAGE_SIZE"
                  @toggle="mediaModel.collapsed = !mediaModel.collapsed"
                  @remove="removeMedia"
                />
              </div>
            </el-tab-pane>
            <el-tab-pane label="电子围栏" name="电子围栏">
              <GeofenceTab
                :enabled="geofenceModel.enabled"
                :show-geofences-on-map="geofenceModel.showGeofencesOnMap"
                :geofences="geofenceModel.geofences"
                :busy="geofenceModel.busy"
                :editing-geofence-id="geofenceModel.editingGeofenceId"
                :drawing-mode="geofenceModel.drawingMode"
                @save="saveGeofences"
                @create="createGeofence"
                @update="updateGeofence"
                @delete="deleteGeofence"
                @view="geofenceModel.editingGeofenceId = $event.id; geofenceModel.drawingMode = false"
                @edit-area="geofenceModel.editingGeofenceId = $event.id; geofenceModel.drawingMode = true"
              />
            </el-tab-pane>
            <el-tab-pane label="设置" name="设置">
              <SettingTab browser-mode :config="settingsModel.config" :busy="settingsModel.busy" @save="saveSettings" />
            </el-tab-pane>
          </el-tabs>
        </aside>
      </div>

      <ResizeHandle @resize="updateLeftWidth" />

      <div class="right-section">
        <div class="floating-brand"><span>{{ settingsModel.config.appName }}</span></div>
        <AmapPanel
          class="map-layer"
          :amap-key="settingsModel.config.amapKey"
          :amap-security-code="settingsModel.config.amapSecurityCode"
          :items="visibleItems"
          :selected-path="mediaModel.selectedPath"
          :geofences="visibleGeofences"
          :editing-geofence-id="geofenceModel.editingGeofenceId"
          :drawing-mode="geofenceModel.drawingMode"
          :enable-click-to-copy="settingsModel.config.enableClickToCopy"
          :enable-marker-clustering="settingsModel.config.enableMarkerClustering"
          @select="mediaModel.selectedPath = $event.path"
          @place="placeMedia"
          @error="ElMessage.error($event)"
          @geofence-drawn="updateGeofenceArea"
          @geofence-edited="updateGeofenceArea"
          @cancel-edit="cancelGeofenceEdit"
        >
          <GeofenceFloatingList
            v-if="geofenceModel.enabled && layoutModel.activeTab === '基本功能' && geofenceModel.geofences.length"
            :geofences="geofenceModel.geofences"
            @drop="dropToGeofence"
          />
        </AmapPanel>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.browser-app .left-section { min-width: 0; }
.browser-left-panel { display: flex; flex-direction: column; height: 100%; background: var(--surface); }
.browser-tabs { flex: 1; display: flex; flex-direction: column; min-height: 0; border: none; box-shadow: none; }
.browser-tabs :deep(.el-tabs__header) { margin: 0; border-bottom: 1px solid var(--border); background: var(--surface-strong); }
.browser-tabs :deep(.el-tabs__content) { flex: 1; min-height: 0; padding: 0; }
.browser-tabs :deep(.el-tab-pane) { height: 100%; }
.browser-basic { display: grid; grid-template-rows: auto auto minmax(0, 1fr); gap: 10px; height: 100%; padding: 12px; overflow: hidden; }
.browser-export-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--text-muted); font-size: 12px; }
.browser-export-bar .el-button { flex: none; }
.browser-app :deep(.map-search) { top: 58px; left: 14px; width: min(400px, calc(100% - 28px)); }

@media (max-width: 900px) {
  .browser-app .app-split-layout { flex-direction: column; }
  .browser-app .left-section { width: 100% !important; height: 52%; }
  .browser-app .right-section { height: 48%; min-height: 0; }
  .browser-app :deep(.resize-handle) { display: none; }
}
</style>
