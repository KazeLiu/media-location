import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('packaging config', () => {
  it('keeps native media runtimes external to the server bundle and packages their files', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

    expect(packageJson.scripts['build:server']).toContain('--external:@ffmpeg-installer/ffmpeg');
    expect(packageJson.scripts['build:server']).not.toContain('--external:sharp');
    expect(packageJson.scripts['package:win']).toContain('--config package.json');
    expect(packageJson.dependencies).not.toHaveProperty('sharp');
    expect(packageJson.pkg?.assets).toEqual(
      expect.arrayContaining([
        'dist/client/index.html',
        'dist/client/assets/**/*',
        'node_modules/@ffmpeg-installer/ffmpeg/**/*',
        'node_modules/@ffmpeg-installer/win32-x64/**/*',
      ]),
    );
    expect(packageJson.pkg?.assets).not.toEqual(expect.arrayContaining(['node_modules/sharp/**/*']));
    expect(packageJson.pkg?.assets).not.toEqual(expect.arrayContaining(['node_modules/@img/sharp-win32-x64/**/*']));
  });

  it('uses a pkg-compatible ffmpeg import path in thumbnail generation', async () => {
    const thumbnailsSource = await readFile('server/src/thumbnails.ts', 'utf8');

    expect(thumbnailsSource).not.toContain("import('@ffmpeg-installer/ffmpeg')");
    expect(thumbnailsSource).toContain("from '@ffmpeg-installer/ffmpeg'");
  });
});
