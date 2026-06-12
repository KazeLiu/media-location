import { mkdir, readFile, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanupOldLogs, getLogDir, readRecentLogs, writeOperationLog } from '../server/src/operationLog';

const originalLogDir = process.env.MEDIA_LOCATION_LOG_DIR;

beforeEach(async () => {
  const logDir = path.join(tmpdir(), `media-location-log-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  process.env.MEDIA_LOCATION_LOG_DIR = logDir;
  await mkdir(logDir, { recursive: true });
});

afterEach(() => {
  if (originalLogDir === undefined) {
    delete process.env.MEDIA_LOCATION_LOG_DIR;
  } else {
    process.env.MEDIA_LOCATION_LOG_DIR = originalLogDir;
  }
});

describe('operation logs', () => {
  it('writes json lines into the configured current log folder', async () => {
    const written = await writeOperationLog({
      level: 'info',
      action: 'read:config',
      target: 'app.config.json',
      status: 'ok',
      durationMs: 3,
    });
    const raw = await readFile(written, 'utf8');
    const entry = JSON.parse(raw.trim());

    expect(path.dirname(written)).toBe(getLogDir());
    expect(entry.action).toBe('read:config');
    expect(entry.status).toBe('ok');
    expect(entry.durationMs).toBe(3);
  });

  it('removes log files older than three days', async () => {
    const oldPath = path.join(getLogDir(), 'media-location-2000-01-01.log');
    await writeFile(oldPath, '{}\n', 'utf8');
    const oldTime = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    await utimes(oldPath, oldTime, oldTime);

    await cleanupOldLogs();

    await expect(stat(oldPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reads recent log content for the local console', async () => {
    await writeOperationLog({
      level: 'info',
      action: 'write:gps',
      target: 'D:/photos/a.jpg',
      status: 'ok',
    });

    const logs = await readRecentLogs();

    expect(logs.content).toContain('"action":"write:gps"');
    expect(logs.path).toContain(getLogDir());
  });
});
