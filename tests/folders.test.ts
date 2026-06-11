import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { browseFolders, resolveDesktopFolderPath } from '../server/src/folders';

describe('folder picker browsing', () => {
  it('returns only child directories for a selected folder', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-folders-'));
    const childDir = path.join(root, 'album');
    const filePath = path.join(root, 'photo.jpg');

    await mkdir(childDir, { recursive: true });
    await writeFile(filePath, 'demo');

    const result = await browseFolders(root);

    expect(result.currentPath).toBe(path.resolve(root));
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.path).toBe(path.join(path.resolve(root), 'album'));
    expect(result.entries[0]?.type).toBe('directory');
    expect(result.entries[0]?.name).toBe('album');
    expect(result.entries[0]?.hasChildren).toBe(false);
  });

  it('marks directories with child folders for lazy tree expansion', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-folders-'));
    const childDir = path.join(root, 'album');
    const nestedDir = path.join(childDir, 'day-one');

    await mkdir(nestedDir, { recursive: true });

    const result = await browseFolders(root);

    expect(result.entries[0]?.name).toBe('album');
    expect(result.entries[0]?.hasChildren).toBe(true);
  });

  it('reports a clear message when a typed folder path does not exist', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-folders-'));
    const missingPath = path.join(root, 'missing');

    await expect(browseFolders(missingPath)).rejects.toThrow('无此路径');
  });

  it('resolves the Windows desktop folder from USERPROFILE', () => {
    const desktop = resolveDesktopFolderPath({
      USERPROFILE: 'C:\\Users\\Alice',
      HOME: 'D:\\Home',
    });

    expect(desktop).toBe(path.resolve('C:\\Users\\Alice', 'Desktop'));
  });
});
