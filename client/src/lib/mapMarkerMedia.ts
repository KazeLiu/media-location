import type { MediaItem } from '@shared/contracts';

export type MapMarkerMediaMode = 'image' | 'video-thumbnail';

/** 判断地图媒体标记是否处于展开状态。 */
export function isMapMarkerExpanded(expandedPath: string, itemPath: string): boolean {
  return expandedPath === itemPath;
}

/** 返回点击媒体标记后的展开路径，重复点击同一标记会收起。 */
export function getNextExpandedPath(expandedPath: string, itemPath: string): string {
  return expandedPath === itemPath ? '' : itemPath;
}

/** 根据媒体类型决定地图标记应渲染图片还是轻量视频缩略图。 */
export function getMapMarkerMediaMode(mediaType: MediaItem['mediaType']): MapMarkerMediaMode {
  if (mediaType === 'image') {
    return 'image';
  }

  return 'video-thumbnail';
}

/** 视频只在地图标记展开后显示新标签播放入口。 */
export function shouldShowMapVideoPlayButton(mediaType: MediaItem['mediaType'], expanded: boolean): boolean {
  return mediaType === 'video' && expanded;
}

/** 图片只在地图标记展开后显示新标签预览入口。 */
export function shouldShowMapImagePreviewButton(mediaType: MediaItem['mediaType'], expanded: boolean): boolean {
  return mediaType === 'image' && expanded;
}
