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
    enableClickToCopy: boolean;
    enableMarkerClustering: boolean;
  }>(),
  {
    amapSecurityCode: '',
    mapboxAccessToken: '',
    geofences: () => [],
    editingGeofenceId: '',
    drawingMode: false,
    enableClickToCopy: false,
    enableMarkerClustering: false,
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

function handleGeofenceDrawn(id: string, coords: GeofenceCoordinate[]): void {
  emit('geofenceDrawn', id, coords);
}

function handleGeofenceEdited(id: string, coords: GeofenceCoordinate[]): void {
  emit('geofenceEdited', id, coords);
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
    :enable-click-to-copy="enableClickToCopy"
    :enable-marker-clustering="enableMarkerClustering"
    @select="handleSelect"
    @place="handlePlace"
    @geofence-drawn="handleGeofenceDrawn"
    @geofence-edited="handleGeofenceEdited"
    @ready="handleReady"
    @error="handleError"
  />
</template>
