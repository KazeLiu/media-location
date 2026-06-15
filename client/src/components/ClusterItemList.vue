<script setup lang="ts">
import { computed } from 'vue';
import type { MediaItem } from '@shared/contracts';
import { getMediaFileUrl, getMediaThumbnailUrl } from '@/api';

const props = defineProps<{
  visible: boolean;
  items: MediaItem[];
  position: { x: number; y: number } | null;
  fixedPosition?: boolean; // 是否使用固定位置（右上角）
}>();

const emit = defineEmits<{
  close: [];
  dragStart: [item: MediaItem];
}>();

// 计算弹窗样式
const popupStyle = computed(() => {
  if (!props.visible) {
    return { display: 'none' };
  }

  // 固定位置模式：显示在右上角
  if (props.fixedPosition) {
    return {
      position: 'absolute',
      top: '60px', // 在"已连接"标签下方
      right: '18px',
      display: 'block',
    };
  }

  // 动态位置模式：跟随点击位置
  if (!props.position) {
    return { display: 'none' };
  }

  const POPUP_WIDTH = 280;
  const POPUP_MAX_HEIGHT = 400;
  const OFFSET = 20;

  let x = props.position.x + OFFSET;
  let y = props.position.y + OFFSET;

  // 右侧空间不足，显示在左侧
  if (x + POPUP_WIDTH > window.innerWidth) {
    x = props.position.x - POPUP_WIDTH - OFFSET;
  }

  // 底部空间不足，向上展开
  if (y + POPUP_MAX_HEIGHT > window.innerHeight) {
    y = props.position.y - POPUP_MAX_HEIGHT - OFFSET;
  }

  return {
    position: 'fixed',
    left: `${x}px`,
    top: `${y}px`,
    display: 'block',
  };
});

// 处理拖拽开始
function handleDragStart(event: DragEvent, item: MediaItem): void {
  if (!event.dataTransfer) return;

  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', item.id);

  emit('dragStart', item);
}

// 处理打开文件
function handleOpenFile(event: Event, item: MediaItem): void {
  event.stopPropagation();
  window.open(getMediaFileUrl(item.path), '_blank', 'noreferrer');
}
</script>

<template>
  <div v-if="visible" class="cluster-item-list" :style="popupStyle">
    <div class="cluster-list-header">
      <span class="cluster-list-title">聚合点 ({{ items.length }} 项)</span>
      <button
        type="button"
        class="cluster-list-close"
        aria-label="关闭"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>

    <el-scrollbar class="cluster-list-body" max-height="400px">
      <div
        v-for="item in items"
        :key="item.id"
        class="cluster-item"
        draggable="true"
        @dragstart="handleDragStart($event, item)"
      >
        <img
          :src="getMediaThumbnailUrl(item.path)"
          :alt="item.name"
          class="cluster-item-thumbnail"
          draggable="false"
        />

        <div class="cluster-item-info">
          <div class="cluster-item-filename" :title="item.name">
            {{ item.name }}
          </div>
          <button
              type="button"
              class="cluster-item-open-btn"
              aria-label="打开文件"
              @click="handleOpenFile($event, item)"
          >
            ↗ 新标签页打开
          </button>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>
