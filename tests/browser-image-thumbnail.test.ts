// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserImageThumbnail, thumbnailDimensions } from '../client/src/lib/browserImageThumbnail';

const dimensionsCases = [
  { name: '横图', width: 4000, height: 2000, expected: { width: 480, height: 240 } },
  { name: '竖图', width: 2000, height: 4000, expected: { width: 240, height: 480 } },
  { name: '方图', width: 600, height: 600, expected: { width: 480, height: 480 } },
  { name: '超窄横图', width: 10000, height: 1, expected: { width: 480, height: 1 } },
  { name: '超窄竖图', width: 1, height: 10000, expected: { width: 1, height: 480 } },
  { name: '小图不放大', width: 120, height: 80, expected: { width: 120, height: 80 } },
  { name: '边界不放大', width: 480, height: 320, expected: { width: 480, height: 320 } },
  { name: '单像素', width: 1, height: 1, expected: { width: 1, height: 1 } },
  { name: '取整仍至少一像素', width: 0.2, height: 0.4, expected: { width: 1, height: 1 } },
  { name: '非整除比例', width: 2049, height: 1365, expected: { width: 480, height: 320 } },
];

const invalidDimensions = [
  [0, 100], [100, 0], [-1, 100], [100, -1],
  [Number.NaN, 100], [100, Number.NaN],
  [Number.POSITIVE_INFINITY, 100], [100, Number.POSITIVE_INFINITY],
  [Number.NEGATIVE_INFINITY, 100], [100, Number.NEGATIVE_INFINITY],
];

describe('thumbnailDimensions', () => {
  it.each(dimensionsCases)('$name 保持比例且最长边不超过480px', ({ width, height, expected }) => {
    expect(thumbnailDimensions(width, height)).toEqual(expected);
  });

  it.each(invalidDimensions)('拒绝无效尺寸 %s × %s', (width, height) => {
    expect(() => thumbnailDimensions(width, height)).toThrow(RangeError);
  });
});

