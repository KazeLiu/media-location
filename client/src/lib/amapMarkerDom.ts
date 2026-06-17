/**
 * 高德地图标记 DOM 构造（无状态）。
 * 从 AmapPanel 抽出，只负责 DOM 结构与交互隔离，不含 emit/mapModel 等组件业务逻辑。
 * 业务事件（点击展开、拖拽等）由组件在拿到容器后自行挂载。
 */
import type { MediaItem } from '@shared/contracts';
import { getMediaFileUrl, getMediaThumbnailUrl } from '@/api';
import {
  getMapMarkerMediaMode,
  shouldShowMapImagePreviewButton,
  shouldShowMapVideoPlayButton,
} from './mapMarkerMedia';

/**
 * 构造媒体标记容器结构（container + bubble + 媒体 + 操作链接 + 标签 + 指针）。
 * 不挂载任何业务事件；调用方拿到容器后自行绑定 pointer/click/keydown。
 * @param item 媒体项
 * @param expanded 是否展开态
 * @param isSelected 是否选中态（决定 selected class）
 */
export function createMarkerContent(item: MediaItem, expanded: boolean, isSelected: boolean): HTMLElement {
  const container = document.createElement('div');
  container.setAttribute('role', 'button');
  container.tabIndex = 0;
  container.className = `map-media-marker${isSelected ? ' selected' : ''}${expanded ? ' expanded' : ''}`;
  container.title = item.name;

  const bubble = document.createElement('span');
  bubble.className = 'marker-bubble';
  container.appendChild(bubble);

  bubble.appendChild(createMarkerMediaElement(item));

  if (shouldShowMapVideoPlayButton(item.mediaType, expanded)) {
    bubble.appendChild(createMarkerVideoPlayLink(item));
  }

  if (shouldShowMapImagePreviewButton(item.mediaType, expanded)) {
    bubble.appendChild(createMarkerImagePreviewLink(item));
  }

  const label = document.createElement('span');
  label.className = expanded ? 'marker-label marker-label-expanded' : 'marker-label';
  label.textContent = item.gpsSource === 'xmp' ? 'XMP' : 'GPS';
  bubble.appendChild(label);

  const pointer = document.createElement('span');
  pointer.className = 'marker-pointer';
  container.appendChild(pointer);

  return container;
}

/**
 * 构造标记内的媒体元素：图片直接 <img>；视频用带兜底图标的缩略图容器。
 */
export function createMarkerMediaElement(item: MediaItem): HTMLElement {
  const mediaMode = getMapMarkerMediaMode(item.mediaType);

  if (mediaMode === 'image') {
    const media = document.createElement('img');
    media.className = 'marker-media';
    media.src = getMediaThumbnailUrl(item.path);
    media.alt = item.name;
    media.draggable = false;
    media.onerror = () => {
      media.classList.add('marker-media-fallback');
    };
    return media;
  }

  const thumbnail = document.createElement('span');
  thumbnail.className = 'marker-media marker-video-thumbnail';
  thumbnail.setAttribute('role', 'img');
  thumbnail.setAttribute('aria-label', `${item.name} 视频缩略图`);

  const image = document.createElement('img');
  image.className = 'marker-video-frame';
  image.src = getMediaThumbnailUrl(item.path);
  image.alt = item.name;
  image.draggable = false;
  image.onerror = () => {
    image.remove();
    thumbnail.classList.add('marker-video-placeholder');
    if (!thumbnail.querySelector('.marker-video-cover-icon')) {
      const fallbackIcon = document.createElement('span');
      fallbackIcon.className = 'marker-video-cover-icon';
      thumbnail.appendChild(fallbackIcon);
    }
  };
  thumbnail.appendChild(image);
  return thumbnail;
}

/** 构造「新标签页播放」操作链接，阻止其冒泡到标记容器。 */
export function createMarkerVideoPlayLink(item: MediaItem): HTMLElement {
  const link = document.createElement('a');
  link.className = 'marker-media-action';
  link.href = getMediaFileUrl(item.path);
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.innerHTML = '<svg class="icon" viewBox="0 0 1024 1024"><path fill="currentColor" d="M768 256H353.6a32 32 0 1 1 0-64H800a32 32 0 0 1 32 32v448a32 32 0 0 1-64 0V256z"/><path fill="currentColor" d="M777.344 201.344a32 32 0 0 1 45.312 45.312l-544 544a32 32 0 0 1-45.312-45.312l544-544z"/></svg>';
  link.setAttribute('aria-label', `在新标签页播放 ${item.name}`);
  link.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });
  link.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  return link;
}

/** 构造「新标签页查看图片」操作链接，阻止其冒泡到标记容器。 */
export function createMarkerImagePreviewLink(item: MediaItem): HTMLElement {
  const link = document.createElement('a');
  link.className = 'marker-media-action';
  link.href = getMediaFileUrl(item.path);
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.innerHTML = '<svg class="icon" viewBox="0 0 1024 1024"><path fill="currentColor" d="M768 256H353.6a32 32 0 1 1 0-64H800a32 32 0 0 1 32 32v448a32 32 0 0 1-64 0V256z"/><path fill="currentColor" d="M777.344 201.344a32 32 0 0 1 45.312 45.312l-544 544a32 32 0 0 1-45.312-45.312l544-544z"/></svg>';
  link.setAttribute('aria-label', `在新标签页查看 ${item.name}`);
  link.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });
  link.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  return link;
}

/**
 * 构造搜索结果标记内容（图钉样式按钮），阻止默认 pointer/click 行为。
 */
export function createSearchMarkerContent(label: string): HTMLElement {
  const container = document.createElement('button');
  container.type = 'button';
  container.className = 'map-search-marker';
  container.title = label || '搜索结果';
  container.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  container.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  const pin = document.createElement('span');
  pin.className = 'search-marker-pin';
  container.appendChild(pin);

  const dot = document.createElement('span');
  dot.className = 'search-marker-dot';
  pin.appendChild(dot);

  return container;
}
