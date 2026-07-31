#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <windows.h>
#endif

#include "utf8.h"
#include "font_render.h"
#include "cmap_builder.h"
#include "output_writer.h"

/* Linked list of font entries: each --font starts a new group,
 * subsequent --symbols/--symbols-file/--range apply to that group. */
typedef struct font_entry {
    const char *font_path;
    uint32_t   *codes;
    size_t      count;
    struct font_entry *next;
} font_entry_t;

static void print_usage(const char *prog)
{
    fprintf(stderr,
        "Usage: %s --font <path> [--symbols <chars>] [--symbols-file <path>]\n"
        "       [--range <start-end>] ...\n"
        "       [--font <path2> [--symbols <chars2>] ...]\n"
        "       --size <px> --bpp <1|2|4> --output <path> [--compress]\n"
        "\n"
        "Options:\n"
        "  --font <path>         Source font file (.ttf/.otf). Repeat for multiple fonts.\n"
        "  --size <px>           Output font size in pixels\n"
        "  --bpp <1|2|4>         Bits per pixel for antialiasing\n"
        "  --output <path>       Output C source file path\n"
        "  --symbols <chars>      Characters to convert (UTF-8 string)\n"
        "  --symbols-file <path>  Read characters from text file\n"
        "  --range <start-end>   Unicode range (hex), e.g. 0x20-0x7F\n"
        "  --compress            Enable RLE compression (bpp 2/4 only)\n"
        "  --smart-mono           Enable smart monospace (group by script)\n"
        "  --spacing <px>         Extra pixel spacing between characters (default 0)\n"
        "\n"
        "Example (single font):\n"
        "  %s --font font.otf --symbols-file chinese.txt --size 24 --bpp 4 --output out.c\n"
        "\n"
        "Example (multiple fonts):\n"
        "  %s --font font1.otf --symbols \"ABC\" --font font2.otf --symbols \"XYZ\"\n"
        "       --size 24 --bpp 4 --output out.c\n",
        prog, prog, prog);
}

/* Parse hex range like "0x20-0x7F" */
static int parse_range(const char *str, uint32_t *start, uint32_t *end)
{
    char *dash = strchr(str, '-');
    if (!dash) {
        /* Single codepoint */
        *start = (uint32_t)strtoul(str, NULL, 0);
        *end = *start;
        return 0;
    }

    /* Temporarily split */
    size_t prefix_len = (size_t)(dash - str);
    char *start_str = (char *)malloc(prefix_len + 1);
    memcpy(start_str, str, prefix_len);
    start_str[prefix_len] = '\0';

    *start = (uint32_t)strtoul(start_str, NULL, 0);
    *end = (uint32_t)strtoul(dash + 1, NULL, 0);

    free(start_str);

    if (*start > *end) {
        fprintf(stderr, "Error: invalid range %s (start > end)\n", str);
        return -1;
    }
    return 0;
}

/* Merge codepoints from range into existing array */
static size_t merge_range(uint32_t **codes, size_t count, uint32_t start, uint32_t end)
{
    size_t range_len = (size_t)(end - start + 1);
    *codes = (uint32_t *)realloc(*codes, (count + range_len) * sizeof(uint32_t));
    for (uint32_t c = start; c <= end; c++) {
        (*codes)[count++] = c;
    }
    return count;
}

/* Sort + deduplicate uint32 array in-place, return new count */
static int cmp_u32(const void *a, const void *b)
{
    uint32_t va = *(const uint32_t *)a;
    uint32_t vb = *(const uint32_t *)b;
    if (va < vb) return -1;
    if (va > vb) return 1;
    return 0;
}

static size_t sort_unique(uint32_t *arr, size_t count)
{
    if (count <= 1) return count;
    qsort(arr, count, sizeof(uint32_t), cmp_u32);
    size_t unique = 1;
    for (size_t i = 1; i < count; i++) {
        if (arr[i] != arr[unique - 1]) {
            arr[unique++] = arr[i];
        }
    }
    return unique;
}

