/**
 * 图标转换（ICON 转换）核心工具
 *
 * 与「图片转换」保持完全一致的像素字节序：
 *   ARGB8565 : RGB565 小端 2 字节 + alpha 1 字节 = 3 字节/像素
 *   ARGB8888 : B, G, R, A 各 1 字节            = 4 字节/像素
 *
 * 本模块只做纯数据运算，不依赖 DOM，便于单元测试。
 * 尺寸始终保持输入图片的原始宽高，不做任何缩放/重采样。
 */

export const ICON_FORMATS = ['ARGB8565', 'ARGB8888'];

export const ICON_FORMAT_DESC = {
  ARGB8565: 'RGB565 小端(2B) + Alpha(1B)，3 字节/像素',
  ARGB8888: 'B,G,R,A 各 1 字节，4 字节/像素'
};

/** 生成代码的文件头：只依赖 SGL 核心头文件，结构体定义由 sgl_core.h 提供 */
const CODE_HEADER = '#include <sgl_core.h>\n\n';

export function getIconBytesPerPixel(format) {
  switch (format) {
    case 'ARGB8565': return 3;
    case 'ARGB8888': return 4;
    default: throw new Error(`不支持的图标颜色格式: ${format}`);
  }
}

/** RGB565 分量量化（与 ImageConvert 保持一致） */
function toRgb565(red, green, blue) {
  return (Math.round(red / 255 * 31) << 11)
    | (Math.round(green / 255 * 63) << 5)
    | Math.round(blue / 255 * 31);
}

/** 5/6/5 bit 位复制回显到 8bit，避免纯移位导致预览偏暗 */
function expand565(value) {
  return {
    red: (((value >> 11) & 0x1F) << 3) | ((value >> 13) & 0x07),
    green: (((value >> 5) & 0x3F) << 2) | ((value >> 11) & 0x03),
    blue: ((value & 0x1F) << 3) | ((value >> 2) & 0x07)
  };
}

function assertDimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error('图片分辨率必须是有效的正整数');
  }
}

/**
 * RGBA -> 图标位图数据。rgba 为 4 字节/像素的非预乘 RGBA。
 * 输出长度严格等于 width * height * bytesPerPixel（尺寸不变）。
 */
export function encodeIconBitmap(rgba, width, height, format) {
  assertDimensions(width, height);
  const bytesPerPixel = getIconBytesPerPixel(format);
  const pixelCount = width * height;
  if (!rgba || rgba.length < pixelCount * 4) {
    throw new Error('RGBA 数据长度不足');
  }

  const out = new Uint8Array(pixelCount * bytesPerPixel);
  let offset = 0;

  for (let i = 0; i < pixelCount; i++) {
    const source = i * 4;
    const red = rgba[source];
    const green = rgba[source + 1];
    const blue = rgba[source + 2];
    const alpha = rgba[source + 3];

    if (format === 'ARGB8565') {
      const value = toRgb565(red, green, blue);
      out[offset++] = value & 0xFF;
      out[offset++] = (value >> 8) & 0xFF;
      out[offset++] = alpha;
    } else {
      out[offset++] = blue;
      out[offset++] = green;
      out[offset++] = red;
      out[offset++] = alpha;
    }
  }

  return out;
}

/**
 * 图标位图数据 -> RGBA（用于「转换后预览」，显示的是量化后的真实效果）。
 */
export function decodeIconBitmap(bitmap, width, height, format) {
  assertDimensions(width, height);
  const bytesPerPixel = getIconBytesPerPixel(format);
  const pixelCount = width * height;
  if (!bitmap || bitmap.length < pixelCount * bytesPerPixel) {
    throw new Error('图标位图数据长度不足');
  }

  const rgba = new Uint8ClampedArray(pixelCount * 4);
  let offset = 0;

  for (let i = 0; i < pixelCount; i++) {
    const target = i * 4;
    let red;
    let green;
    let blue;
    let alpha;

    if (format === 'ARGB8565') {
      const value = bitmap[offset] | (bitmap[offset + 1] << 8);
      ({ red, green, blue } = expand565(value));
      alpha = bitmap[offset + 2];
    } else {
      blue = bitmap[offset];
      green = bitmap[offset + 1];
      red = bitmap[offset + 2];
      alpha = bitmap[offset + 3];
    }

    rgba[target] = red;
    rgba[target + 1] = green;
    rgba[target + 2] = blue;
    rgba[target + 3] = alpha;
    offset += bytesPerPixel;
  }

  return rgba;
}

