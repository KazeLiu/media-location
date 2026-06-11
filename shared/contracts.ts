export interface AppConfig {
  appName: string;
  appVersion: string;
  port: number;
  amapKey: string;
  libraryRoots: string[];
  backupBeforeWrite: boolean;
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

export interface BrowseResponse {
  currentDir: string;
  parentDir: string | null;
  rootDir: string | null;
  entries: BrowseEntry[];
  media: MediaItem[];
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
