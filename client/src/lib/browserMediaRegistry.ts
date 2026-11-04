import { shallowReactive } from 'vue';
import type { MediaItem } from '@shared/contracts';
import { createBrowserImageThumbnail } from './browserImageThumbnail';

interface BrowserMediaEntry {
  file: File;
  mediaType: MediaItem['mediaType'];
  originalUrl?: string;
  thumbnailUrl?: string;
  thumbnailTask?: Promise<string | undefined>;
  resolveThumbnail?: (url: string | undefined) => void;
}

const media = shallowReactive(new Map<string, BrowserMediaEntry>());
let thumbnailQueue: { path: string; entry: BrowserMediaEntry }[] = [];
let processingThumbnails = false;
let browserMode = false;

export function enableBrowserMode(): void {
  browserMode = true;
}

export function isBrowserMode(): boolean {
  return browserMode;
}

export function registerBrowserMedia(path: string, file: File, mediaType: MediaItem['mediaType']): void {
  removeBrowserMedia(path);
  // 仅保留文件引用；导入时不解码、不为原图创建 URL。
  media.set(path, shallowReactive({ file, mediaType }));
}

export function getBrowserMediaUrl(path: string): string | undefined {
  const entry = media.get(path);
  if (!entry) return undefined;
  entry.originalUrl ??= URL.createObjectURL(entry.file);
  return entry.originalUrl;
}

export function getBrowserMediaThumbnailUrl(path: string): string | undefined {
  return media.get(path)?.thumbnailUrl;
}

export function requestBrowserMediaThumbnail(path: string): Promise<string | undefined> {
  const entry = media.get(path);
  if (!entry || entry.mediaType !== 'image') return Promise.resolve(undefined);
  // 成功、处理中和失败都复用同一个任务；失败不在每次渲染时重试。
  if (entry.thumbnailTask) return entry.thumbnailTask;
  entry.thumbnailTask = new Promise((resolve) => { entry.resolveThumbnail = resolve; });
  thumbnailQueue.push({ path, entry });
  void processThumbnailQueue();
  return entry.thumbnailTask;
}

async function processThumbnailQueue(): Promise<void> {
  if (processingThumbnails) return;
  processingThumbnails = true;
  try {
    while (thumbnailQueue.length) {
      const { path, entry } = thumbnailQueue.shift()!;
      try {
        if (media.get(path) === entry) {
          const blob = await createBrowserImageThumbnail(entry.file);
          // 删除、清空、同路径重新导入后，过期结果不再注册 URL。
          if (media.get(path) === entry) entry.thumbnailUrl = URL.createObjectURL(blob);
        }
      } catch {
        // 不支持的格式或解码失败保持占位，绝不回退加载原图。
      } finally {
        entry.resolveThumbnail?.(entry.thumbnailUrl);
        entry.resolveThumbnail = undefined;
      }
      // 单任务串行并让出事件循环，避免大批图片连续阻塞交互。
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    processingThumbnails = false;
  }
}

export function removeBrowserMedia(path: string): void {
  const entry = media.get(path);
  if (!entry) return;
  media.delete(path);
  thumbnailQueue = thumbnailQueue.filter((task) => task.entry !== entry);
  entry.resolveThumbnail?.(undefined);
  entry.resolveThumbnail = undefined;
  if (entry.originalUrl) URL.revokeObjectURL(entry.originalUrl);
  if (entry.thumbnailUrl) URL.revokeObjectURL(entry.thumbnailUrl);
}

export function clearBrowserMedia(): void {
  for (const path of media.keys()) removeBrowserMedia(path);
}
