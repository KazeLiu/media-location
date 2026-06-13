<script setup lang="ts">
import { computed, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { ArrowDown, ArrowRight, Check, Close, Location, Picture, VideoCamera } from '@element-plus/icons-vue';
import { Pin, PinOff } from 'lucide-vue-next';
import type { MediaItem } from '@shared/contracts';
import { getMediaFileUrl, getMediaThumbnailUrl } from '@/api';

const props = defineProps<{
  currentDir: string;
  items: MediaItem[];
  pinnedItems: MediaItem[];
  selectedId: string;
  loading: boolean;
  collapsed: boolean;
  largeWorkspace?: boolean;
}>();

const emit = defineEmits<{
  select: [item: MediaItem];
  dragStart: [item: MediaItem, event: DragEvent];
  manualPlace: [payload: { path: string; longitude: number; latitude: number }];
  togglePin: [item: MediaItem];
  pinCurrentDir: [];
  toggle: [];
}>();

// Manual GPS block: owns the inline coordinate editor shown on media without location.
const manualGpsModel = reactive({
  editingId: '',
  value: '',
});

const pinnedPathSet = computed(() => new Set(props.pinnedItems.map((item) => item.path)));
const displayedItems = computed(() => {
  const currentPaths = new Set(props.items.map((item) => item.path));
  const externalPinnedItems = props.pinnedItems.filter((item) => !currentPaths.has(item.path));

  return [...props.items, ...externalPinnedItems];
});
const displayedMissingGpsCount = computed(() => displayedItems.value.filter((item) => !item.hasGps).length);
const currentDirAllPinned = computed(() => Boolean(props.items.length) && props.items.every((item) => pinnedPathSet.value.has(item.path)));
const currentDirPinTooltip = computed(() =>
  currentDirAllPinned.value ? '取消固定当前目录内的所有媒体' : '固定当前目录内的所有媒体，切换目录后仍会保留在界面里',
);

function isPinned(item: MediaItem): boolean {
  return pinnedPathSet.value.has(item.path);
}

function getPinTooltip(item: MediaItem): string {
  return isPinned(item) ? '取消固定后，切换目录时不再保留在固定区' : '固定后切换文件夹也会保留在界面里';
}

function formatCoordinate(item: MediaItem): string {
  if (typeof item.longitude !== 'number' || typeof item.latitude !== 'number') {
    return '';
  }

  return `${item.longitude.toFixed(6)},${item.latitude.toFixed(6)}`;
}

function startManualInput(item: MediaItem, event: MouseEvent): void {
  event.stopPropagation();
  manualGpsModel.editingId = item.id;
  manualGpsModel.value = '';
}

function cancelManualInput(event?: MouseEvent): void {
  event?.stopPropagation();
  manualGpsModel.editingId = '';
  manualGpsModel.value = '';
}

function submitManualInput(item: MediaItem, event?: MouseEvent): void {
  event?.stopPropagation();
  const coordinate = parseCoordinate(manualGpsModel.value);

  if (!coordinate) {
    ElMessage.warning('请输入有效的经度,纬度');
    return;
  }

  emit('manualPlace', {
    path: item.path,
    longitude: coordinate.longitude,
    latitude: coordinate.latitude,
  });
  cancelManualInput();
}

function parseCoordinate(source: string): { longitude: number; latitude: number } | null {
  const parts = source
    .trim()
    .replaceAll('，', ',')
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(Number);

  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const [longitude, latitude] = parts;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    return null;
  }

  return { longitude, latitude };
}
</script>

