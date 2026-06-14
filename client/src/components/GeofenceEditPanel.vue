<script setup lang="ts">
import { computed } from 'vue';
import type { Geofence, GeofenceCoordinate } from '@shared/contracts';

const props = defineProps<{
  geofence: Geofence;
  coordinates: GeofenceCoordinate[];
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const pointCount = computed(() => props.coordinates.length);

// 计算多边形面积（平方米）
// 使用 Shoelace 公式计算球面多边形近似面积
const area = computed(() => {
  if (props.coordinates.length < 3) return 0;

  const R = 6371000; // 地球半径（米）
  const coords = props.coordinates;

  let area = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    const lat1 = coords[i].latitude * Math.PI / 180;
    const lat2 = coords[j].latitude * Math.PI / 180;
    const lng1 = coords[i].longitude * Math.PI / 180;
    const lng2 = coords[j].longitude * Math.PI / 180;

    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  area = Math.abs(area * R * R / 2);
  return area;
});

const areaText = computed(() => {
  const a = area.value;
  if (a >= 1000000) {
    return `${(a / 1000000).toFixed(2)} km²`;
  }
  return `${a.toFixed(0)} m²`;
});
</script>

<template>
  <div class="geofence-edit-panel">
    <div class="panel-header">
      <div class="status-indicator">
        <span class="status-text">正在编辑"{{ geofence.name }}"</span>
      </div>
    </div>

    <div class="panel-info">
      <div class="info-item">
        <span class="info-label">顶点数：</span>
        <span class="info-value">{{ pointCount }}</span>
      </div>
      <div class="info-item">
        <span class="info-label">面积：</span>
        <span class="info-value">{{ areaText }}</span>
      </div>
    </div>

    <div class="panel-actions">
      <el-button size="small" @click="emit('cancel')">
        取消
      </el-button>
      <el-button
        type="primary"
        size="small"
        :disabled="pointCount < 3"
        @click="emit('confirm')"
      >
        确认保存
      </el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.geofence-edit-panel {
  position: absolute;
  left: 16px;
  bottom: 16px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  padding: 16px;
  min-width: 280px;
  z-index: 1000;
}

.panel-header {
  margin-bottom: 12px;
}

.status-indicator {
  display: flex;
  align-items: center;
}

.status-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-color-primary);
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.02);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.panel-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}

.info-item {
  display: flex;
  align-items: center;
  font-size: 14px;
}

.info-label {
  color: var(--el-text-color-secondary);
  margin-right: 8px;
}

.info-value {
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.panel-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
