import { promises as fs } from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { spawn } from 'node:child_process';

const RUNTIME_BIN_DIR = path.resolve(process.cwd(), 'data', 'runtime-bin');

export interface FfmpegSetupResult {
  available: boolean;
  path?: string;
  message: string;
}

/**
 * 检查并设置 ffmpeg
 * 优先级：环境变量 > data/runtime-bin/ > 系统 PATH
 */
export async function ensureFfmpeg(): Promise<FfmpegSetupResult> {
  // 1. 检查环境变量
  if (process.env.MEDIA_LOCATION_FFMPEG_PATH) {
    const envPath = process.env.MEDIA_LOCATION_FFMPEG_PATH;
    if (await isFfmpegExecutable(envPath)) {
      return {
        available: true,
        path: envPath,
        message: `使用环境变量指定的 ffmpeg: ${envPath}`,
      };
    }
  }

  // 2. 检查 data/runtime-bin/
  const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const runtimeBinPath = path.join(RUNTIME_BIN_DIR, binaryName);

  if (await isFfmpegExecutable(runtimeBinPath)) {
    return {
      available: true,
      path: runtimeBinPath,
      message: `ffmpeg 已就绪: ${runtimeBinPath}`,
    };
  }

  // 3. 尝试从系统 PATH 查找
  const systemFfmpeg = await findSystemFfmpeg();
  if (systemFfmpeg) {
    return {
      available: true,
      path: systemFfmpeg,
      message: `使用系统 ffmpeg: ${systemFfmpeg}`,
    };
  }

  // 4. ffmpeg 不存在，返回手动安装提示
  return {
    available: false,
    message: [
      '❌ 未找到 ffmpeg',
      '',
      '📥 下载地址:',
      '   https://ffmpeg.org/download.html',
      '   或 https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
      '',
      '📂 存放位置:',
      `   ${runtimeBinPath}`,
      '',
      '🔧 或设置环境变量:',
      '   MEDIA_LOCATION_FFMPEG_PATH=<ffmpeg路径>',
      '',
      '⚠️  视频缩略图功能暂时不可用，图片缩略图功能正常工作',
    ].join('\n'),
  };
}

async function isFfmpegExecutable(ffmpegPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(ffmpegPath);
    if (!stat.isFile() || stat.size === 0) {
      return false;
    }

    // 测试是否可执行
    return new Promise<boolean>((resolve) => {
      const child = spawn(ffmpegPath, ['-version'], {
        windowsHide: true,
        timeout: 3000,
      });

      child.once('error', () => resolve(false));
      child.once('exit', (code) => resolve(code === 0));

      setTimeout(() => {
        child.kill();
        resolve(false);
      }, 3000);
    });
  } catch {
    return false;
  }
}

async function findSystemFfmpeg(): Promise<string | null> {
  const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

  // 尝试直接执行 ffmpeg
  const canExecute = await new Promise<boolean>((resolve) => {
    const child = spawn(binaryName, ['-version'], {
      windowsHide: true,
      timeout: 3000,
    });

    child.once('error', () => resolve(false));
    child.once('exit', (code) => resolve(code === 0));

    setTimeout(() => {
      child.kill();
      resolve(false);
    }, 3000);
  });

  return canExecute ? binaryName : null;
}

interface DownloadResult {
  success: boolean;
  error?: string;
}

async function downloadFfmpeg(targetPath: string): Promise<DownloadResult> {
  const platform = process.platform;

  if (platform !== 'win32') {
    return {
      success: false,
      error: `当前平台 (${platform}) 暂不支持自动下载，请手动安装。`,
    };
  }

  // Windows: 使用 gyan.dev 的 essentials 版本（约 75MB）
  const downloadUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';

  try {
    console.log(`📥 正在从 ${downloadUrl} 下载 ffmpeg...`);
    console.log('提示：首次下载约 75MB，请耐心等待...');

    await fs.mkdir(RUNTIME_BIN_DIR, { recursive: true });
    const zipPath = path.join(RUNTIME_BIN_DIR, 'ffmpeg.zip');

    await downloadFile(downloadUrl, zipPath);

    console.log('✅ 下载完成！');
    console.log('⚠️  需要手动解压:');
    console.log(`   1. 解压 ${zipPath}`);
    console.log(`   2. 将 ffmpeg.exe 移动到: ${targetPath}`);
    console.log('   或设置环境变量: MEDIA_LOCATION_FFMPEG_PATH=<路径>');

    return {
      success: false,
      error: `ffmpeg 已下载到 ${zipPath}，请手动解压并将 ffmpeg.exe 放置到 ${targetPath}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `下载失败: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const tempPath = `${dest}.tmp`;

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      // 处理重定向
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, dest).then(resolve).catch(reject);
          return;
        }
      }

      if (res.statusCode !== 200) {
        reject(new Error(`下载失败: HTTP ${res.statusCode}`));
        return;
      }

      const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
      let downloadedBytes = 0;
      let lastProgress = 0;

      const fileStream = fs.open(tempPath, 'w').then((handle) => {
        res.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          void handle.write(chunk);

          // 显示进度（每 10% 输出一次）
          if (totalBytes > 0) {
            const progress = Math.floor((downloadedBytes / totalBytes) * 100);
            if (progress >= lastProgress + 10) {
              console.log(`下载进度: ${progress}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB / ${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
              lastProgress = progress;
            }
          }
        });

        res.on('end', async () => {
          await handle.close();
          await fs.rename(tempPath, dest);
          resolve();
        });

        res.on('error', async (err) => {
          await handle.close();
          await fs.rm(tempPath, { force: true });
          reject(err);
        });
      }).catch(reject);
    }).on('error', reject);
  });
}