describe('createBrowserImageThumbnail', () => {
  let file: File;
  let jpeg: Blob;
  let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> };
  let context: { fillStyle: string; fillRect: ReturnType<typeof vi.fn>; drawImage: ReturnType<typeof vi.fn> };
  let canvas: HTMLCanvasElement | undefined;
  let contextAvailable: boolean;
  let encodedSize: { width: number; height: number } | undefined;

  beforeEach(() => {
    file = new File(['源图片'], 'photo.png', { type: 'image/png' });
    jpeg = new Blob(['压缩后的图片'], { type: 'image/jpeg' });
    bitmap = { width: 4000, height: 2000, close: vi.fn() };
    context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    canvas = undefined;
    encodedSize = undefined;
    contextAvailable = true;
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('不允许网络请求')));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-thumbnail-source');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      canvas = this;
      return contextAvailable ? context as unknown as CanvasRenderingContext2D : null;
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback) {
      encodedSize = { width: this.width, height: this.height };
      callback(jpeg);
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => {
      throw new Error('不允许转换为dataURL');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function expectCanvasReleased() {
    expect(canvas).toBeDefined();
    expect(canvas?.width).toBe(0);
    expect(canvas?.height).toBe(0);
  }

  function installImageFallback(width = 4000, height = 2000, outcome: 'load' | 'error' | 'throw' = 'load') {
    vi.stubGlobal('createImageBitmap', undefined);
    const image = document.createElement('img');
    Object.defineProperties(image, {
      naturalWidth: { value: width },
      naturalHeight: { value: height },
    });
    const setSource = vi.spyOn(image, 'src', 'set').mockImplementation(() => {
      if (outcome === 'throw') throw new Error('设置图片来源失败');
      queueMicrotask(() => image.dispatchEvent(new Event(outcome)));
    });
    const removeSource = vi.spyOn(image, 'removeAttribute');
    vi.stubGlobal('Image', vi.fn(function () { return image; }));
    return { image, setSource, removeSource };
  }

  function expectImageReleased(fallback: ReturnType<typeof installImageFallback>) {
    expect(fallback.image.onload).toBeNull();
    expect(fallback.image.onerror).toBeNull();
    expect(fallback.removeSource).toHaveBeenCalledWith('src');
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:local-thumbnail-source');
    expect(fallback.image.isConnected).toBe(false);
  }

  it('优先位图解码并传递EXIF方向选项，按0.75质量生成JPEG后释放资源', async () => {
    const result = await createBrowserImageThumbnail(file);

    expect(createImageBitmap).toHaveBeenCalledExactlyOnceWith(file, { imageOrientation: 'from-image' });
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('2d');
    expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(bitmap, 0, 0, 480, 240);
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.75);
    expect(encodedSize).toEqual({ width: 480, height: 240 });
    expect(result).toBe(jpeg);
    expect(result).not.toBe(file);
    expect(result.type).toBe('image/jpeg');
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expectCanvasReleased();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalled();
  });

  it('透明PNG绘制前先填充白底，避免JPEG透明区域变黑', async () => {
    await createBrowserImageThumbnail(file);

    expect(context.fillStyle).toBe('#fff');
    expect(context.fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 480, 240);
    expect(context.fillRect.mock.invocationCallOrder[0]).toBeLessThan(context.drawImage.mock.invocationCallOrder[0]);
  });

  it.each([
    [2000, 4000, 240, 480],
    [120, 80, 120, 80],
    [1, 10000, 1, 480],
  ])('按解码后尺寸 %s × %s 绘制为 %s × %s', async (width, height, targetWidth, targetHeight) => {
    bitmap.width = width;
    bitmap.height = height;

    await createBrowserImageThumbnail(file);

    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, targetWidth, targetHeight);
    expect(encodedSize).toEqual({ width: targetWidth, height: targetHeight });
  });

  it('编码完成前保持画布和位图有效，异步toBlob完成后再释放', async () => {
    let finishEncoding: BlobCallback | undefined;
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) => { finishEncoding = callback; });
    const pending = createBrowserImageThumbnail(file).then(
      (blob) => ({ blob, error: undefined }),
      (error: unknown) => ({ blob: undefined, error }),
    );
    await vi.waitFor(() => expect(finishEncoding).toBeTypeOf('function'));

    expect(canvas?.width).toBe(480);
    expect(canvas?.height).toBe(240);
    expect(bitmap.close).not.toHaveBeenCalled();
    finishEncoding!(jpeg);
    expect(await pending).toEqual({ blob: jpeg, error: undefined });
    expectCanvasReleased();
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('位图解码失败直接reject，不回退再次解码或返回原File', async () => {
    const error = new Error('位图解码失败');
    vi.mocked(createImageBitmap).mockRejectedValue(error);

    await expect(createBrowserImageThumbnail(file)).rejects.toBe(error);

    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
    expect(bitmap.close).not.toHaveBeenCalled();
  });

  it('解码后尺寸无效时reject且关闭位图', async () => {
    bitmap.width = 0;

    await expect(createBrowserImageThumbnail(file)).rejects.toThrow(RangeError);

    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('Canvas没有2D上下文时reject且释放画布与位图', async () => {
    contextAvailable = false;

    await expect(createBrowserImageThumbnail(file)).rejects.toThrow();

    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expectCanvasReleased();
    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled();
  });

  it('绘制失败时reject且释放画布与位图', async () => {
    const error = new Error('绘制失败');
    context.drawImage.mockImplementation(() => { throw error; });

    await expect(createBrowserImageThumbnail(file)).rejects.toBe(error);

    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expectCanvasReleased();
  });

  it('toBlob返回null时reject且释放画布与位图', async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) => callback(null));

    await expect(createBrowserImageThumbnail(file)).rejects.toThrow();

    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expectCanvasReleased();
  });

  it('toBlob同步抛错时reject且释放画布与位图', async () => {
    const error = new Error('编码失败');
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(() => { throw error; });

    await expect(createBrowserImageThumbnail(file)).rejects.toBe(error);

    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expectCanvasReleased();
  });

  it('编码器没有产出JPEG时reject，不把其他格式或原文件当作缩略图', async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) => callback(file));

    await expect(createBrowserImageThumbnail(file)).rejects.toThrow();

    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expectCanvasReleased();
  });

  it('缺少位图API时从临时Object URL解码，按方向后的natural尺寸缩放', async () => {
    const fallback = installImageFallback(2000, 4000);

    expect(await createBrowserImageThumbnail(file)).toBe(jpeg);

    expect(URL.createObjectURL).toHaveBeenCalledExactlyOnceWith(file);
    expect(fallback.setSource).toHaveBeenCalledExactlyOnceWith('blob:local-thumbnail-source');
    expect(fallback.image.style.imageOrientation).toBe('from-image');
    expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(fallback.image, 0, 0, 240, 480);
    expect(context.fillStyle).toBe('#fff');
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 240, 480);
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.75);
    expectCanvasReleased();
    expectImageReleased(fallback);
    expect(fetch).not.toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.toDataURL).not.toHaveBeenCalled();
  });

  it('HTMLImageElement解码失败也清理img并撤销临时URL', async () => {
    const fallback = installImageFallback(0, 0, 'error');

    await expect(createBrowserImageThumbnail(file)).rejects.toThrow();

    expectImageReleased(fallback);
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.toBlob).not.toHaveBeenCalled();
  });

  it('HTMLImageElement设置src同步失败也清理img并撤销临时URL', async () => {
    const fallback = installImageFallback(0, 0, 'throw');

    await expect(createBrowserImageThumbnail(file)).rejects.toThrow('设置图片来源失败');

    expectImageReleased(fallback);
  });

  it('HTMLImageElement的natural尺寸无效时reject并清理img与URL', async () => {
    const fallback = installImageFallback(0, 100);

    await expect(createBrowserImageThumbnail(file)).rejects.toThrow(RangeError);

    expectImageReleased(fallback);
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it.each(['context', 'draw', 'null', 'throw'] as const)('HTMLImageElement回退在 %s 失败时仍释放全部资源', async (failure) => {
    const fallback = installImageFallback();
    if (failure === 'context') contextAvailable = false;
    if (failure === 'draw') context.drawImage.mockImplementation(() => { throw new Error('绘制失败'); });
    if (failure === 'null') vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback) => callback(null));
    if (failure === 'throw') vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(() => { throw new Error('编码失败'); });

    await expect(createBrowserImageThumbnail(file)).rejects.toThrow();

    expectImageReleased(fallback);
    expectCanvasReleased();
  });
});
