import { promises as fs } from 'node:fs';
import path from 'node:path';

export type OperationLogLevel = 'info' | 'warn' | 'error';
export type OperationLogStatus = 'ok' | 'error' | 'miss';

export interface OperationLogInput {
  level: OperationLogLevel;
  action: string;
  target?: string;
  status?: OperationLogStatus;
  message?: string;
  durationMs?: number;
  details?: unknown;
}

export interface RecentLogs {
  path: string;
  content: string;
}

const LOG_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_RECENT_LOG_BYTES = 2 * 1024 * 1024;

let lastCleanupAt = 0;

export function getLogDir(): string {
  return process.env.MEDIA_LOCATION_LOG_DIR
    ? path.resolve(process.env.MEDIA_LOCATION_LOG_DIR)
    : path.resolve(process.cwd(), 'logs');
}

export async function writeOperationLog(input: OperationLogInput): Promise<string> {
  const logDir = getLogDir();
  await fs.mkdir(logDir, { recursive: true });
  await cleanupOldLogsIfNeeded();

  const logPath = path.join(logDir, `media-location-${formatDateForFile(new Date())}.log`);
  const entry = {
    timestamp: new Date().toISOString(),
    level: input.level,
    action: input.action,
    target: input.target,
    status: input.status ?? 'ok',
    message: input.message,
    durationMs: input.durationMs,
    details: input.details,
  };

  await fs.appendFile(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
  return logPath;
}

export async function cleanupOldLogs(): Promise<void> {
  const logDir = getLogDir();
  await fs.mkdir(logDir, { recursive: true });
  const entries = await fs.readdir(logDir, { withFileTypes: true });
  const cutoff = Date.now() - LOG_RETENTION_MS;

  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.log'))
      .map(async (entry) => {
        const fullPath = path.join(logDir, entry.name);
        const stat = await fs.stat(fullPath);
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(fullPath);
        }
      }),
  );

  lastCleanupAt = Date.now();
}

export async function readRecentLogs(): Promise<RecentLogs> {
  const logDir = getLogDir();
  await fs.mkdir(logDir, { recursive: true });
  await cleanupOldLogsIfNeeded();

  const files = await fs.readdir(logDir, { withFileTypes: true });
  const logFiles = files
    .filter((entry) => entry.isFile() && entry.name.endsWith('.log'))
    .map((entry) => path.join(logDir, entry.name))
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { numeric: true }));

  const chunks: string[] = [];
  let totalBytes = 0;

  for (const filePath of logFiles.slice(-5)) {
    const raw = await fs.readFile(filePath, 'utf8');
    chunks.push(raw);
    totalBytes += Buffer.byteLength(raw);
  }

  let content = chunks.join('');
  if (totalBytes > MAX_RECENT_LOG_BYTES) {
    content = content.slice(-MAX_RECENT_LOG_BYTES);
  }

  return {
    path: logDir,
    content,
  };
}

async function cleanupOldLogsIfNeeded(): Promise<void> {
  if (Date.now() - lastCleanupAt < 60 * 60 * 1000) {
    return;
  }

  await cleanupOldLogs();
}

function formatDateForFile(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
