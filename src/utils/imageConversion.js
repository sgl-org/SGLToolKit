const PREVIEW_MIME_TYPE = 'image/png';
const MAX_INLINE_CODE_BYTES = 256 * 1024;

export class ConversionCancelledError extends Error {
  constructor() {
    super('转换任务已取消');
    this.name = 'ConversionCancelledError';
  }
}

export function releasePreviewUrls(previews) {
  for (const preview of previews) {
    if (typeof preview?.url === 'string' && preview.url.startsWith('blob:')) {
      URL.revokeObjectURL(preview.url);
    }
  }
}

export async function createImageThumbnail(path, readBytes, maxImagePixels, maxPreviewPixels) {
  return withImageUrl(path, readBytes, async (url) => {
    const image = await loadImage(url);
    const { width, height } = getImageDimensions(image);
    validateDimensions(width, height, maxImagePixels);
    const thumbnail = getScaledDimensions(width, height, maxPreviewPixels);
    const canvas = document.createElement('canvas');

    try {
      canvas.width = thumbnail.width;
      canvas.height = thumbnail.height;
      const context = canvas.getContext('2d', { alpha: true });
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, thumbnail.width, thumbnail.height);

      const blob = await canvasToBlob(canvas, PREVIEW_MIME_TYPE);
      return {
        width,
        height,
        url: URL.createObjectURL(blob)
      };
    } finally {
      releaseImage(image);
      releaseCanvas(canvas);
    }
  });
}

export async function convertImages(images, settings, options) {
  const {
    readBytes,
    maxImagePixels,
    maxTotalOutputBytes,
    maxPreviewPixels,
    isCancelled = () => false,
    onProgress = () => {}
  } = options;
  const previews = [];
  const infos = [];
  let maximumOutputBytes = 0;

  try {
    for (const image of images) {
      throwIfCancelled(isCancelled);
      validateDimensions(image.width, image.height, maxImagePixels);

      const bytesPerPixel = getBytesPerPixel(settings.format);
      const maximumImageBytes = image.width * image.height * (
        settings.compression === 'rle' ? bytesPerPixel + 1 : bytesPerPixel
      );
      maximumOutputBytes += maximumImageBytes;
      if (maximumOutputBytes > maxTotalOutputBytes) {
        throw new Error(`转换结果最大可能超过 ${formatBytes(maxTotalOutputBytes)}，请减少图片或分辨率后重试`);
      }

      onProgress(image);
      let rawBitmap = await decodeImageToBitmap(image, settings, readBytes, isCancelled);
      throwIfCancelled(isCancelled);

      let preview;
      try {
        preview = await createConvertedPreview(image, rawBitmap, settings, maxPreviewPixels);
        throwIfCancelled(isCancelled);

        const bitmapData = settings.compression === 'rle'
          ? rleCompress(rawBitmap, settings.format)
          : rawBitmap;
        rawBitmap = null;
        preview.compressedSize = bitmapData.length;
        preview.compressionRatio = preview.originalSize > 0
          ? ((preview.originalSize - bitmapData.length) / preview.originalSize * 100).toFixed(1)
          : 0;

        infos.push(createBitmapInfo(image, bitmapData));
        previews.push(preview);
      } catch (error) {
        if (preview) {
          releasePreviewUrls([preview]);
        }
        throw error;
      }
    }

    throwIfCancelled(isCancelled);
    const outputs = settings.outputFormat === 'bin'
      ? createBinResults(infos, settings)
      : [createCResult(infos, settings)];

    return { previews, outputs };
  } catch (error) {
    releasePreviewUrls(previews);
    throw error;
  }
}

export function estimateCCodeBytes(result) {
  return result.infos.reduce((total, info) => total + info.bitmapData.length * 7, 2048);
}

export function collectCCode(result, maxBytes) {
  const chunks = [];
  let totalBytes = 0;

  for (const chunk of createCCodeChunks(result.infos, result.settings)) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      throw new Error(`C代码超过 ${formatBytes(maxBytes)}，请使用下载功能导出`);
    }
    chunks.push(chunk);
  }

  return chunks.join('');
}

