import { Dirent, promises as fs } from 'node:fs';
import path from 'node:path';
import type { BrowseEntry } from '../../shared/contracts';

export function ensureWithinRoots(candidate: string, roots: string[]): string {
  const resolvedCandidate = path.resolve(candidate);
  const matched = roots.some((root) => isSameOrChild(resolvedCandidate, path.resolve(root)));

  if (!matched) {
    throw new Error(`Path is outside configured library roots: ${resolvedCandidate}`);
  }

  return resolvedCandidate;
}

export function toSafeRelativePath(candidate: string, root: string): string {
  return path.relative(path.resolve(root), path.resolve(candidate)).replaceAll(path.sep, '/');
}

export function findRootForPath(candidate: string, roots: string[]): string | null {
  const resolvedCandidate = path.resolve(candidate);
  return roots.find((root) => isSameOrChild(resolvedCandidate, path.resolve(root))) ?? null;
}

export function getParentInsideRoot(candidate: string, root: string): string | null {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);

  if (samePath(resolvedCandidate, resolvedRoot)) {
    return null;
  }

  const parent = path.dirname(resolvedCandidate);
  return isSameOrChild(parent, resolvedRoot) ? parent : null;
}

export async function listDirectoryEntries(dir: string): Promise<BrowseEntry[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  return entries
    .filter((entry) => !entry.name.startsWith('.'))
    .sort(sortDirectoryFirst)
    .map((entry) => toBrowseEntry(dir, entry));
}

function toBrowseEntry(dir: string, entry: Dirent): BrowseEntry {
  const fullPath = path.join(dir, entry.name);
  const extension = entry.isFile() ? path.extname(entry.name).toLowerCase() : undefined;

  return {
    name: entry.name,
    path: fullPath,
    type: entry.isDirectory() ? 'directory' : 'file',
    extension,
  };
}

function sortDirectoryFirst(a: Dirent, b: Dirent): number {
  if (a.isDirectory() !== b.isDirectory()) {
    return a.isDirectory() ? -1 : 1;
  }

  return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
}

function isSameOrChild(candidate: string, root: string): boolean {
  const normalizedCandidate = normalizeForCompare(candidate);
  const normalizedRoot = normalizeForCompare(root);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

function samePath(a: string, b: string): boolean {
  return normalizeForCompare(a) === normalizeForCompare(b);
}

function normalizeForCompare(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
