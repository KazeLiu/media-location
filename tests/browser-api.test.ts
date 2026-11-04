// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, watchEffect } from 'vue';
import { getMediaFileUrl, getMediaThumbnailUrl, writeClientLog } from '../client/src/api';
import { clearBrowserMedia, enableBrowserMode, registerBrowserMedia, requestBrowserMediaThumbnail } from '../client/src/lib/browserMediaRegistry';
import { createBrowserImageThumbnail } from '../client/src/lib/browserImageThumbnail';
import { createMarkerContent } from '../client/src/lib/amapMarkerDom';
import type { MediaItem } from '../shared/contracts';

vi.mock('../client/src/lib/browserImageThumbnail', () => ({ createBrowserImageThumbnail: vi.fn() }));
const generate = vi.mocked(createBrowserImageThumbnail);
const item = {
  id: 'browser:photo', path: 'browser:photo', name: 'photo.jpg', mediaType: 'image', gpsSource: 'embedded',
} as MediaItem;

beforeEach(() => {
  let serial = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:local-${++serial}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  generate.mockReset().mockResolvedValue(new Blob(['small'], { type: 'image/jpeg' }));
  enableBrowserMode();
});
afterEach(async () => {
  clearBrowserMedia();
  await new Promise((resolve) => setTimeout(resolve, 10));
  vi.restoreAllMocks();
});

describe('browser edition media URLs', () => {
  it('uses separate local thumbnails without backend calls or original-file fallback', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const file = new File(['photo'], 'photo.jpg');
    registerBrowserMedia(item.path, file, 'image');
    expect(getMediaThumbnailUrl(item.path)).toBe('');
    const url = await requestBrowserMediaThumbnail(item.path);
    expect(getMediaThumbnailUrl(item.path)).toBe(url);
    expect(getMediaFileUrl(item.path)).not.toBe(url);
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
    await expect(writeClientLog({ level: 'info', action: 'copy' })).resolves.toEqual({ ok: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('updates Vue image bindings when the asynchronous thumbnail becomes available', async () => {
    registerBrowserMedia(item.path, new File(['photo'], 'photo.jpg'), 'image');
    let src = '';
    const stop = watchEffect(() => { src = getMediaThumbnailUrl(item.path); });
    expect(src).toBe('');
    await requestBrowserMediaThumbnail(item.path);
    await nextTick();
    expect(src).toMatch(/^blob:/);
    expect(generate).toHaveBeenCalledTimes(1);
    stop();
  });

  it('updates the existing native map image without recreating the marker and shares the list cache', async () => {
    registerBrowserMedia(item.path, new File(['photo'], 'photo.jpg'), 'image');
    const marker = createMarkerContent(item, false, false);
    const image = marker.querySelector('img')!;
    expect(image.hasAttribute('src')).toBe(false);
    expect(image.classList.contains('marker-media-fallback')).toBe(true);
    const url = await requestBrowserMediaThumbnail(item.path);
    await Promise.resolve();
    expect(marker.querySelector('img')).toBe(image);
    expect(image.src).toBe(url);
    expect(image.classList.contains('marker-media-fallback')).toBe(false);
    expect(getMediaThumbnailUrl(item.path)).toBe(url);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('keeps unsupported images and videos on lightweight placeholders', async () => {
    generate.mockRejectedValue(new Error('unsupported format'));
    registerBrowserMedia(item.path, new File(['bad'], 'photo.heic'), 'image');
    const imageMarker = createMarkerContent(item, true, false);
    await requestBrowserMediaThumbnail(item.path);
    expect(imageMarker.querySelector('img')?.hasAttribute('src')).toBe(false);
    const video = { ...item, path: 'browser:video', mediaType: 'video' } as MediaItem;
    registerBrowserMedia(video.path, new File(['video'], 'video.mp4'), 'video');
    expect(getMediaThumbnailUrl(video.path)).toBe('');
    const videoMarker = createMarkerContent(video, true, false);
    expect(videoMarker.querySelector('video, img')).toBeNull();
    expect(videoMarker.querySelector('.marker-video-cover-icon')).toBeTruthy();
    expect(videoMarker.querySelector('a')?.href).toMatch(/^blob:/);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