export function* createCCodeChunks(infos, settings, chunkSize = 128 * 1024) {
  let chunk = '';

  for (const line of createCCodeLines(infos, settings)) {
    if (chunk.length > 0 && chunk.length + line.length > chunkSize) {
      yield chunk;
      chunk = '';
    }
    chunk += line;
  }

  if (chunk.length > 0) {
    yield chunk;
  }
}

export function* createBinaryChunks(parts, chunkSize = 96 * 1024) {
  for (const part of parts) {
    for (let offset = 0; offset < part.length; offset += chunkSize) {
      yield part.subarray(offset, Math.min(offset + chunkSize, part.length));
    }
  }
}

function createCResult(infos, settings) {
  const resultName = settings.arrayName || 'combined_results';
  const totalBytes = infos.reduce((total, info) => total + info.bitmapData.length, 0);
  const result = {
    kind: 'c',
    name: resultName,
    infos,
    settings,
    displayCode: `// ${infos.length} 张图片，取模数据 ${formatBytes(totalBytes)}\n// 为避免大图 C 文本长期占用内存，完整代码请使用“复制”或“下载”。\n`
  };

  if (estimateCCodeBytes(result) > MAX_INLINE_CODE_BYTES) {
    return result;
  }

  const code = collectCCode(result, MAX_INLINE_CODE_BYTES);
  return {
    kind: 'text',
    name: resultName,
    code,
    displayCode: code
  };
}

function createBinResults(infos, settings) {
  const arrayName = settings.arrayName || 'flash_image';
  const binSize = infos.reduce((total, info) => total + info.bitmapData.length, 0);
  const binCode = createBinCode(infos, settings, arrayName);

  return [
    {
      kind: 'bin',
      name: `${arrayName}.bin`,
      binParts: infos.map((info) => info.bitmapData),
      binSize
    },
    {
      kind: 'text',
      name: `${arrayName}.c`,
      code: binCode,
      displayCode: binCode
    }
  ];
}

function createBinCode(infos, settings, arrayName) {
  let code = '#include <stdint.h>\n#include <sgl_core.h>\n\n';
  const startAddress = parseStartAddress(settings.binStartAddress);
  let currentAddress = startAddress;
  const pixmaps = [];

  for (const info of infos) {
    pixmaps.push({
      width: info.width,
      height: info.height,
      address: currentAddress,
      format: getSGLFormat(settings.format, settings.compression)
    });

    if (!settings.combineAsArray) {
      code += `const sgl_pixmap_t ${info.name}_image = {\n`;
      code += `    .width = ${info.width},\n`;
      code += `    .height = ${info.height},\n`;
      code += `    .bitmap.addr = 0x${currentAddress.toString(16).padStart(8, '0')},\n`;
      code += `    .format = ${getSGLFormat(settings.format, settings.compression)},\n`;
      code += '};\n\n';
    }

    currentAddress += info.bitmapData.length;
  }

  if (settings.combineAsArray) {
    code += `const sgl_pixmap_t ${arrayName}[${pixmaps.length}] = {\n`;
    for (const pixmap of pixmaps) {
      code += '    {\n';
      code += `        .width = ${pixmap.width},\n`;
      code += `        .height = ${pixmap.height},\n`;
      code += `        .bitmap.addr = 0x${pixmap.address.toString(16).padStart(8, '0')},\n`;
      code += `        .format = ${pixmap.format},\n`;
      code += '    },\n';
    }
    code += '};\n';
  }

  return code;
}

