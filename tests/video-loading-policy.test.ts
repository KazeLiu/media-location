import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

async function readSource(relativePath: string): Promise<string> {
  return readFile(path.resolve(relativePath), 'utf8');
}

describe('video loading policy', () => {
  it('does not expose inline video loading settings', async () => {
    const source = await readSource('client/src/components/SettingsPanel.vue');

    expect(source).not.toContain('视频内容加载');
    expect(source).not.toContain('loadVideoContent');
  });

  it('does not create inline video elements in the workbench', async () => {
    const mapPanel = await readSource('client/src/components/MapPanel.vue');
    const mediaTable = await readSource('client/src/components/MediaTable.vue');

    expect(mapPanel).not.toContain("document.createElement('video')");
    expect(mediaTable).not.toContain('<video');
  });

  it('uses generated thumbnail images instead of text placeholders for map videos', async () => {
    // 媒体标记 DOM 构造已下沉到 lib/amapMarkerDom.ts，结构断言跟随落点
    const amapMarkerDom = await readSource('client/src/lib/amapMarkerDom.ts');
    const mapboxPanel = await readSource('client/src/components/MapboxPanel.vue');

    // 检查 amapMarkerDom
    const amapVideoBranchStart = amapMarkerDom.indexOf("const thumbnail = document.createElement");
    const amapVideoBranchEnd = amapMarkerDom.indexOf('function createMarkerVideoPlayLink');
    const amapVideoBranch = amapMarkerDom.slice(amapVideoBranchStart, amapVideoBranchEnd);

    expect(amapVideoBranchStart).toBeGreaterThanOrEqual(0);
    expect(amapVideoBranchEnd).toBeGreaterThan(amapVideoBranchStart);
    expect(amapVideoBranch).toContain("document.createElement('img')");
    expect(amapVideoBranch).toContain('.src = getMediaThumbnailUrl(item.path)');
    expect(amapVideoBranch).not.toContain("textContent = 'VIDEO'");

    // 检查 MapboxPanel
    const mapboxVideoBranchStart = mapboxPanel.indexOf("const thumbnail = document.createElement");
    const mapboxVideoBranchEnd = mapboxPanel.indexOf('function createMarkerVideoPlayLink');
    const mapboxVideoBranch = mapboxPanel.slice(mapboxVideoBranchStart, mapboxVideoBranchEnd);

    expect(mapboxVideoBranchStart).toBeGreaterThanOrEqual(0);
    expect(mapboxVideoBranchEnd).toBeGreaterThan(mapboxVideoBranchStart);
    expect(mapboxVideoBranch).toContain("document.createElement('img')");
    expect(mapboxVideoBranch).toContain('.src = getMediaThumbnailUrl(item.path)');
    expect(mapboxVideoBranch).not.toContain("textContent = 'VIDEO'");
  });
});
