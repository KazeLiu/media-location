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
    const mapPanel = await readSource('client/src/components/MapPanel.vue');
    const videoBranchStart = mapPanel.indexOf("const thumbnail = document.createElement");
    const videoBranchEnd = mapPanel.indexOf('function createMarkerVideoPlayLink');
    const videoBranch = mapPanel.slice(videoBranchStart, videoBranchEnd);

    expect(videoBranchStart).toBeGreaterThanOrEqual(0);
    expect(videoBranchEnd).toBeGreaterThan(videoBranchStart);
    expect(videoBranch).toContain("document.createElement('img')");
    expect(videoBranch).toContain('.src = getMediaThumbnailUrl(item.path)');
    expect(videoBranch).not.toContain("textContent = 'VIDEO'");
  });
});
