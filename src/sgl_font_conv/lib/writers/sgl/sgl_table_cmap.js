'use strict';

const u = require('../../utils');
const Cmap = require('../../font/table_cmap');
const build_subtables = require('../../font/cmap_build_subtables');

class SglCmap extends Cmap {
  constructor(font) {
    super(font);

    this.sgl_compiled = false;
    this.sgl_subtables = [];
  }

  sgl_format2enum(name) {
    switch (name) {
      case 'format0_tiny': return 'SGL_FONT_FMT_TXT_CMAP_FORMAT0_TINY';
      case 'format0': return 'SGL_FONT_FMT_TXT_CMAP_FORMAT0_FULL';
      case 'sparse_tiny': return 'SGL_FONT_FMT_TXT_CMAP_SPARSE_TINY';
      case 'sparse': return 'SGL_FONT_FMT_TXT_CMAP_SPARSE_FULL';
      default: throw new Error('Unknown subtable format');
    }
  }

  sgl_compile() {
    if (this.sgl_compiled) return;
    this.sgl_compiled = true;

    const f = this.font;

    let subtables_plan = build_subtables(f.src.glyphs.map(g => g.code));
    let idx = 0;

    for (let [format, codepoints] of subtables_plan) {
      let g = this.glyphByCode(codepoints[0]);
      let start_glyph_id = f.glyph_id[g.code];
      let min_code = codepoints[0];
      let max_code = codepoints[codepoints.length - 1];

      let has_charcodes = false;
      let has_ids = false;
      let defs = '';
      let entries_count = 0;

      if (format === 'format0_tiny') {
        // use default empty values
      } else if (format === 'format0') {
        has_ids = true;
        let d = this.collect_format0_data(min_code, max_code, start_glyph_id);
        entries_count = d.length;

        defs = `
`.trim();

      } else if (format === 'sparse_tiny') {
        has_charcodes = true;
        let d = this.collect_sparse_data(codepoints, start_glyph_id);
        entries_count = d.codes.length;

        defs = `
static const uint32_t unicode_list_${idx}[] = {
${u.long_dump(d.codes, { hex: true })}
};
`.trim();

      } else { // assume format === 'sparse'
        has_charcodes = true;
        has_ids = true;
        let d = this.collect_sparse_data(codepoints, start_glyph_id);
        entries_count = d.codes.length;

        defs = `
static const uint32_t unicode_list_${idx}[] = {
${u.long_dump(d.codes, { hex: true })}
};
`.trim();
      }

      const u_list = has_charcodes ? `unicode_list_${idx}` : 'NULL';

      // 决定 .len 字段
      let len;
      if (format === 'format0' || format === 'format0_tiny') {
        len = max_code - min_code + 1;
      } else {
        len = entries_count;
      }

      /* eslint-disable max-len */
      const head = `    { .offset = 0x${min_code.toString(16)}, .len = ${len}, .list = ${u_list}, .tab_offset = ${start_glyph_id}, }`;

      this.sgl_subtables.push({
        defs,
        head
      });

      idx++;
    }
  }

  toSGL() {
    this.sgl_compile();

    return `

${this.sgl_subtables.map(d => d.defs).filter(Boolean).join('\n\n')}

static const sgl_font_unicode_t font_unicode[] =
{
${this.sgl_subtables.map(d => d.head).join(',\n')}
};
`.trim();
  }
}

module.exports = SglCmap;