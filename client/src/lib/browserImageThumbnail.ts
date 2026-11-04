const MAX_THUMBNAIL_EDGE = 480;
const JPEG_QUALITY = 0.75;

export function thumbnailDimensions(width: number, height: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError('图片尺寸必须是有限正数');
  }

  const scale = Math.min(1, MAX_THUMBNAIL_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function drawThumbnail(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const dimensions = thumbnailDimensions(width, height);
  const canvas = document.createElement('canvas');
  try {
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建缩略图画布');

    // JPEG 不保留透明度，先铺白底，避免透明 PNG 的背景变黑。
    context.fillStyle = '#fff';
    context.fillRect(0, 0, dimensions.width, dimensions.height);
    context.drawImage(source, 0, 0, dimensions.width, dimensions.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob || blob.type !== 'image/jpeg') {
          reject(new Error('浏览器无法编码 JPEG 缩略图'));
          return;
        }
        resolve(blob);
      }, 'image/jpeg', JPEG_QUALITY);
    });
  } finally {
    // 必须等异步编码结束后再清空画布，及时释放像素缓冲区。
    canvas.width = 0;
    canvas.height = 0;
  }
}

export async function createBrowserImageThumbnail(file: Blob): Promise<Blob> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      return await drawThumbnail(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  }

  const image = new Image();
  let objectUrl: string | undefined;
  try {
    // 兼容路径仍需解码一次原图；方向和自然尺寸由浏览器解码器处理。
    image.style.imageOrientation = 'from-image';
    objectUrl = URL.createObjectURL(file);
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('浏览器无法解码图片'));
      image.src = objectUrl!;
    });
    return await drawThumbnail(image, image.naturalWidth, image.naturalHeight);
  } finally {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
  }
}
