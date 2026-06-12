const fs = require('node:fs/promises');
const path = require('node:path');

const DOS_SIGNATURE = 0x5a4d;
const PE_SIGNATURE = 'PE\0\0';
const PE_POINTER_OFFSET = 0x3c;
const COFF_HEADER_SIZE = 24;
const SUBSYSTEM_OFFSET_IN_OPTIONAL_HEADER = 68;
const WINDOWS_GUI_SUBSYSTEM = 2;

async function setWindowsGuiSubsystem(exePath) {
  const resolvedPath = path.resolve(exePath);
  const image = await fs.readFile(resolvedPath);

  if (image.length < 256 || image.readUInt16LE(0) !== DOS_SIGNATURE) {
    throw new Error(`Not a valid Windows PE executable: ${resolvedPath}`);
  }

  const peOffset = image.readUInt32LE(PE_POINTER_OFFSET);
  if (image.toString('binary', peOffset, peOffset + 4) !== PE_SIGNATURE) {
    throw new Error(`Missing PE signature: ${resolvedPath}`);
  }

  const subsystemOffset = peOffset + COFF_HEADER_SIZE + SUBSYSTEM_OFFSET_IN_OPTIONAL_HEADER;
  const previous = image.readUInt16LE(subsystemOffset);
  image.writeUInt16LE(WINDOWS_GUI_SUBSYSTEM, subsystemOffset);
  await fs.writeFile(resolvedPath, image);

  return previous;
}

async function main() {
  const exePath = process.argv[2];
  if (!exePath) {
    throw new Error('Usage: node scripts/windows-subsystem.cjs <path-to-exe>');
  }

  const previous = await setWindowsGuiSubsystem(exePath);
  console.log(`Patched ${path.resolve(exePath)} subsystem ${previous} -> ${WINDOWS_GUI_SUBSYSTEM}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  setWindowsGuiSubsystem,
};
