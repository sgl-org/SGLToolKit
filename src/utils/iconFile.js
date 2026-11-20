/**
 * 图标文件（ICO / CUR / ICNS）解析与规范化
 *
 * 为什么不能直接用 <img> 加载 .ico：
 *   1. 浏览器通常只取容器里的某一帧（多为最小帧），会丢掉 256x256 等高清帧；
 *   2. 老式 DIB 帧的透明度来自 1bpp AND mask，不做还原会变成黑底；
 *   3. ICNS 是 Apple 的容器格式，浏览器不认识。
 *
 * 本模块把图标文件规范化成「浏览器可直接解码的 PNG 字节」，
 * 并在 DIB 帧时额外返回原始 RGBA，避免 PNG 往返造成半透明精度损失。
 *
 * 纯数据部分（目录解析 / DIB 解码 / ICNS 提取）不依赖 DOM，便于单元测试；
 * 只有 encodeRgbaToPng 用到 canvas。
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const ICON_FILE_EXTENSIONS = ['ico', 'cur', 'icns'];

/** 由文件名判断图标容器类型，null 表示普通图片 */
export function getIconFileKind(fileName) {
  const ext = String(fileName || '').split('.').pop().toLowerCase();
  return ICON_FILE_EXTENSIONS.includes(ext) ? ext : null;
}

/** 没有扩展名时按文件头嗅探（只认特征非常明确的容器） */
export function sniffIconKind(bytes) {
  if (!bytes || bytes.length < 8) return null;
  if (bytes[0] === 0 && bytes[1] === 0 && (bytes[2] === 1 || bytes[2] === 2) && bytes[3] === 0) {
    return bytes[2] === 1 ? 'ico' : 'cur';
  }
  if (bytes[0] === 0x69 && bytes[1] === 0x63 && bytes[2] === 0x6E && bytes[3] === 0x73) {
    return 'icns';
  }
  return null;
}

export function isIconFile(bytes, fileName) {
  return Boolean(getIconFileKind(fileName) || sniffIconKind(bytes));
}

