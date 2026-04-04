'use strict';

const path = require('path');

const Font = require('../../font/font');
const Head = require('./sgl_table_head');
const Cmap = require('./sgl_table_cmap');
const Glyf = require('./sgl_table_glyf');
const AppError = require('../../app_error');

class SglFont extends Font {
  constructor(fontData, options) {
    super(fontData, options);

    this.font_name = options.sgl_font_name;
    if (!this.font_name) {
      const ext = path.extname(options.output);
      this.font_name = path.basename(options.output, ext);
    }

    if (options.sgl_fallback) {
      this.fallback = '&' + options.sgl_fallback;
      this.fallback_declaration = 'extern const sgl_font_t ' + options.sgl_fallback + ';\n';
    } else {
      this.fallback = 'NULL';
      this.fallback_declaration = '';
    }

    if (options.bpp === 3 && options.compress == false) {
      throw new AppError('SGL supports "--bpp 3" with compression only');
    }
  }

  init_tables() {
    this.head = new Head(this);
    this.glyf = new Glyf(this);
    this.cmap = new Cmap(this);
  }

  large_format_guard() {
    let guard_required = false;
    let glyphs_bin_size = 0;

    this.glyf.sgl_data.forEach(d => {
      glyphs_bin_size += d.bin.length;

      if (d.glyph.bbox.width > 255 ||
          d.glyph.bbox.height > 255 ||
          Math.abs(d.glyph.bbox.x) > 127 ||
          Math.abs(d.glyph.bbox.y) > 127 ||
          Math.round(d.glyph.advanceWidth * 16) > 4096) {
        guard_required = true;
      }
    });

    if (glyphs_bin_size > 1024 * 1024) guard_required = true;

    if (!guard_required) return '';

    return `
#if (SGL_FONT_FMT_TXT_LARGE == 0)
#  error "Too large font or glyphs in ${this.font_name.toUpperCase()}. Enable SGL_FONT_FMT_TXT_LARGE in sgl_conf.h")
#endif
`.trimLeft();
  }

  toSGL() {
    let guard_name = this.font_name.toUpperCase();

    return `/* source/fonts/${this.font_name}.c
 *
 * MIT License
 *
 * Copyright(c) 2023-present All contributors of SGL  
 * Document reference link: docs directory
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

#include <sgl_core.h>
#include <sgl_font.h>

${this.glyf.toSGL()}

${this.cmap.toSGL()}

${this.head.toSGL()}

`;
  }
}

module.exports = SglFont;
