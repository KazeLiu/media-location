import path from 'node:path';

type RuntimeEnv = {
  NODE_ENV?: string;
};

type RuntimeProcess = {
  pkg?: unknown;
};

export function shouldServeStaticClient(
  env: RuntimeEnv = process.env,
  runtimeProcess: RuntimeProcess = process as RuntimeProcess,
): boolean {
  return env.NODE_ENV === 'production' || Boolean(runtimeProcess.pkg);
}

export function resolveClientDist(serverModuleDir = resolveServerModuleDir()): string {
  return path.resolve(serverModuleDir, '../client');
}

function resolveServerModuleDir(): string {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }

  return process.cwd();
}
