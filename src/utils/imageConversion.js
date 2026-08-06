const PREVIEW_MIME_TYPE = 'image/png';
const MAX_INLINE_CODE_BYTES = 256 * 1024;

const QOI_MAGIC = 0x51;
const QOI_OP_RUN = 0xC0;
const QOI_OP_DIFF = 0x40;
const QOI_OP_LUMA = 0x80;
const QOI_OP_RGB565 = 0xFE;
const QOI_HDR_SIZE = 13;
const QOI_MAX_RUN = 62;

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
  if (settings.compression === 'qoi' && settings.format !== 'RGB565') {
    throw new Error('QOI压缩仅支持RGB565颜色格式');
  }
  const previews = [];
  const infos = [];
  let maximumOutputBytes = 0;

  try {
    for (const image of images) {
      throwIfCancelled(isCancelled);
      validateDimensions(image.width, image.height, maxImagePixels);

      const isQoiCompression = settings.compression === 'qoi';
      const bytesPerPixel = getBytesPerPixel(settings.format);
      const maximumImageBytes = image.width * image.height * (
        settings.compression === 'rle' || isQoiCompression ? bytesPerPixel + 1 : bytesPerPixel
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
          : isQoiCompression
            ? qoiCompress(rawBitmap, image.width, image.height)
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
      ? (settings.batchSingleBin
          ? createBatchSingleBinResults(infos, settings)
          : createBinResults(infos, settings))
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

export function createBatchSingleBinResults(infos, settings) {
  const arrayName = settings.arrayName || 'images';
  const outputs = infos.map((info) => ({
    kind: 'bin',
    name: `${info.name}.bin`,
    binParts: [info.bitmapData],
    binSize: info.bitmapData.length
  }));

  const code = createBatchSingleBinCode(infos, settings, arrayName);
  outputs.push({
    kind: 'text',
    name: `${arrayName}.c`,
    code,
    displayCode: code
  });

  return outputs;
}

function createBatchSingleBinCode(infos, settings, arrayName) {
  let code = '#include <stdint.h>\n#include <stddef.h>\n#include <sgl_core.h>\n\n';
  code += `// ${arrayName} - Generated by Image To Array Tool\n\n`;
  code += '// 图片数据结构体定义\n';

  for (const info of infos) {
    code += `// ${info.sourceFileName || info.name} -> ${info.name}.bin\n`;
    code += `const sgl_pixmap_t ${info.name} = {\n`;
    code += `    .width = ${info.width},\n`;
    code += `    .height = ${info.height},\n`;
    code += `    .bitmap.addr = NULL,\n`;
    code += `    .format = ${getSGLFormat(settings.format, settings.compression)},\n`;
    code += '};\n\n';
  }

  return code;
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
    } else if (settings.compression === 'qoi') {
      yield '// QOI压缩数据\n';
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

function writeU16BE(out, pos, value) {
  out[pos] = (value >> 8) & 0xFF;
  out[pos + 1] = value & 0xFF;
}

function writeU24BE(out, pos, value) {
  out[pos] = (value >> 16) & 0xFF;
  out[pos + 1] = (value >> 8) & 0xFF;
  out[pos + 2] = value & 0xFF;
}

function writeU32BE(out, pos, value) {
  out[pos] = (value >>> 24) & 0xFF;
  out[pos + 1] = (value >>> 16) & 0xFF;
  out[pos + 2] = (value >>> 8) & 0xFF;
  out[pos + 3] = value & 0xFF;
}

function readU16BE(data, pos) {
  return (data[pos] << 8) | data[pos + 1];
}

function readU24BE(data, pos) {
  return (data[pos] << 16) | (data[pos + 1] << 8) | data[pos + 2];
}

function readU32BE(data, pos) {
  return (((data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3]) >>> 0);
}

// 5/6/5 位深回绕下的合法 DIFF 增量 (-2..+1)，与解码器 (prev + delta) & mask 语义一致
function validQoiDeltas(prev, target, mask) {
  const result = [];
  for (const delta of [0, -1, 1, -2]) {
    if (((prev + delta) & mask) === target) {
      result.push(delta);
    }
  }
  return result;
}

function encodeQoiRow(data, start, width) {
  const bytes = [];
  let pr = 0;
  let pg = 0;
  let pb = 0;
  let run = 0;
  let i = 0;

  const flushRun = () => {
    while (run > 0) {
      const count = Math.min(run, QOI_MAX_RUN);
      bytes.push(QOI_OP_RUN | (count - 1));
      run -= count;
    }
  };

  while (i < width) {
    const hi = data[start + i * 2 + 1];
    const lo = data[start + i * 2];
    const r = (hi >> 3) & 0x1F;
    const g = ((hi & 0x07) << 3) | ((lo >> 5) & 0x07);
    const b = lo & 0x1F;
    i++;

    if (r === pr && g === pg && b === pb) {
      run++;
      continue;
    }

    if (run > 0) {
      flushRun();
      run = 0;
    }

    const validDr = validQoiDeltas(pr, r, 0x1F);
    const validDg = validQoiDeltas(pg, g, 0x3F);
    const validDb = validQoiDeltas(pb, b, 0x1F);
    let matched = null;
    outer:
    for (const dg of validDg) {
      for (const dr of validDr) {
        for (const db of validDb) {
          matched = [dr, dg, db];
          break outer;
        }
      }
    }
    if (matched) {
      bytes.push(QOI_OP_DIFF | ((matched[0] + 2) << 4) | ((matched[1] + 2) << 2) | (matched[2] + 2));
      pr = r;
      pg = g;
      pb = b;
      continue;
    }

    let dg = (g - pg) & 0x3F;
    if (dg > 31) dg -= 64;
    let drDg = ((r - pr) - dg) % 32;
    if (drDg < 0) drDg += 32;
    if (drDg > 7) drDg -= 32;
    let dbDg = ((b - pb) - dg) % 32;
    if (dbDg < 0) dbDg += 32;
    if (dbDg > 7) dbDg -= 32;
    if (drDg >= -8 && dbDg >= -8) {
      bytes.push(QOI_OP_LUMA | (dg + 32));
      bytes.push(((drDg + 8) << 4) | (dbDg + 8));
      pr = r;
      pg = g;
      pb = b;
      continue;
    }

    bytes.push(QOI_OP_RGB565);
    bytes.push(hi);
    bytes.push(lo);
    pr = r;
    pg = g;
    pb = b;
  }

  flushRun();
  return new Uint8Array(bytes);
}

// QOI-RGB565 压缩（与 SGL 解码器格式对齐：13字节头 + 行偏移表 + 逐行独立编码）
export function qoiCompress(rgb565Data, width, height) {
  const pixelCount = width * height;
  if (rgb565Data.length < pixelCount * 2) {
    throw new Error('QOI压缩数据长度不足');
  }

  const rows = [];
  for (let y = 0; y < height; y++) {
    rows.push(encodeQoiRow(rgb565Data, y * width * 2, width));
  }

  const offsets = new Uint32Array(height);
  let dataSize = 0;
  for (let y = 0; y < height; y++) {
    offsets[y] = dataSize;
    dataSize += rows[y].length;
  }

  let n16 = 0;
  let n24 = 0;
  for (let y = 0; y < height; y++) {
    if (offsets[y] < 0x10000) n16++;
    else if (offsets[y] < 0x1000000) n24++;
  }
  const n32 = height - n16 - n24;

  const out = new Uint8Array(QOI_HDR_SIZE + n16 * 2 + n24 * 3 + n32 * 4 + dataSize);
  out[0] = QOI_MAGIC;
  writeU16BE(out, 1, width);
  writeU16BE(out, 3, height);
  writeU16BE(out, 7, n16 * 2);
  writeU16BE(out, 9, n24 * 3);
  writeU16BE(out, 11, n32 * 4);

  let pos = QOI_HDR_SIZE;
  for (let y = 0; y < height; y++) {
    const offset = offsets[y];
    if (y < n16) {
      writeU16BE(out, pos, offset);
      pos += 2;
    } else if (y < n16 + n24) {
      writeU24BE(out, pos, offset);
      pos += 3;
    } else {
      writeU32BE(out, pos, offset);
      pos += 4;
    }
  }

  for (let y = 0; y < height; y++) {
    out.set(rows[y], pos);
    pos += rows[y].length;
  }

  return out;
}

// QOI-RGB565 解码（逐字节镜像 SGL 草稿解码器语义，输出 RGB565 小端像素）
export function qoiDecode(data) {
  if (!data || data.length < QOI_HDR_SIZE) {
    throw new Error('QOI数据无效');
  }
  const width = readU16BE(data, 1);
  const height = readU16BE(data, 3);
  if (width === 0 || height === 0) {
    throw new Error('QOI数据无效');
  }
  const n16 = readU16BE(data, 7) >> 1;
  const n24 = Math.floor(readU16BE(data, 9) / 3);
  const u32Size = readU16BE(data, 11);
  const dataStart = QOI_HDR_SIZE + n16 * 2 + n24 * 3 + u32Size;
  if (data.length < dataStart) {
    throw new Error('QOI数据无效');
  }

  const lines = new Uint32Array(height);
  let pos = QOI_HDR_SIZE;
  for (let i = 0; i < height; i++) {
    if (i < n16) {
      lines[i] = readU16BE(data, pos);
      pos += 2;
    } else if (i < n16 + n24) {
      lines[i] = readU24BE(data, pos);
      pos += 3;
    } else {
      lines[i] = readU32BE(data, pos);
      pos += 4;
    }
  }

  const out = new Uint8Array(width * height * 2);
  let op = 0;
  for (let y = 0; y < height; y++) {
    let p = dataStart + lines[y];
    let pr = 0;
    let pg = 0;
    let pb = 0;
    let remaining = width;

    while (remaining > 0) {
      const byte = data[p++];
      if (byte === QOI_OP_RGB565) {
        const hi = data[p++];
        const lo = data[p++];
        pr = (hi >> 3) & 0x1F;
        pg = ((hi & 0x07) << 3) | ((lo >> 5) & 0x07);
        pb = lo & 0x1F;
        out[op++] = lo;
        out[op++] = hi;
        remaining--;
      } else if ((byte & 0xC0) === QOI_OP_RUN) {
        let count = (byte & 0x3F) + 1;
        while (count-- > 0 && remaining > 0) {
          out[op++] = ((pg & 0x07) << 5) | pb;
          out[op++] = (pr << 3) | (pg >> 3);
          remaining--;
        }
      } else if ((byte & 0xC0) === QOI_OP_DIFF) {
        const dr = ((byte >> 4) & 0x03) - 2;
        const dg = ((byte >> 2) & 0x03) - 2;
        const db = (byte & 0x03) - 2;
        pr = (pr + dr) & 0x1F;
        pg = (pg + dg) & 0x3F;
        pb = (pb + db) & 0x1F;
        out[op++] = ((pg & 0x07) << 5) | pb;
        out[op++] = (pr << 3) | (pg >> 3);
        remaining--;
      } else if ((byte & 0xC0) === QOI_OP_LUMA) {
        const dg = (byte & 0x3F) - 32;
        const sub = data[p++];
        const drDg = ((sub >> 4) & 0x0F) - 8;
        const dbDg = (sub & 0x0F) - 8;
        pr = (pr + drDg + dg) & 0x1F;
        pg = (pg + dg) & 0x3F;
        pb = (pb + dbDg + dg) & 0x1F;
        out[op++] = ((pg & 0x07) << 5) | pb;
        out[op++] = (pr << 3) | (pg >> 3);
        remaining--;
      } else {
        out[op++] = 0x00;
        out[op++] = 0x00;
        remaining--;
      }
    }
  }

  return { width, height, bitmapData: out };
}

function createBitmapInfo(image, bitmapData) {
  const filenameWithoutExt = image.name.replace(/\.[^/.]+$/, '');
  const safeFilename = filenameWithoutExt
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^[^a-zA-Z_]/, '_');

  return {
    name: safeFilename,
    sourceFileName: image.name || safeFilename,
    width: image.width,
    height: image.height,
    bitmapName: `${safeFilename}_bitmap`,
    bitmapData
  };
}

export function collectBatchSingleBinNameIssues(images) {
  const invalidNames = [];
  const duplicateNames = new Set();
  const usedNames = new Set();

  for (const image of images) {
    const originalName = image?.name || '';
    const baseName = getImageBaseName(originalName);

    if (!isValidImageExportName(baseName)) {
      invalidNames.push(originalName || '(未命名图片)');
      continue;
    }

    if (usedNames.has(baseName)) {
      duplicateNames.add(baseName);
      continue;
    }

    usedNames.add(baseName);
  }

  return {
    invalidNames,
    duplicateNames: Array.from(duplicateNames)
  };
}

export function validateBatchSingleBinNames(images) {
  const { invalidNames, duplicateNames } = collectBatchSingleBinNameIssues(images);
  return invalidNames.length === 0 && duplicateNames.length === 0;
}

function getImageBaseName(filename) {
  return (filename || '').replace(/\.[^.]+$/, '');
}

function isValidImageExportName(name) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
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
  const suffix = compression === 'rle' ? 'RLE_' : compression === 'qoi' ? 'QOI_' : '';
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
