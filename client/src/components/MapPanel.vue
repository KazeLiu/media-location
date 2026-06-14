<script setup lang="ts">
import { computed } from 'vue';
import type { MediaItem, MapProvider, Geofence, GeofenceCoordinate } from '@shared/contracts';
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
    geofences: Geofence[];
    editingGeofenceId: string;
    drawingMode: boolean;
  }>(),
  {
    amapSecurityCode: '',
    mapboxAccessToken: '',
    geofences: () => [],
    editingGeofenceId: '',
    drawingMode: false,
  },
);

const emit = defineEmits<{
  select: [item: MediaItem];
  place: [payload: { path: string; longitude: number; latitude: number }];
  ready: [];
  error: [message: string];
  geofenceDrawn: [id: string, coordinates: GeofenceCoordinate[]];
  geofenceEdited: [id: string, coordinates: GeofenceCoordinate[]];
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
    :geofences="geofences"
    :editing-geofence-id="editingGeofenceId"
    :drawing-mode="drawingMode"
    @select="handleSelect"
    @place="handlePlace"
    @geofence-drawn="$emit('geofenceDrawn', $event[0], $event[1])"
    @geofence-edited="$emit('geofenceEdited', $event[0], $event[1])"
    @ready="handleReady"
    @error="handleError"
  />
</template>
