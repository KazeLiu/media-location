import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

async function readMediaTable(): Promise<string> {
  return readFile(path.resolve('client/src/components/MediaTable.vue'), 'utf8');
}

async function readStyles(): Promise<string> {
  return readFile(path.resolve('client/src/styles.scss'), 'utf8');
}

describe('media card interactions', () => {
  it('keeps drag behavior on the thumbnail instead of the whole card', async () => {
    const source = await readMediaTable();
    const cardStart = source.indexOf('<el-card');
    const previewStart = source.indexOf('class="preview-frame"');
    const footerStart = source.indexOf('<div class="media-card-footer">');
    const cardOpening = source.slice(cardStart, previewStart);
    const previewBlock = source.slice(previewStart, footerStart);

    expect(cardStart).toBeGreaterThanOrEqual(0);
    expect(previewStart).toBeGreaterThan(cardStart);
    expect(footerStart).toBeGreaterThan(previewStart);
    expect(cardOpening).not.toContain('draggable="true"');
    expect(cardOpening).not.toContain('@dragstart');
    expect(previewBlock).toContain('draggable="true"');
    expect(previewBlock).toContain("@dragstart=\"emit('dragStart', item, $event)\"");
  });

  it('copies the filename from the filename control', async () => {
    const source = await readMediaTable();

    expect(source).toContain('copyFileName(item.name, $event)');
    expect(source).toContain('文件名已复制');
    expect(source).toContain('media-name-button');
  });

  it('renders video cards with a thumbnail cover and a separate play link', async () => {
    const source = await readMediaTable();
    const videoCoverClass = source.indexOf('preview-video-cover');
    const footerStart = source.indexOf('<div class="media-card-footer">', videoCoverClass);
    const videoCoverStart = source.lastIndexOf('<', videoCoverClass);
    const videoCoverOpeningEnd = source.indexOf('>', videoCoverStart);
    const videoCoverOpening = source.slice(videoCoverStart, videoCoverOpeningEnd);
    const videoCoverBlock = source.slice(videoCoverStart, footerStart);

    expect(videoCoverClass).toBeGreaterThanOrEqual(0);
    expect(footerStart).toBeGreaterThan(videoCoverClass);
    expect(videoCoverOpening.trimStart().startsWith('<div')).toBe(true);
    expect(videoCoverOpening).not.toContain(':href=');
    expect(videoCoverBlock).toContain(':src="getMediaThumbnailUrl(item.path)"');
    expect(videoCoverBlock).toContain('class="preview-video-thumbnail"');
    expect(videoCoverBlock).toContain('class="video-play-badge"');
    expect(videoCoverBlock).toContain(':href="getMediaFileUrl(item.path)"');
    expect(videoCoverBlock).toContain('@click.stop');
    expect(videoCoverBlock).toContain('draggable="false"');
    expect(videoCoverBlock).not.toContain('VIDEO');
  });

  it('keeps the draggable cursor on video thumbnail covers', async () => {
    const source = await readStyles();
    const previewFrameStart = source.indexOf('.preview-frame');
    const previewImageStart = source.indexOf('.preview-image', previewFrameStart);
    const previewFrameBlock = source.slice(previewFrameStart, previewImageStart);
    const videoCoverStart = source.indexOf('.preview-video-cover {');
    const videoThumbnailStart = source.indexOf('.preview-video-thumbnail', videoCoverStart);
    const videoCoverBlock = source.slice(videoCoverStart, videoThumbnailStart);

    expect(previewFrameStart).toBeGreaterThanOrEqual(0);
    expect(previewImageStart).toBeGreaterThan(previewFrameStart);
    expect(previewFrameBlock).toContain("cursor: grab");
    expect(videoCoverStart).toBeGreaterThanOrEqual(0);
    expect(videoThumbnailStart).toBeGreaterThan(videoCoverStart);
    expect(videoCoverBlock).not.toContain('cursor: default');
  });
});
