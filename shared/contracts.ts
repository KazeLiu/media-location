export type MapProvider = 'amap' | 'mapbox';
export type GpsWriteMode = 'xmp' | 'exif';

export interface AppConfig {
  appName: string;
  appVersion: string;
  port: number;
  mapProvider: MapProvider;
  amapKey: string;
  amapSecurityCode: string;
  mapboxAccessToken: string;
  libraryRoots: string[];
  backupBeforeWrite: boolean;
  loadVideoContent: boolean;
  gpsWriteMode: GpsWriteMode;
  enableClickToCopy: boolean;
  enableMarkerClustering: boolean; // 是否启用点位聚合
  _configPath?: string; // 内部属性，用于记录配置文件路径
}

export interface BrowseEntry {
  name: string;
  path: string;
  type: 'directory' | 'file';
  extension?: string;
  size?: number;
}

export interface MediaItem {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  extension: string;
  mediaType: 'image' | 'video';
  xmpPath: string | null;
  hasGps: boolean;
  latitude: number | null;
  longitude: number | null;
  gpsSource: 'embedded' | 'xmp' | null;
}

export interface MediaPage {
  items: MediaItem[];
  total: number;
  offset: number;
  limit: number;
  filter: string;
}

export interface BrowseResponse {
  currentDir: string;
  parentDir: string | null;
  rootDir: string | null;
  entries: BrowseEntry[];
  media: MediaItem[];
  mediaTotal: number;
  mediaOffset: number;
  mediaLimit: number;
  mediaFilter: string;
}

export interface ClientLogPayload {
  level: 'info' | 'warn' | 'error';
  action: string;
  message?: string;
  details?: unknown;
}

export interface FolderPickerEntry {
  name: string;
  path: string;
  type: 'directory';
  hasChildren: boolean;
}

export interface FolderPickerResponse {
  currentPath: string;
  parentPath: string | null;
  entries: FolderPickerEntry[];
}

export interface FolderPickerShortcut {
  entry: FolderPickerEntry;
  ancestorPaths: string[];
}

export interface FolderPickerShortcuts {
  desktop: FolderPickerShortcut | null;
}

export interface GeofenceCoordinate {
  longitude: number;
  latitude: number;
}

export interface Geofence {
  id: string;
  name: string;
  color: string;
  coordinates: GeofenceCoordinate[];
  createdAt: string;
  updatedAt: string;
}

export interface GeofenceConfig {
  enabled: boolean; // 是否在基本功能页面显示围栏列表
  showGeofencesOnMap: boolean; // 是否在基本功能页面显示地图围栏
  geofences: Geofence[];
}
