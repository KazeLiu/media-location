export function nextDirectoryTreeRenderKey(currentKey: number): number {
  return currentKey + 1;
}

export function addExpandedDirectoryKey(keys: string[], path: string): string[] {
  return keys.includes(path) ? keys : [...keys, path];
}

export function removeCollapsedDirectoryKeys(keys: string[], collapsedPath: string): string[] {
  return keys.filter((key) => !isSameOrDescendantPath(key, collapsedPath));
}

function isSameOrDescendantPath(candidatePath: string, parentPath: string): boolean {
  const candidate = normalizeDirectoryKey(candidatePath);
  const parent = normalizeDirectoryKey(parentPath);
  const parentPrefix = parent === '/' ? parent : `${parent}/`;

  return candidate === parent || candidate.startsWith(parentPrefix);
}

function normalizeDirectoryKey(source: string): string {
  const normalized = source.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
  return normalized || '/';
}
