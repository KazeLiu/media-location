<script setup lang="ts">
import { computed } from 'vue';
import type { MediaItem, MapProvider } from '@shared/contracts';
import AmapPanel from './AmapPanel.vue';
import MapboxPanel from './MapboxPanel.vue';

const props = withDefaults(
  defineProps<{
    mapProvider: MapProvider;
    amapKey: string;
    amapSecurityCode?: string;
    mapboxAccessToken: string;
    items: MediaItem[];
    selectedPath: string;
  }>(),
  {
    amapSecurityCode: '',
    mapboxAccessToken: '',
  },
);

const emit = defineEmits<{
  select: [item: MediaItem];
  place: [payload: { path: string; longitude: number; latitude: number }];
  ready: [];
  error: [message: string];
}>();

const currentMapComponent = computed(() => {
  return props.mapProvider === 'mapbox' ? MapboxPanel : AmapPanel;
});

function handleSelect(item: MediaItem): void {
  emit('select', item);
}

function handlePlace(payload: { path: string; longitude: number; latitude: number }): void {
  emit('place', payload);
}

function handleReady(): void {
  emit('ready');
}

function handleError(message: string): void {
  emit('error', message);
}
</script>

<template>
  <component
    :is="currentMapComponent"
    :amap-key="amapKey"
    :amap-security-code="amapSecurityCode"
    :mapbox-access-token="mapboxAccessToken"
    :items="items"
    :selected-path="selectedPath"
    @select="handleSelect"
    @place="handlePlace"
    @ready="handleReady"
    @error="handleError"
  />
</template>
