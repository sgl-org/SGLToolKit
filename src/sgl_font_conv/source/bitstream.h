#ifndef BITSTREAM_H
#define BITSTREAM_H

#include <stdint.h>
#include <stddef.h>

typedef struct {
    uint8_t *buffer;
    size_t   capacity;   /* allocated bytes */
    size_t   bit_index;  /* current write position in bits */
} bitstream_t;

void     bitstream_init(bitstream_t *bs, uint8_t *buf, size_t capacity);
void     bitstream_write_bits(bitstream_t *bs, uint32_t value, int num_bits);
size_t   bitstream_byte_index(const bitstream_t *bs);

#endif /* BITSTREAM_H */
