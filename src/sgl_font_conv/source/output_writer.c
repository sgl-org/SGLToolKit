#include "output_writer.h"
#include "bitstream.h"
#include "rle_compress.h"
#include "utf8.h"
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

/* ---------- UTF-8 encoder ---------- */

/* Encode a Unicode codepoint to UTF-8. Returns number of bytes written (1-4) */
static int utf8_encode(uint32_t code, char buf[5])
{
    if (code < 0x80) {
        buf[0] = (char)code;
        buf[1] = '\0';
        return 1;
    } else if (code < 0x800) {
        buf[0] = (char)(0xC0 | (code >> 6));
        buf[1] = (char)(0x80 | (code & 0x3F));
        buf[2] = '\0';
        return 2;
    } else if (code < 0x10000) {
        buf[0] = (char)(0xE0 | (code >> 12));
        buf[1] = (char)(0x80 | ((code >> 6) & 0x3F));
        buf[2] = (char)(0x80 | (code & 0x3F));
        buf[3] = '\0';
        return 3;
    } else {
        buf[0] = (char)(0xF0 | (code >> 18));
        buf[1] = (char)(0x80 | ((code >> 12) & 0x3F));
        buf[2] = (char)(0x80 | ((code >> 6) & 0x3F));
        buf[3] = (char)(0x80 | (code & 0x3F));
        buf[4] = '\0';
        return 4;
    }
}

/* Convert string to uppercase in-place */
static void str_to_upper(char *s)
{
    for (; *s; s++) {
        if (*s >= 'a' && *s <= 'z')
            *s -= 32;
    }
}

/* ---------- smart monospace ---------- */

/* Categorize a Unicode codepoint into a script group:
 *   0 → Latin & ASCII printable
 *   1 → CJK (Chinese, Japanese, Korean)
 *   2 → Cyrillic
 *   3 → Others (fallback) */
static int script_group(uint32_t code)
{
    /* Latin & ASCII printable */
    if ((code >= 0x0020 && code <= 0x007E) ||
        (code >= 0x00A0 && code <= 0x024F))
        return 0;

    /* CJK: Radicals, Symbols, Unified Ideographs, Compatibility */
    if ((code >= 0x2E80 && code <= 0x9FFF) ||
        (code >= 0xF900 && code <= 0xFAFF) ||
        (code >= 0xFF00 && code <= 0xFFEF))
        return 1;

    /* Cyrillic */
    if (code >= 0x0400 && code <= 0x04FF)
        return 2;

    /* Others */
    return 3;
}

/* Apply smart monospace: each script group gets its own max width as the
 * uniform advance width, and glyphs are centered within it. */
static void apply_smart_mono(font_data_t *font)
{
    size_t max_box_w[4] = {0, 0, 0, 0};

    /* First pass: find max box_w per group */
    for (size_t i = 0; i < font->glyph_count; i++) {
        int g = script_group(font->glyphs[i].code);
        int bw = font->glyphs[i].box_w;
        if (bw > (int)max_box_w[g])
            max_box_w[g] = (size_t)bw;
    }

    /* Second pass: set uniform adv_w and center ofs_x */
    for (size_t i = 0; i < font->glyph_count; i++) {
        int g = script_group(font->glyphs[i].code);
        int mw = (int)max_box_w[g];
        font->glyphs[i].adv_w = mw * 16;
        if (font->glyphs[i].box_w > 0)
            font->glyphs[i].ofs_x = (mw - font->glyphs[i].box_w) / 2;
        else
            font->glyphs[i].ofs_x = 0;
    }
}

/* ---------- writer ---------- */

/* Per-glyph compiled data */
typedef struct {
    uint8_t *bitmap_data;
    size_t   bitmap_len;
    size_t   bitmap_offset;  /* offset into combined bitmap array */
} compiled_glyph_t;

/* ---------- monospaced (fixed width) blocks ---------- */

