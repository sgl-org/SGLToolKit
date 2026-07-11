#include "output_writer.h"
#include "bitstream.h"
#include "rle_compress.h"
#include <stdlib.h>
#include <string.h>

/* ---------- helpers ---------- */

/* Quantize 8-bit grayscale pixel to bpp bits */
static uint8_t quantize_pixel(uint8_t pixel, int bpp)
{
    return pixel >> (8 - bpp);
}

/* Should we compress? bpp==1 => no compression */
static int should_compress(int bpp, int compress_flag)
{
    if (!compress_flag) return 0;
    if (bpp == 1) return 0;
    return 1;
}

/* Render one glyph's bitmap to packed bytes (big-endian bit order).
 * Returns malloc'd buffer and sets *out_len. */
static uint8_t *render_glyph_bitmap(const glyph_t *g, int bpp, int compress_flag,
                                    size_t *out_len)
{
    size_t pixel_count = (size_t)g->box_w * (size_t)g->box_h;

    /* Quantize pixels */
    uint8_t *qpixels = NULL;
    if (pixel_count > 0) {
        qpixels = (uint8_t *)malloc(pixel_count);
        for (size_t i = 0; i < pixel_count; i++) {
            qpixels[i] = quantize_pixel(g->pixels[i], bpp);
        }
    }

    /* Allocate output buffer (generous upper bound) */
    size_t buf_cap = 128 + pixel_count * 2;
    uint8_t *buf = (uint8_t *)calloc(1, buf_cap);
    bitstream_t bs;
    bitstream_init(&bs, buf, buf_cap);

    if (pixel_count > 0 && qpixels) {
        if (should_compress(bpp, compress_flag)) {
            rle_compress(&bs, qpixels, pixel_count, bpp);
        } else {
            /* Raw: write each pixel as bpp bits */
            for (size_t i = 0; i < pixel_count; i++) {
                bitstream_write_bits(&bs, qpixels[i], bpp);
            }
        }
    }

    free(qpixels);

    *out_len = bitstream_byte_index(&bs);
    return buf;
}

/* Find glyph index in font->glyphs by codepoint (binary search, glyphs sorted) */
static int find_glyph_index(const font_data_t *font, uint32_t code)
{
    size_t lo = 0, hi = font->glyph_count;
    while (lo < hi) {
        size_t mid = lo + (hi - lo) / 2;
        if (font->glyphs[mid].code == code) return (int)mid;
        if (font->glyphs[mid].code < code) lo = mid + 1;
        else hi = mid;
    }
    return -1;
}

/* ---------- writer ---------- */

/* Per-glyph compiled data */
typedef struct {
    uint8_t *bitmap_data;
    size_t   bitmap_len;
    size_t   bitmap_offset;  /* offset into combined bitmap array */
} compiled_glyph_t;

