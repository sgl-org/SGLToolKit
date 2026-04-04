'use strict';

const Head = require('../../font/table_head');

class SglHead extends Head {
  constructor(font) {
    super(font);
  }

  get_stride_align() {
    if (this.font.opts.stride > 0) {
      return `    .stride = ${this.font.opts.stride}`;
    }
    return '';
  }

  toSGL() {
    const f = this.font;

    // SGL 不区分 subpixel 模式（或可自定义），此处简化为无 subpixel 支持
    // 若需支持，可添加类似 sgl_font_subpx_mode_t 的枚举

    const staticBitmap = f.glyf.getCompressionCode() === 0 ? '1' : '0';

    return `
${f.fallback_declaration}

const sgl_font_t ${f.font_name} = {
    .bitmap = font_bitmap,
    .table = font_table,
    .font_table_size = SGL_ARRAY_SIZE(font_table),
    .font_height = ${f.src.ascent - f.src.descent},
    .base_line = ${-f.src.descent},
    .bpp = ${f.opts.bpp},
    .compress = ${f.opts.compress ? '1' : '0'},
    .unicode = font_unicode,
    .unicode_num = SGL_ARRAY_SIZE(font_unicode),
};
`.trim();
  }
}

module.exports = SglHead;
