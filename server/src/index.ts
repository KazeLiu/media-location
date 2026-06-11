import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { loadConfig } from './config';
import { openBrowser } from './openBrowser';
import { createApiRouter, createStaticRouter } from './routes';

let activeServer: ReturnType<express.Express['listen']> | null = null;

async function main(): Promise<void> {
  const config = await loadConfig();
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', createApiRouter());

  const clientDist = path.resolve(process.cwd(), 'dist/client');
  if (process.env.NODE_ENV === 'production') {
    app.use(createStaticRouter(clientDist));
  }

  activeServer = app.listen(config.port, '0.0.0.0', async () => {
    const localUrl = `http://127.0.0.1:${config.port}`;
    console.log(`${config.appName} ${config.appVersion} is running at ${localUrl}`);

    if (process.env.MEDIA_LOCATION_OPEN_BROWSER === 'true') {
      openBrowser(localUrl);
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
