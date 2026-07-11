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
 * Returns plan that caller must free with cmap_plan_free(). */
cmap_plan_t cmap_build(const uint32_t *codes, size_t count);

/* Free cmap plan resources. */
void cmap_plan_free(cmap_plan_t *plan);

#endif
