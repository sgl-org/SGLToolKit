#ifndef UTF8_H
#define UTF8_H

#include <stdint.h>
#include <stddef.h>
#include <stdio.h>

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

/* Open a file with a UTF-8 encoded path.
 * On Windows the path is converted to UTF-16 and _wfopen is used,
 * so non-ASCII (e.g. Chinese) paths work regardless of the ANSI code page. */
FILE *utf8_fopen(const char *path, const char *mode);

/* Read entire binary file into a malloc'd buffer.
 * Returns 0 on success, -1 on failure. Caller must free(*out_buf). */
int utf8_read_whole_file(const char *path, uint8_t **out_buf, size_t *out_size);

/* Create all parent directories of filepath (UTF-8 path, recursive).
 * Returns 0 on success, -1 on failure. */
int utf8_make_dirs(const char *filepath);

#endif /* UTF8_H */
