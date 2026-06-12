import { describe, expect, it } from 'vitest';
import {
  getMapMarkerMediaMode,
  getNextExpandedPath,
  isMapMarkerExpanded,
  shouldShowMapVideoPlayButton,
} from '../client/src/lib/mapMarkerMedia';

describe('map marker media behavior', () => {
  it('toggles video marker expansion independently from playback', () => {
    expect(isMapMarkerExpanded('video-path', 'video-path')).toBe(true);
    expect(getNextExpandedPath('', 'video-path')).toBe('video-path');
    expect(getNextExpandedPath('video-path', 'video-path')).toBe('');
  });

  it('always renders videos as lightweight thumbnails on the map', () => {
    expect(getMapMarkerMediaMode('video')).toBe('video-thumbnail');
    expect(getMapMarkerMediaMode('image')).toBe('image');
  });

  it('shows the map video play button only after the marker is expanded', () => {
    expect(shouldShowMapVideoPlayButton('video', false)).toBe(false);
    expect(shouldShowMapVideoPlayButton('video', true)).toBe(true);
    expect(shouldShowMapVideoPlayButton('image', true)).toBe(false);
  });
});
