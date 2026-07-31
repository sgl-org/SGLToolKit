#ifndef RLE_COMPRESS_H
#define RLE_COMPRESS_H

#include "bitstream.h"
#include <stdint.h>
#include <stddef.h>

/* Compress pixel array using RLE (modified I3BN algorithm).
 * pixels: flat array of quantized pixel values (0 .. (1<<bpp)-1)
 * count:  number of pixels
 * bpp:    bits per pixel (1, 2 or 4)
 * bs:     output bitstream */
void rle_compress(bitstream_t *bs, const uint8_t *pixels, size_t count, int bpp);

#endif /* RLE_COMPRESS_H */
