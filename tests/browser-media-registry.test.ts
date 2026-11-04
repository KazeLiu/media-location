// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearBrowserMedia, getBrowserMediaThumbnailUrl, getBrowserMediaUrl,
  registerBrowserMedia, removeBrowserMedia, requestBrowserMediaThumbnail,
} from '../client/src/lib/browserMediaRegistry';
import { createBrowserImageThumbnail } from '../client/src/lib/browserImageThumbnail';

vi.mock('../client/src/lib/browserImageThumbnail', () => ({ createBrowserImageThumbnail: vi.fn() }));
const generate = vi.mocked(createBrowserImageThumbnail);
const photo = () => new File(['original'], 'photo.jpg', { type: 'image/jpeg' });
const thumbnail = () => new Blob(['small'], { type: 'image/jpeg' });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  let serial = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:local-${++serial}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  generate.mockReset().mockImplementation(async () => thumbnail());
});
afterEach(async () => {
  clearBrowserMedia();
  // 队列任务之间会让出事件循环，等待上一条测试完成收尾。
  await new Promise((resolve) => setTimeout(resolve, 10));
  vi.restoreAllMocks();
});

describe('browser thumbnail registry', () => {
  it('does not decode or create original URLs just to register media', () => {
    registerBrowserMedia('a', photo(), 'image');
    expect(generate).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('caches a separate thumbnail and keeps the original only for explicit file links', async () => {
    const file = photo();
    registerBrowserMedia('a', file, 'image');
    const url = await requestBrowserMediaThumbnail('a');
    expect(getBrowserMediaThumbnailUrl('a')).toBe(url);
    expect(await requestBrowserMediaThumbnail('a')).toBe(url);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).not.toHaveBeenCalledWith(file);
    const original = getBrowserMediaUrl('a');
    expect(original).not.toBe(url);
    expect(getBrowserMediaUrl('a')).toBe(original);
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
  });

  it('shares in-flight work between list and map and runs only one decode at a time', async () => {
    const first = deferred<Blob>();
    generate.mockImplementationOnce(() => first.promise);
    registerBrowserMedia('a', photo(), 'image');
    registerBrowserMedia('b', photo(), 'image');
    const a = requestBrowserMediaThumbnail('a');
    const again = requestBrowserMediaThumbnail('a');
    const b = requestBrowserMediaThumbnail('b');
    expect(a).toBe(again);
    expect(generate).toHaveBeenCalledTimes(1);
    first.resolve(thumbnail());
    await Promise.all([a, b]);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('does not generate thumbnails for unrequested media or videos', async () => {
    registerBrowserMedia('hidden', photo(), 'image');
    registerBrowserMedia('video', new File(['video'], 'v.mp4'), 'video');
    expect(await requestBrowserMediaThumbnail('video')).toBeUndefined();
    expect(await requestBrowserMediaThumbnail('missing')).toBeUndefined();
    expect(generate).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('keeps a failed image on a placeholder without retrying or returning the original', async () => {
    generate.mockRejectedValueOnce(new Error('unsupported image'));
    registerBrowserMedia('bad', photo(), 'image');
    registerBrowserMedia('good', photo(), 'image');
    expect(await requestBrowserMediaThumbnail('bad')).toBeUndefined();
    expect(await requestBrowserMediaThumbnail('bad')).toBeUndefined();
    expect(getBrowserMediaThumbnailUrl('bad')).toBeUndefined();
    expect(await requestBrowserMediaThumbnail('good')).toMatch(/^blob:/);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('revokes both cached URLs when removed, without double revoking', async () => {
    registerBrowserMedia('a', photo(), 'image');
    const small = await requestBrowserMediaThumbnail('a');
    const original = getBrowserMediaUrl('a');
    removeBrowserMedia('a');
    removeBrowserMedia('a');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(small);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(original);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(getBrowserMediaUrl('a')).toBeUndefined();
  });

  it('discards removed in-flight results and cancels queued media before decoding', async () => {
    const first = deferred<Blob>();
    generate.mockImplementationOnce(() => first.promise);
    registerBrowserMedia('active', photo(), 'image');
    registerBrowserMedia('queued', photo(), 'image');
    const active = requestBrowserMediaThumbnail('active');
    const queued = requestBrowserMediaThumbnail('queued');
    removeBrowserMedia('active');
    removeBrowserMedia('queued');
    first.resolve(thumbnail());
    expect(await active).toBeUndefined();
    expect(await queued).toBeUndefined();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('does not resurrect old media or start a second decoder after clearing and reimporting', async () => {
    const first = deferred<Blob>();
    generate.mockImplementationOnce(() => first.promise);
    registerBrowserMedia('a', photo(), 'image');
    const old = requestBrowserMediaThumbnail('a');
    clearBrowserMedia();
    registerBrowserMedia('a', photo(), 'image');
    const next = requestBrowserMediaThumbnail('a');
    expect(generate).toHaveBeenCalledTimes(1);
    first.resolve(thumbnail());
    expect(await old).toBeUndefined();
    const current = await next;
    expect(current).toMatch(/^blob:/);
    expect(getBrowserMediaThumbnailUrl('a')).toBe(current);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('releases the old URLs when replacing a path', async () => {
    registerBrowserMedia('a', photo(), 'image');
    const old = await requestBrowserMediaThumbnail('a');
    getBrowserMediaUrl('a');
    registerBrowserMedia('a', photo(), 'image');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(await requestBrowserMediaThumbnail('a')).not.toBe(old);
  });
});