function isPngAt(bytes, offset) {
  if (offset < 0 || offset + 8 > bytes.length) return false;
  for (let i = 0; i < 8; i++) {
    if (bytes[offset + i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

function viewOf(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function readPngSize(bytes, offset) {
  if (!isPngAt(bytes, offset) || offset + 24 > bytes.length) return null;
  const view = viewOf(bytes);
  const width = view.getUint32(offset + 16, false);
  const height = view.getUint32(offset + 20, false);
  if (!width || !height || width > 16384 || height > 16384) return null;
  return { width, height };
}

/** 从 PNG 起点一路走到 IEND，返回结束偏移；找不到返回 -1 */
function findPngEnd(bytes, start) {
  const view = viewOf(bytes);
  let p = start + 8;
  while (p + 8 <= bytes.length) {
    const length = view.getUint32(p, false);
    if (length > bytes.length - p) return -1;
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    p += 12 + length;
    if (type === 'IEND') return p;
    if (type === 'IHDR' && length !== 13) return -1;
  }
  return -1;
}

/**
 * 解析 ICO / CUR 目录，返回全部帧描述。
 * 帧数据不做解码，只切出 payload，便于单元测试构造用例。
 */
export function parseIco(bytes) {
  const view = viewOf(bytes);
  if (bytes.length < 6) throw new Error('ICO 文件过短');
  const reserved = view.getUint16(0, true);
  const type = view.getUint16(2, true);
  const count = view.getUint16(4, true);
  if (reserved !== 0 || (type !== 1 && type !== 2)) {
    throw new Error('不是有效的 ICO / CUR 文件');
  }
  if (count === 0 || 6 + count * 16 > bytes.length) {
    throw new Error('ICO 目录项数量无效');
  }

  const frames = [];
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    const dirWidth = bytes[entry] || 256;   // 目录里 0 表示 256
    const dirHeight = bytes[entry + 1] || 256;
    const bitCount = view.getUint16(entry + 6, true);
    const byteSize = view.getUint32(entry + 8, true);
    const imageOffset = view.getUint32(entry + 12, true);
    if (byteSize === 0 || imageOffset + byteSize > bytes.length) {
      // 单帧损坏不应让整个文件不可读
      continue;
    }
    const data = bytes.subarray(imageOffset, imageOffset + byteSize);
    const isPng = isPngAt(data, 0);
    const pngSize = isPng ? readPngSize(data, 0) : null;
    frames.push({
      index: i,
      kind: isPng ? 'png' : 'dib',
      dirWidth,
      dirHeight,
      width: pngSize ? pngSize.width : dirWidth,
      height: pngSize ? pngSize.height : dirHeight,
      bitCount,
      data
    });
  }

  if (!frames.length) throw new Error('ICO 中没有可用的图像帧');
  return { type: type === 1 ? 'ICO' : 'CUR', frames };
}

/**
 * 选最佳帧：优先分辨率大，其次位深高，最后 PNG 帧（压缩无损、通常自带 alpha）。
 */
export function chooseBestFrame(frames) {
  if (!frames || !frames.length) throw new Error('没有可选择的图标帧');
  return frames.reduce((best, frame) => {
    const score = (f) => f.width * f.height * 1000 + (f.bitCount || 0) * 10 + (f.kind === 'png' ? 5 : 0);
    return score(frame) > score(best) ? frame : best;
  });
}

/**
 * 把 ICO 的 DIB（BITMAPINFOHEADER）帧解码成非预乘 RGBA。
 * 支持 32/24/8/4/1 bpp、调色板、自下而上/自上而下、以及 1bpp AND 透明掩码。
 */
export function decodeDibFrame(frame) {
  const bytes = frame.data;
  const view = viewOf(bytes);
  if (bytes.length < 40) throw new Error('DIB 帧数据过短');
  const headerSize = view.getUint32(0, true);
  if (headerSize < 40) throw new Error('不支持的 DIB 头（需要 BITMAPINFOHEADER 及以上）');
  const width = Math.abs(view.getInt32(4, true));
  const rawHeight = view.getInt32(8, true);
  const bitCount = view.getUint16(14, true);
  const compression = view.getUint32(16, true);
  const clrUsed = view.getUint32(32, true);
  if (!width || !rawHeight || width > 16384) throw new Error('DIB 尺寸无效');
  if (compression !== 0 && compression !== 3) throw new Error('不支持压缩的 DIB 图标帧');
  if (![1, 4, 8, 24, 32].includes(bitCount)) throw new Error(`不支持 ${bitCount}bpp 的 DIB 图标帧`);

  // ICO 的 biHeight 是 XOR 位图 + AND 掩码的总高度，即图标高度的 2 倍
  const height = Math.max(1, Math.floor(Math.abs(rawHeight) / 2));
  const topDown = rawHeight < 0;

  const paletteCount = bitCount <= 8 ? (clrUsed || (1 << bitCount)) : 0;
  const paletteOffset = headerSize;
  const xorOffset = paletteOffset + paletteCount * 4;
  const xorStride = Math.floor((width * bitCount + 31) / 32) * 4;
  const andOffset = xorOffset + xorStride * height;
  const andStride = Math.floor((width + 31) / 32) * 4;
  if (xorOffset + xorStride * height > bytes.length) {
    throw new Error('DIB 像素数据不完整');
  }
  const hasMask = andOffset + andStride * height <= bytes.length;

  // 32bpp 且 alpha 通道有有效值 → 以 alpha 为准（Vista+ 图标）；
  // 否则（老式图标 alpha 全 0）以及 24/8/4/1bpp → 由 AND 掩码决定透明。
  let nonZeroAlpha = false;
  if (bitCount === 32) {
    for (let y = 0; y < height && !nonZeroAlpha; y++) {
      const row = xorOffset + (topDown ? y : height - 1 - y) * xorStride;
      for (let x = 0; x < width; x++) {
        if (bytes[row + x * 4 + 3]) { nonZeroAlpha = true; break; }
      }
    }
  }
  const useMask = bitCount !== 32 || !nonZeroAlpha;

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcY = topDown ? y : height - 1 - y;
    const xorRow = xorOffset + srcY * xorStride;
    const andRow = andOffset + srcY * andStride;
    for (let x = 0; x < width; x++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 255;

      if (bitCount === 32) {
        const p = xorRow + x * 4;
        blue = bytes[p];
        green = bytes[p + 1];
        red = bytes[p + 2];
        alpha = bytes[p + 3];
      } else if (bitCount === 24) {
        const p = xorRow + x * 3;
        blue = bytes[p];
        green = bytes[p + 1];
        red = bytes[p + 2];
      } else {
        let index = 0;
        if (bitCount === 8) {
          index = bytes[xorRow + x];
        } else if (bitCount === 4) {
          const b = bytes[xorRow + (x >> 1)];
          index = (x & 1) === 0 ? (b >> 4) : (b & 0x0F);
        } else {
          const b = bytes[xorRow + (x >> 3)];
          index = (b >> (7 - (x & 7))) & 1;
        }
        const p = paletteOffset + index * 4;
        if (p + 2 < bytes.length) {
          blue = bytes[p];
          green = bytes[p + 1];
          red = bytes[p + 2];
        }
      }

      if (useMask) {
        const transparent = hasMask
          ? Boolean((bytes[andRow + (x >> 3)] >> (7 - (x & 7))) & 1)
          : false;
        alpha = transparent ? 0 : 255;
      }

      const o = (y * width + x) * 4;
      rgba[o] = red;
      rgba[o + 1] = green;
      rgba[o + 2] = blue;
      rgba[o + 3] = alpha;
    }
  }

  return { width, height, rgba, bitCount, hasMask, usedMask: useMask };
}

/**
 * 从 ICNS 中挑出分辨率最大的内嵌 PNG。
 * 现代 ICNS（icp4/ic07/ic08/ic09/ic10...）内部就是 PNG，直接扫描签名最稳妥。
 */
export function pickIcnsPng(bytes) {
  if (bytes.length < 8 || sniffIconKind(bytes) !== 'icns') {
    throw new Error('不是有效的 ICNS 文件');
  }
  const candidates = [];
  for (let i = 8; i + 8 <= bytes.length; i++) {
    if (!isPngAt(bytes, i)) continue;
    const size = readPngSize(bytes, i);
    const end = findPngEnd(bytes, i);
    if (size && end > i) {
      candidates.push({ offset: i, length: end - i, width: size.width, height: size.height });
      i = end - 1; // 跳过整张 PNG，避免把压缩数据里的巧合字节当成新图
    }
  }
  if (!candidates.length) {
    throw new Error('该 ICNS 未包含 PNG 图像（仅支持 PNG 编码的 ICNS）');
  }
  const best = candidates.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
  return {
    data: bytes.subarray(best.offset, best.offset + best.length),
    width: best.width,
    height: best.height,
    frameCount: candidates.length
  };
}

/** RGBA -> PNG 字节（仅预览用；转换直接使用 rgba，不经过这一步） */
export async function encodeRgbaToPng(rgba, width, height) {
  if (typeof document === 'undefined') {
    throw new Error('当前环境不支持 PNG 编码');
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext('2d', { alpha: true });
    context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('PNG 编码失败')), 'image/png');
    });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** 普通图片扩展名 -> MIME */
export function guessImageMime(fileName) {
  const ext = String(fileName || '').split('.').pop().toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'bmp': return 'image/bmp';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}

/**
 * 把任意受支持的图片字节规范化成 { bytes, mime, rgba, width, height, frameInfo }。
 *  - 普通图片：原样返回（rgba = null，交给浏览器解码）
 *  - ICO/CUR：自动选最佳帧；PNG 帧直接复用；DIB 帧解成 RGBA 并另附 PNG 预览字节
 *  - ICNS：提取最大内嵌 PNG
 */
export async function normalizeImageFile(bytes, fileName) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const kind = getIconFileKind(fileName) || sniffIconKind(source);
  if (!kind) {
    return { bytes: source, mime: guessImageMime(fileName), rgba: null, width: 0, height: 0, frameInfo: null };
  }

  if (kind === 'icns') {
    const png = pickIcnsPng(source);
    return {
      bytes: new Uint8Array(png.data),
      mime: 'image/png',
      rgba: null,
      width: png.width,
      height: png.height,
      frameInfo: {
        container: 'ICNS',
        frameCount: png.frameCount,
        picked: `${png.width}x${png.height}`,
        encoding: 'PNG'
      }
    };
  }

  const { type, frames } = parseIco(source);
  const best = chooseBestFrame(frames);
  const frameInfo = {
    container: type,
    frameCount: frames.length,
    picked: `${best.width}x${best.height}`,
    encoding: best.kind === 'png' ? 'PNG' : `${best.bitCount}bpp DIB`
  };

  if (best.kind === 'png') {
    return {
      bytes: new Uint8Array(best.data),
      mime: 'image/png',
      rgba: null,
      width: best.width,
      height: best.height,
      frameInfo
    };
  }

  const decoded = decodeDibFrame(best);
  frameInfo.width = decoded.width;
  frameInfo.height = decoded.height;
  frameInfo.mask = decoded.usedMask ? 'AND mask' : 'alpha 通道';
  const pngBytes = await encodeRgbaToPng(decoded.rgba, decoded.width, decoded.height);
  return {
    bytes: pngBytes,
    mime: 'image/png',
    rgba: decoded.rgba,
    width: decoded.width,
    height: decoded.height,
    frameInfo
  };
}
