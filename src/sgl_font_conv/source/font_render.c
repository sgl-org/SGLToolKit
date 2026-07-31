#include "font_render.h"
#include <ft2build.h>
#include FT_FREETYPE_H
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

static int cmp_glyph_code(const void *a, const void *b)
{
    uint32_t va = ((const glyph_t *)a)->code;
    uint32_t vb = ((const glyph_t *)b)->code;
    if (va < vb) return -1;
    if (va > vb) return 1;
    return 0;
}

int font_render_init(const char *font_path, int pixel_size,
                     const uint32_t *codes, size_t count,
                     font_data_t *out)
{
    FT_Library library;
    FT_Face face;
    FT_Error error;

    memset(out, 0, sizeof(*out));

    error = FT_Init_FreeType(&library);
    if (error) {
        fprintf(stderr, "Error: FT_Init_FreeType failed (%d)\n", error);
        return -1;
    }

    error = FT_New_Face(library, font_path, 0, &face);
    if (error) {
        fprintf(stderr, "Error: cannot load font '%s' (%d)\n", font_path, error);
        FT_Done_FreeType(library);
        return -1;
    }

    error = FT_Set_Pixel_Sizes(face, 0, (FT_UInt)pixel_size);
    if (error) {
        fprintf(stderr, "Error: FT_Set_Pixel_Sizes failed (%d)\n", error);
        FT_Done_Face(face);
        FT_Done_FreeType(library);
        return -1;
    }

    out->glyphs = (glyph_t *)calloc(count, sizeof(glyph_t));
    if (!out->glyphs) {
        FT_Done_Face(face);
        FT_Done_FreeType(library);
        return -1;
    }

    int ascent = -9999;
    int descent = 9999;
    size_t valid_count = 0;

    for (size_t i = 0; i < count; i++) {
        uint32_t code = codes[i];
        FT_UInt glyph_index = FT_Get_Char_Index(face, code);

        if (glyph_index == 0) {
            fprintf(stderr, "Warning: glyph not found for U+%04X, skipping\n", code);
            continue;
        }

        /* Use LIGHT autohint + FORCE_AUTOHINT to match JS version */
        FT_Int32 load_flags = FT_LOAD_RENDER | FT_LOAD_TARGET_LIGHT | FT_LOAD_FORCE_AUTOHINT;

        error = FT_Load_Glyph(face, glyph_index, load_flags);
        if (error) {
            fprintf(stderr, "Warning: FT_Load_Glyph failed for U+%04X (%d)\n", code, error);
            continue;
        }

        FT_GlyphSlot slot = face->glyph;
        FT_Bitmap *bmp = &slot->bitmap;

        glyph_t *g = &out->glyphs[valid_count];
        g->code = code;

        /* advanceWidth: linearHoriAdvance is FP16.16, convert to float then *16 and round */
        double advance = (double)slot->linearHoriAdvance / 65536.0;
        g->adv_w = (int)(advance * 16.0 + 0.5);

        g->box_w = (int)bmp->width;
        g->box_h = (int)bmp->rows;
        g->ofs_x = slot->bitmap_left;
        g->ofs_y = slot->bitmap_top - (int)bmp->rows;  /* match JS: y = bitmap_top - height */

        /* Copy pixels (8-bit grayscale) */
        size_t pixel_count = (size_t)g->box_w * (size_t)g->box_h;
        if (pixel_count > 0) {
            g->pixels = (uint8_t *)malloc(pixel_count);
            if (!g->pixels) {
                font_render_free(out);
                FT_Done_Face(face);
                FT_Done_FreeType(library);
                return -1;
            }

            for (int row = 0; row < g->box_h; row++) {
                for (int col = 0; col < g->box_w; col++) {
                    uint8_t val;
                    if (bmp->pixel_mode == FT_PIXEL_MODE_MONO) {
                        int byte_idx = col / 8;
                        int bit_idx = 7 - (col % 8);
                        val = (bmp->buffer[row * bmp->pitch + byte_idx] & (1 << bit_idx)) ? 255 : 0;
                    } else {
                        val = bmp->buffer[row * bmp->pitch + col];
                    }
                    g->pixels[row * g->box_w + col] = val;
                }
            }
        } else {
            g->pixels = NULL;
        }

        /* Track ascent / descent */
        int glyph_top = g->ofs_y + g->box_h;
        int glyph_bottom = g->ofs_y;
        if (glyph_top > ascent) ascent = glyph_top;
        if (glyph_bottom < descent) descent = glyph_bottom;

        valid_count++;
    }

    out->glyph_count = valid_count;
    out->ascent = ascent;
    out->descent = descent;
    out->font_height = ascent - descent;
    out->base_line = -descent;

    FT_Done_Face(face);
    FT_Done_FreeType(library);
    return 0;
}

