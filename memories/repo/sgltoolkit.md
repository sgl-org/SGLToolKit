# SGLToolKit repo notes

## image_conv (C CLI, added 2026-09)
- Location: `image_conv/source/`, re-implements `src/components/ImageConvert.vue` + `src/utils/imageConversion.js`.
- Build: `cd image_conv/source && make` (MinGW gcc on this machine, C99, zero warnings).
- Third-party: bundled `stb_image.h` v2.30 (downloaded from nothings/stb) for PNG/JPEG/BMP decode.
- Module split: types / util / bitmap / compress / output / main.c.
- Key parity details vs JS:
  - RGB565 etc. encode: little-endian values, byte order matters; JS `Math.round` == floor(v+0.5).
  - Transparent fill: alpha<255 && fill enabled => blend with #RRGGBB (default FFFFFF).
  - RLE: [count(1..255)][bpp bytes] chunks. QOI: SGL variant — 13B header(0x51 magic, BE w/h, offsets table sizes), row offset table (2/3/4B BE), per-row independent RUN/DIFF/LUMA/RGB565 ops.
  - Default output name from first image: `img_<safeName>`; C arrays named `<name>_bitmap`, pixmaps `<name>_image` or combined array.
  - BIN mode: concatenated .bin + address-table .c; `--batch-single-bin` makes per-image .bin with decl .c (bitmap.addr = NULL).
- CLI gotcha: `--format` is COLOR format; output c|bin uses `-O/--out`; `-d` sets output dir.
- Windows: use `util_fopen` (_wfopen CP_UTF8) for file IO; convert argv via CommandLineToArgvW + WideCharToMultiByte to heap (never reuse argv[i] buffer — overflow risk).
