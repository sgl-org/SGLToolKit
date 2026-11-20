/**
 * 图标高质量等比缩放
 *
 * 管线（针对带透明通道的图标专门设计）：
 *   1. sRGB -> 线性光，并做 Alpha 预乘
 *      · 直接对非预乘 RGBA 插值会让透明像素的（通常是黑色）RGB 渗进边缘，形成黑边；
 *      · 线性光可避免半透明叠加处发暗，比在 gamma 空间滤波更准确。
 *   2. 大幅缩小（>3x）时先做「面积平均」预降采样，数学上等价于 box filter，
 *      一次性把所有源像素纳入平均，是最彻底的抗混叠，同时把后续卷积成本压到常数级。
 *   3. Lanczos3 可分离卷积（水平 + 垂直）收尾。缩小时 kernel 半径按缩放比展宽，
 *      即标准 anti-aliased Lanczos；放大时用原生 3-lobe kernel 保持锐利边缘。
 *   4. 反预乘 + 线性光 -> sRGB 输出。
 *
 * 只做纯数据运算，不依赖 DOM，便于单元测试。
 */

export const MAX_OUTPUT_PIXELS = 4 * 1024 * 1024;
export const MAX_OUTPUT_SIDE = 4096;
export const RESIZE_QUALITY_LABEL = 'Lanczos3 · 线性光 · 预乘 Alpha · 面积抗混叠';

const SRGB_TO_LINEAR = new Float32Array(256);
const LINEAR_TO_SRGB = new Float32Array(4097);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
for (let i = 0; i <= 4096; i++) {
  const c = i / 4096;
  LINEAR_TO_SRGB[i] = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function encodeSrgb(value) {
  const t = (value <= 0 ? 0 : value >= 1 ? 1 : value) * 4096;
  const i = t | 0;
  if (i >= 4096) return 1;
  const f = t - i;
  return LINEAR_TO_SRGB[i] + (LINEAR_TO_SRGB[i + 1] - LINEAR_TO_SRGB[i]) * f;
}

function positive(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function invalidResult(width, height, error) {
  return {
    width,
    height,
    changed: false,
    ratioX: 1,
    ratioY: 1,
    valid: false,
    error
  };
}

/**
 * 计算等比缩放后的尺寸（严格保持宽高比，四个边共用同一个 scale）。
 *
 * mode:
 *   'none'   不缩放
 *   'width'  指定目标宽度（用 targetWidth）
 *   'height' 指定目标高度（用 targetHeight）
 *   'max'    限制最长边（用 targetWidth 作为最长边上限）
 *   'fit'    等比适配进 targetWidth x targetHeight 的框
 */
export function computeScaledSize(width, height, options = {}) {
  const { mode = 'none', targetWidth = 0, targetHeight = 0 } = options;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    return invalidResult(width, height, '原始尺寸无效');
  }
  if (mode === 'none') {
    return { width, height, changed: false, ratioX: 1, ratioY: 1, valid: true, error: null };
  }

  const tw = positive(targetWidth);
  const th = positive(targetHeight);
  let scale = 0;
  switch (mode) {
    case 'width': scale = tw ? tw / width : 0; break;
    case 'height': scale = th ? th / height : 0; break;
    case 'max': scale = tw ? tw / Math.max(width, height) : 0; break;
    case 'fit': scale = (tw && th) ? Math.min(tw / width, th / height) : 0; break;
    default: return invalidResult(width, height, '未知的缩放模式');
  }
  if (!(scale > 0)) return invalidResult(width, height, '目标尺寸必须是正数');

  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));
  if (outW > MAX_OUTPUT_SIDE || outH > MAX_OUTPUT_SIDE || outW * outH > MAX_OUTPUT_PIXELS) {
    return invalidResult(width, height, `目标尺寸 ${outW}x${outH} 超过上限（单边 ${MAX_OUTPUT_SIDE} / 总像素 ${MAX_OUTPUT_PIXELS.toLocaleString()}）`);
  }

  return {
    width: outW,
    height: outH,
    changed: outW !== width || outH !== height,
    ratioX: width / outW,
    ratioY: height / outH,
    valid: true,
    error: null
  };
}

function assertRgba(rgba, width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error('缩放尺寸必须是有效的正整数');
  }
  if (!rgba || rgba.length < width * height * 4) throw new Error('RGBA 数据长度不足');
}

