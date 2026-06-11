import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FolderPickerEntry, FolderPickerResponse, FolderPickerShortcuts } from '../../shared/contracts';

export async function browseFolders(candidatePath?: string): Promise<FolderPickerResponse> {
  if (!candidatePath && process.platform === 'win32') {
    return {
      currentPath: '',
      parentPath: null,
      entries: (await getWindowsDriveRoots()).map((driveRoot) => ({
        name: driveRoot,
        path: driveRoot,
        type: 'directory',
        hasChildren: true,
      })),
    };
  }

  const currentPath = candidatePath ? path.resolve(candidatePath) : await resolveDefaultBrowsePath();
  const stat = await getDirectoryStat(currentPath);

  if (!stat.isDirectory()) {
    throw new Error('无此路径');
  }

  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  const childDirectories = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }));

  return {
    currentPath,
    parentPath: getParentPath(currentPath),
    entries: await listChildFolders(currentPath, childDirectories.map((entry) => entry.name)),
  };
}

export async function getFolderPickerShortcuts(): Promise<FolderPickerShortcuts> {
  const desktopPath = resolveDesktopFolderPath();

  if (!(await isDirectory(desktopPath))) {
    return { desktop: null };
  }

  return {
    desktop: {
      entry: {
        name: '桌面',
        path: desktopPath,
        type: 'directory',
        hasChildren: await directoryHasChildren(desktopPath),
      },
      ancestorPaths: getAncestorPaths(desktopPath),
    },
  };
}

export function resolveDesktopFolderPath(env: NodeJS.ProcessEnv = process.env): string {
  const homePath = env.USERPROFILE || env.HOME || process.cwd();
  return path.resolve(homePath, 'Desktop');
}

async function getDirectoryStat(currentPath: string): Promise<import('node:fs').Stats> {
  try {
    return await fs.stat(currentPath);
  } catch {
    throw new Error('无此路径');
  }
}

export async function listChildFolders(currentPath: string, knownNames?: string[]): Promise<FolderPickerEntry[]> {
  const names = knownNames ?? (await fs.readdir(currentPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }))
    .map((entry) => entry.name);

  return Promise.all(names.map((name) => toFolderPickerEntry(currentPath, name)));
}

async function resolveDefaultBrowsePath(): Promise<string> {
  if (process.platform !== 'win32') {
    return path.parse(process.cwd()).root;
  }

  const driveRoots = await getWindowsDriveRoots();

  if (driveRoots.length > 0) {
    return driveRoots[0];
  }

  return path.parse(process.cwd()).root;
}

async function getWindowsDriveRoots(): Promise<string[]> {
  const driveRoots: string[] = [];

  for (let code = 65; code <= 90; code += 1) {
    const root = `${String.fromCharCode(code)}:\\`;
    try {
      await fs.access(root);
      driveRoots.push(root);
    } catch {
      continue;
    }
  }

  return driveRoots;
}

function getParentPath(currentPath: string): string | null {
  const parent = path.dirname(path.resolve(currentPath));
  return parent === path.resolve(currentPath) ? null : parent;
}

function getAncestorPaths(targetPath: string): string[] {
  const paths: string[] = [];
  let currentPath = path.resolve(targetPath);

  while (true) {
    paths.unshift(currentPath);
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return paths;
    }
    currentPath = parentPath;
  }
}

async function toFolderPickerEntry(basePath: string, name: string): Promise<FolderPickerEntry> {
  const fullPath = path.join(basePath, name);
  return {
    name,
    path: fullPath,
    type: 'directory',
    hasChildren: await directoryHasChildren(fullPath),
  };
}

async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await fs.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

async function directoryHasChildren(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.some((entry) => entry.isDirectory() && !entry.name.startsWith('.'));
  } catch {
    return false;
  }
}