/* A unicode block whose characters all share one descriptor, so that the font
 * table does not need one entry per character (sgl_font_unicode_t.fixed).
 * Square scripts (CJK / Japanese / Korean) and icon fonts are the typical case:
 * their glyphs have the same advance and nearly the same box. */
typedef struct {
    int      used;          /* 1 when the block shares one descriptor */
    int      padded;        /* 1 when glyph bitmaps had to be padded */
    int     *gi;            /* glyph index of every position, in runtime order */
    size_t   count;         /* number of characters of the block */
    int      box_w, box_h;  /* shared cell */
    int      adv_w;
    int      ofs_x, ofs_y;
    size_t   stride;        /* bytes of one slot in the bitmap blob */
    size_t   base_offset;   /* bitmap offset of the first slot */
    size_t   orig_bytes;    /* bytes of the same glyphs before the padding */
    char     reason[96];    /* why the block keeps per-character entries */
} block_fixed_t;

/* A monospaced block is addressed by its position in font_unicode[], and the
 * runtime keeps that number in the 7 bits above the index inside the block. */
#define SGL_FONT_FIXED_MAX_BLOCKS 128

/* Collect the glyph index of every position of a subtable, ordered the way the
 * runtime numbers them (code - offset for the dense formats, position in the
 * sparse list otherwise).
 * Returns NULL when a position has no glyph: the linear addressing of a
 * monospaced block cannot express the holes of a range with gaps. */
static int *block_positions(const font_data_t *font, const cmap_subtable_t *st,
                            size_t *out_count)
{
    size_t count, i;
    int *gi;

    if (st->format == CMAP_SPARSE_TINY) {
        count = st->count;
    } else {
        count = (size_t)(st->max_code - st->min_code + 1);
    }

    gi = (int *)malloc(count * sizeof(int));
    if (!gi) return NULL;

    for (i = 0; i < count; i++) {
        uint32_t code = (st->format == CMAP_SPARSE_TINY)
                            ? st->codepoints[i]
                            : (st->min_code + (uint32_t)i);
        gi[i] = find_glyph_index(font, code);
        if (gi[i] < 0) {
            free(gi);
            *out_count = 0;
            return NULL;
        }
    }

    *out_count = count;
    return gi;
}

/* Grow one glyph bitmap into the shared cell: dx columns are inserted on the
 * left and dy rows on top of the drawn box, so the ink keeps its absolute
 * position. Note that ofs_y grows upwards (it is the bearing minus the height),
 * hence dy is measured from the top of the block, not from its ofs_y. */
static int glyph_pad(glyph_t *g, int cell_w, int cell_h, int dx, int dy,
                     int cell_ofs_x, int cell_ofs_y, int *padded)
{
    uint8_t *dst;
    int r;

    if (g->box_w == cell_w && g->box_h == cell_h && dx == 0 && dy == 0 &&
        g->ofs_x == cell_ofs_x && g->ofs_y == cell_ofs_y)
        return 0;

    dst = (uint8_t *)calloc((size_t)cell_w * (size_t)cell_h, 1);
    if (!dst) return -1;

    if (g->pixels != NULL) {
        for (r = 0; r < g->box_h; r++) {
            memcpy(dst + (size_t)(dy + r) * cell_w + dx,
                   g->pixels + (size_t)r * g->box_w,
                   (size_t)g->box_w);
        }
    }
    free(g->pixels);

    g->pixels = dst;
    g->box_w = cell_w;
    g->box_h = cell_h;
    g->ofs_x = cell_ofs_x;
    g->ofs_y = cell_ofs_y;
    *padded = 1;
    return 0;
}

/* Decide whether one subtable can share a single descriptor and, when the
 * glyphs only differ in their box, pad them into one common cell so that they
 * really do share it. The advance width is never touched: characters with
 * different advances are proportional by nature and stay per-character. */
