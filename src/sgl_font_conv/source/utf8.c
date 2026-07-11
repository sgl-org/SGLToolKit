#include "utf8.h"
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

uint32_t utf8_decode(const char **ptr)
{
    const uint8_t *s = (const uint8_t *)*ptr;
    uint32_t cp;
    int extra;

    if (*s == 0) return 0;

    if (*s < 0x80) {
        cp = *s++;
        extra = 0;
    } else if ((*s & 0xE0) == 0xC0) {
        cp = *s++ & 0x1F;
        extra = 1;
    } else if ((*s & 0xF0) == 0xE0) {
        cp = *s++ & 0x0F;
        extra = 2;
    } else if ((*s & 0xF8) == 0xF0) {
        cp = *s++ & 0x07;
        extra = 3;
    } else {
        /* invalid byte, skip */
        s++;
        *ptr = (const char *)s;
        return 0xFFFD;
    }

    for (int i = 0; i < extra; i++) {
        if ((*s & 0xC0) != 0x80) {
            *ptr = (const char *)s;
            return 0xFFFD;
        }
        cp = (cp << 6) | (*s++ & 0x3F);
    }

    *ptr = (const char *)s;
    return cp;
}

static int cmp_uint32(const void *a, const void *b)
{
    uint32_t va = *(const uint32_t *)a;
    uint32_t vb = *(const uint32_t *)b;
    if (va < vb) return -1;
    if (va > vb) return 1;
    return 0;
}

size_t utf8_to_codepoints(const char *text, uint32_t **out_codes)
{
    /* First pass: count codepoints */
    size_t capacity = 256;
    size_t count = 0;
    uint32_t *codes = (uint32_t *)malloc(capacity * sizeof(uint32_t));
    if (!codes) return 0;

    const char *ptr = text;
    while (*ptr) {
        uint32_t cp = utf8_decode(&ptr);
        if (cp == 0) break;
        if (cp < 0x20) continue;  /* skip control chars */
        if (cp == 0xFFFD) continue;
        if (cp == 0xFEFF) continue; /* skip BOM */

        if (count >= capacity) {
            capacity *= 2;
            codes = (uint32_t *)realloc(codes, capacity * sizeof(uint32_t));
            if (!codes) return 0;
        }
        codes[count++] = cp;
    }

    if (count == 0) {
        free(codes);
        *out_codes = NULL;
        return 0;
    }

    /* Sort */
    qsort(codes, count, sizeof(uint32_t), cmp_uint32);

    /* Remove duplicates */
    size_t unique = 1;
    for (size_t i = 1; i < count; i++) {
        if (codes[i] != codes[unique - 1]) {
            codes[unique++] = codes[i];
        }
    }

    *out_codes = codes;
    return unique;
}

char *read_file_text(const char *path)
{
    FILE *fp = fopen(path, "rb");
    if (!fp) return NULL;

    fseek(fp, 0, SEEK_END);
    long size = ftell(fp);
    fseek(fp, 0, SEEK_SET);

    if (size < 0) {
        fclose(fp);
        return NULL;
    }

    char *buf = (char *)malloc((size_t)size + 1);
    if (!buf) {
        fclose(fp);
        return NULL;
    }

    size_t read_count = fread(buf, 1, (size_t)size, fp);
    fclose(fp);

    buf[read_count] = '\0';

    /* Skip UTF-8 BOM if present */
    if (read_count >= 3 &&
        (uint8_t)buf[0] == 0xEF &&
        (uint8_t)buf[1] == 0xBB &&
        (uint8_t)buf[2] == 0xBF) {
        memmove(buf, buf + 3, read_count - 3 + 1);
    }

    return buf;
}
