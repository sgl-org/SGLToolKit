#include "bitstream.h"
#include <string.h>

void bitstream_init(bitstream_t *bs, uint8_t *buf, size_t capacity)
{
    bs->buffer = buf;
    bs->capacity = capacity;
    bs->bit_index = 0;
    memset(buf, 0, capacity);
}

void bitstream_write_bits(bitstream_t *bs, uint32_t value, int num_bits)
{
    /* Write bits in big-endian order (MSB first), matching JS BitStream with bigEndian=true */
    for (int i = num_bits - 1; i >= 0; i--) {
        size_t byte_pos = bs->bit_index / 8;
        int    bit_pos  = 7 - (int)(bs->bit_index % 8);  /* MSB first within byte */

        if (byte_pos < bs->capacity) {
            if ((value >> i) & 1) {
                bs->buffer[byte_pos] |= (uint8_t)(1 << bit_pos);
            }
        }
        bs->bit_index++;
    }
}

size_t bitstream_byte_index(const bitstream_t *bs)
{
    return (bs->bit_index + 7) / 8;
}