static void block_try_fix(font_data_t *font, const cmap_subtable_t *st,
                          int block_no, int bpp, block_fixed_t *bf)
{
    size_t i;
    int cell_w, cell_h, min_ofs_x, max_right, min_ofs_y, max_top;

    memset(bf, 0, sizeof(*bf));

    if (block_no >= SGL_FONT_FIXED_MAX_BLOCKS) {
        snprintf(bf->reason, sizeof(bf->reason),
                 "more than %d unicode blocks", SGL_FONT_FIXED_MAX_BLOCKS);
        return;
    }

    bf->gi = block_positions(font, st, &bf->count);
    if (!bf->gi) {
        snprintf(bf->reason, sizeof(bf->reason),
                 "range has gaps (not rendered codepoints)");
        return;
    }
    if (bf->count < 2) {
        snprintf(bf->reason, sizeof(bf->reason), "block has a single glyph");
        free(bf->gi);
        bf->gi = NULL;
        return;
    }

    /* bounding box of the ink of the whole block, empty glyphs aside */
    bf->adv_w = font->glyphs[bf->gi[0]].adv_w;
    min_ofs_x = 0;
    max_right = 0;
    min_ofs_y = 0;
    max_top = 0;

    for (i = 0; i < bf->count; i++) {
        const glyph_t *g = &font->glyphs[bf->gi[i]];
        if (g->adv_w != bf->adv_w) {
            snprintf(bf->reason, sizeof(bf->reason),
                     "advance widths differ (try --smart-mono)");
            free(bf->gi);
            bf->gi = NULL;
            return;
        }
        if (g->box_w <= 0 || g->box_h <= 0) continue;
        if (i == 0 || g->ofs_x < min_ofs_x) min_ofs_x = g->ofs_x;
        if (i == 0 || g->ofs_x + g->box_w > max_right) max_right = g->ofs_x + g->box_w;
        if (i == 0 || g->ofs_y < min_ofs_y) min_ofs_y = g->ofs_y;
        if (i == 0 || g->ofs_y + g->box_h > max_top) max_top = g->ofs_y + g->box_h;
    }

    cell_w = max_right - min_ofs_x;
    cell_h = max_top - min_ofs_y;
    if (cell_w <= 0 || cell_h <= 0) {
        snprintf(bf->reason, sizeof(bf->reason), "block has no ink");
        free(bf->gi);
        bf->gi = NULL;
        return;
    }

    /* grow the glyphs that are smaller than the cell, or that do not start at
     * the same place: the bitmap changes, the drawn result does not */
    for (i = 0; i < bf->count; i++) {
        glyph_t *g = &font->glyphs[bf->gi[i]];
        int empty = (g->box_w <= 0 || g->box_h <= 0);
        int dx = empty ? 0 : g->ofs_x - min_ofs_x;
        int dy = empty ? 0 : max_top - (g->ofs_y + g->box_h);

        bf->orig_bytes += ((size_t)g->box_w * (size_t)g->box_h * (size_t)bpp + 7) / 8;
        if (glyph_pad(g, cell_w, cell_h, dx, dy, min_ofs_x, min_ofs_y,
                      &bf->padded) != 0) {
            snprintf(bf->reason, sizeof(bf->reason), "out of memory");
            free(bf->gi);
            bf->gi = NULL;
            return;
        }
    }

    bf->box_w = cell_w;
    bf->box_h = cell_h;
    bf->ofs_x = min_ofs_x;
    bf->ofs_y = min_ofs_y;
    bf->used = 1;
}

static void block_fixed_free(block_fixed_t *blocks, size_t count)
{
    size_t i;

    if (!blocks) return;
    for (i = 0; i < count; i++) {
        free(blocks[i].gi);
        blocks[i].gi = NULL;
    }
    free(blocks);
}

