import assert from 'node:assert/strict';
import {
  collectBatchSingleBinNameIssues,
  collectCCode,
  convertImages,
  createBatchSingleBinResults,
  createBinaryChunks,
  createCCodeChunks,
  estimateCCodeBytes,
  qoiCompress,
  qoiDecode,
  validateBatchSingleBinNames
} from '../src/utils/imageConversion.js';

const settings = {
  format: 'RGB565',
  compression: 'none',
  combineAsArray: true,
  arrayName: 'images'
};

const result = {
  infos: [
    {
      name: 'first',
      width: 2,
      height: 1,
      bitmapName: 'first_bitmap',
      bitmapData: new Uint8Array([0x01, 0x02, 0x03, 0x04])
    },
    {
      name: 'second',
      width: 1,
      height: 1,
      bitmapName: 'second_bitmap',
      bitmapData: new Uint8Array([0x05, 0x06])
    }
  ],
  settings
};

const code = collectCCode(result, 4096);
assert.match(code, /images\[2\]/);
assert.match(code, /0x01, 0x02, 0x03, 0x04/);

const chunks = [...createCCodeChunks(result.infos, settings, 32)];
assert.ok(chunks.length > 1);
assert.equal(chunks.join(''), code);

const binary = [...createBinaryChunks(result.infos.map((info) => info.bitmapData), 3)]
  .flatMap((chunk) => [...chunk]);
assert.deepEqual(binary, [1, 2, 3, 4, 5, 6]);
assert.ok(estimateCCodeBytes(result) > 0);
assert.throws(() => collectCCode(result, 10), /超过/);

// 批量单图片 BIN 模式：命名校验
const nameIssues = collectBatchSingleBinNameIssues([
  { name: 'icon1.png' },
  { name: 'icon_2.jpg' },
  { name: '3bad.png' },
  { name: 'bad-name.png' },
  { name: 'icon1.bmp' }
]);
assert.deepEqual(nameIssues.invalidNames, ['3bad.png', 'bad-name.png']);
assert.deepEqual(nameIssues.duplicateNames, ['icon1']);
assert.equal(validateBatchSingleBinNames([
  { name: 'icon1.png' },
  { name: 'icon_2.jpg' }
]), true);
assert.equal(validateBatchSingleBinNames([
  { name: 'icon1.png' },
  { name: 'icon1.bmp' }
]), false);