/* Extract basename without extension for font_name */
static char *extract_font_name(const char *output_path)
{
    const char *base = output_path;
    const char *sep;

    /* Find last path separator */
    sep = strrchr(base, '/');
    if (sep) base = sep + 1;
    sep = strrchr(base, '\\');
    if (sep) base = sep + 1;

    /* Copy basename */
    char *name = strdup(base);

    /* Remove extension */
    char *dot = strrchr(name, '.');
    if (dot) *dot = '\0';

    return name;
}

/* Ensure parent directory exists (simple version for common cases) */
static void ensure_parent_dir(const char *filepath)
{
    char *path = strdup(filepath);
    char *last_sep = strrchr(path, '/');
    if (!last_sep) last_sep = strrchr(path, '\\');
    if (last_sep) {
        *last_sep = '\0';
#ifdef _WIN32
        /* Use system mkdir on Windows */
        char cmd[512];
        snprintf(cmd, sizeof(cmd), "mkdir \"%s\" 2>nul", path);
        system(cmd);
#else
        char cmd[512];
        snprintf(cmd, sizeof(cmd), "mkdir -p \"%s\"", path);
        system(cmd);
#endif
    }
    free(path);
}

/* Add codepoints to the current font entry */
static int add_codes_to_entry(font_entry_t *entry, uint32_t *new_codes, size_t new_count)
{
    if (new_count == 0) return 0;
    entry->codes = (uint32_t *)realloc(entry->codes, (entry->count + new_count) * sizeof(uint32_t));
    if (!entry->codes) return -1;
    memcpy(entry->codes + entry->count, new_codes, new_count * sizeof(uint32_t));
    entry->count += new_count;
    return 0;
}

/* Free a single font entry */
static void free_font_entry(font_entry_t *entry)
{
    if (entry) {
        free(entry->codes);
        free(entry);
    }
}

/* Free all font entries in linked list */
static void free_font_entries(font_entry_t *head)
{
    while (head) {
        font_entry_t *next = head->next;
        free_font_entry(head);
        head = next;
    }
}

