// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildClipboardFailureMessage,
  copyTextWithFallback,
  copyTextWithTextarea,
  createClipboardLogDetails,
  errorToMessage,
  errorToPlainObject,
} from '@/lib/clipboard';

describe('clipboard helpers', () => {
  const originalClipboard = navigator.clipboard;
  const originalExecCommand = document.execCommand;

  afterEach(() => {
    vi.restoreAllMocks();
    // happy-dom 下 navigator.clipboard 可能被测试覆盖，恢复兜底
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
    });
    document.execCommand = originalExecCommand;
  });

  it('uses navigator.clipboard when available in a secure context', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });

    const result = await copyTextWithFallback('hello');

    expect(writeText).toHaveBeenCalledWith('hello');
    expect(result.method).toBe('clipboard');
  });

  it('falls back to textarea when clipboard API is missing', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    document.execCommand = vi.fn(() => true);

    const result = await copyTextWithFallback('hello');

    expect(result.method).toBe('fallback');
    expect(result.clipboardError).toBeNull();
  });

  it('throws when both clipboard and fallback fail (execCommand returns false)', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    document.execCommand = vi.fn(() => false);

    await expect(copyTextWithFallback('hello')).rejects.toThrow(
      'Clipboard copy failed. clipboard=none; fallback=Error: document.execCommand returned false',
    );
  });

  it('records the clipboard API error when it rejects and fallback succeeds', async () => {
    const clipboardError = new Error('not allowed');
    const writeText = vi.fn().mockRejectedValue(clipboardError);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    document.execCommand = vi.fn(() => true);

    const result = await copyTextWithFallback('hello');

    expect(result.method).toBe('fallback');
    expect(result.clipboardError).toBe(clipboardError);
  });

  it('copyTextWithTextarea appends, selects, copies, and cleans up the element', () => {
    const exec = vi.fn(() => true);
    document.execCommand = exec;

    const before = document.body.childNodes.length;
    const ok = copyTextWithTextarea('payload');

    expect(ok).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
    // textarea 已被移除，body 子节点数应回到初始
    expect(document.body.childNodes.length).toBe(before);
  });

  it('buildClipboardFailureMessage joins both error descriptions', () => {
    const message = buildClipboardFailureMessage(new Error('boom'), new Error('fallback-down'));
    expect(message).toBe('Clipboard copy failed. clipboard=Error: boom; fallback=Error: fallback-down');
  });

  it('createClipboardLogDetails captures browser environment fingerprint', () => {
    const details = createClipboardLogDetails(new Error('denied'));

    expect(details.error).toMatchObject({ name: 'Error', message: 'denied' });
    expect(details).toHaveProperty('isSecureContext');
    expect(details).toHaveProperty('clipboardAvailable');
    expect(typeof details.href).toBe('string');
    expect(typeof details.userAgent).toBe('string');
  });

  it('errorToPlainObject normalizes Error and plain values', () => {
    expect(errorToPlainObject(null)).toBeNull();
    expect(errorToPlainObject(new TypeError('x'))).toMatchObject({ name: 'TypeError', message: 'x' });
    expect(errorToPlainObject('boom')).toEqual({ message: 'boom' });
  });

  it('errorToMessage returns "none" for empty and stringifies errors', () => {
    expect(errorToMessage(null)).toBe('none');
    expect(errorToMessage(new RangeError('big'))).toBe('RangeError: big');
    expect(errorToMessage('oops')).toBe('oops');
  });
});