function* createCCodeLines(infos, settings) {
  yield '#include <stdint.h>\n#include <sgl_core.h>\n\n';

  for (const info of infos) {
    if (settings.compression === 'rle') {
      yield '// RLE压缩数据\n';
    }
    yield `static const uint8_t ${info.bitmapName}[${info.bitmapData.length}] = {\n`;

    for (let offset = 0; offset < info.bitmapData.length; offset += 24) {
      const count = Math.min(24, info.bitmapData.length - offset);
      const values = new Array(count);
      for (let index = 0; index < count; index++) {
        values[index] = `0x${info.bitmapData[offset + index].toString(16).padStart(2, '0')}`;
      }
      const isLastLine = offset + count >= info.bitmapData.length;
      yield `    ${values.join(', ')}${isLastLine ? '' : ','}\n`;
    }
    yield '};\n\n';
  }

  if (settings.combineAsArray && infos.length > 1) {
    const arrayName = settings.arrayName || 'combined_images';
    yield `const sgl_pixmap_t ${arrayName}[${infos.length}] = {\n`;
    for (const info of infos) {
      yield '    {\n';
      yield `        .width = ${info.width},\n`;
      yield `        .height = ${info.height},\n`;
      yield `        .bitmap.array = ${info.bitmapName},\n`;
      yield `        .format = ${getSGLFormat(settings.format, settings.compression)},\n`;
      yield '    },\n';
    }
    yield '};\n';
    return;
  }

  for (const info of infos) {
    const pixmapName = settings.combineAsArray
      ? (settings.arrayName || `${info.name}_image`)
      : `${info.name}_image`;
    yield `const sgl_pixmap_t ${pixmapName} = {\n`;
    yield `    .width = ${info.width},\n`;
    yield `    .height = ${info.height},\n`;
    yield `    .bitmap.array = ${info.bitmapName},\n`;
    yield `    .format = ${getSGLFormat(settings.format, settings.compression)},\n`;
    yield '};\n\n';
  }
}

async function decodeImageToBitmap(image, settings, readBytes, isCancelled) {
  return withImageUrl(image.path, readBytes, async (url) => {
    const sourceImage = await loadImage(url);
    const canvas = document.createElement('canvas');

    try {
      throwIfCancelled(isCancelled);
      const width = image.width || sourceImage.naturalWidth;
      const height = image.height || sourceImage.naturalHeight;
      validateDimensions(width, height, Number.MAX_SAFE_INTEGER);

      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true, alpha: true });
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(sourceImage, 0, 0, width, height);

      const rgba = context.getImageData(0, 0, width, height).data;
      return encodeBitmap(rgba, width * height, settings);
    } finally {
      releaseImage(sourceImage);
      releaseCanvas(canvas);
    }
  });
}

async function createConvertedPreview(image, bitmapData, settings, maxPreviewPixels) {
  const width = image.width;
  const height = image.height;
  const previewSize = getScaledDimensions(width, height, maxPreviewPixels);
  const canvas = document.createElement('canvas');

  try {
    canvas.width = previewSize.width;
    canvas.height = previewSize.height;
    const context = canvas.getContext('2d', { alpha: true });
    const imageData = context.createImageData(previewSize.width, previewSize.height);
    const target = imageData.data;
    const bytesPerPixel = getBytesPerPixel(settings.format);

    for (let y = 0; y < previewSize.height; y++) {
      const sourceY = Math.min(height - 1, Math.floor(y * height / previewSize.height));
      for (let x = 0; x < previewSize.width; x++) {
        const sourceX = Math.min(width - 1, Math.floor(x * width / previewSize.width));
        const sourceOffset = (sourceY * width + sourceX) * bytesPerPixel;
        const targetOffset = (y * previewSize.width + x) * 4;
        decodeBitmapPixel(bitmapData, sourceOffset, settings.format, target, targetOffset);
      }
    }

    context.putImageData(imageData, 0, 0);
    const blob = await canvasToBlob(canvas, PREVIEW_MIME_TYPE);
    return {
      name: image.name,
      url: URL.createObjectURL(blob),
      width,
      height,
      originalSize: bitmapData.length,
      compressedSize: bitmapData.length,
      compressionRatio: 0
    };
  } finally {
    releaseCanvas(canvas);
  }
}

