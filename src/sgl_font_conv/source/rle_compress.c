#include "rle_compress.h"

/*
 * RLE compression (modified I3BN algorithm), matching the JS version in compress.js:
 *
 * 1. RLE_SKIP_COUNT = 1: write first pixel as-is before entering RLE mode
 * 2. RLE_BIT_COLLAPSED_COUNT = 10: up to 10 repeats encoded as single '1' bits
 * 3. RLE_COUNTER_BITS = 6: for repeats > 10, use 6-bit counter
 * 4. RLE_COUNTER_MAX = 63
 * 5. RLE_MAX_REPEATS = 63 + 10 + 1 = 74
 */

#define RLE_SKIP_COUNT           1
#define RLE_BIT_COLLAPSED_COUNT  10
#define RLE_COUNTER_BITS         6
#define RLE_COUNTER_MAX          ((1 << RLE_COUNTER_BITS) - 1)
#define RLE_MAX_REPEATS          (RLE_COUNTER_MAX + RLE_BIT_COLLAPSED_COUNT + 1)

static size_t count_same(const uint8_t *pixels, size_t count, size_t offset)
{
    size_t same = 1;
    uint8_t val = pixels[offset];

    for (size_t i = offset + 1; i < count; i++) {
        if (pixels[i] != val) break;
        same++;
    }

    return same;
}

void rle_compress(bitstream_t *bs, const uint8_t *pixels, size_t count, int bpp)
{
    size_t offset = 0;

    while (offset < count) {
        uint8_t pixel = pixels[offset];
        size_t same = count_same(pixels, count, offset);

        /* Clamp to max encodable run length */
        if (same > RLE_MAX_REPEATS + RLE_SKIP_COUNT) {
            same = RLE_MAX_REPEATS + RLE_SKIP_COUNT;
        }

        offset += same;

        /* Not enough for RLE - write as-is */
        if (same <= RLE_SKIP_COUNT) {
            for (size_t i = 0; i < same; i++) {
                bitstream_write_bits(bs, pixel, bpp);
            }
            continue;
        }

        /* Write "skipped" head as-is */
        for (int i = 0; i < RLE_SKIP_COUNT; i++) {
            bitstream_write_bits(bs, pixel, bpp);
        }
        same -= RLE_SKIP_COUNT;

        /* Not enough for counter - use bit-extended encoding */
        if (same <= RLE_BIT_COLLAPSED_COUNT) {
            bitstream_write_bits(bs, pixel, bpp);
            for (size_t i = 0; i < same; i++) {
                if (i < same - 1) {
                    bitstream_write_bits(bs, 1, 1);
                } else {
                    bitstream_write_bits(bs, 0, 1);
                }
            }
            continue;
        }

        /* Use counter mode */
        same -= RLE_BIT_COLLAPSED_COUNT + 1;

        bitstream_write_bits(bs, pixel, bpp);
        for (int i = 0; i < RLE_BIT_COLLAPSED_COUNT + 1; i++) {
            bitstream_write_bits(bs, 1, 1);
        }
        bitstream_write_bits(bs, (uint32_t)same, RLE_COUNTER_BITS);
    }
}
