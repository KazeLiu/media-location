import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('packaging config', () => {
  it('keeps sharp external to the server bundle and packages its native runtime files', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

    expect(packageJson.scripts['build:server']).toContain('--external:sharp');
    expect(packageJson.scripts['package:win']).toContain('--config package.json');
    expect(packageJson.pkg?.assets).toEqual(
      expect.arrayContaining([
        'dist/client/index.html',
        'dist/client/assets/**/*',
        'node_modules/sharp/**/*',
        'node_modules/@img/sharp-win32-x64/**/*',
      ]),
    );
  });
});
