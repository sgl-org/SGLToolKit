#ifndef UTF8_H
#define UTF8_H

#include <stdint.h>
#include <stddef.h>

/* Decode one UTF-8 codepoint from string, advance pointer.
 * Returns codepoint, or 0 on end / error. */
uint32_t utf8_decode(const char **ptr);

/* Parse UTF-8 string into sorted unique codepoint array.
 * Caller must free() the returned array.
 * Returns count of codepoints. */
size_t utf8_to_codepoints(const char *text, uint32_t **out_codes);

/* Read entire file into malloc'd buffer (null-terminated).
 * Returns NULL on failure. */
char *read_file_text(const char *path);

#endif /* UTF8_H */
