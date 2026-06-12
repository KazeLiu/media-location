<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { Setting } from '@element-plus/icons-vue';
import type { AppConfig, BrowseResponse, MediaItem } from '@shared/contracts';
import { browseDirectory, getConfig, saveConfig, setMediaGps } from './api';
import DirectoryBrowser from './components/DirectoryBrowser.vue';
import FolderPickerDialog from './components/FolderPickerDialog.vue';
import MapPanel from './components/MapPanel.vue';
import MediaTable from './components/MediaTable.vue';
import SettingsPanel from './components/SettingsPanel.vue';

// Settings block: keeps backend-owned app config and save status together.
const settingsModel = reactive({
  busy: false,
  message: '',
  config: {
    appName: 'Media Location',
    appVersion: '0.1.0',
    port: 6755,
    amapKey: '',
    amapSecurityCode: '',
    libraryRoots: [] as string[],
    backupBeforeWrite: false,
  },
});

// Browser block: tracks the current root, child folders, and scanned media in one place.
const browserModel = reactive({
  busy: false,
  error: '',
  currentDir: '',
  parentDir: null as string | null,
  rootDir: null as string | null,
  entries: [] as BrowseResponse['entries'],
  media: [] as MediaItem[],
  directoryTreeRefreshVersion: 0,
});

// Selection block: owns the item that receives map drop/click writes.
const selectionModel = reactive({
  selectedId: '',
  saving: '',
  message: '',
});

// Pin block: keeps hand-picked media visible while browsing other folders.
const pinModel = reactive({
  items: [] as MediaItem[],
});

// Layout block: owns floating panels and dialogs.
const layoutModel = reactive({
  directoryCollapsed: false,
  mediaCollapsed: false,
  settingsOpen: false,
  folderPickerOpen: false,
});

const roots = computed(() => settingsModel.config.libraryRoots);
const visibleMedia = computed(() => mergeMediaItems(pinModel.items, browserModel.media));

async function loadInitial(): Promise<void> {
  settingsModel.busy = true;
  try {
    const config = await getConfig();
    applyConfig(config);
    layoutModel.settingsOpen = !config.amapKey;
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
  if (settingsModel.config.amapKey) {
    layoutModel.settingsOpen = false;
  }
}

function handleMapError(message: string): void {
  settingsModel.message = message;
  layoutModel.settingsOpen = true;
}

function applyConfig(config: AppConfig): void {
  settingsModel.config.appName = config.appName;
  settingsModel.config.appVersion = config.appVersion;
  settingsModel.config.port = config.port;
  settingsModel.config.amapKey = config.amapKey;
  settingsModel.config.amapSecurityCode = config.amapSecurityCode;
  settingsModel.config.libraryRoots = config.libraryRoots;
  settingsModel.config.backupBeforeWrite = config.backupBeforeWrite;
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
  syncSelectionWithVisibleMedia();
}

async function openDirectory(dir: string): Promise<void> {
  browserModel.busy = true;
  browserModel.error = '';
  try {
    const response = await browseDirectory(dir);
    browserModel.currentDir = response.currentDir;
    browserModel.parentDir = response.parentDir;
    browserModel.rootDir = response.rootDir;
    browserModel.entries = response.entries;
    browserModel.media = response.media;
    refreshPinnedMedia(response.media);
    syncSelectionWithVisibleMedia();
  } catch (error) {
    const message = error instanceof Error ? error.message : '目录读取失败';
    browserModel.error = message;
    ElMessage.error(message);
  } finally {
    browserModel.busy = false;
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

function syncSelectionWithVisibleMedia(preferredId?: string): void {
  const items = visibleMedia.value;
  if (preferredId && items.some((item) => item.id === preferredId)) {
    selectionModel.selectedId = preferredId;
    return;
  }

  if (selectionModel.selectedId && items.some((item) => item.id === selectionModel.selectedId)) {
    return;
  }

  selectionModel.selectedId = items[0]?.id ?? '';
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

  syncSelectionWithVisibleMedia(item.id);
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
  syncSelectionWithVisibleMedia(selectionModel.selectedId || nextItems[0]?.id);
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
    layoutModel.settingsOpen = !saved.amapKey;
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
    await refresh();
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
  selectionModel.selectedId = item.id;
}

function handleSelectItem(item: MediaItem): void {
  selectionModel.selectedId = item.id;
}

onMounted(loadInitial);
</script>

<template>
  <div class="app-shell">
    <MapPanel
      class="map-layer"
      :amap-key="settingsModel.config.amapKey"
      :amap-security-code="settingsModel.config.amapSecurityCode"
      :items="visibleMedia"
      :selected-id="selectionModel.selectedId"
      :loading="browserModel.busy"
      @select="handleSelectItem"
      @place="placeMedia"
      @ready="handleMapReady"
      @error="handleMapError"
    />

    <div class="floating-brand">
      <span>{{ settingsModel.config.appName }}</span>
      <small>{{ settingsModel.config.appVersion }}</small>
    </div>

    <el-button
      class="settings-trigger"
      circle
      :icon="Setting"
      @click="layoutModel.settingsOpen = true"
    />

    <SettingsPanel
      v-if="layoutModel.settingsOpen"
      :config="settingsModel.config"
      :busy="settingsModel.busy"
      @save="saveSettings"
      @close="layoutModel.settingsOpen = false"
    />

    <FolderPickerDialog v-model="layoutModel.folderPickerOpen" @confirm="addLibraryRoot" />

    <main class="floating-workbench">
      <section class="stack-column" :class="{ 'media-is-collapsed': layoutModel.mediaCollapsed }">
        <DirectoryBrowser
          :current-dir="browserModel.currentDir"
          :roots="roots"
          :loading="browserModel.busy"
          :collapsed="layoutModel.directoryCollapsed"
          :refresh-version="browserModel.directoryTreeRefreshVersion"
          @add-root="layoutModel.folderPickerOpen = true"
          @open-dir="openDirectory"
          @remove-root="removeLibraryRoot"
          @refresh="refresh"
          @toggle="layoutModel.directoryCollapsed = !layoutModel.directoryCollapsed"
        />

        <MediaTable
          :current-dir="browserModel.currentDir"
          :items="browserModel.media"
          :pinned-items="pinModel.items"
          :selected-id="selectionModel.selectedId"
          :loading="browserModel.busy"
          :collapsed="layoutModel.mediaCollapsed"
          @select="handleSelectItem"
          @drag-start="handleDragStart"
          @manual-place="placeMedia"
          @toggle-pin="togglePinnedMedia"
          @pin-current-dir="pinCurrentDirectory"
          @toggle="layoutModel.mediaCollapsed = !layoutModel.mediaCollapsed"
        />
      </section>
    </main>
  </div>
</template>
