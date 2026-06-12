import { describe, expect, it } from 'vitest';
import {
  addExpandedDirectoryKey,
  nextDirectoryTreeRenderKey,
  removeCollapsedDirectoryKeys,
} from '../client/src/lib/directoryTree';

describe('directory tree refresh state', () => {
  it('increments the render key so a lazy tree can drop stale child caches', () => {
    expect(nextDirectoryTreeRenderKey(0)).toBe(1);
    expect(nextDirectoryTreeRenderKey(41)).toBe(42);
  });

  it('keeps expanded directory keys unique', () => {
    expect(addExpandedDirectoryKey(['D:\\Media'], 'D:\\Media')).toEqual(['D:\\Media']);
    expect(addExpandedDirectoryKey(['D:\\Media'], 'D:\\Media\\Album')).toEqual([
      'D:\\Media',
      'D:\\Media\\Album',
    ]);
  });

  it('removes collapsed directory keys together with their descendants', () => {
    expect(
      removeCollapsedDirectoryKeys(
        ['D:\\Media', 'D:\\Media\\Album', 'D:\\Media\\Album\\Day1', 'E:\\Archive'],
        'D:\\Media\\Album',
      ),
    ).toEqual(['D:\\Media', 'E:\\Archive']);
  });
});
