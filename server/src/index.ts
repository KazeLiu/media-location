import cors from 'cors';
import express from 'express';
import { renderConsolePage } from './consolePage';
import { loadConfig } from './config';
import { openBrowser } from './openBrowser';
import { cleanupOldLogs, writeOperationLog } from './operationLog';
import { createApiRouter, createStaticRouter } from './routes';
import { resolveClientDist, shouldServeStaticClient } from './runtime';

let activeServer: ReturnType<express.Express['listen']> | null = null;

async function main(): Promise<void> {
  await cleanupOldLogs();
  const config = await loadConfig();
  const app = express();
  const packaged = Boolean((process as { pkg?: unknown }).pkg);

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', createApiRouter({ shutdown: shutdownApplication }));
  app.get('/console', (_req, res) => {
    res.type('html').send(renderConsolePage(config));
  });

  if (shouldServeStaticClient()) {
    app.use(createStaticRouter(resolveClientDist()));
  }

  activeServer = app.listen(config.port, '0.0.0.0', () => {
    const localUrl = `http://127.0.0.1:${config.port}`;
    console.log(`${config.appName} ${config.appVersion} is running at ${localUrl}`);
    void writeOperationLog({
      level: 'info',
      action: 'startup',
      target: localUrl,
      status: 'ok',
      message: `${config.appName} ${config.appVersion} started`,
    }).catch((error) => console.error(error));

    if (packaged) {
      openBrowser(`${localUrl}/console`);
      return;
    }

    if (process.env.MEDIA_LOCATION_OPEN_BROWSER === 'true') {
      openBrowser(localUrl);
    }
  });
}

main().catch(async (error) => {
  console.error(error);
  try {
    await writeOperationLog({
      level: 'error',
      action: 'startup',
      target: 'server',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown startup error',
      details: error instanceof Error ? { stack: error.stack } : undefined,
    });
  } finally {
    process.exit(1);
  }
});

async function shutdownApplication(): Promise<void> {
  await writeOperationLog({
    level: 'info',
    action: 'shutdown',
    target: 'server',
    status: 'ok',
    message: 'Application shutdown requested from local console',
  });

  if (activeServer) {
    await new Promise<void>((resolve) => {
      activeServer?.close(() => resolve());
    });
  }

  setTimeout(() => process.exit(0), 20);
}
