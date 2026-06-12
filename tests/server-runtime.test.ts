import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveClientDist, shouldServeStaticClient } from '../server/src/runtime';

describe('server runtime mode', () => {
  it('serves the static client in packaged executables', () => {
    expect(shouldServeStaticClient({}, { pkg: {} })).toBe(true);
  });

  it('resolves the packaged client directory beside the bundled server entry', () => {
    expect(resolveClientDist(path.resolve('C:/snapshot/media-location/dist/server'))).toBe(
      path.resolve('C:/snapshot/media-location/dist/client'),
    );
  });
});
