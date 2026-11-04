import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browserDir = path.join(projectRoot, 'dist', 'browser');
const outputPath = path.join(projectRoot, 'dist', 'media-location-browser.zip');
const archiveFiles = {};

async function addDirectory(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await addDirectory(filePath);
    } else if (entry.isFile()) {
      const archivePath = path.relative(browserDir, filePath).split(path.sep).join('/');
      archiveFiles[archivePath] = await readFile(filePath);
    }
  }
}

await addDirectory(browserDir);
if (!archiveFiles['index.html']) throw new Error('浏览器构建缺少 index.html');
await writeFile(outputPath, zipSync(archiveFiles, { level: 6 }));

const { size } = await stat(outputPath);
console.log(`浏览器部署包：${outputPath} (${(size / 1024 / 1024).toFixed(2)} MiB)`);
