import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { ensureWithinRoots, toSafeRelativePath } from '../server/src/fs';

describe('filesystem path guards', () => {
  it('allows paths under a configured root', () => {
    const root = resolve('D:/media-root');
    const child = resolve(root, 'album/photo.jpg');

    expect(ensureWithinRoots(child, [root])).toBe(child);
  });

  it('rejects paths outside configured roots', () => {
    const root = resolve('D:/media-root');
    const outside = resolve('D:/private/photo.jpg');

    expect(() => ensureWithinRoots(outside, [root])).toThrow(/outside/i);
  });

  it('returns stable relative paths for UI display', () => {
    const root = resolve('D:/media-root');
    const child = resolve(root, 'album/photo.jpg');

    expect(toSafeRelativePath(child, root)).toBe('album/photo.jpg');
  });
});
