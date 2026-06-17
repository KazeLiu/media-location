import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { renderConsolePage } from './consolePage';
import { loadConfig } from './config';
import { ensureFfmpeg } from './ffmpegSetup';
import { openBrowser } from './openBrowser';
import { cleanupOldLogs, writeOperationLog } from './operationLog';
import { createApiRouter, createStaticRouter } from './routes';
import { resolveClientDist, shouldServeStaticClient } from './runtime';

let activeServer: ReturnType<express.Express['listen']> | null = null;

async function main(): Promise<void> {
  await cleanupOldLogs();

  // 检查并设置 ffmpeg
  console.log('🔍 正在检查 ffmpeg...');
  await writeOperationLog({
    level: 'info',
    action: 'ffmpeg-check',
    target: 'system',
    status: 'ok',
    message: '正在检查 ffmpeg...',
  }).catch((error) => console.error(error));

  const ffmpegResult = await ensureFfmpeg();
  console.log(ffmpegResult.message);

  if (!ffmpegResult.available) {
    console.warn('⚠️  ffmpeg 不可用，视频缩略图功能将无法使用');
    console.warn('图片缩略图功能仍然可以正常工作');

    // 拆分为多条日志，便于阅读
    await writeOperationLog({
      level: 'warn',
      action: 'ffmpeg-check',
      target: 'system',
      status: 'miss',
      message: '❌ 未找到 ffmpeg',
    }).catch((error) => console.error(error));

    await writeOperationLog({
      level: 'info',
      action: 'ffmpeg-download',
      target: 'guide',
      status: 'ok',
      message: '📥 下载地址: https://ffmpeg.org/download.html',
    }).catch((error) => console.error(error));

    await writeOperationLog({
      level: 'info',
      action: 'ffmpeg-download',
      target: 'guide',
      status: 'ok',
      message: '📥 备用下载: https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
    }).catch((error) => console.error(error));

    const runtimeBinPath = path.resolve(process.cwd(), 'data', 'runtime-bin', 'ffmpeg.exe');
    await writeOperationLog({
      level: 'info',
      action: 'ffmpeg-install',
      target: 'guide',
      status: 'ok',
      message: `📂 存放位置: ${runtimeBinPath}`,
    }).catch((error) => console.error(error));

    await writeOperationLog({
      level: 'info',
      action: 'ffmpeg-install',
      target: 'guide',
      status: 'ok',
      message: '🔧 或设置环境变量: MEDIA_LOCATION_FFMPEG_PATH=<ffmpeg路径>',
    }).catch((error) => console.error(error));

    await writeOperationLog({
      level: 'warn',
      action: 'ffmpeg-status',
      target: 'feature',
      status: 'miss',
      message: '⚠️ 视频缩略图功能暂时不可用，图片缩略图功能正常工作',
    }).catch((error) => console.error(error));
  } else {
    await writeOperationLog({
      level: 'info',
      action: 'ffmpeg-check',
      target: ffmpegResult.path || 'system',
      status: 'ok',
      message: ffmpegResult.message,
    }).catch((error) => console.error(error));
  }

  const config = await loadConfig();
  const app = express();
  const packaged = Boolean((process as { pkg?: unknown }).pkg);

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', createApiRouter({ shutdown: shutdownApplication }));
  app.get('/console', (_req, res) => {
    res.type('html').send(renderConsolePage(config));
  });

  const serveStatic = shouldServeStaticClient();
  console.log(`📁 静态文件服务: ${serveStatic ? '启用' : '禁用'}`);
  console.log(`   - NODE_ENV: ${process.env.NODE_ENV || '(未设置)'}`);
  console.log(`   - packaged: ${packaged}`);

  if (serveStatic) {
    const clientDist = resolveClientDist();
    console.log(`   - 客户端目录: ${clientDist}`);
    app.use(createStaticRouter(clientDist));
  } else {
    console.log(`   - 开发模式下，请单独运行前端开发服务器: npm run dev:client`);
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
      // 打包模式下打开控制台页面
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
