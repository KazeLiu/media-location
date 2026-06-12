import type {
  AppConfig,
  BrowseResponse,
  ClientLogPayload,
  FolderPickerEntry,
  FolderPickerResponse,
  FolderPickerShortcuts,
} from '@shared/contracts';

const API_BASE = '/api';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || response.statusText);
  }

  return payload as T;
}

export function getConfig(): Promise<AppConfig> {
  return requestJson<AppConfig>('/config');
}

export function saveConfig(config: Partial<AppConfig>): Promise<AppConfig> {
  return requestJson<AppConfig>('/config', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export function browseDirectory(
  dir?: string,
  options: {
    filter?: string;
    offset?: number;
    limit?: number;
  } = {},
): Promise<BrowseResponse> {
  const params = new URLSearchParams();
  if (dir) {
    params.set('dir', dir);
  }
  if (options.filter) {
    params.set('filter', options.filter);
  }
  if (typeof options.offset === 'number') {
    params.set('offset', String(options.offset));
  }
  if (typeof options.limit === 'number') {
    params.set('limit', String(options.limit));
  }

  const query = params.toString() ? `?${params.toString()}` : '';
  return requestJson<BrowseResponse>(`/library/browse${query}`);
}

export function browseLibraryDirectories(dir: string): Promise<FolderPickerEntry[]> {
  return requestJson<FolderPickerEntry[]>(`/library/directories?dir=${encodeURIComponent(dir)}`);
}

export function browseFolders(dir?: string): Promise<FolderPickerResponse> {
  const query = dir ? `?path=${encodeURIComponent(dir)}` : '';
  return requestJson<FolderPickerResponse>(`/folders${query}`);
}

export function getFolderPickerShortcuts(): Promise<FolderPickerShortcuts> {
  return requestJson<FolderPickerShortcuts>('/folders/shortcuts');
}

export function getMediaThumbnailUrl(path: string): string {
  return `${API_BASE}/media/thumbnail?path=${encodeURIComponent(path)}`;
}

export function getMediaFileUrl(path: string): string {
  return `${API_BASE}/media/file?path=${encodeURIComponent(path)}`;
}

export function setMediaGps(payload: { path: string; latitude: number; longitude: number }): Promise<{ path: string; xmpPath: string; latitude: number; longitude: number }> {
  return requestJson<{ path: string; xmpPath: string; latitude: number; longitude: number }>('/media/set-gps', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function writeClientLog(payload: ClientLogPayload): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>('/client-log', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
