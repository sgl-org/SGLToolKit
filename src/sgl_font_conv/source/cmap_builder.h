#ifndef CMAP_BUILDER_H
#define CMAP_BUILDER_H

#include <stdint.h>
#include <stddef.h>

typedef enum {
    CMAP_FORMAT0_TINY,   /* consecutive codepoints, no gaps */
    CMAP_FORMAT0,        /* range < 256, may have gaps */
    CMAP_SPARSE_TINY     /* sparse, range < 65536, store code deltas */
} cmap_format_t;

typedef struct {
    cmap_format_t format;
    uint32_t     *codepoints;   /* sorted codepoint array (owned) */
    size_t        count;        /* number of codepoints */
    uint32_t      min_code;
    uint32_t      max_code;
} cmap_subtable_t;

typedef struct {
    cmap_subtable_t *subtables;
    size_t           count;
} cmap_plan_t;

/* Build optimal cmap subtable plan from sorted codepoints.
 * Adjacent dense subtables (format0_tiny, i.e. list == NULL) whose codepoints
 * are consecutive are always merged into one subtable: the 256-codepoint limit
 * on format0_tiny comes from lv_font_conv, while SGL stores
 * sgl_font_unicode_t.len in a uint32_t, so a single dense block may be much
 * larger. The merge is capped at 65535 codepoints to keep font_table_size
 * (uint16_t) and the fixed-block local index well within range.
 * Returns plan that caller must free with cmap_plan_free(). */
cmap_plan_t cmap_build(const uint32_t *codes, size_t count);

/* Free cmap plan resources. */
void cmap_plan_free(cmap_plan_t *plan);

#endif
