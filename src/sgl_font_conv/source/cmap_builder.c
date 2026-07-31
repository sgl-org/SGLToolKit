#include "cmap_builder.h"
#include <stdlib.h>
#include <string.h>
#include <limits.h>

/*
 * DP-based optimal cmap subtable splitting, matching the JS version
 * in cmap_build_subtables.js with post-merge fix.
 */

#define SUBTABLE_ENTRY_OVERHEAD 16

typedef struct {
    long long dist;
    size_t    start;
    size_t    end;
    cmap_format_t format;
} dp_node_t;

static long long est_format0_tiny(void)
{
    return 16;
}

static long long est_format0(uint32_t start_code, uint32_t end_code)
{
    return 16 + (long long)(end_code - start_code + 1);
}

static long long est_sparse_tiny(size_t count)
{
    return 16 + (long long)count * 2;
}

/* Estimate cost of a subtable for post-merge comparison */
static long long subtable_cost(const cmap_subtable_t *st)
{
    switch (st->format) {
    case CMAP_FORMAT0_TINY:
        return est_format0_tiny();
    case CMAP_FORMAT0:
        return est_format0(st->min_code, st->max_code);
    case CMAP_SPARSE_TINY:
        return est_sparse_tiny(st->count);
    }
    return 0;
}

cmap_plan_t cmap_build(const uint32_t *codes, size_t count)
{
    cmap_plan_t plan = {NULL, 0};
    if (count == 0) return plan;

    /* DP shortest path */
    dp_node_t *dp = (dp_node_t *)calloc(count, sizeof(dp_node_t));
    if (!dp) return plan;

    for (size_t i = 0; i < count; i++) {
        dp[i].dist = LLONG_MAX;

        for (size_t j = 0; j <= i; j++) {
            long long prev_dist = (j > 0) ? dp[j - 1].dist : 0;
            long long s;

            /* format0: range < 256 */
            if (codes[i] - codes[j] < 256) {
                s = est_format0(codes[j], codes[i]);
                if (prev_dist + s < dp[i].dist) {
                    dp[i].dist = prev_dist + s;
                    dp[i].start = j;
                    dp[i].end = i;
                    dp[i].format = CMAP_FORMAT0;
                }
            }

            /* format0_tiny: range < 256 AND consecutive (no gaps) */
            if (codes[i] - codes[j] < 256 &&
                codes[i] - i == codes[j] - j) {
                s = est_format0_tiny();
                if (prev_dist + s < dp[i].dist) {
                    dp[i].dist = prev_dist + s;
                    dp[i].start = j;
                    dp[i].end = i;
                    dp[i].format = CMAP_FORMAT0_TINY;
                }
            }

            /* sparse_tiny: range < 65536 */
            if (codes[i] - codes[j] < 65536) {
                s = est_sparse_tiny(i - j + 1);
                if (prev_dist + s < dp[i].dist) {
                    dp[i].dist = prev_dist + s;
                    dp[i].start = j;
                    dp[i].end = i;
                    dp[i].format = CMAP_SPARSE_TINY;
                }
            }
        }
    }

    /* Backtrack to build result */
    size_t result_cap = 16;
    size_t result_count = 0;
    cmap_subtable_t *result = (cmap_subtable_t *)calloc(result_cap, sizeof(cmap_subtable_t));

    for (size_t idx = count; idx > 0; ) {
        size_t i = idx - 1;
        dp_node_t *node = &dp[i];
        size_t seg_len = node->end - node->start + 1;

        /* Grow array */
        if (result_count >= result_cap) {
            result_cap *= 2;
            result = (cmap_subtable_t *)realloc(result, result_cap * sizeof(cmap_subtable_t));
        }

        cmap_subtable_t *st = &result[result_count++];
        st->format = node->format;
        st->count = seg_len;
        st->codepoints = (uint32_t *)malloc(seg_len * sizeof(uint32_t));
        memcpy(st->codepoints, &codes[node->start], seg_len * sizeof(uint32_t));
        st->min_code = codes[node->start];
        st->max_code = codes[node->end];

        idx = node->start;
    }

    free(dp);

    /* Reverse (backtrack gives reverse order) */
    for (size_t i = 0; i < result_count / 2; i++) {
        cmap_subtable_t tmp = result[i];
        result[i] = result[result_count - 1 - i];
        result[result_count - 1 - i] = tmp;
    }

    /* Post-merge: merge adjacent subtables when combining into sparse_tiny
     * is cheaper (accounting for per-subtable entry overhead). */
    int merged_flag = 1;
    while (merged_flag) {
        merged_flag = 0;
        for (size_t i = 0; i + 1 < result_count; i++) {
            cmap_subtable_t *a = &result[i];
            cmap_subtable_t *b = &result[i + 1];

            uint32_t combined_first = a->min_code;
            uint32_t combined_last  = b->max_code;

            if (combined_last - combined_first >= 65536) continue;

            long long cost_a = subtable_cost(a);
            long long cost_b = subtable_cost(b);
            long long separate = cost_a + cost_b + 2 * SUBTABLE_ENTRY_OVERHEAD;

            size_t combined_count = a->count + b->count;
            long long merged_cost = est_sparse_tiny(combined_count) + SUBTABLE_ENTRY_OVERHEAD;

            if (merged_cost <= separate) {
                /* Merge b into a */
                uint32_t *new_codes = (uint32_t *)malloc(combined_count * sizeof(uint32_t));
                memcpy(new_codes, a->codepoints, a->count * sizeof(uint32_t));
                memcpy(new_codes + a->count, b->codepoints, b->count * sizeof(uint32_t));

                free(a->codepoints);
                free(b->codepoints);

                a->codepoints = new_codes;
                a->count = combined_count;
                a->max_code = combined_last;
                a->format = CMAP_SPARSE_TINY;

                /* Remove b by shifting */
                for (size_t k = i + 1; k + 1 < result_count; k++) {
                    result[k] = result[k + 1];
                }
                result_count--;

                merged_flag = 1;
                break;
            }
        }
    }

    plan.subtables = result;
    plan.count = result_count;
    return plan;
}

void cmap_plan_free(cmap_plan_t *plan)
{
    if (plan->subtables) {
        for (size_t i = 0; i < plan->count; i++) {
            free(plan->subtables[i].codepoints);
        }
        free(plan->subtables);
        plan->subtables = NULL;
    }
    plan->count = 0;
}
