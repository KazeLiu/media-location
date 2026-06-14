import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

export interface GpsValue {
  latitude: number;
  longitude: number;
}

/**
 * 使用 exiftool 将 GPS 坐标直接写入图片 EXIF
 * 需要系统安装 exiftool：https://exiftool.org/
 */
export async function writeGpsToExif(imagePath: string, gps: GpsValue, backupBeforeWrite: boolean): Promise<string> {
  // 检查文件是否存在
  await fs.access(imagePath);

  const args = [
    '-overwrite_original',
    `-GPSLatitude=${Math.abs(gps.latitude)}`,
    `-GPSLatitudeRef=${gps.latitude >= 0 ? 'N' : 'S'}`,
    `-GPSLongitude=${Math.abs(gps.longitude)}`,
    `-GPSLongitudeRef=${gps.longitude >= 0 ? 'E' : 'W'}`,
  ];

  // 如果需要备份，不使用 -overwrite_original，exiftool 会自动创建 .original 备份
  if (backupBeforeWrite) {
    args.shift(); // 移除 -overwrite_original
  }

  args.push(imagePath);

  return new Promise((resolve, reject) => {
    const proc = spawn('exiftool', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (error) => {
      reject(new Error(`exiftool 执行失败: ${error.message}。请确保已安装 exiftool (https://exiftool.org/)`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`exiftool 返回非零退出码 ${code}: ${stderr || stdout}`));
        return;
      }

      resolve(imagePath);
    });
  });
}

/**
 * 检查系统是否安装了 exiftool
 */
export async function checkExiftoolAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('exiftool', ['-ver'], {
      stdio: 'ignore',
    });

    proc.on('error', () => {
      resolve(false);
    });

    proc.on('close', (code) => {
      resolve(code === 0);
    });
  });
}