function toPremultipliedLinear(rgba, width, height) {
  const out = new Float32Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * 4;
    const a = rgba[s + 3] / 255;
    out[s] = SRGB_TO_LINEAR[rgba[s]] * a;
    out[s + 1] = SRGB_TO_LINEAR[rgba[s + 1]] * a;
    out[s + 2] = SRGB_TO_LINEAR[rgba[s + 2]] * a;
    out[s + 3] = a;
  }
  return out;
}

function fromPremultipliedLinear(data, width, height) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * 4;
    const a = data[s + 3] <= 0 ? 0 : (data[s + 3] >= 1 ? 1 : data[s + 3]);
    const inv = a > 1e-7 ? 1 / a : 0;
    out[s] = Math.round(encodeSrgb(data[s] * inv) * 255);
    out[s + 1] = Math.round(encodeSrgb(data[s + 1] * inv) * 255);
    out[s + 2] = Math.round(encodeSrgb(data[s + 2] * inv) * 255);
    out[s + 3] = Math.round(a * 255);
  }
  return out;
}

/** 精确面积平均降采样：每个目标像素按其覆盖的源像素面积加权 */
function areaDownscale(src, srcW, srcH, dstW, dstH) {
  const out = new Float32Array(dstW * dstH * 4);
  const sx = srcW / dstW;
  const sy = srcH / dstH;
  for (let dy = 0; dy < dstH; dy++) {
    const y0 = dy * sy;
    const y1 = (dy + 1) * sy;
    const iy0 = Math.floor(y0);
    const iy1 = Math.min(srcH, Math.ceil(y1));
    for (let dx = 0; dx < dstW; dx++) {
      const x0 = dx * sx;
      const x1 = (dx + 1) * sx;
      const ix0 = Math.floor(x0);
      const ix1 = Math.min(srcW, Math.ceil(x1));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let total = 0;
      for (let y = iy0; y < iy1; y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        if (wy <= 0) continue;
        const row = y * srcW;
        for (let x = ix0; x < ix1; x++) {
          const wx = Math.min(x + 1, x1) - Math.max(x, x0);
          if (wx <= 0) continue;
          const w = wx * wy;
          const p = (row + x) * 4;
          r += src[p] * w;
          g += src[p + 1] * w;
          b += src[p + 2] * w;
          a += src[p + 3] * w;
          total += w;
        }
      }
      const inv = total > 0 ? 1 / total : 0;
      const o = (dy * dstW + dx) * 4;
      out[o] = r * inv;
      out[o + 1] = g * inv;
      out[o + 2] = b * inv;
      out[o + 3] = a * inv;
    }
  }
  return out;
}

/** Lanczos 窗口 sinc 核（a = 3 lobes） */
function lanczos3(x) {
  if (x === 0) return 1;
  const ax = Math.abs(x);
  if (ax >= 3) return 0;
  const px = Math.PI * x;
  return (3 * Math.sin(px) * Math.sin(px / 3)) / (px * px);
}

/** 为每个目标坐标预计算卷积权重；缩小时展宽 kernel 实现抗混叠 */
function buildWeights(srcSize, dstSize) {
  const scale = srcSize / dstSize;
  const filterScale = Math.max(1, scale);
  const radius = 3 * filterScale;
  const table = new Array(dstSize);
  for (let d = 0; d < dstSize; d++) {
    const center = (d + 0.5) * scale;
    const left = Math.max(0, Math.floor(center - radius));
    const right = Math.min(srcSize, Math.ceil(center + radius));
    const weights = new Float32Array(right - left);
    let sum = 0;
    for (let s = left; s < right; s++) {
      const w = lanczos3((s + 0.5 - center) / filterScale);
      weights[s - left] = w;
      sum += w;
    }
    if (Math.abs(sum) > 1e-8) {
      for (let i = 0; i < weights.length; i++) weights[i] /= sum;
    } else {
      // 极端边界退化成最近邻，保证不会出现空像素
      weights.fill(0);
      const nearest = Math.min(right - 1, Math.max(left, Math.floor(center)));
      weights[nearest - left] = 1;
    }
    table[d] = { left, right, weights };
  }
  return table;
}

function clampPremultiplied(value, alpha) {
  return value < 0 ? 0 : (value > alpha ? alpha : value);
}

