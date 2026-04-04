// Find an optimal configuration of cmap tables representing set of codepoints,
// using simple breadth-first algorithm
//
// Assume that:
//  - codepoints have one-to-one correspondence to glyph ids
//  - glyph ids are always bigger for bigger codepoints
//  - glyph ids are always consecutive (1..N without gaps)
//
// This way we can omit glyph ids from all calculations entirely: if codepoints
// fit in format0, then glyph ids also will.
//
// format6 is not considered, because if glyph ids can be delta-coded,
// multiple format0 tables are guaranteed to be smaller than a single format6.
//
// sparse format is not used because as long as glyph ids are consecutive,
// sparse_tiny will always be preferred.
//

'use strict';


function estimate_format0_tiny_size(/*start_code, end_code*/) {
  return 16;
}

function estimate_format0_size(start_code, end_code) {
  return 16 + (end_code - start_code + 1);
}

//function estimate_sparse_size(count) {
//  return 16 + count * 4;
//}

function estimate_sparse_tiny_size(count) {
  return 16 + count * 2;
}

module.exports = function cmap_split(all_codepoints) {
  console.log(`调试: 进入build_subtables，字符数量: ${all_codepoints.length}`);
  
  all_codepoints = all_codepoints.sort((a, b) => a - b);
  console.log(`调试: 排序后字符范围: 0x${all_codepoints[0].toString(16)} - 0x${all_codepoints[all_codepoints.length - 1].toString(16)}`);

  // 限制每个子表的最大字符数量，避免生成过大的子表
  const MAX_CHARS_PER_SUBTABLE = 0x100000;
  
  // 如果字符数量超过限制，将其分成多个块
  if (all_codepoints.length > MAX_CHARS_PER_SUBTABLE) {
    console.log(`调试: 字符数量超过限制，将分成多个块`);
    let result = [];
    let current_chunk = [];
    
    for (let i = 0; i < all_codepoints.length; i++) {
      current_chunk.push(all_codepoints[i]);
      
      // 当达到最大字符数量或到达数组末尾时，创建一个新的子表
      if (current_chunk.length >= MAX_CHARS_PER_SUBTABLE || i === all_codepoints.length - 1) {
        // 为每个块创建一个sparse_tiny子表
        result.push(['sparse_tiny', current_chunk]);
        current_chunk = [];
      }
    }
    
    console.log(`调试: 生成的子表数量: ${result.length}`);
    result.forEach(([format, codepoints], index) => {
      console.log(`调试: 子表 ${index}, 格式: ${format}, 字符数量: ${codepoints.length}, 范围: 0x${codepoints[0].toString(16)} - 0x${codepoints[codepoints.length - 1].toString(16)}`);
    });
    
    return result;
  }

  // 原始逻辑，用于处理字符数量较少的情况
  let min_paths = [];

  for (let i = 0; i < all_codepoints.length; i++) {
    let min = { dist: Infinity };

    for (let j = 0; j <= i; j++) {
      let prev_dist = (j - 1 >= 0) ? min_paths[j - 1].dist : 0;
      let s;

      if (all_codepoints[i] - all_codepoints[j] < 256) {
        s = estimate_format0_size(all_codepoints[j], all_codepoints[i]);

        /* eslint-disable max-depth */
        if (prev_dist + s < min.dist) {
          min = {
            dist: prev_dist + s,
            start: j,
            end: i,
            format: 'format0'
          };
        }
      }

      if (all_codepoints[i] - all_codepoints[j] < 256 && all_codepoints[i] - i === all_codepoints[j] - j) {
        s = estimate_format0_tiny_size(all_codepoints[j], all_codepoints[i]);

        /* eslint-disable max-depth */
        if (prev_dist + s < min.dist) {
          min = {
            dist: prev_dist + s,
            start: j,
            end: i,
            format: 'format0_tiny'
          };
        }
      }

      // tiny sparse will always be preferred over full sparse because glyph ids are consecutive
      // 增加对中文字符的支持，扩大范围限制
      if (all_codepoints[i] - all_codepoints[j] < 0x100000) { // 扩大到1MB范围，支持更多中文字符
        s = estimate_sparse_tiny_size(i - j + 1);

        if (prev_dist + s < min.dist) {
          min = {
            dist: prev_dist + s,
            start: j,
            end: i,
            format: 'sparse_tiny'
          };
        }
      }
    }

    min_paths[i] = min;
  }

  let result = [];

  for (let i = all_codepoints.length - 1; i >= 0;) {
    let path = min_paths[i];
    result.unshift([ path.format, all_codepoints.slice(path.start, path.end + 1) ]);
    i = path.start - 1;
  }

  console.log(`调试: 生成的子表数量: ${result.length}`);
  result.forEach(([format, codepoints], index) => {
    console.log(`调试: 子表 ${index}, 格式: ${format}, 字符数量: ${codepoints.length}, 范围: 0x${codepoints[0].toString(16)} - 0x${codepoints[codepoints.length - 1].toString(16)}`);
  });
  
  return result;
};
