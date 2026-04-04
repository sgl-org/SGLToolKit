'use strict';

const { BitStream } = require('bit-buffer');
const u = require('../../utils');
const Glyf = require('../../font/table_glyf');

class SglGlyf extends Glyf {
  constructor(font) {
    super(font);

    this.sgl_data = [];
    this.sgl_compiled = false;
  }

  sgl_bitmap(glyph) {
    let buf;

    const bufSize = 100 + (this.widthToStride(glyph.bbox.width) * glyph.bbox.height) *
                     this.font.opts.bpp + this.font.opts.align;
    buf = Buffer.alloc(bufSize);

    const bs = new BitStream(buf);
    bs.bigEndian = true;

    const pixels = this.font.glyf.pixelsToBpp(glyph.pixels);

    this.font.glyf.storePixels(bs, pixels);

    let glyph_bitmap;
    if (this.font.opts.align !== 1) {
      glyph_bitmap = Buffer.alloc(Math.ceil(bs.byteIndex / this.font.opts.align) * this.font.opts.align);
    } else {
      glyph_bitmap = Buffer.alloc(bs.byteIndex);
    }

    buf.copy(glyph_bitmap, 0, 0, bs.byteIndex);

    return glyph_bitmap;
  }

  sgl_compile() {
    if (this.sgl_compiled) return;

    this.sgl_compiled = true;

    const f = this.font;
    this.sgl_data = [];
    let offset = 0;

    f.src.glyphs.forEach(g => {
      const id = f.glyph_id[g.code];
      const bin = this.sgl_bitmap(g);
      this.sgl_data[id] = {
        bin,
        offset,
        glyph: g
      };
      offset += bin.length;
    });
  }

  to_sgl_bitmaps() {
    this.sgl_compile();

    let result = [];
    this.sgl_data.forEach((d, idx) => {
      if (idx === 0) return;
      const code_hex = d.glyph.code.toString(16).toUpperCase();
      const code_str = JSON.stringify(String.fromCodePoint(d.glyph.code));

      let cols = 8;

      if (this.font.opts.stride > 0) cols = this.widthToStride(d.glyph.bbox.width);
      let txt = `    /* U+${code_hex.padStart(4, '0')} ${code_str} */
${u.long_dump(d.bin, { hex: true, col: cols })}`;

      if (idx < this.sgl_data.length - 1) {
        // skip comma for zero data
        txt += d.bin.length ? ',\n\n' : '\n';
      }

      result.push(txt);
    });

    return result.join('');
  }

  to_sgl_glyph_dsc() {
    this.sgl_compile();

    /* eslint-disable max-len */

    let result = [ '    {.bitmap_index = 0, .adv_w = 0, .box_w = 0, .box_h = 0, .ofs_x = 0, .ofs_y = 0} /* id = 0 reserved */' ];

    this.sgl_data.forEach(d => {
      const idx = d.offset,
            adv_w = Math.round(d.glyph.advanceWidth * 16),
            h = d.glyph.bbox.height,
            w = d.glyph.bbox.width,
            x = d.glyph.bbox.x,
            y = d.glyph.bbox.y;
      result.push(`    {.bitmap_index = ${idx}, .adv_w = ${adv_w}, .box_w = ${w}, .box_h = ${h}, .ofs_x = ${x}, .ofs_y = ${y}}`);
    });

    return result.join(',\n');
  }

  toSGL() {
    return `
static const uint8_t font_bitmap[] = {
${this.to_sgl_bitmaps()}
};


static const sgl_font_table_t font_table[] = {
${this.to_sgl_glyph_dsc()}
};
`.trim();
  }
}

module.exports = SglGlyf;