function encodeBitmap(rgba, pixelCount, settings) {
  const format = settings.format;
  const bytesPerPixel = getBytesPerPixel(format);
  const bitmapData = new Uint8Array(pixelCount * bytesPerPixel);
  const fillColor = settings.enableTransparentFill ? parseColor(settings.transparentFillColor) : null;
  let outputOffset = 0;

  for (let sourceOffset = 0; sourceOffset < rgba.length; sourceOffset += 4) {
    let red = rgba[sourceOffset];
    let green = rgba[sourceOffset + 1];
    let blue = rgba[sourceOffset + 2];
    const alpha = rgba[sourceOffset + 3];

    if (alpha < 255 && fillColor) {
      const alphaFactor = alpha / 255;
      red = Math.round(red * alphaFactor + fillColor.r * (1 - alphaFactor));
      green = Math.round(green * alphaFactor + fillColor.g * (1 - alphaFactor));
      blue = Math.round(blue * alphaFactor + fillColor.b * (1 - alphaFactor));
    }

    switch (format) {
      case 'RGB888':
        bitmapData[outputOffset++] = blue;
        bitmapData[outputOffset++] = green;
        bitmapData[outputOffset++] = red;
        break;
      case 'RGB565': {
        const value = (Math.round(red / 255 * 31) << 11)
          | (Math.round(green / 255 * 63) << 5)
          | Math.round(blue / 255 * 31);
        bitmapData[outputOffset++] = value & 0xFF;
        bitmapData[outputOffset++] = (value >> 8) & 0xFF;
        break;
      }
      case 'RGB332':
        bitmapData[outputOffset++] = (Math.round(red / 255 * 7) << 5)
          | (Math.round(green / 255 * 7) << 2)
          | Math.round(blue / 255 * 3);
        break;
      case 'ARGB8888':
        bitmapData[outputOffset++] = blue;
        bitmapData[outputOffset++] = green;
        bitmapData[outputOffset++] = red;
        bitmapData[outputOffset++] = alpha;
        break;
      case 'ARGB4444': {
        const value = (Math.round(alpha / 255 * 15) << 12)
          | (Math.round(red / 255 * 15) << 8)
          | (Math.round(green / 255 * 15) << 4)
          | Math.round(blue / 255 * 15);
        bitmapData[outputOffset++] = value & 0xFF;
        bitmapData[outputOffset++] = (value >> 8) & 0xFF;
        break;
      }
      case 'ARGB2222':
        bitmapData[outputOffset++] = (Math.round(alpha / 255 * 3) << 6)
          | (Math.round(red / 255 * 3) << 4)
          | (Math.round(green / 255 * 3) << 2)
          | Math.round(blue / 255 * 3);
        break;
      default:
        throw new Error(`不支持的颜色格式: ${format}`);
    }
  }

  return bitmapData;
}

function decodeBitmapPixel(source, offset, format, target, targetOffset) {
  let red;
  let green;
  let blue;
  let alpha = 255;

  switch (format) {
    case 'RGB888':
      blue = source[offset];
      green = source[offset + 1];
      red = source[offset + 2];
      break;
    case 'RGB565': {
      const value = source[offset] | (source[offset + 1] << 8);
      red = ((value >> 11) & 0x1F) << 3;
      green = ((value >> 5) & 0x3F) << 2;
      blue = (value & 0x1F) << 3;
      break;
    }
    case 'RGB332': {
      const value = source[offset];
      red = ((value >> 5) & 0x07) << 5;
      green = ((value >> 2) & 0x07) << 5;
      blue = (value & 0x03) << 6;
      break;
    }
    case 'ARGB8888':
      blue = source[offset];
      green = source[offset + 1];
      red = source[offset + 2];
      alpha = source[offset + 3];
      break;
    case 'ARGB4444': {
      const value = source[offset] | (source[offset + 1] << 8);
      alpha = ((value >> 12) & 0x0F) << 4;
      red = ((value >> 8) & 0x0F) << 4;
      green = ((value >> 4) & 0x0F) << 4;
      blue = (value & 0x0F) << 4;
      break;
    }
    case 'ARGB2222': {
      const value = source[offset];
      alpha = ((value >> 6) & 0x03) << 6;
      red = ((value >> 4) & 0x03) << 6;
      green = ((value >> 2) & 0x03) << 6;
      blue = (value & 0x03) << 6;
      break;
    }
    default:
      throw new Error(`不支持的颜色格式: ${format}`);
  }

  target[targetOffset] = red;
  target[targetOffset + 1] = green;
  target[targetOffset + 2] = blue;
  target[targetOffset + 3] = alpha;
}

