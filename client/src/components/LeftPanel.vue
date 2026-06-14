<script setup lang="ts">
import { computed, reactive } from 'vue';
import type { AppConfig, BrowseResponse, MediaItem, Geofence, GeofenceConfig } from '@shared/contracts';
import DirectoryBrowser from './DirectoryBrowser.vue';
import MediaTable from './MediaTable.vue';
import SettingTab from './SettingTab.vue';
import GuideTab from './GuideTab.vue';
import GeofenceTab from './GeofenceTab.vue';

const props = defineProps<{
  // Browser props
  currentDir: string;
  parentDir: string | null;
  rootDir: string | null;
  entries: BrowseResponse['entries'];
  browserLoading: boolean;
  directoryTreeRefreshVersion: number;

  // Media props
  media: MediaItem[];
  pinnedItems: MediaItem[];
  mediaTotal: number;
  mediaFilter: string;
  hasMore: boolean;
  selectedPath: string;
  mediaLoading: boolean;
  loadingMore: boolean;

  // Settings props
  config: AppConfig;
  settingsBusy: boolean;

  // Geofence props
  geofenceEnabled: boolean;
  geofences: Geofence[];
  geofenceBusy: boolean;
  editingGeofenceId: string;
  drawingMode: boolean;
}>();

const emit = defineEmits<{
  // Browser events
  addRoot: [];
  openDir: [path: string];
  removeRoot: [path: string];
  refresh: [];

  // Media events
  selectMedia: [item: MediaItem];
  dragStart: [item: MediaItem, event: DragEvent];
  manualPlace: [payload: { path: string; longitude: number; latitude: number }];
  togglePin: [item: MediaItem];
  pinCurrentDir: [];
  filterChange: [value: string];
  loadMore: [];

  // Settings events
  saveSettings: [config: AppConfig];

  // Geofence events
  saveGeofences: [config: GeofenceConfig];
  createGeofence: [data: { name: string; color: string }];
  updateGeofence: [id: string, data: { name: string; color: string }];
  deleteGeofence: [id: string];
  viewGeofence: [geofence: Geofence];
  editGeofenceArea: [geofence: Geofence];
}>();

const roots = computed(() => props.config.libraryRoots);

// Collapse state for directory and media sections
const collapseModel = reactive({
  directoryCollapsed: false,
  mediaCollapsed: false,
});

function handleDragStart(item: MediaItem, event: DragEvent): void {
  emit('dragStart', item, event);
}

function handleUpdateGeofence(id: string, data: { name: string; color: string }): void {
  emit('updateGeofence', id, data);
}
</script>

<template>
  <aside class="left-panel">
    <el-tabs class="left-panel-tabs" type="border-card">
      <el-tab-pane label="基本功能">
        <div class="tab-content" :class="{
          'directory-is-collapsed': collapseModel.directoryCollapsed,
          'media-is-collapsed': collapseModel.mediaCollapsed,
        }">
          <DirectoryBrowser
            :current-dir="currentDir"
            :roots="roots"
            :loading="browserLoading"
            :collapsed="collapseModel.directoryCollapsed"
            :refresh-version="directoryTreeRefreshVersion"
            @add-root="emit('addRoot')"
            @open-dir="emit('openDir', $event)"
            @remove-root="emit('removeRoot', $event)"
            @refresh="emit('refresh')"
            @toggle="collapseModel.directoryCollapsed = !collapseModel.directoryCollapsed"
          />

          <MediaTable
            :current-dir="currentDir"
            :items="media"
            :pinned-items="pinnedItems"
            :media-total="mediaTotal"
            :media-filter="mediaFilter"
            :has-more="hasMore"
            :selected-path="selectedPath"
            :loading="mediaLoading"
            :loading-more="loadingMore"
            :collapsed="collapseModel.mediaCollapsed"
            @select="emit('selectMedia', $event)"
            @drag-start="handleDragStart"
            @manual-place="emit('manualPlace', $event)"
            @toggle-pin="emit('togglePin', $event)"
            @pin-current-dir="emit('pinCurrentDir')"
            @filter-change="emit('filterChange', $event)"
            @load-more="emit('loadMore')"
            @toggle="collapseModel.mediaCollapsed = !collapseModel.mediaCollapsed"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="电子围栏">
        <GeofenceTab
            :enabled="geofenceEnabled"
            :geofences="geofences"
            :busy="geofenceBusy"
            :editing-geofence-id="editingGeofenceId"
            :drawing-mode="drawingMode"
            @save="emit('saveGeofences', $event)"
            @create="emit('createGeofence', $event)"
            @update="handleUpdateGeofence"
            @delete="emit('deleteGeofence', $event)"
            @view="emit('viewGeofence', $event)"
            @edit-area="emit('editGeofenceArea', $event)"
        />
      </el-tab-pane>

      <el-tab-pane label="设置">
        <SettingTab
          :config="config"
          :busy="settingsBusy"
          @save="emit('saveSettings', $event)"
        />
      </el-tab-pane>

      <el-tab-pane label="用法指南">
        <GuideTab />
      </el-tab-pane>

    </el-tabs>
  </aside>
</template>

<style scoped lang="scss">
.left-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface);
}

.left-panel-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: none;
  box-shadow: none;

  :deep(.el-tabs__header) {
    margin: 0;
    border-bottom: 1px solid var(--border);
    background: var(--surface-strong);
  }

  :deep(.el-tabs__content) {
    flex: 1;
    min-height: 0;
    padding: 0;
  }

  :deep(.el-tab-pane) {
    height: 100%;
  }
}

.tab-content {
  display: grid;
  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  height: 100%;
  padding: 12px;
  overflow: hidden;

  &.media-is-collapsed {
    grid-template-rows: minmax(0, 1fr) auto;
  }

  &.directory-is-collapsed {
    grid-template-rows: auto minmax(0, 1fr);
  }

  &.directory-is-collapsed.media-is-collapsed {
    align-content: start;
    grid-template-rows: auto auto;
  }
}
</style>