int write_sgl_font(FILE *fp, const writer_ctx_t *ctx)
{
    const font_data_t *font = ctx->font;
    const cmap_plan_t *cmap = ctx->cmap;
    size_t glyph_count = font->glyph_count;
    size_t st_idx;
    int flash = ctx->flash;
    int use_fixed = 0;
    compiled_glyph_t *compiled = NULL;
    block_fixed_t *blocks = NULL;

    /* ---- Phase 1: metrics only passes ---- */

    /* smart monospace */
    if (ctx->smart_mono) {
        apply_smart_mono((font_data_t *)font);  /* cast away const, safe here */
    }

    /* character spacing */
    if (ctx->spacing > 0) {
        for (size_t i = 0; i < glyph_count; i++) {
            ((font_data_t *)font)->glyphs[i].adv_w += ctx->spacing * 16;
        }
    }

    /* monospaced blocks: may pad glyph bitmaps into one shared cell, so this
     * has to happen before the bitmaps get compiled */
    blocks = (block_fixed_t *)calloc(cmap->count, sizeof(block_fixed_t));
    if (!blocks) return -1;

    /* The shared descriptor is only worth having for an external flash font:
     * it removes font table entries from the scarce internal flash and the
     * price is padding inside the bitmap blob, which lives in cheap external
     * flash. A RAM font would pay the padding in internal flash as well and
     * keep the table it did not save, so --fixed is ignored there. */
    if (ctx->fixed && !ctx->flash) {
        fprintf(stderr,
                "Note: --fixed ignored without --flash, a RAM font pays the padding and\n"
                "      keeps the table, so one font table entry per character is emitted\n");
    } else if (ctx->fixed && should_compress(ctx->bpp, ctx->compress)) {
        fprintf(stderr,
                "Note: --fixed ignored, RLE compressed bitmaps have no uniform stride\n");
    } else if (ctx->fixed) {
        use_fixed = 1;
        for (st_idx = 0; st_idx < cmap->count; st_idx++) {
            block_try_fix((font_data_t *)font, &cmap->subtables[st_idx],
                          (int)st_idx, ctx->bpp, &blocks[st_idx]);
        }
    }

    /* ---- Phase 2: compile all glyph bitmaps ---- */
    compiled = (compiled_glyph_t *)calloc(glyph_count, sizeof(compiled_glyph_t));
    if (!compiled) {
        block_fixed_free(blocks, cmap->count);
        return -1;
    }

    size_t total_bitmap_size = 0;
    for (size_t i = 0; i < glyph_count; i++) {
        compiled[i].bitmap_data = render_glyph_bitmap(
            &font->glyphs[i], ctx->bpp, ctx->compress, &compiled[i].bitmap_len);
        compiled[i].bitmap_offset = total_bitmap_size;
        total_bitmap_size += compiled[i].bitmap_len;
    }

    /* ---- Phase 2.5: confirm a block can really be addressed linearly ---- */
    for (st_idx = 0; st_idx < cmap->count; st_idx++) {
        block_fixed_t *bf = &blocks[st_idx];
        size_t k;

        if (!bf->used) continue;

        bf->stride = ((size_t)bf->box_w * (size_t)bf->box_h * (size_t)ctx->bpp + 7) / 8;
        bf->base_offset = compiled[bf->gi[0]].bitmap_offset;

        for (k = 0; k < bf->count; k++) {
            const compiled_glyph_t *cg = &compiled[bf->gi[k]];
            if (cg->bitmap_len != bf->stride ||
                cg->bitmap_offset != bf->base_offset + k * bf->stride) {
                snprintf(bf->reason, sizeof(bf->reason),
                         "bitmaps are not stored back to back");
                bf->used = 0;
                break;
            }
        }
    }

    if (use_fixed) {
        for (st_idx = 0; st_idx < cmap->count; st_idx++) {
            const block_fixed_t *bf = &blocks[st_idx];
            long delta;

            if (bf->used) {
                /* what the shared cell costs in the blob, against the font
                 * table entries it removes */
                delta = (long)(bf->count * bf->stride) - (long)bf->orig_bytes;
                printf("  [%u] fixed block: %u glyph(s), cell %dx%d, stride %u B, "
                       "%u table entr%s replaced by 1 descriptor, "
                       "bitmap %+ld B%s\n",
                       (unsigned)st_idx, (unsigned)bf->count, bf->box_w, bf->box_h,
                       (unsigned)bf->stride, (unsigned)bf->count,
                       bf->count == 1 ? "y" : "ies", delta,
                       bf->padded ? " (bitmaps padded to the cell)" : "");
            } else {
                printf("  [%u] per-glyph table: %s\n", (unsigned)st_idx,
                       bf->reason[0] ? bf->reason : "--fixed not applicable");
            }
        }
    }

    /* ---- Phase 3: external flash fonts write the bitmap blob to a .bin file ---- */
    if (flash) {
        if (!ctx->bin_path) {
            fprintf(stderr, "Error: flash font requires a bin output path\n");
            goto fail;
        }

        FILE *fb = utf8_fopen(ctx->bin_path, "wb");
        if (!fb) {
            fprintf(stderr, "Error: cannot open bin file '%s'\n", ctx->bin_path);
            goto fail;
        }
        for (size_t i = 0; i < glyph_count; i++) {
            size_t len = compiled[i].bitmap_len;
            if (fwrite(compiled[i].bitmap_data, 1, len, fb) != len) {
                fprintf(stderr, "Error: failed to write bin file '%s'\n", ctx->bin_path);
                fclose(fb);
                goto fail;
            }
        }
        fclose(fb);
        printf("  Bitmap blob written to %s (%u glyph(s), packed)\n",
               ctx->bin_path, (unsigned)glyph_count);
    }

    /* ---- Phase 4: write C file header ---- */
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
    fprintf(fp, "/*\n");
    {
        int col = 0;
        for (size_t i = 0; i < glyph_count; i++) {
            uint32_t code = font->glyphs[i].code;
            /* Skip non-displayable control characters */
            if (code < 0x20 || (code >= 0x7F && code <= 0x9F)) continue;
            char utf8_buf[5];
            utf8_encode(code, utf8_buf);
            fprintf(fp, "%s", utf8_buf);
            col++;
            if (col % 32 == 0) fprintf(fp, "\n");
        }
        if (col % 32 != 0) fprintf(fp, "\n");
    }
    fprintf(fp, "*/\n\n");

    /* Build macro name: CONFIG_SGL_FONT_<UPPER_FONT_NAME> */
    char macro_name[256];
    snprintf(macro_name, sizeof(macro_name), "CONFIG_SGL_FONT_%s", ctx->font_name);
    str_to_upper(macro_name);

    fprintf(fp, "#ifndef %s\n", macro_name);
    fprintf(fp, "#define %s 1\n", macro_name);
    fprintf(fp, "#endif\n\n");
    fprintf(fp, "#if %s\n\n", macro_name);

    /* ---- Phase 4.5: spell out the requirements the target build has to meet,
     * so that a misconfigured project fails to compile rather than render
     * garbage. ---- */
    {
        size_t bs;
        int fixed_used = 0;

        for (bs = 0; bs < cmap->count; bs++) {
            if (blocks[bs].used) {
                fixed_used = 1;
                break;
            }
        }

        /* Monospaced blocks are only decoded when the library is built with
         * external flash font support, because that is the only layout where
         * trading table for bitmap pays off. Without it the lookup branches of
         * sgl_core.c are compiled out, so such a font could only be misread. */
        if (fixed_used) {
            fprintf(fp, "#if (!CONFIG_SGL_FLASH_FONT)\n");
            fprintf(fp, "#error \"%s uses monospaced blocks (--fixed), which "
                        "requires CONFIG_SGL_FLASH_FONT 1\"\n", ctx->font_name);
            fprintf(fp, "#endif\n\n");
        }

        /* The bitmap blob of a big font does not fit into the 16 bit
         * bitmap_index of the small font table anymore. The compiler only
         * truncates the initializers, and a wrapped offset silently draws another
         * character, so make the requirement visible at build time instead. */
        if (total_bitmap_size > 65535) {
            fprintf(fp, "/* The bitmap blob is %u bytes, more than the 64 KB a 16 bit\n"
                        " * bitmap_index can address: this project must be built with\n"
                        " * CONFIG_SGL_FONT_SMALL_TABLE set to 0. */\n"
                        "typedef char %s_bitmap_index_needs_32_bit_table[\n"
                        "        sizeof(((sgl_font_table_t *)0)->bitmap_index) >= 4 ? 1 : -1];\n\n",
                    (unsigned)total_bitmap_size, ctx->font_name);
            fprintf(stderr,
                    "Warning: bitmap blob is %u bytes (> 64 KB), build the target "
                    "with CONFIG_SGL_FONT_SMALL_TABLE 0\n",
                    (unsigned)total_bitmap_size);
        }
    }

    /* ---- Phase 5: write font_bitmap[] (skipped for external flash fonts,
     * the bitmap blob lives in the .bin file instead) ---- */
    if (!flash) {
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
    }

    /* ---- Phase 6: write font_table[] ---- */
    {
    /* font_table entries must follow cmap subtable order, with dummy entries
     * for gaps in FORMAT0 subtables. This ensures tab_offset + (code - offset)
     * correctly indexes into font_table at runtime. Monospaced blocks contribute
     * no entry at all, they are described by one shared descriptor. */
    fprintf(fp, "\nstatic const sgl_font_table_t font_table[] = {\n");
    fprintf(fp, "    {.bitmap_index = 0, .adv_w = 0, .box_w = 0, .box_h = 0, .ofs_x = 0, .ofs_y = 0} /* id = 0 reserved */");

    for (st_idx = 0; st_idx < cmap->count; st_idx++) {
        const cmap_subtable_t *st = &cmap->subtables[st_idx];
        const block_fixed_t *bf = &blocks[st_idx];
        size_t k;

        if (bf->used) {
            /* No entry is emitted for this block, so it must not touch the
             * comma either: a comment is not an initializer element, and two
             * adjacent monospaced blocks would leave a stray comma behind. */
            fprintf(fp, "\n    /* U+%04X..U+%04X: monospaced block, shared descriptor */",
                    st->min_code, st->max_code);
            continue;
        }

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
            for (k = 0; k < st->count; k++) {
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
    } /* end font_table */

    /* ---- Phase 7: write unicode_list arrays, shared descriptors and font_unicode[] ---- */

    {
    /* Write unicode_list_N arrays for sparse subtables */
    for (st_idx = 0; st_idx < cmap->count; st_idx++) {
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

    /* One shared descriptor per monospaced block, referenced by font_unicode[]
     * below. bitmap_index is the offset of the first glyph of the block; the
     * runtime adds index_in_block x (box_w * box_h * bpp / 8) to it. */
    for (st_idx = 0; st_idx < cmap->count; st_idx++) {
        const block_fixed_t *bf = &blocks[st_idx];

        if (!bf->used) continue;
        fprintf(fp, "static const sgl_font_table_t %s_fixed_%u = {\n",
                ctx->font_name, (unsigned)st_idx);
        fprintf(fp, "    .bitmap_index = %u, .adv_w = %d,\n",
                (unsigned)bf->base_offset, bf->adv_w);
        fprintf(fp, "    .box_w = %d, .box_h = %d, .ofs_x = %d, .ofs_y = %d\n",
                bf->box_w, bf->box_h, bf->ofs_x, bf->ofs_y);
        fprintf(fp, "};\n\n");
    }

    /* Write font_unicode[] */
    fprintf(fp, "static const sgl_font_unicode_t font_unicode[] = {\n");

    /* tab_offset is cumulative: 1 (reserved entry) + sum of the font_table
     * entries emitted so far. Monospaced blocks emit none, so they do not move
     * it. This must match the font_table[] layout. */
    int cumulative_offset = 1;

    for (st_idx = 0; st_idx < cmap->count; st_idx++) {
        const cmap_subtable_t *st = &cmap->subtables[st_idx];
        const block_fixed_t *bf = &blocks[st_idx];
        size_t emitted = 0;

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

        /* tab_offset = cumulative offset (1-based, entry 0 is reserved), unused
         * for a monospaced block, which points at its shared descriptor */
        int tab_offset = bf->used ? 0 : cumulative_offset;
        char fixed_buf[64];
        if (bf->used) {
            snprintf(fixed_buf, sizeof(fixed_buf), "&%s_fixed_%u",
                     ctx->font_name, (unsigned)st_idx);
        } else {
            snprintf(fixed_buf, sizeof(fixed_buf), "NULL");
        }

        fprintf(fp, "    { .offset = 0x%x, .len = %u, .list = %s, .tab_offset = %d, .fixed = %s, }",
                st->min_code, (unsigned)len, list_name, tab_offset, fixed_buf);

        if (st_idx < cmap->count - 1) fprintf(fp, ",");
        fprintf(fp, "\n");

        if (!bf->used) {
            emitted = len;
            cumulative_offset += (int)emitted;
        }
    }

    fprintf(fp, "};\n\n");
    } /* end font_unicode */

    /* ---- Phase 8: write sgl_font_t ---- */
    if (flash) {
        fprintf(fp, "extern int32_t %s_flash_read(uint32_t addr, void *buf, uint32_t len);\n\n",
                ctx->font_name);
    }

    const char *fmt_str;
    if (flash) {
        fmt_str = "SGL_FONT_FMT_EXT_FLASH";
    } else {
        fmt_str = should_compress(ctx->bpp, ctx->compress)
                      ? "SGL_FONT_FMT_COMPRESSED" : "SGL_FONT_FMT_NORMAL";
    }

    fprintf(fp, "const sgl_font_t %s = {\n", ctx->font_name);
    fprintf(fp, "    .bitmap = %s,\n", flash ? "NULL" : "font_bitmap");
    fprintf(fp, "    .table = font_table,\n");
    fprintf(fp, "    .font_table_size = SGL_ARRAY_SIZE(font_table),\n");
    fprintf(fp, "    .font_height = %d,\n", font->font_height);
    fprintf(fp, "    .unicode = font_unicode,\n");
    fprintf(fp, "    .unicode_num = SGL_ARRAY_SIZE(font_unicode),\n");
    fprintf(fp, "    .base_line = %d,\n", font->base_line);
    fprintf(fp, "    .bpp = %d,\n", ctx->bpp);
    fprintf(fp, "    .format = %s,\n", fmt_str);
    if (flash) {
        fprintf(fp, "#if (CONFIG_SGL_FLASH_FONT)\n");
        fprintf(fp, "    .flash_read = %s_flash_read,\n", ctx->font_name);
        fprintf(fp, "    .flash_addr = 0, /* offset of the %s blob in external flash */\n",
                ctx->font_name);
        fprintf(fp, "#endif\n");
    }
    fprintf(fp, "};\n");

    /* Build macro name again for the closing #endif (macro_name is still in scope) */
    fprintf(fp, "\n#endif /* %s */\n", macro_name);

    /* Cleanup */
    for (size_t i = 0; i < glyph_count; i++) {
        free(compiled[i].bitmap_data);
    }
    free(compiled);
    block_fixed_free(blocks, cmap->count);
    return 0;

fail:
    for (size_t i = 0; i < glyph_count; i++) {
        free(compiled[i].bitmap_data);
    }
    free(compiled);
    block_fixed_free(blocks, cmap->count);
    return -1;
}
