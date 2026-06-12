import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { setWindowsGuiSubsystem } = require('../scripts/windows-subsystem.cjs') as {
  setWindowsGuiSubsystem: (exePath: string) => Promise<number>;
};

describe('windows subsystem patching', () => {
  it('switches a PE file to the Windows GUI subsystem', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'media-location-pe-'));
    const exePath = path.join(root, 'app.exe');
    const peOffset = 0x80;
    const optionalHeaderOffset = peOffset + 24;
    const subsystemOffset = optionalHeaderOffset + 68;
    const image = Buffer.alloc(512);

    image.writeUInt16LE(0x5a4d, 0);
    image.writeUInt32LE(peOffset, 0x3c);
    image.write('PE\0\0', peOffset, 'binary');
    image.writeUInt16LE(0x20b, optionalHeaderOffset);
    image.writeUInt16LE(3, subsystemOffset);
    await writeFile(exePath, image);

    const previous = await setWindowsGuiSubsystem(exePath);
    const patched = await readFile(exePath);

    expect(previous).toBe(3);
    expect(patched.readUInt16LE(subsystemOffset)).toBe(2);
  });
});