// 批量单图片 BIN 模式：每张图一个 bin 结果 + 一个 c 描述文件
const batchSettings = {
  ...settings,
  outputFormat: 'bin',
  batchSingleBin: true,
  combineAsArray: true
};
const batchOutputs = createBatchSingleBinResults(result.infos, batchSettings);
assert.equal(batchOutputs.length, 3);
assert.equal(batchOutputs[0].kind, 'bin');
assert.equal(batchOutputs[0].name, 'first.bin');
assert.deepEqual([...batchOutputs[0].binParts[0]], [1, 2, 3, 4]);
assert.equal(batchOutputs[1].kind, 'bin');
assert.equal(batchOutputs[1].name, 'second.bin');
assert.equal(batchOutputs[2].kind, 'text');
assert.match(batchOutputs[2].code, /#include <stddef.h>/);
assert.match(batchOutputs[2].code, /const sgl_pixmap_t first = \{/);
assert.match(batchOutputs[2].code, /\.bitmap\.addr = NULL/);
assert.match(batchOutputs[2].code, /const sgl_pixmap_t second = \{/);
assert.match(batchOutputs[2].code, /\/\/ first -> first\.bin/);

// QOI-RGB565 压缩：编码/解码闭环
function rgb565Pixel(r, g, b) {
  const value = (Math.round(r / 255 * 31) << 11)
    | (Math.round(g / 255 * 63) << 5)
    | Math.round(b / 255 * 31);
  return [value & 0xFF, (value >> 8) & 0xFF];
}

function assertRoundTrip(name, width, height, pixels) {
  const buf = new Uint8Array(width * height * 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [lo, hi] = pixels[y * width + x];
      const o = (y * width + x) * 2;
      buf[o] = lo;
      buf[o + 1] = hi;
    }
  }

  const compressed = qoiCompress(buf, width, height);
  assert.equal(compressed[0], 0x51, `${name}: magic`);
  assert.deepEqual([...compressed.slice(1, 3)], [(width >> 8) & 0xFF, width & 0xFF], `${name}: 宽度BE`);
  assert.deepEqual([...compressed.slice(3, 5)], [(height >> 8) & 0xFF, height & 0xFF], `${name}: 高度BE`);
  const n16 = (compressed[7] << 8) | compressed[8];
  const n24 = (compressed[9] << 8) | compressed[10];
  const n32 = (compressed[11] << 8) | compressed[12];
  assert.equal(n16 + n24 + n32, height * 2, `${name}: 偏移表总字节数`);
  assert.equal(n24, 0, `${name}: 小图应全部使用u16档`);
  assert.equal(n32, 0, `${name}: 小图应全部使用u16档`);

  const decoded = qoiDecode(compressed);
  assert.equal(decoded.width, width, `${name}: 解码宽度`);
  assert.equal(decoded.height, height, `${name}: 解码高度`);
  assert.deepEqual([...decoded.bitmapData], [...buf], `${name}: 逐字节还原`);
  return compressed;
}

function readU16BE(data, pos) {
  return (data[pos] << 8) | data[pos + 1];
}

// 实色图片：整行整块 RUN，且全黑首像素触发 prev=(0,0,0) 分支
(() => {
  const solid = new Array(64 * 2).fill(rgb565Pixel(31, 63, 31));
  assertRoundTrip('纯色RUN', 64, 2, solid);
})();

// 行宽 63/64/65：RUN 上限与跨行重置
(() => {
  const row = rgb565Pixel(1, 2, 3);
  const last = rgb565Pixel(7, 7, 7);
  for (const width of [1, 2, 62, 63, 64, 65, 127]) {
    for (const height of [1, 3]) {
      const flat = Array.from(
        { length: width * height },
        (_, i) => i % width === width - 1 ? last : row
      );
      assertRoundTrip(`行宽${width}x${height}`, width, height, flat);
    }
  }
})();

// 渐变：逐像素小幅变化，密集 DIFF/LUMA
(() => {
  const width = 40;
  const height = 4;
  const flat = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      flat.push(rgb565Pixel((x * 7) % 32, (x * 3 + y) % 64, (x * 11) % 32));
    }
  }
  assertRoundTrip('渐变DIFF/LUMA', width, height, flat);
})();

// 棋盘格：大幅跳变像素
(() => {
  const width = 33;
  const height = 5;
  const flat = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      flat.push((x + y) % 2 === 0 ? rgb565Pixel(9, 9, 9) : rgb565Pixel(30, 20, 12));
    }
  }
  assertRoundTrip('棋盘格', width, height, flat);
})();

// 伪随机像素：覆盖原始RGB565、回绕差分等分支
(() => {
  const width = 37;
  const height = 7;
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const flat = Array.from({ length: width * height }, () => rgb565Pixel(
    Math.floor(rand() * 31),
    Math.floor(rand() * 63),
    Math.floor(rand() * 31)
  ));
  assertRoundTrip('随机像素', width, height, flat);
})();

// 行间独立编码验证：相邻行差异大时互不影响（前一行尾部 RUN 不应泄漏到下一行）
(() => {
  const width = 63;
  const height = 3;
  const dim = rgb565Pixel(1, 1, 1);
  const bright = rgb565Pixel(20, 20, 20);
  const flat = Array.from({ length: width * height }, (_, i) => Math.floor(i / width) === 1 ? bright : dim);
  assertRoundTrip('行独立性', width, height, flat);
})();

// QOI 作为压缩算法：仅允许 RGB565，C 代码输出 SGL_PIXMAP_FMT_QOI_RGB565
const qoiCode = collectCCode({
  infos: [
    {
      name: 'x',
      width: 1,
      height: 1,
      bitmapName: 'x_bitmap',
      bitmapData: new Uint8Array([1, 2, 3, 4])
    }
  ],
  settings: { format: 'RGB565', compression: 'qoi', combineAsArray: false, arrayName: 'x' }
}, 4096);
assert.match(qoiCode, /SGL_PIXMAP_FMT_QOI_RGB565/);
assert.match(qoiCode, /\/\/ QOI压缩数据\n/);

// QOI 压缩与非 RGB565 格式组合必须报错
await assert.rejects(
  convertImages([], { format: 'RGB888', compression: 'qoi' }, {}),
  /仅支持RGB565/
);

console.log('image conversion helpers: ok');
