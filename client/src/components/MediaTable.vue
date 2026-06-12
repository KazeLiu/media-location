<script setup lang="ts">
import { computed, reactive } from 'vue';
import { ElMessage } from 'element-plus';
import { ArrowDown, ArrowRight, Check, Close, Location, Picture, Search, VideoCamera } from '@element-plus/icons-vue';
import { Pin, PinOff } from 'lucide-vue-next';
import type { MediaItem } from '@shared/contracts';
import { getMediaFileUrl, getMediaThumbnailUrl } from '@/api';

const props = defineProps<{
  currentDir: string;
  items: MediaItem[];
  pinnedItems: MediaItem[];
  mediaTotal: number;
  mediaFilter: string;
  hasMore: boolean;
  selectedPath: string;
  loading: boolean;
  loadingMore: boolean;
  collapsed: boolean;
}>();

const emit = defineEmits<{
  select: [item: MediaItem];
  dragStart: [item: MediaItem, event: DragEvent];
  manualPlace: [payload: { path: string; longitude: number; latitude: number }];
  togglePin: [item: MediaItem];
  pinCurrentDir: [];
  filterChange: [value: string];
  loadMore: [];
  toggle: [];
}>();

type MediaSectionKey = 'current' | 'pinned';

interface MediaSection {
  key: MediaSectionKey;
  title: string;
  items: MediaItem[];
  emptyDescription: string;
  collapsed: boolean;
}

// Manual GPS block: owns the inline coordinate editor shown on media without location.
const manualGpsModel = reactive({
  editingPath: '',
  value: '',
});

// Pin section block: keeps the separate pinned media shelf collapsible.
const pinSectionModel = reactive({
  collapsed: false,
});

const pinnedPathSet = computed(() => new Set(props.pinnedItems.map((item) => item.path)));
const currentDirectoryItems = computed(() => props.items.filter((item) => !pinnedPathSet.value.has(item.path)));
const currentMissingGpsCount = computed(() => currentDirectoryItems.value.filter((item) => !item.hasGps).length);
const currentEmptyDescription = computed(() =>
  props.items.length && !currentDirectoryItems.value.length
    ? '当前目录媒体都已固定'
    : props.mediaFilter
      ? '没有匹配媒体'
      : '没有媒体文件',
);
const currentDirAllPinned = computed(() => Boolean(props.items.length) && props.items.every((item) => pinnedPathSet.value.has(item.path)));
const currentDirPinTooltip = computed(() =>
  currentDirAllPinned.value ? '取消固定当前目录内的所有媒体' : '固定当前目录内的所有媒体，切换目录后仍会保留在界面里',
);
const mediaSections = computed<MediaSection[]>(() => {
  const sections: MediaSection[] = [
    {
      key: 'current',
      title: props.currentDir || '未选择目录',
      items: currentDirectoryItems.value,
      emptyDescription: currentEmptyDescription.value,
      collapsed: false,
    },
  ];

  if (props.pinnedItems.length) {
    sections.push({
      key: 'pinned',
      title: '固定媒体',
      items: props.pinnedItems,
      emptyDescription: '没有固定媒体',
      collapsed: pinSectionModel.collapsed,
    });
  }

  return sections;
});

function togglePinSection(): void {
  pinSectionModel.collapsed = !pinSectionModel.collapsed;
}

function isPinned(item: MediaItem): boolean {
  return pinnedPathSet.value.has(item.path);
}

async function copyFileName(fileName: string, event: MouseEvent): Promise<void> {
  event.stopPropagation();

  try {
    await copyTextWithFallback(fileName);
    ElMessage.success('文件名已复制');
  } catch {
    ElMessage.error('文件名复制失败，请手动复制');
  }
}

async function copyTextWithFallback(text: string): Promise<void> {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

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
    if (!document.execCommand('copy')) {
      throw new Error('copy failed');
    }
  } finally {
    document.body.removeChild(textarea);
    window.getSelection()?.removeAllRanges();
  }
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
  manualGpsModel.editingPath = item.path;
  manualGpsModel.value = '';
}

function cancelManualInput(event?: MouseEvent): void {
  event?.stopPropagation();
  manualGpsModel.editingPath = '';
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
        <el-tag size="small" effect="plain">已加载 {{ items.length }}/{{ mediaTotal }} 个</el-tag>
        <el-tag size="small" type="warning" effect="plain">无经纬度 {{ currentMissingGpsCount }} 个</el-tag>
        <el-tag size="small" type="info" effect="plain">固定 {{ pinnedItems.length }} 个</el-tag>
      </el-space>
    </header>

    <template v-if="!collapsed">
      <el-scrollbar class="media-scrollbar" v-loading="loading">
        <div class="media-content">
          <div class="media-toolbar">
            <el-input
              :model-value="mediaFilter"
              :prefix-icon="Search"
              clearable
              placeholder="按文件名过滤"
              @input="emit('filterChange', String($event))"
            />
          </div>

          <section
            v-for="section in mediaSections"
            :key="section.key"
            class="media-section"
            :class="{ 'pinned-media-section': section.key === 'pinned' }"
          >
            <div class="media-section-header">
              <el-text v-if="section.key === 'current'" class="media-section-title" tag="div">{{ section.title }}</el-text>
              <el-button
                v-else
                link
                class="media-section-title-button"
                :icon="section.collapsed ? ArrowRight : ArrowDown"
                :aria-expanded="!section.collapsed"
                @click="togglePinSection"
              >
                {{ section.title }}
              </el-button>

              <el-tooltip v-if="section.key === 'current'" :content="currentDirPinTooltip" placement="top">
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
              <el-tag v-else size="small" type="info" effect="plain">{{ pinnedItems.length }} 个</el-tag>
            </div>

            <template v-if="!section.collapsed && section.items.length">
              <div class="media-grid">
                <el-card
                  v-for="item in section.items"
                  :key="item.path"
                  class="media-card"
                  :class="{ selected: item.path === selectedPath }"
                  shadow="hover"
                  @click="emit('select', item)"
                >
                  <div
                    class="preview-frame"
                    draggable="true"
                    @dragstart="emit('dragStart', item, $event)"
                  >
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
                    <div
                      v-else
                      class="preview-video-cover"
                      role="img"
                      :aria-label="`${item.name} 视频缩略图`"
                    >
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
                        <button
                          type="button"
                          class="media-name-button"
                          :aria-label="`复制文件名 ${item.name}`"
                          @click="copyFileName(item.name, $event)"
                        >
                          <span class="media-name">{{ item.name }}</span>
                        </button>
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
                      v-else-if="manualGpsModel.editingPath === item.path"
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

                    <div v-else class="media-card-status-row">
                      <el-tag
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

                  </div>
                </el-card>
              </div>
            </template>

            <el-empty
              v-else-if="!section.collapsed"
              :image-size="56"
              :description="section.emptyDescription"
            />

            <div v-if="!section.collapsed && section.key === 'current' && hasMore" class="media-load-more">
              <el-button
                type="primary"
                plain
                :loading="loadingMore"
                :disabled="loading"
                @click="emit('loadMore')"
              >
                加载更多
              </el-button>
            </div>
          </section>
        </div>
      </el-scrollbar>
    </template>
  </section>
</template>
