// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '@shared/contracts';
import {
  createMarkerContent,
  createMarkerImagePreviewLink,
  createMarkerMediaElement,
  createMarkerVideoPlayLink,
  createSearchMarkerContent,
} from '@/lib/amapMarkerDom';

function makeItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'item-1',
    path: '/photos/a.jpg',
    name: 'a.jpg',
    mediaType: 'image',
    hasGps: true,
    longitude: 116.39,
    latitude: 39.9,
    gpsSource: 'embedded',
    ...overrides,
  } as MediaItem;
}

describe('createMarkerContent', () => {
  it('builds an accessible button-like container with bubble, media, label and pointer', () => {
    const item = makeItem();
    const el = createMarkerContent(item, false, false);

    expect(el.getAttribute('role')).toBe('button');
    expect(el.tabIndex).toBe(0);
    expect(el.className).toBe('map-media-marker');
    expect(el.title).toBe('a.jpg');
    expect(el.querySelector('.marker-bubble')).toBeTruthy();
    expect(el.querySelector('.marker-media')).toBeTruthy();
    expect(el.querySelector('.marker-pointer')).toBeTruthy();
  });

  it('applies selected and expanded classes when flagged', () => {
    const el = createMarkerContent(makeItem(), true, true);
    expect(el.className).toContain('selected');
    expect(el.className).toContain('expanded');
  });

  it('shows the GPS source as the label text', () => {
    const gpsEl = createMarkerContent(makeItem({ gpsSource: 'embedded' }), false, false);
    expect(gpsEl.querySelector('.marker-label')?.textContent).toBe('GPS');

    const xmpEl = createMarkerContent(makeItem({ gpsSource: 'xmp' }), false, false);
    expect(xmpEl.querySelector('.marker-label')?.textContent).toBe('XMP');
  });

  it('uses the expanded label class when expanded', () => {
    const el = createMarkerContent(makeItem(), true, false);
    const label = el.querySelector('.marker-label');
    expect(label?.className).toContain('marker-label-expanded');
  });

  it('renders the video play + image preview action links only when appropriate', () => {
    // video expanded: 应出现播放链接（视频），无图片预览链接
    const videoEl = createMarkerContent(makeItem({ mediaType: 'video' }), true, false);
    expect(videoEl.querySelector('.marker-media-action')).toBeTruthy();

    // image expanded: 应出现预览链接
    const imageEl = createMarkerContent(makeItem({ mediaType: 'image' }), true, false);
    expect(imageEl.querySelector('.marker-media-action')).toBeTruthy();

    // 未展开时不渲染操作链接
    const collapsedEl = createMarkerContent(makeItem({ mediaType: 'image' }), false, false);
    expect(collapsedEl.querySelector('.marker-media-action')).toBeNull();
  });
});

describe('createMarkerMediaElement', () => {
  it('renders an <img> for image media pointing at the thumbnail url', () => {
    const el = createMarkerMediaElement(makeItem({ mediaType: 'image' })) as HTMLImageElement;
    expect(el.tagName).toBe('IMG');
    expect(el.className).toBe('marker-media');
    expect(el.src).toContain('/api/media/thumbnail?path=');
    expect(el.alt).toBe('a.jpg');
    expect(el.draggable).toBe(false);
  });

  it('renders a video thumbnail span with fallback icon on image error', () => {
    const el = createMarkerMediaElement(makeItem({ mediaType: 'video' })) as HTMLElement;
    expect(el.className).toContain('marker-video-thumbnail');
    expect(el.getAttribute('aria-label')).toContain('视频缩略图');

    const img = el.querySelector('.marker-video-frame') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toContain('/api/media/thumbnail?path=');

    // 触发 onerror：图片移除，占位类与兜底图标就位
    img.onerror?.(new Event('error'));
    expect(el.querySelector('.marker-video-frame')).toBeNull();
    expect(el.className).toContain('marker-video-placeholder');
    expect(el.querySelector('.marker-video-cover-icon')).toBeTruthy();
  });

  it('does not duplicate the fallback icon when onerror fires twice', () => {
    const el = createMarkerMediaElement(makeItem({ mediaType: 'video' })) as HTMLElement;
    const img = el.querySelector('.marker-video-frame') as HTMLImageElement;
    img.onerror?.(new Event('error'));
    img.onerror?.(new Event('error'));
    expect(el.querySelectorAll('.marker-video-cover-icon').length).toBe(1);
  });
});

function sharedActionLinkAssertions(link: HTMLAnchorElement, ariaLabel: string): void {
  expect(link.tagName).toBe('A');
  expect(link.className).toBe('marker-media-action');
  expect(link.target).toBe('_blank');
  expect(link.rel).toBe('noreferrer');
  expect(link.href).toContain('/api/media/file?path=');
  expect(link.getAttribute('aria-label')).toBe(ariaLabel);
  expect(link.querySelector('svg.icon')).toBeTruthy();
}

describe('action links', () => {
  it('video play link stops pointer and click propagation', () => {
    const link = createMarkerVideoPlayLink(makeItem()) as HTMLAnchorElement;
    sharedActionLinkAssertions(link, '在新标签页播放 a.jpg');

    const pointerEvent = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const stopPointer = vi.spyOn(pointerEvent, 'stopPropagation');
    const stopClick = vi.spyOn(clickEvent, 'stopPropagation');

    link.dispatchEvent(pointerEvent);
    link.dispatchEvent(clickEvent);
    expect(stopPointer).toHaveBeenCalled();
    expect(stopClick).toHaveBeenCalled();
  });

  it('image preview link stops pointer and click propagation', () => {
    const link = createMarkerImagePreviewLink(makeItem()) as HTMLAnchorElement;
    sharedActionLinkAssertions(link, '在新标签页查看 a.jpg');

    const pointerEvent = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(pointerEvent);
    link.dispatchEvent(clickEvent);
    // 事件被 stopPropagation 即满足预期（不冒泡到标记容器）
    expect(pointerEvent.cancelBubble).toBe(true);
    expect(clickEvent.cancelBubble).toBe(true);
  });
});

describe('createSearchMarkerContent', () => {
  it('builds a pin button that swallows pointer and click', () => {
    const el = createSearchMarkerContent('北京大学') as HTMLButtonElement;
    expect(el.tagName).toBe('BUTTON');
    expect(el.type).toBe('button');
    expect(el.className).toBe('map-search-marker');
    expect(el.title).toBe('北京大学');
    expect(el.querySelector('.search-marker-pin')).toBeTruthy();
    expect(el.querySelector('.search-marker-dot')).toBeTruthy();

    const pointerEvent = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    el.dispatchEvent(pointerEvent);
    el.dispatchEvent(clickEvent);
    expect(pointerEvent.defaultPrevented).toBe(true);
    expect(clickEvent.defaultPrevented).toBe(true);
  });

  it('falls back to a default title when label is empty', () => {
    expect(createSearchMarkerContent('').title).toBe('搜索结果');
  });
});
