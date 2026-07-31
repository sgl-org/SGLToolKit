import assert from 'node:assert/strict';
import {
  collectCCode,
  createBinaryChunks,
  createCCodeChunks,
  estimateCCodeBytes
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

console.log('image conversion helpers: ok');
