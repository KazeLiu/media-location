<script setup lang="ts">
type MapLayerMode = 'standard' | 'satellite';

// 图层模式与路网开关均为只读展示；切换会触发父级 AMap 实例副作用
// （switchMapLayer 重置 roadNet + applyMapLayers；toggleSatelliteRoadNet 调 applyMapLayers），
// 故用 props + emit 而非 v-model。
defineProps<{
  layerMode: MapLayerMode;
  roadNet: boolean;
}>();

const emit = defineEmits<{
  switch: [mode: MapLayerMode];
  'toggle-roadnet': [value: boolean];
}>();
</script>

<template>
  <div class="map-layer-switch">
    <el-checkbox
      v-if="layerMode === 'satellite'"
      :model-value="roadNet"
      @update:model-value="emit('toggle-roadnet', Boolean($event))"
    >
      路网
    </el-checkbox>
    <el-button-group>
      <el-button
        :type="layerMode === 'satellite' ? 'primary' : 'default'"
        @click="emit('switch', 'satellite')"
      >
        卫星图
      </el-button>
      <el-button
        :type="layerMode === 'standard' ? 'primary' : 'default'"
        @click="emit('switch', 'standard')"
      >
        标准图
      </el-button>
    </el-button-group>
  </div>
</template>
