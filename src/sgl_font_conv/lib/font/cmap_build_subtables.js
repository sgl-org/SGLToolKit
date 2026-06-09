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
function estimate_format0_tiny_size(/* start_code, end_code */) {
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
// Fixed overhead per subtable entry in the output (sgl_font_unicode_t struct
// + potential unicode_list array declaration). Used in post-merge step to
// decide whether merging adjacent subtables saves total space.
const SUBTABLE_ENTRY_OVERHEAD = 16;
module.exports = function cmap_split(all_codepoints) {
  all_codepoints = all_codepoints.sort((a, b) => a - b);
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
  if (all_codepoints[i] - all_codepoints[j] < 65536) {
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
  // Post-merge: merge adjacent subtables when combining them into a single
  // sparse_tiny is cheaper than keeping them separate (accounting for the
  // per-subtable entry overhead that the DP does not model).
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < result.length - 1; i++) {
      let a = result[i];
      let b = result[i + 1];
      let combinedCodes = a[1].concat(b[1]);
      let combinedFirst = combinedCodes[0];
      let combinedLast  = combinedCodes[combinedCodes.length - 1];
  // Can only merge if combined range fits in sparse_tiny (< 65536 span)
  if (combinedLast - combinedFirst >= 65536) continue;

  // Cost of keeping separate (each subtable has its own entry overhead)
  let costA, costB;
  if (a[0] === 'format0_tiny') costA = estimate_format0_tiny_size();
  else if (a[0] === 'format0') costA = estimate_format0_size(a[1][0], a[1][a[1].length - 1]);
  else costA = estimate_sparse_tiny_size(a[1].length);


  if (b[0] === 'format0_tiny') costB = estimate_format0_tiny_size();
  else if (b[0] === 'format0') costB = estimate_format0_size(b[1][0], b[1][b[1].length - 1]);
  else costB = estimate_sparse_tiny_size(b[1].length);


  let separateCost = costA + costB + 2 * SUBTABLE_ENTRY_OVERHEAD;
  let mergedCost   = estimate_sparse_tiny_size(combinedCodes.length) + SUBTABLE_ENTRY_OVERHEAD;


  if (mergedCost <= separateCost) {
    result.splice(i, 2, [ 'sparse_tiny', combinedCodes ]);
    merged = true;
    break;
  }
}
  }
  return result;
};
