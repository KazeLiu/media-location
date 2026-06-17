<script setup lang="ts">
import type { CoordinateSystem } from '@shared/gps';

// 坐标系双向绑定（无副作用，仅影响复制时的显示文本），父级 mapModel.coordinateSystem
const system = defineModel<CoordinateSystem>('system');

defineProps<{
  gcj02Text?: string | null;
  wgs84Text?: string | null;
}>();
</script>

<template>
  <div class="map-coordinate">
    <el-button-group>
      <el-button
        :type="system === 'gcj02' ? 'primary' : 'default'"
        @click="system = 'gcj02'"
      >
        {{ gcj02Text ?? 'GCJ-02' }}
      </el-button>
      <el-button
        :type="system === 'wgs84' ? 'primary' : 'default'"
        @click="system = 'wgs84'"
      >
        {{ wgs84Text ?? 'WGS-84' }}
      </el-button>
    </el-button-group>
  </div>
</template>
