import type { AppConfig } from '../../shared/contracts';

const GITHUB_URL = 'https://github.com/KazeLiu/media-location';
const AUTHOR_NAME = '蓝芷怡';

export function renderConsolePage(config: AppConfig): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(config.appName)} Console</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #eef3f7;
      color: #10212f;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #eef3f7;
    }
    .shell {
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 16px;
      min-height: 100vh;
      padding: 20px;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 16px;
      border: 1px solid #ccd8e3;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 12px 34px rgba(16, 33, 47, 0.11);
    }
    .identity {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    h1 {
      margin: 0;
      font-size: 20px;
      line-height: 1.2;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      color: #5d6f82;
      font-size: 13px;
    }
    a {
      color: #166d59;
      font-weight: 650;
      text-decoration: none;
    }
    a:hover,
    a:focus-visible {
      text-decoration: underline;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }
    button,
    .button-link {
      min-height: 36px;
      padding: 0 12px;
      border: 1px solid #b8c8d7;
      border-radius: 8px;
      background: #ffffff;
      color: #10212f;
      cursor: pointer;
      font: inherit;
    }
    button.primary,
    .button-link.primary {
      line-height: 36px;
      border-color: #166d59;
      background: #1b7f68;
      color: #ffffff;
    }
    button.danger {
      border-color: #c45656;
      background: #ffffff;
      color: #a83a3a;
    }
    button.danger:hover,
    button.danger:focus-visible {
      background: #fff1f1;
    }
    .log-panel {
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 10px;
      min-height: 0;
      padding: 14px;
      border: 1px solid #ccd8e3;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 12px 34px rgba(16, 33, 47, 0.11);
    }
    .log-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: #5d6f82;
      font-size: 13px;
    }
    textarea {
      width: 100%;
      min-height: 520px;
      resize: none;
      border: 1px solid #b8c8d7;
      border-radius: 8px;
      padding: 12px;
      background: #0f1822;
      color: #d9e8f5;
      font: 13px/1.55 "Cascadia Mono", Consolas, monospace;
      tab-size: 2;
      white-space: pre;
    }
    .status {
      min-height: 20px;
      color: #5d6f82;
      font-size: 13px;
    }
    @media (max-width: 720px) {
      .shell { padding: 12px; }
      .topbar { align-items: stretch; flex-direction: column; }
      .actions { justify-content: flex-start; }
      textarea { min-height: 420px; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div class="identity">
        <h1>${escapeHtml(config.appName)}</h1>
        <div class="meta">
          <span>版本 ${escapeHtml(config.appVersion)}</span>
          <span>作者 ${escapeHtml(AUTHOR_NAME)}</span>
          <a href="${GITHUB_URL}" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </div>
      <div class="actions">
        <a class="button-link primary" href="/" target="_blank" rel="noreferrer">打开工作台</a>
        <button id="refreshLogs" type="button">刷新日志</button>
        <button id="copyLogs" type="button">复制日志</button>
        <button id="shutdownApp" class="danger" type="button">关闭程序</button>
      </div>
    </header>
    <section class="log-panel" aria-label="运行日志">
      <div class="log-header">
        <strong>运行日志</strong>
        <span id="logPath"></span>
      </div>
      <textarea id="logs" readonly spellcheck="false">日志加载中...</textarea>
      <div id="status" class="status" aria-live="polite"></div>
    </section>
  </main>
  <script>
    const logsEl = document.getElementById('logs');
    const statusEl = document.getElementById('status');
    const logPathEl = document.getElementById('logPath');
    const refreshButton = document.getElementById('refreshLogs');
    const copyButton = document.getElementById('copyLogs');
    const shutdownButton = document.getElementById('shutdownApp');

    async function loadLogs() {
      statusEl.textContent = '正在读取日志...';
      try {
        const response = await fetch('/api/logs', { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || response.statusText);
        }
        logsEl.value = payload.content || '暂无日志';
        logPathEl.textContent = payload.path || '';
        logsEl.scrollTop = logsEl.scrollHeight;
        statusEl.textContent = '日志已刷新';
      } catch (error) {
        statusEl.textContent = '日志读取失败：' + (error instanceof Error ? error.message : String(error));
      }
    }

    async function copyLogs() {
      try {
        await copyText(logsEl.value);
        statusEl.textContent = '日志已复制';
      } catch (error) {
        statusEl.textContent = '复制失败，请手动选中日志文本复制';
      }
    }

    async function copyText(text) {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
      }
      logsEl.focus();
      logsEl.select();
      if (!document.execCommand('copy')) {
        throw new Error('execCommand copy failed');
      }
      window.getSelection()?.removeAllRanges();
    }

    function closeConsolePage() {
      statusEl.textContent = '关闭请求已发送，正在关闭这个页面...';
      try {
        window.open('', '_self');
        window.close();
      } catch (error) {
        // 浏览器可能阻止脚本关闭非脚本打开的标签页。
      }
      setTimeout(() => {
        statusEl.textContent = '后台程序已收到关闭请求；如果页面没有自动关闭，请手动关闭这个浏览器页面';
      }, 600);
    }

    async function shutdownApp() {
      const confirmed = window.confirm('确定要关闭 Media Location 后台程序吗？');
      if (!confirmed) {
        return;
      }

      shutdownButton.disabled = true;
      statusEl.textContent = '正在关闭程序...';
      try {
        const response = await fetch('/api/shutdown', { method: 'POST' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || response.statusText);
        }
        setTimeout(closeConsolePage, 80);
      } catch (error) {
        shutdownButton.disabled = false;
        statusEl.textContent = '关闭失败：' + (error instanceof Error ? error.message : String(error));
      }
    }

    refreshButton.addEventListener('click', loadLogs);
    copyButton.addEventListener('click', copyLogs);
    shutdownButton.addEventListener('click', shutdownApp);
    void loadLogs();
  </script>
</body>
</html>`;
}

function escapeHtml(source: string): string {
  return source
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