int write_sgl_font(FILE *fp, const writer_ctx_t *ctx)
{
    const font_data_t *font = ctx->font;
    const cmap_plan_t *cmap = ctx->cmap;
    size_t glyph_count = font->glyph_count;

    /* ---- Phase 1: compile all glyph bitmaps ---- */
    compiled_glyph_t *compiled = (compiled_glyph_t *)calloc(glyph_count, sizeof(compiled_glyph_t));
    if (!compiled) return -1;

    size_t total_bitmap_size = 0;
    for (size_t i = 0; i < glyph_count; i++) {
        compiled[i].bitmap_data = render_glyph_bitmap(
            &font->glyphs[i], ctx->bpp, ctx->compress, &compiled[i].bitmap_len);
        compiled[i].bitmap_offset = total_bitmap_size;
        total_bitmap_size += compiled[i].bitmap_len;
    }

    /* ---- Phase 2: write C file header ---- */
    fprintf(fp, "/* source/fonts/%s.c\n", ctx->font_name);
    fprintf(fp, " *\n");
    fprintf(fp, " * MIT License\n");
    fprintf(fp, " *\n");
    fprintf(fp, " * Copyright(c) 2023-present All contributors of SGL  \n");
    fprintf(fp, " * Document reference link: docs directory\n");
    fprintf(fp, " * \n");
    fprintf(fp, " * Permission is hereby granted, free of charge, to any person obtaining a copy\n");
    fprintf(fp, " * of this software and associated documentation files (the \"Software\"), to deal\n");
    fprintf(fp, " * in the Software without restriction, including without limitation the rights\n");
    fprintf(fp, " * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n");
    fprintf(fp, " * copies of the Software, and to permit persons to whom the Software is\n");
    fprintf(fp, " * furnished to do so, subject to the following conditions:\n");
    fprintf(fp, " * The above copyright notice and this permission notice shall be included in all\n");
    fprintf(fp, " * copies or substantial portions of the Software.\n");
    fprintf(fp, " * THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n");
    fprintf(fp, " * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n");
    fprintf(fp, " * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n");
    fprintf(fp, " * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n");
    fprintf(fp, " * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n");
    fprintf(fp, " * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n");
    fprintf(fp, " * SOFTWARE.\n");
    fprintf(fp, " */\n\n");
    fprintf(fp, "#include <sgl_core.h>\n");
    fprintf(fp, "#include <sgl_font.h>\n\n");

    /* ---- Phase 3: write font_bitmap[] ---- */
    fprintf(fp, "static const uint8_t font_bitmap[] = {\n");

    for (size_t i = 0; i < glyph_count; i++) {
        const glyph_t *g = &font->glyphs[i];
        const compiled_glyph_t *cg = &compiled[i];

        fprintf(fp, "    /* U+%04X */\n", g->code);

        /* Write hex bytes, 8 per line */
        for (size_t b = 0; b < cg->bitmap_len; b++) {
            if (b % 8 == 0) fprintf(fp, "    ");
            fprintf(fp, "0x%02x", cg->bitmap_data[b]);

            /* Comma: not after very last byte of very last glyph */
            if (i < glyph_count - 1 || b < cg->bitmap_len - 1) {
                fprintf(fp, ",");
            }

            if (b % 8 == 7 || b == cg->bitmap_len - 1) {
                fprintf(fp, "\n");
            } else {
                fprintf(fp, " ");
            }
        }

        if (i < glyph_count - 1 && cg->bitmap_len > 0) {
            fprintf(fp, "\n");
        }
    }

    fprintf(fp, "};\n\n");

    /* ---- Phase 4: write font_table[] ---- */
    /* font_table entries must follow cmap subtable order, with dummy entries
     * for gaps in FORMAT0 subtables. This ensures tab_offset + (code - offset)
     * correctly indexes into font_table at runtime. */
    fprintf(fp, "\nstatic const sgl_font_table_t font_table[] = {\n");
    fprintf(fp, "    {.bitmap_index = 0, .adv_w = 0, .box_w = 0, .box_h = 0, .ofs_x = 0, .ofs_y = 0} /* id = 0 reserved */");

    for (size_t st_idx = 0; st_idx < cmap->count; st_idx++) {
        const cmap_subtable_t *st = &cmap->subtables[st_idx];

        if (st->format == CMAP_FORMAT0 || st->format == CMAP_FORMAT0_TINY) {
            /* FORMAT0: iterate all positions in range, dummy entries for gaps */
            for (uint32_t code = st->min_code; code <= st->max_code; code++) {
                int gi = find_glyph_index(font, code);
                if (gi >= 0) {
                    const glyph_t *g = &font->glyphs[gi];
                    fprintf(fp, ",\n    {.bitmap_index = %u, .adv_w = %d, .box_w = %d, .box_h = %d, .ofs_x = %d, .ofs_y = %d}",
                            (unsigned)compiled[gi].bitmap_offset,
                            g->adv_w, g->box_w, g->box_h, g->ofs_x, g->ofs_y);
                } else {
                    /* Dummy entry for gap */
                    fprintf(fp, ",\n    {.bitmap_index = %u, .adv_w = 0, .box_w = 0, .box_h = 0, .ofs_x = 0, .ofs_y = 0}",
                            (unsigned)total_bitmap_size);
                }
            }
        } else {
            /* SPARSE_TINY: only actual codepoints, no gaps */
            for (size_t k = 0; k < st->count; k++) {
                uint32_t code = st->codepoints[k];
                int gi = find_glyph_index(font, code);
                if (gi >= 0) {
                    const glyph_t *g = &font->glyphs[gi];
                    fprintf(fp, ",\n    {.bitmap_index = %u, .adv_w = %d, .box_w = %d, .box_h = %d, .ofs_x = %d, .ofs_y = %d}",
                            (unsigned)compiled[gi].bitmap_offset,
                            g->adv_w, g->box_w, g->box_h, g->ofs_x, g->ofs_y);
                } else {
                    /* Should not happen, but handle gracefully */
                    fprintf(fp, ",\n    {.bitmap_index = %u, .adv_w = 0, .box_w = 0, .box_h = 0, .ofs_x = 0, .ofs_y = 0}",
                            (unsigned)total_bitmap_size);
                }
            }
        }
    }

    fprintf(fp, "\n};\n\n");

    /* ---- Phase 5: write unicode_list arrays and font_unicode[] ---- */

    /* Write unicode_list_N arrays for sparse subtables */
    for (size_t st_idx = 0; st_idx < cmap->count; st_idx++) {
        const cmap_subtable_t *st = &cmap->subtables[st_idx];

        if (st->format == CMAP_SPARSE_TINY) {
            fprintf(fp, "static const uint16_t unicode_list_%u[] = {\n", (unsigned)st_idx);

            uint32_t base = st->min_code;
            for (size_t k = 0; k < st->count; k++) {
                uint16_t delta = (uint16_t)(st->codepoints[k] - base);
                if (k % 8 == 0) fprintf(fp, "    ");
                fprintf(fp, "0x%x", delta);
                if (k < st->count - 1) fprintf(fp, ",");
                if (k % 8 == 7 || k == st->count - 1) fprintf(fp, "\n");
                else fprintf(fp, " ");
            }
            fprintf(fp, "};\n\n");
        }
    }

    /* Write font_unicode[] */
    fprintf(fp, "static const sgl_font_unicode_t font_unicode[] = {\n");

    /* tab_offset is cumulative: 1 (reserved entry) + sum of previous subtable len values.
     * This must match the font_table[] layout where each subtable contributes
     * exactly 'len' entries (with dummy entries for FORMAT0 gaps). */
    int cumulative_offset = 1;

    for (size_t st_idx = 0; st_idx < cmap->count; st_idx++) {
        const cmap_subtable_t *st = &cmap->subtables[st_idx];

        /* Determine len field */
        size_t len;
        if (st->format == CMAP_FORMAT0 || st->format == CMAP_FORMAT0_TINY) {
            len = (size_t)(st->max_code - st->min_code + 1);
        } else {
            len = st->count;
        }

        /* Determine list pointer name */
        const char *list_name;
        char list_buf[32];
        if (st->format == CMAP_SPARSE_TINY) {
            snprintf(list_buf, sizeof(list_buf), "unicode_list_%u", (unsigned)st_idx);
            list_name = list_buf;
        } else {
            list_name = "NULL";
        }

        /* tab_offset = cumulative offset (1-based, entry 0 is reserved) */
        int tab_offset = cumulative_offset;

        fprintf(fp, "    { .offset = 0x%x, .len = %u, .list = %s, .tab_offset = %d, }",
                st->min_code, (unsigned)len, list_name, tab_offset);

        if (st_idx < cmap->count - 1) fprintf(fp, ",");
        fprintf(fp, "\n");

        cumulative_offset += (int)len;
    }

    fprintf(fp, "};\n\n");

    /* ---- Phase 6: write sgl_font_t ---- */
    fprintf(fp, "const sgl_font_t %s = {\n", ctx->font_name);
    fprintf(fp, "    .bitmap = font_bitmap,\n");
    fprintf(fp, "    .table = font_table,\n");
    fprintf(fp, "    .font_table_size = SGL_ARRAY_SIZE(font_table),\n");
    fprintf(fp, "    .font_height = %d,\n", font->font_height);
    fprintf(fp, "    .base_line = %d,\n", font->base_line);
    fprintf(fp, "    .bpp = %d,\n", ctx->bpp);
    fprintf(fp, "    .compress = %d,\n", should_compress(ctx->bpp, ctx->compress) ? 1 : 0);
    fprintf(fp, "    .unicode = font_unicode,\n");
    fprintf(fp, "    .unicode_num = SGL_ARRAY_SIZE(font_unicode),\n");
    fprintf(fp, "};\n");

    /* Cleanup */
    for (size_t i = 0; i < glyph_count; i++) {
        free(compiled[i].bitmap_data);
    }
    free(compiled);

    return 0;
}