int font_data_merge(const font_data_t *a, const font_data_t *b, font_data_t *out)
{
    if (!a || !b || !out) return -1;
    if (a->glyph_count == 0 && b->glyph_count == 0) {
        memset(out, 0, sizeof(*out));
        return 0;
    }

    /* Allocate combined glyph array (upper bound: a + b) */
    size_t max_count = a->glyph_count + b->glyph_count;
    out->glyphs = (glyph_t *)calloc(max_count, sizeof(glyph_t));
    if (!out->glyphs) return -1;

    size_t out_count = 0;

    /* Copy all glyphs from a */
    for (size_t i = 0; i < a->glyph_count; i++) {
        const glyph_t *src = &a->glyphs[i];
        glyph_t *dst = &out->glyphs[out_count++];
        dst->code = src->code;
        dst->adv_w = src->adv_w;
        dst->box_w = src->box_w;
        dst->box_h = src->box_h;
        dst->ofs_x = src->ofs_x;
        dst->ofs_y = src->ofs_y;
        if (src->pixels && src->box_w > 0 && src->box_h > 0) {
            size_t pixel_count = (size_t)src->box_w * (size_t)src->box_h;
            dst->pixels = (uint8_t *)malloc(pixel_count);
            if (!dst->pixels) {
                font_render_free(out);
                return -1;
            }
            memcpy(dst->pixels, src->pixels, pixel_count);
        } else {
            dst->pixels = NULL;
        }
    }

    /* Copy glyphs from b, skipping duplicates */
    for (size_t i = 0; i < b->glyph_count; i++) {
        const glyph_t *src = &b->glyphs[i];
        /* Check if code already exists in output */
        int found = 0;
        for (size_t j = 0; j < out_count; j++) {
            if (out->glyphs[j].code == src->code) {
                found = 1;
                break;
            }
        }
        if (found) continue;

        glyph_t *dst = &out->glyphs[out_count++];
        dst->code = src->code;
        dst->adv_w = src->adv_w;
        dst->box_w = src->box_w;
        dst->box_h = src->box_h;
        dst->ofs_x = src->ofs_x;
        dst->ofs_y = src->ofs_y;
        if (src->pixels && src->box_w > 0 && src->box_h > 0) {
            size_t pixel_count = (size_t)src->box_w * (size_t)src->box_h;
            dst->pixels = (uint8_t *)malloc(pixel_count);
            if (!dst->pixels) {
                font_render_free(out);
                return -1;
            }
            memcpy(dst->pixels, src->pixels, pixel_count);
        } else {
            dst->pixels = NULL;
        }
    }

    out->glyph_count = out_count;

    /* Sort glyphs by codepoint */
    qsort(out->glyphs, out_count, sizeof(glyph_t), cmp_glyph_code);

    /* Compute union ascent/descent */
    int ascent = (a->glyph_count > 0) ? a->ascent : -9999;
    int descent = (a->glyph_count > 0) ? a->descent : 9999;
    if (b->glyph_count > 0) {
        if (b->ascent > ascent) ascent = b->ascent;
        if (b->descent < descent) descent = b->descent;
    }
    out->ascent = ascent;
    out->descent = descent;
    out->font_height = ascent - descent;
    out->base_line = -descent;

    return 0;
}

void font_render_free(font_data_t *data)
{
    if (data->glyphs) {
        for (size_t i = 0; i < data->glyph_count; i++) {
            free(data->glyphs[i].pixels);
        }
        free(data->glyphs);
        data->glyphs = NULL;
    }
    data->glyph_count = 0;
}
