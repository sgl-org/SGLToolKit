#ifndef FONT_RENDER_H
#define FONT_RENDER_H

#include <stdint.h>
#include <stddef.h>

typedef struct {
    uint32_t code;        /* unicode codepoint */
    int      adv_w;       /* advance width * 16 */
    int      box_w;       /* bitmap width in pixels */
    int      box_h;       /* bitmap height in pixels */
    int      ofs_x;       /* x offset (bearing X) */
    int      ofs_y;       /* y offset (bearing Y - height) */
    uint8_t *pixels;      /* row-major pixel data, 8-bit grayscale */
} glyph_t;

typedef struct {
    glyph_t *glyphs;
    size_t   glyph_count;
    int      ascent;      /* max(ofs_y + box_h) */
    int      descent;     /* min(ofs_y) */
    int      font_height; /* ascent - descent */
    int      base_line;   /* -descent */
} font_data_t;

/* Initialize FreeType, load font, render all codepoints.
 * codes must be sorted ascending, count > 0.
 * Returns 0 on success, -1 on error. */
int font_render_init(const char *font_path, int pixel_size,
                     const uint32_t *codes, size_t count,
                     font_data_t *out);

/* Free all resources allocated by font_render_init. */
void font_render_free(font_data_t *data);

/* Merge two font_data_t into one. Glyph arrays are combined, ascent/descent
 * are the union (max ascent, min descent). Duplicate codepoints (by unicode
 * value) from 'b' are skipped if already present in 'a'.
 * After merge, 'a' and 'b' are zeroed and must not be freed individually;
 * call font_render_free() on 'out' when done.
 * Returns 0 on success, -1 on error. */
int font_data_merge(const font_data_t *a, const font_data_t *b, font_data_t *out);

#endif /* FONT_RENDER_H */
