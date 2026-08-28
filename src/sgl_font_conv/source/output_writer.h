#ifndef OUTPUT_WRITER_H
#define OUTPUT_WRITER_H

#include "font_render.h"
#include "cmap_builder.h"
#include <stdio.h>

typedef struct {
    const font_data_t *font;
    const cmap_plan_t *cmap;
    int                bpp;
    int                compress;
    const char        *font_name;  /* variable name for sgl_font_t */
    int                smart_mono;  /* enable smart monospace (group by script) */
    int                spacing;     /* extra pixel spacing between characters */
    int                flash;       /* external flash font: bitmap goes to bin_path */
    int                flash_fixed; /* flash font with uniform (monospaced) glyphs */
    const char        *bin_path;   /* output path of the bitmap blob (.bin) */
} writer_ctx_t;

/* Write complete SGL font C source file to the given FILE handle. */
int write_sgl_font(FILE *fp, const writer_ctx_t *ctx);

#endif /* OUTPUT_WRITER_H */