/** 文件名/用户输入 -> 合法 C 标识符 */
export function toCIdentifier(value, fallback = 'icon') {
  let name = String(value || '').replace(/\.[^/.]+$/, '');
  name = name.replace(/[^A-Za-z0-9_]/g, '_');
  if (!name) return fallback;
  if (!/^[A-Za-z_]/.test(name)) {
    name = `_${name}`;
  }
  return name;
}

/** 生成去重后的 C 变量名列表 */
export function makeUniqueIdentifiers(infos, fallback = 'icon') {
  const used = new Set();
  return infos.map((info, index) => {
    let name = toCIdentifier(info.name, `${fallback}_${index}`);
    if (used.has(name)) {
      let suffix = 1;
      while (used.has(`${name}_${suffix}`)) suffix++;
      name = `${name}_${suffix}`;
    }
    used.add(name);
    return name;
  });
}

function commentText(text) {
  return String(text || '').replace(/\*\//g, '* /').replace(/[\r\n]+/g, ' ');
}

/** 把字节数组格式化成 C 初始化列表的行（每行 perLine 个 0xXX） */
export function formatHexLines(bytes, perLine = 24, indent = '        ') {
  const lines = [];
  const count = Math.max(1, perLine);
  for (let offset = 0; offset < bytes.length; offset += count) {
    const values = [];
    const end = Math.min(bytes.length, offset + count);
    for (let i = offset; i < end; i++) {
      values.push(`0x${bytes[i].toString(16).padStart(2, '0').toUpperCase()}`);
    }
    lines.push(`${indent}${values.join(', ')},\n`);
  }
  return lines.join('');
}

/**
 * 生成 C 代码。
 *
 * @param {Array} infos  [{ name, fileName, width, height, data: Uint8Array }]
 * @param {Object} options
 *   format                'ARGB8565' | 'ARGB8888'
 *   arrayName             输出数组名
 *   valuesPerLine         每行字节数，默认 24
 *
 * 多张图片固定合并为一个二维数组 + 一个 sgl_icon_pixmap_t 描述数组，
 * 不再提供「独立数组」模式；文件头固定只有 #include <sgl_core.h>，
 * 不输出任何说明注释块、stdint.h 或 sgl_icon_pixmap_t 定义，避免与 SGL 头文件重复定义。
 * @returns {{code, dataCode, structCode, header, arrayName, rowLength, totalBytes}}
 */
export function buildIconCode(infos, options = {}) {
  if (!Array.isArray(infos) || infos.length === 0) {
    throw new Error('没有可转换的图片');
  }

  const {
    format = 'ARGB8565',
    arrayName = 'icons',
    valuesPerLine = 24
  } = options;

  const bytesPerPixel = getIconBytesPerPixel(format);
  const name = toCIdentifier(arrayName, 'icons');
  const dataName = `${name}_bitmap`;
  const totalBytes = infos.reduce((sum, info) => sum + info.data.length, 0);
  const rowLength = Math.max(...infos.map((info) => info.data.length));
  const identifiers = makeUniqueIdentifiers(infos);

  const header = CODE_HEADER;

  const comments = infos.map((info, index) =>
    `/* [${index}] ${commentText(info.fileName || info.name)}  ${info.width} x ${info.height}  ${info.data.length} bytes */`
  );

  let dataCode = `static const uint8_t ${dataName}[${infos.length}][${rowLength}] = {\n`;
  infos.forEach((info, index) => {
    dataCode += `    { ${comments[index]}\n`;
    dataCode += formatHexLines(info.data, valuesPerLine);
    dataCode += '    },\n';
  });
  dataCode += '};\n\n';

  let structCode = `const sgl_icon_pixmap_t ${name}[${infos.length}] = {\n`;
  infos.forEach((info, index) => {
    structCode += `    { .width = ${info.width}, .height = ${info.height}, .bitmap = ${dataName}[${index}] },  /* ${identifiers[index]} */\n`;
  });
  structCode += '};\n';

  return {
    code: `${header}${dataCode}${structCode}`,
    dataCode,
    structCode,
    header,
    arrayName: name,
    rowLength,
    totalBytes,
    bytesPerPixel
  };
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
