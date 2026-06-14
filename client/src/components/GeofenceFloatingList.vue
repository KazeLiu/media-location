<script setup lang="ts">
import { ref } from 'vue';
import type { Geofence } from '@shared/contracts';

const props = defineProps<{
  geofences: Geofence[];
}>();

const emit = defineEmits<{
  drop: [geofence: Geofence, mediaPath: string];
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
  const mediaPath = event.dataTransfer?.getData('text/plain');
  if (mediaPath) {
    emit('drop', geofence, mediaPath);
  }
  hoveredId.value = '';
}
</script>

<template>
  <div v-if="geofences.length" class="geofence-floating-list">
    <div class="floating-header">电子围栏</div>

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
.geofence-floating-list {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 200px;
  max-height: 400px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 100;
}

.floating-header {
  padding: 12px 16px;
  font-weight: 600;
  font-size: 14px;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--el-color-primary-light-9);
}

.floating-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.floating-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 4px;

  &:hover {
    background: var(--el-color-primary-light-9);
  }

  &.is-hovered {
    background: var(--el-color-primary-light-8);
    border: 2px dashed var(--el-color-primary);
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
