import assert from 'node:assert/strict';
import {
  collectBatchSingleBinNameIssues,
  collectCCode,
  createBatchSingleBinResults,
  createBinaryChunks,
  createCCodeChunks,
  estimateCCodeBytes,
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

console.log('image conversion helpers: ok');
