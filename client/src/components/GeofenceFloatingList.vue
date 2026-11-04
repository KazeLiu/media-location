<script setup lang="ts">
import { ref } from 'vue';
import type { Geofence } from '@shared/contracts';

const props = defineProps<{
  geofences: Geofence[];
}>();

const emit = defineEmits<{
  drop: [geofence: Geofence, mediaPaths: string[]];
}>();

const hoveredId = ref('');

function handleDragOver(event: DragEvent, geofence: Geofence): void {
  event.preventDefault();
  hoveredId.value = geofence.id;
}

function handleDragLeave(): void {
  hoveredId.value = '';
}

function handleDrop(event: DragEvent, geofence: Geofence): void {
  event.preventDefault();

  // 先尝试获取批量拖拽数据
  const batchDataStr = event.dataTransfer?.getData('application/json');
  if (batchDataStr) {
    try {
      const batchData = JSON.parse(batchDataStr);
      if (batchData.type === 'batch' && Array.isArray(batchData.paths)) {
        emit('drop', geofence, batchData.paths);
        hoveredId.value = '';
        return;
      }
    } catch (e) {
      console.error('Failed to parse batch drag data:', e);
    }
  }

  // 回退到单个文件拖拽
  const mediaPath = event.dataTransfer?.getData('text/plain');
  if (mediaPath) {
    emit('drop', geofence, [mediaPath]);
  }
  hoveredId.value = '';
}
</script>

<template>
  <div class="geofence-floating-list">
    <div class="floating-header">电子围栏 ({{ geofences.length }})</div>

    <div class="floating-content">
      <div
        v-for="geofence in geofences"
        :key="geofence.id"
        class="floating-item"
        :class="{ 'is-hovered': hoveredId === geofence.id }"
        @dragover="handleDragOver($event, geofence)"
        @dragleave="handleDragLeave"
        @drop="handleDrop($event, geofence)"
      >
        <div
          class="item-color"
          :style="{ backgroundColor: geofence.color }"
        />
        <span class="item-name">{{ geofence.name }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
$row-height: 36px;
$row-gap: 4px;
$list-padding: 8px;

.geofence-floating-list {
  $bottom-offset: 56px;

  position: absolute;
  left: 14px;
  bottom: $bottom-offset;
  width: min(200px, calc(100% - 28px));
  // 为顶部搜索框和底部坐标控件留出空间。
  max-height: calc(100% - 100px - $bottom-offset);
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 100;
}

.floating-header {
  flex: none;
  padding: 12px 16px;
  font-weight: 600;
  font-size: 14px;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--el-color-primary-light-9);
}

.floating-content {
  display: grid;
  grid-auto-rows: $row-height;
  gap: $row-gap;
  max-height: 10 * $row-height + 9 * $row-gap + 2 * $list-padding;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: $list-padding;
}

.floating-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background: var(--el-color-primary-light-9);
  }

  &.is-hovered {
    background: var(--el-color-primary-light-8);
    outline: 2px dashed var(--el-color-primary);
    outline-offset: -2px;
  }
}

.item-color {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  flex-shrink: 0;
}

.item-name {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