/** 水平卷积：srcW x srcH -> dstW x srcH */
function convolveHorizontal(src, srcW, srcH, dstW, weightTable) {
  const out = new Float32Array(dstW * srcH * 4);
  for (let y = 0; y < srcH; y++) {
    const row = y * srcW;
    const outRow = y * dstW;
    for (let x = 0; x < dstW; x++) {
      const { left, right, weights } = weightTable[x];
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let s = left; s < right; s++) {
        const w = weights[s - left];
        if (w === 0) continue;
        const p = (row + s) * 4;
        r += src[p] * w;
        g += src[p + 1] * w;
        b += src[p + 2] * w;
        a += src[p + 3] * w;
      }
      const alpha = a < 0 ? 0 : (a > 1 ? 1 : a);
      const o = (outRow + x) * 4;
      out[o] = clampPremultiplied(r, alpha);
      out[o + 1] = clampPremultiplied(g, alpha);
      out[o + 2] = clampPremultiplied(b, alpha);
      out[o + 3] = alpha;
    }
  }
  return out;
}

/** 垂直卷积：srcW x srcH -> srcW x dstH */
function convolveVertical(src, srcW, srcH, dstH, weightTable) {
  const out = new Float32Array(srcW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const { left, right, weights } = weightTable[y];
    for (let x = 0; x < srcW; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let s = left; s < right; s++) {
        const w = weights[s - left];
        if (w === 0) continue;
        const p = (s * srcW + x) * 4;
        r += src[p] * w;
        g += src[p + 1] * w;
        b += src[p + 2] * w;
        a += src[p + 3] * w;
      }
      const alpha = a < 0 ? 0 : (a > 1 ? 1 : a);
      const o = (y * srcW + x) * 4;
      out[o] = clampPremultiplied(r, alpha);
      out[o + 1] = clampPremultiplied(g, alpha);
      out[o + 2] = clampPremultiplied(b, alpha);
      out[o + 3] = alpha;
    }
  }
  return out;
}

/**
 * 高质量 RGBA 重采样。输入/输出都是非预乘 sRGB RGBA。
 * 返回 Uint8ClampedArray，长度严格等于 dstW * dstH * 4。
 */
export function resizeRgba(rgba, srcW, srcH, dstW, dstH) {
  assertRgba(rgba, srcW, srcH);
  if (!Number.isSafeInteger(dstW) || !Number.isSafeInteger(dstH) || dstW <= 0 || dstH <= 0) {
    throw new Error('目标尺寸必须是有效的正整数');
  }
  if (dstW * dstH > MAX_OUTPUT_PIXELS || dstW > MAX_OUTPUT_SIDE || dstH > MAX_OUTPUT_SIDE) {
    throw new Error('目标尺寸超过上限');
  }
  if (dstW === srcW && dstH === srcH) {
    return new Uint8ClampedArray(rgba.subarray ? rgba.subarray(0, srcW * srcH * 4) : rgba);
  }

  let work = toPremultipliedLinear(rgba, srcW, srcH);
  let workW = srcW;
  let workH = srcH;

  // 大幅缩小：先做面积平均预降到目标约 2 倍，再让 Lanczos 收尾
  const shrink = Math.max(srcW / dstW, srcH / dstH);
  if (shrink > 3) {
    const preW = Math.max(dstW, Math.min(workW, dstW * 2));
    const preH = Math.max(dstH, Math.min(workH, dstH * 2));
    if (preW < workW || preH < workH) {
      work = areaDownscale(work, workW, workH, preW, preH);
      workW = preW;
      workH = preH;
    }
  }

  if (workW !== dstW) {
    work = convolveHorizontal(work, workW, workH, dstW, buildWeights(workW, dstW));
    workW = dstW;
  }
  if (workH !== dstH) {
    work = convolveVertical(work, workW, workH, dstH, buildWeights(workH, dstH));
    workH = dstH;
  }

  return fromPremultipliedLinear(work, workW, workH);
}

/**
 * 便捷入口：按 computeScaledSize 的选项一步完成等比缩放。
 * 返回 { width, height, rgba, changed, ratioX, ratioY }。
 */
export function scaleRgbaKeepAspect(rgba, width, height, options = {}) {
  const size = computeScaledSize(width, height, options);
  if (!size.valid) throw new Error(size.error);
  return {
    ...size,
    rgba: resizeRgba(rgba, width, height, size.width, size.height)
  };
}