<template>
  <section class="panel media-panel">
    <header class="panel-header">
      <el-button
        link
        :icon="collapsed ? ArrowRight : ArrowDown"
        class="panel-title-button"
        @click="emit('toggle')"
      >
        媒体
      </el-button>
      <el-space wrap :size="6" alignment="center">
        <el-tag size="small" effect="plain">共 {{ displayedItems.length }} 个</el-tag>
        <el-tag size="small" type="warning" effect="plain">无经纬度 {{ displayedMissingGpsCount }} 个</el-tag>
        <el-tag size="small" type="info" effect="plain">固定 {{ pinnedItems.length }} 个</el-tag>
      </el-space>
    </header>

    <template v-if="!collapsed">
      <el-scrollbar class="media-scrollbar" v-loading="loading">
        <div class="media-content">
          <section class="media-section">
            <div class="media-section-header">
              <el-text class="media-section-title" tag="div">{{ currentDir || '未选择目录' }}</el-text>
              <el-tooltip :content="currentDirPinTooltip" placement="top">
                <el-button
                  :icon="currentDirAllPinned ? PinOff : Pin"
                  size="small"
                  :type="currentDirAllPinned ? 'warning' : 'primary'"
                  plain
                  :disabled="loading || !items.length"
                  @click="emit('pinCurrentDir')"
                >
                  {{ currentDirAllPinned ? '取消固定当前目录' : '固定当前目录' }}
                </el-button>
              </el-tooltip>
            </div>

            <template v-if="displayedItems.length">
              <div class="media-grid" :class="{ 'large-workspace': largeWorkspace }">
                <el-card
                  v-for="item in displayedItems"
                  :key="item.id"
                  class="media-card"
                  :class="{ selected: item.id === selectedId }"
                  shadow="hover"
                  draggable="true"
                  @click="emit('select', item)"
                  @dragstart="emit('dragStart', item, $event)"
                >
                  <div class="preview-frame">
                    <el-image
                      v-if="item.mediaType === 'image'"
                      :src="getMediaThumbnailUrl(item.path)"
                      fit="contain"
                      lazy
                      class="preview-image"
                    >
                      <template #error>
                        <div class="preview-fallback">
                          <el-icon><Picture /></el-icon>
                        </div>
                      </template>
                    </el-image>
                    <div v-else class="preview-video-cover" role="img" :aria-label="`${item.name} 视频缩略图`">
                      <el-image
                        :src="getMediaThumbnailUrl(item.path)"
                        fit="contain"
                        lazy
                        class="preview-video-thumbnail"
                      >
                        <template #error>
                          <div class="video-cover-fallback">
                            <el-icon><VideoCamera /></el-icon>
                          </div>
                        </template>
                      </el-image>
                      <a
                        class="video-play-badge"
                        :href="getMediaFileUrl(item.path)"
                        target="_blank"
                        rel="noreferrer"
                        draggable="false"
                        :aria-label="`在新标签页播放 ${item.name}`"
                        @click.stop
                        @dragstart.stop.prevent
                      >
                        <el-icon><VideoCamera /></el-icon>
                        新标签播放
                      </a>
                    </div>
                  </div>

                  <div class="media-card-footer">
                    <div class="media-card-topline">
                      <el-tooltip :content="item.relativePath" placement="top">
                        <span class="media-name">{{ item.name }}</span>
                      </el-tooltip>
                    </div>

                    <div v-if="item.hasGps" class="media-card-status-row">
                      <el-tag class="gps-coordinate-tag" size="small" type="success" effect="light">
                        <el-icon><Location /></el-icon>
                        {{ formatCoordinate(item) }}
                      </el-tag>

                      <el-tooltip :content="getPinTooltip(item)" placement="top">
                        <el-button
                          link
                          size="small"
                          class="pin-toggle"
                          :aria-label="isPinned(item) ? '取消固定' : '固定'"
                          @click.stop="emit('togglePin', item)"
                        >
                          <el-icon>
                            <component :is="isPinned(item) ? PinOff : Pin" />
                          </el-icon>
                        </el-button>
                      </el-tooltip>
                    </div>

                    <div
                      v-else-if="manualGpsModel.editingId === item.id"
                      class="manual-gps-editor"
                      @click.stop
                    >
                      <el-input
                        v-model="manualGpsModel.value"
                        size="small"
                        placeholder="输入 WGS-84 坐标"
                        autofocus
                        @keyup.enter="submitManualInput(item)"
                        @keyup.esc="cancelManualInput()"
                      />
                      <el-button :icon="Check" circle size="small" type="primary" @click="submitManualInput(item, $event)" />
                      <el-button :icon="Close" circle size="small" @click="cancelManualInput($event)" />
                    </div>

                    <el-tag
                      v-else
                      class="manual-gps-trigger"
                      size="small"
                      type="info"
                      effect="plain"
                      disable-transitions
                      @click="startManualInput(item, $event)"
                    >
                      <el-icon>
                        <component :is="item.mediaType === 'image' ? Picture : VideoCamera" />
                      </el-icon>
                      无位置信息
                    </el-tag>
                  </div>
                </el-card>
              </div>
            </template>

            <el-empty v-else :image-size="56" description="没有媒体文件" />
          </section>
        </div>
      </el-scrollbar>
    </template>
  </section>
</template>
