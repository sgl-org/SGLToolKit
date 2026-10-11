#include "utf8.h"
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <sys/stat.h>
#include <sys/types.h>
#include <errno.h>
#endif

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

FILE *utf8_fopen(const char *path, const char *mode)
{
#ifdef _WIN32
    int wlen = MultiByteToWideChar(CP_UTF8, 0, path, -1, NULL, 0);
    if (wlen <= 0) return NULL;
    WCHAR *wpath = (WCHAR *)malloc((size_t)wlen * sizeof(WCHAR));
    if (!wpath) return NULL;
    MultiByteToWideChar(CP_UTF8, 0, path, -1, wpath, wlen);
    WCHAR wmode[16];
    MultiByteToWideChar(CP_UTF8, 0, mode, -1, wmode, 16);
    FILE *fp = _wfopen(wpath, wmode);
    free(wpath);
    return fp;
#else
    return fopen(path, mode);
#endif
}

int utf8_read_whole_file(const char *path, uint8_t **out_buf, size_t *out_size)
{
    FILE *fp = utf8_fopen(path, "rb");
    if (!fp) return -1;

    fseek(fp, 0, SEEK_END);
    long size = ftell(fp);
    fseek(fp, 0, SEEK_SET);
    if (size < 0) {
        fclose(fp);
        return -1;
    }

    uint8_t *buf = (uint8_t *)malloc((size_t)size);
    if (!buf) {
        fclose(fp);
        return -1;
    }

    size_t got = fread(buf, 1, (size_t)size, fp);
    fclose(fp);
    if (got != (size_t)size) {
        free(buf);
        return -1;
    }

    *out_buf = buf;
    *out_size = (size_t)size;
    return 0;
}

int utf8_make_dirs(const char *filepath)
{
    char *path = strdup(filepath);
    if (!path) return -1;

    /* Truncate to parent directory */
    char *last_sep = strrchr(path, '/');
#ifdef _WIN32
    {
        char *b = strrchr(path, '\\');
        if (b && (!last_sep || b > last_sep)) last_sep = b;
    }
#endif
    if (!last_sep) {
        free(path);
        return 0; /* no directory component */
    }
    *last_sep = '\0';
    if (path[0] == '\0') {
        free(path);
        return 0;
    }

#ifdef _WIN32
    {
        int wlen = MultiByteToWideChar(CP_UTF8, 0, path, -1, NULL, 0);
        if (wlen <= 0) { free(path); return -1; }
        WCHAR *wpath = (WCHAR *)malloc((size_t)wlen * sizeof(WCHAR));
        if (!wpath) { free(path); return -1; }
        MultiByteToWideChar(CP_UTF8, 0, path, -1, wpath, wlen);

        int ret = 0;
        /* Create each prefix level, e.g. C:\a -> C:\a\b -> C:\a\b\c */
        for (WCHAR *p = wpath + 1; *p; p++) {
            if (*p != L'\\' && *p != L'/') continue;
            /* Skip drive colon ("C:") and UNC leading separators */
            if (p == wpath + 1 && p[-1] == L':') continue;
            if (p == wpath + 2 && wpath[1] == L':') continue;
            WCHAR saved = *p;
            *p = L'\0';
            if (!CreateDirectoryW(wpath, NULL)) {
                DWORD err = GetLastError();
                if (err != ERROR_ALREADY_EXISTS) ret = -1;
            }
            *p = saved;
        }
        /* Final (longest) segment may have no trailing separator; create it too */
        if (!CreateDirectoryW(wpath, NULL)) {
            DWORD err = GetLastError();
            if (err != ERROR_ALREADY_EXISTS) ret = -1;
        }
        free(wpath);
        free(path);
        return ret;
    }
#else
    {
        int ret = 0;
        for (char *p = path + 1; *p; p++) {
            if (*p != '/') continue;
            *p = '\0';
            if (mkdir(path, 0755) != 0 && errno != EEXIST) ret = -1;
            *p = '/';
        }
        if (mkdir(path, 0755) != 0 && errno != EEXIST) ret = -1;
        free(path);
        return ret;
    }
#endif
}

char *read_file_text(const char *path)
{
    FILE *fp = utf8_fopen(path, "rb");
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