int main(int argc, char *argv[])
{
#ifdef _WIN32
    /* On Windows, argv is encoded in the system locale (e.g. GBK).
     * Use GetCommandLineW + CommandLineToArgvW to get proper Unicode,
     * then convert to UTF-8. */
    int wargc;
    wchar_t **wargv = CommandLineToArgvW(GetCommandLineW(), &wargc);
    if (wargv) {
        argc = wargc;
        argv = (char **)malloc(argc * sizeof(char *));
        for (int i = 0; i < argc; i++) {
            int len = WideCharToMultiByte(CP_UTF8, 0, wargv[i], -1, NULL, 0, NULL, NULL);
            argv[i] = (char *)malloc(len);
            WideCharToMultiByte(CP_UTF8, 0, wargv[i], -1, argv[i], len, NULL, NULL);
        }
        LocalFree(wargv);
    }
#endif

    const char *output_path = NULL;
    int pixel_size = 0;
    int bpp = 0;
    int compress_flag = 0;
    int smart_mono_flag = 0;
    int spacing_val = 0;

    font_entry_t *font_head = NULL;
    font_entry_t *font_tail = NULL;
    font_entry_t *current_entry = NULL;

    /* Parse arguments */
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--font") == 0 && i + 1 < argc) {
            /* Start a new font entry */
            font_entry_t *entry = (font_entry_t *)calloc(1, sizeof(font_entry_t));
            if (!entry) {
                fprintf(stderr, "Error: out of memory\n");
                free_font_entries(font_head);
                return 1;
            }
            entry->font_path = argv[++i];
            entry->next = NULL;

            if (!font_head) {
                font_head = entry;
                font_tail = entry;
            } else {
                font_tail->next = entry;
                font_tail = entry;
            }
            current_entry = entry;
        } else if (strcmp(argv[i], "--size") == 0 && i + 1 < argc) {
            pixel_size = atoi(argv[++i]);
        } else if (strcmp(argv[i], "--bpp") == 0 && i + 1 < argc) {
            bpp = atoi(argv[++i]);
        } else if (strcmp(argv[i], "--output") == 0 && i + 1 < argc) {
            output_path = argv[++i];
        } else if (strcmp(argv[i], "-o") == 0 && i + 1 < argc) {
            output_path = argv[++i];
        } else if (strcmp(argv[i], "--compress") == 0) {
            compress_flag = 1;
        } else if (strcmp(argv[i], "--smart-mono") == 0) {
            smart_mono_flag = 1;
        } else if (strcmp(argv[i], "--spacing") == 0 && i + 1 < argc) {
            spacing_val = atoi(argv[++i]);
        } else if (strcmp(argv[i], "--symbols") == 0 && i + 1 < argc) {
            if (!current_entry) {
                fprintf(stderr, "Error: --symbols must follow a --font\n");
                free_font_entries(font_head);
                return 1;
            }
            i++;
            uint32_t *sym_codes = NULL;
            size_t sym_count = utf8_to_codepoints(argv[i], &sym_codes);
            if (sym_count > 0) {
                if (add_codes_to_entry(current_entry, sym_codes, sym_count) != 0) {
                    fprintf(stderr, "Error: out of memory\n");
                    free(sym_codes);
                    free_font_entries(font_head);
                    return 1;
                }
                free(sym_codes);
            }
        } else if (strcmp(argv[i], "--symbols-file") == 0 && i + 1 < argc) {
            if (!current_entry) {
                fprintf(stderr, "Error: --symbols-file must follow a --font\n");
                free_font_entries(font_head);
                return 1;
            }
            i++;
            char *text = read_file_text(argv[i]);
            if (!text) {
                fprintf(stderr, "Error: cannot read file '%s'\n", argv[i]);
                free_font_entries(font_head);
                return 1;
            }
            uint32_t *sym_codes = NULL;
            size_t sym_count = utf8_to_codepoints(text, &sym_codes);
            free(text);
            if (sym_count > 0) {
                if (add_codes_to_entry(current_entry, sym_codes, sym_count) != 0) {
                    fprintf(stderr, "Error: out of memory\n");
                    free(sym_codes);
                    free_font_entries(font_head);
                    return 1;
                }
                free(sym_codes);
            }
        } else if (strcmp(argv[i], "--range") == 0 && i + 1 < argc) {
            if (!current_entry) {
                fprintf(stderr, "Error: --range must follow a --font\n");
                free_font_entries(font_head);
                return 1;
            }
            i++;
            uint32_t range_start, range_end;
            if (parse_range(argv[i], &range_start, &range_end) != 0) {
                free_font_entries(font_head);
                return 1;
            }
            current_entry->count = merge_range(&current_entry->codes, current_entry->count, range_start, range_end);
        } else if (strcmp(argv[i], "--help") == 0 || strcmp(argv[i], "-h") == 0) {
            print_usage(argv[0]);
            free_font_entries(font_head);
            return 0;
        } else {
            fprintf(stderr, "Unknown option: %s\n", argv[i]);
            print_usage(argv[0]);
            free_font_entries(font_head);
            return 1;
        }
    }

    /* Validate arguments */
    if (!font_head) {
        fprintf(stderr, "Error: --font is required\n");
        print_usage(argv[0]);
        free_font_entries(font_head);
        return 1;
    }
    if (pixel_size <= 0) {
        fprintf(stderr, "Error: --size must be positive\n");
        free_font_entries(font_head);
        return 1;
    }
    if (bpp != 1 && bpp != 2 && bpp != 4) {
        fprintf(stderr, "Error: --bpp must be 1, 2 or 4\n");
        free_font_entries(font_head);
        return 1;
    }
    if (!output_path) {
        fprintf(stderr, "Error: --output is required\n");
        free_font_entries(font_head);
        return 1;
    }

    /* Validate each font entry has codepoints */
    for (font_entry_t *e = font_head; e; e = e->next) {
        if (e->count == 0) {
            fprintf(stderr, "Error: font '%s' has no characters (use --symbols, --symbols-file or --range)\n", e->font_path);
            free_font_entries(font_head);
            return 1;
        }
    }

    /* Sort and deduplicate codepoints for each font */
    for (font_entry_t *e = font_head; e; e = e->next) {
        e->count = sort_unique(e->codes, e->count);
        printf("Font '%s': %u characters\n", e->font_path, (unsigned)e->count);
    }

    /* Render each font separately, then merge */
    printf("Rendering glyphs with FreeType...\n");
    font_data_t merged_font;
    memset(&merged_font, 0, sizeof(merged_font));
    int first_font = 1;

    for (font_entry_t *e = font_head; e; e = e->next) {
        font_data_t single_font;
        if (font_render_init(e->font_path, pixel_size, e->codes, e->count, &single_font) != 0) {
            font_render_free(&merged_font);
            free_font_entries(font_head);
            return 1;
        }
        printf("  Rendered %u glyphs from '%s' (height=%d, baseline=%d)\n",
               (unsigned)single_font.glyph_count, e->font_path, single_font.font_height, single_font.base_line);

        if (first_font) {
            merged_font = single_font;
            first_font = 0;
        } else {
            font_data_t temp;
            if (font_data_merge(&merged_font, &single_font, &temp) != 0) {
                fprintf(stderr, "Error: failed to merge font data\n");
                font_render_free(&merged_font);
                font_render_free(&single_font);
                free_font_entries(font_head);
                return 1;
            }
            font_render_free(&merged_font);
            font_render_free(&single_font);
            merged_font = temp;
        }
    }

    printf("Merged font: %u glyphs (height=%d, baseline=%d)\n",
           (unsigned)merged_font.glyph_count, merged_font.font_height, merged_font.base_line);

    /* Build cmap */
    printf("Building cmap subtables...\n");
    uint32_t *rendered_codes = (uint32_t *)malloc(merged_font.glyph_count * sizeof(uint32_t));
    for (size_t i = 0; i < merged_font.glyph_count; i++) {
        rendered_codes[i] = merged_font.glyphs[i].code;
    }
    cmap_plan_t cmap = cmap_build(rendered_codes, merged_font.glyph_count);
    free(rendered_codes);
    printf("  %u subtable(s)\n", (unsigned)cmap.count);

    for (size_t i = 0; i < cmap.count; i++) {
        const cmap_subtable_t *st = &cmap.subtables[i];
        const char *fmt_name = st->format == CMAP_FORMAT0_TINY ? "format0_tiny" :
                               st->format == CMAP_FORMAT0 ? "format0" : "sparse_tiny";
        printf("  [%u] %s range=0x%04x-0x%04x count=%u\n",
               (unsigned)i, fmt_name, st->min_code, st->max_code, (unsigned)st->count);
    }

    /* Write output */
    char *font_name = extract_font_name(output_path);
    ensure_parent_dir(output_path);

    FILE *fp = fopen(output_path, "w");
    if (!fp) {
        fprintf(stderr, "Error: cannot open output file '%s'\n", output_path);
        free(font_name);
        cmap_plan_free(&cmap);
        font_render_free(&merged_font);
        free_font_entries(font_head);
        return 1;
    }

    writer_ctx_t writer = {
        .font = &merged_font,
        .cmap = &cmap,
        .bpp = bpp,
        .compress = compress_flag,
        .font_name = font_name,
        .smart_mono = smart_mono_flag,
        .spacing = spacing_val
    };

    printf("Writing output to %s...\n", output_path);
    if (write_sgl_font(fp, &writer) != 0) {
        fprintf(stderr, "Error: write failed\n");
        fclose(fp);
        free(font_name);
        cmap_plan_free(&cmap);
        font_render_free(&merged_font);
        free_font_entries(font_head);
        return 1;
    }

    fclose(fp);
    printf("Done! Output: %s\n", output_path);

    /* Cleanup */
    free(font_name);
    cmap_plan_free(&cmap);
    font_render_free(&merged_font);
    free_font_entries(font_head);

    return 0;
}