function rleCompress(data, format) {
  const bytesPerPixel = getBytesPerPixel(format);
  let outputLength = 0;

  for (let offset = 0; offset < data.length;) {
    let count = 1;
    while (
      count < 255
      && offset + (count + 1) * bytesPerPixel <= data.length
      && pixelsEqual(data, offset, offset + count * bytesPerPixel, bytesPerPixel)
    ) {
      count++;
    }
    outputLength += bytesPerPixel + 1;
    offset += count * bytesPerPixel;
  }

  const compressed = new Uint8Array(outputLength);
  let outputOffset = 0;
  for (let offset = 0; offset < data.length;) {
    let count = 1;
    while (
      count < 255
      && offset + (count + 1) * bytesPerPixel <= data.length
      && pixelsEqual(data, offset, offset + count * bytesPerPixel, bytesPerPixel)
    ) {
      count++;
    }
    compressed[outputOffset++] = count;
    compressed.set(data.subarray(offset, offset + bytesPerPixel), outputOffset);
    outputOffset += bytesPerPixel;
    offset += count * bytesPerPixel;
  }

  return compressed;
}

function pixelsEqual(data, firstOffset, secondOffset, bytesPerPixel) {
  for (let index = 0; index < bytesPerPixel; index++) {
    if (data[firstOffset + index] !== data[secondOffset + index]) {
      return false;
    }
  }
  return true;
}

function createBitmapInfo(image, bitmapData) {
  const filenameWithoutExt = image.name.replace(/\.[^/.]+$/, '');
  const safeFilename = filenameWithoutExt
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^[^a-zA-Z_]/, '_');

  return {
    name: safeFilename,
    width: image.width,
    height: image.height,
    bitmapName: `${safeFilename}_bitmap`,
    bitmapData
  };
}

function getBytesPerPixel(format) {
  switch (format) {
    case 'RGB888': return 3;
    case 'RGB565': return 2;
    case 'RGB332': return 1;
    case 'ARGB8888': return 4;
    case 'ARGB4444': return 2;
    case 'ARGB2222': return 1;
    default: throw new Error(`不支持的颜色格式: ${format}`);
  }
}

function getSGLFormat(format, compression) {
  const suffix = compression === 'rle' ? 'RLE_' : '';
  return `SGL_PIXMAP_FMT_${suffix}${format}`;
}

function parseStartAddress(value) {
  let address = String(value || '').trim();
  if (address && !address.startsWith('0x')) {
    address = `0x${address}`;
  }
  return /^0x[0-9A-Fa-f]+$/.test(address) ? parseInt(address, 16) : 0;
}

function parseColor(color) {
  const match = /^#([0-9A-Fa-f]{6})$/.exec(color || '');
  if (!match) return null;
  const hex = match[1];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16)
  };
}

function getScaledDimensions(width, height, maxPixels) {
  const pixelCount = width * height;
  if (pixelCount <= maxPixels) return { width, height };
  const scale = Math.sqrt(maxPixels / pixelCount);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale))
  };
}

function validateDimensions(width, height, maxPixels) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error('图片分辨率必须是有效的正整数');
  }
  if (width * height > maxPixels) {
    throw new Error(`图片分辨率超过 ${maxPixels.toLocaleString()} 像素限制`);
  }
}

async function withImageUrl(path, readBytes, callback) {
  const bytes = await readBytes(path);
  const url = URL.createObjectURL(new Blob([bytes], { type: getImageMimeType(path) }));
  try {
    return await callback(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法加载图片'));
    image.src = url;
  });
}

function getImageDimensions(image) {
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height
  };
}

function releaseImage(image) {
  if (!image) return;
  image.onload = null;
  image.onerror = null;
  image.src = '';
}

function releaseCanvas(canvas) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

function canvasToBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('无法生成图片预览'));
      }
    }, type);
  });
}

function getImageMimeType(path) {
  const extension = path.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'bmp': return 'image/bmp';
    default: return 'application/octet-stream';
  }
}

function throwIfCancelled(isCancelled) {
  if (isCancelled()) {
    throw new ConversionCancelledError();
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
