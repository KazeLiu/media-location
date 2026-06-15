import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

async function readStyles(): Promise<string> {
  return readFile(path.resolve('client/src/styles.scss'), 'utf8');
}

function getCssBlock(source: string, selector: string): string {
  const start = source.indexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);

  const nextTopLevelBlock = source.indexOf('\n@', start);
  return source.slice(start, nextTopLevelBlock > start ? nextTopLevelBlock : undefined);
}

describe('map marker layout', () => {
  it('keeps media marker positioning compatible with Mapbox GL marker transforms', async () => {
    const source = await readStyles();
    const markerBlock = getCssBlock(source, '.map-media-marker {');
    const declarationEnd = markerBlock.indexOf('&.selected');
    const markerDeclarations = markerBlock.slice(0, declarationEnd);

    expect(markerDeclarations).toContain('position: relative;');
    expect(markerDeclarations).not.toContain('position: absolute;');
    expect(markerDeclarations).not.toContain('bottom: 0;');
    expect(markerDeclarations).not.toContain('transform: translateX(-50%);');
  });
});
