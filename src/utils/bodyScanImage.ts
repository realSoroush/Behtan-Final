export const BODY_SCAN_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'] as const;
export const BODY_SCAN_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const BODY_SCAN_MAX_NORMALIZED_BYTES = 5 * 1024 * 1024;
export const BODY_SCAN_MIN_SHORT_EDGE = 360;
export const BODY_SCAN_MIN_LONG_EDGE = 640;
export const BODY_SCAN_MAX_SOURCE_PIXELS = 40_000_000;
export const BODY_SCAN_MAX_OUTPUT_EDGE = 1600;
export const BODY_SCAN_CAPTURE_ASPECT_RATIO = 3 / 4;

export class BodyScanImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BodyScanImageError';
  }
}

type FileMetadata = Pick<File, 'type' | 'size'>;

export function validateBodyScanFileMetadata(file: FileMetadata): string | null {
  if (!(BODY_SCAN_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'فرمت تصویر پشتیبانی نمی‌شود. فقط فایل JPG یا PNG انتخاب کنید.';
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return 'فایل تصویر خالی یا نامعتبر است.';
  }

  if (file.size > BODY_SCAN_MAX_UPLOAD_BYTES) {
    return 'حجم تصویر بیشتر از ۱۰ مگابایت است.';
  }

  return null;
}

export function hasSafeBodyScanDimensions(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  if (width <= 0 || height <= 0) return false;

  const shortEdge = Math.min(width, height);
  const longEdge = Math.max(width, height);
  return (
    shortEdge >= BODY_SCAN_MIN_SHORT_EDGE
    && longEdge >= BODY_SCAN_MIN_LONG_EDGE
    && width * height <= BODY_SCAN_MAX_SOURCE_PIXELS
  );
}

export function estimateBase64DataUrlBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',');
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function isSafeNormalizedBodyScanDataUrl(dataUrl: string): boolean {
  return (
    /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)
    && estimateBase64DataUrlBytes(dataUrl) <= BODY_SCAN_MAX_NORMALIZED_BYTES
  );
}

function loadImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new BodyScanImageError('فایل انتخاب‌شده یک تصویر سالم و قابل‌خواندن نیست.'));
    };
    image.src = objectUrl;
  });
}

function canvasToSafeJpegDataUrl(canvas: HTMLCanvasElement): string {
  let dataUrl = canvas.toDataURL('image/jpeg', 0.88);

  if (estimateBase64DataUrlBytes(dataUrl) > BODY_SCAN_MAX_NORMALIZED_BYTES) {
    dataUrl = canvas.toDataURL('image/jpeg', 0.76);
  }

  if (!isSafeNormalizedBodyScanDataUrl(dataUrl)) {
    throw new BodyScanImageError('آماده‌سازی امن تصویر انجام نشد. لطفاً تصویر دیگری انتخاب کنید.');
  }

  return dataUrl;
}

function createNormalizedCanvas(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  crop?: { x: number; y: number; width: number; height: number }
): HTMLCanvasElement {
  const effectiveWidth = crop?.width ?? sourceWidth;
  const effectiveHeight = crop?.height ?? sourceHeight;
  const scale = Math.min(1, BODY_SCAN_MAX_OUTPUT_EDGE / Math.max(effectiveWidth, effectiveHeight));
  const outputWidth = Math.max(1, Math.round(effectiveWidth * scale));
  const outputHeight = Math.max(1, Math.round(effectiveHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new BodyScanImageError('مرورگر نتوانست تصویر را آماده کند.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, outputWidth, outputHeight);

  if (crop) {
    context.drawImage(
      source,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      outputWidth,
      outputHeight
    );
  } else {
    context.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);
  }

  return canvas;
}

/**
 * Decodes and re-encodes the upload. Besides bounding resolution/payload size,
 * this removes EXIF metadata such as device/location data before analysis.
 */
export async function normalizeBodyScanFile(file: File): Promise<string> {
  const metadataError = validateBodyScanFileMetadata(file);
  if (metadataError) throw new BodyScanImageError(metadataError);

  const image = await loadImage(file);
  const width = image.naturalWidth;
  const height = image.naturalHeight;

  if (!hasSafeBodyScanDimensions(width, height)) {
    if (width * height > BODY_SCAN_MAX_SOURCE_PIXELS) {
      throw new BodyScanImageError('ابعاد تصویر بیش از حد بزرگ است. یک تصویر کوچک‌تر انتخاب کنید.');
    }
    throw new BodyScanImageError('وضوح تصویر پایین است. یک عکس واضح‌تر و تمام‌قد انتخاب کنید.');
  }

  return canvasToSafeJpegDataUrl(createNormalizedCanvas(image, width, height));
}

export function captureBodyScanFrame(video: HTMLVideoElement): string {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;

  if (!hasSafeBodyScanDimensions(sourceWidth, sourceHeight)) {
    throw new BodyScanImageError('کیفیت دوربین برای ثبت عکس کافی نیست. از گزینه آپلود تصویر استفاده کنید.');
  }

  const sourceAspect = sourceWidth / sourceHeight;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let cropX = 0;
  let cropY = 0;

  if (sourceAspect > BODY_SCAN_CAPTURE_ASPECT_RATIO) {
    cropWidth = sourceHeight * BODY_SCAN_CAPTURE_ASPECT_RATIO;
    cropX = (sourceWidth - cropWidth) / 2;
  } else if (sourceAspect < BODY_SCAN_CAPTURE_ASPECT_RATIO) {
    cropHeight = sourceWidth / BODY_SCAN_CAPTURE_ASPECT_RATIO;
    cropY = (sourceHeight - cropHeight) / 2;
  }

  const canvas = createNormalizedCanvas(video, sourceWidth, sourceHeight, {
    x: cropX,
    y: cropY,
    width: cropWidth,
    height: cropHeight,
  });

  return canvasToSafeJpegDataUrl(canvas);
}
