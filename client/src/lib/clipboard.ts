/**
 * 剪贴板写入原语：从 AmapPanel 抽出的无状态工具。
 * - 优先 navigator.clipboard（需安全上下文）
 * - 不可用时走隐藏 textarea + execCommand 兜底
 * - 失败时组装可定位的错误消息与日志详情
 */

export type ClipboardCopyMethod = 'clipboard' | 'fallback';

export interface ClipboardCopyResult {
  method: ClipboardCopyMethod;
  clipboardError?: unknown;
}

/**
 * 写入剪贴板，优先官方 API，失败/不可用时降级到 textarea 兜底。
 * @returns method 标识实际使用的写入方式；clipboardError 记录官方 API 失败原因
 * @throws 当两种方式都失败时抛出含 clipboard/fallback 双错误详情的消息
 */
export async function copyTextWithFallback(text: string): Promise<ClipboardCopyResult> {
  let clipboardError: unknown = null;

  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return { method: 'clipboard' };
    } catch (error) {
      clipboardError = error;
    }
  }

  try {
    if (copyTextWithTextarea(text)) {
      return { method: 'fallback', clipboardError };
    }
  } catch (error) {
    throw new Error(buildClipboardFailureMessage(clipboardError, error));
  }

  throw new Error(buildClipboardFailureMessage(clipboardError, new Error('document.execCommand returned false')));
}

/** 隐藏 textarea + execCommand('copy') 兜底写入；成功返回 true。 */
export function copyTextWithTextarea(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
    window.getSelection()?.removeAllRanges();
  }
}

/** 组装同时包含官方 API 与兜底失败原因的错误消息。 */
export function buildClipboardFailureMessage(clipboardError: unknown, fallbackError: unknown): string {
  const clipboardMessage = errorToMessage(clipboardError);
  const fallbackMessage = errorToMessage(fallbackError);
  return `Clipboard copy failed. clipboard=${clipboardMessage}; fallback=${fallbackMessage}`;
}

/** 构造用于 /api/client-log 的剪贴板失败详情（含浏览器环境指纹）。 */
export function createClipboardLogDetails(error: unknown): Record<string, unknown> {
  return {
    error: errorToPlainObject(error),
    isSecureContext: window.isSecureContext,
    clipboardAvailable: Boolean(navigator.clipboard?.writeText),
    href: window.location.href,
    userAgent: navigator.userAgent,
  };
}

/** 将任意错误归一为可序列化对象，供日志落盘。 */
export function errorToPlainObject(error: unknown): Record<string, unknown> | null {
  if (!error) {
    return null;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

/** 将任意错误归一为单行消息字符串。无错误返回 'none'。 */
export function errorToMessage(error: unknown): string {
  if (!error) {
    return 'none';
  }

  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
