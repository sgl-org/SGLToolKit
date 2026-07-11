CC      = gcc
AR      = ar
CFLAGS  = -O2 -Wall -std=c99
TARGET  = sgl_font_conv

# ---- FreeType config ----
FT_ZIP    = ../freetype-master.zip
FT_DIR    = freetype
FT_INC    = -I$(FT_DIR)/include
FT_CFLAGS = $(CFLAGS) $(FT_INC) -DFT2_BUILD_LIBRARY
FT_LIB    = libfreetype.a
FT_OBJDIR = ft_objs

FT_OBJS = \
   $(FT_OBJDIR)/ftsystem.o   $(FT_OBJDIR)/ftinit.o     $(FT_OBJDIR)/ftdebug.o  \
   $(FT_OBJDIR)/ftbase.o     $(FT_OBJDIR)/ftbbox.o      $(FT_OBJDIR)/ftbitmap.o \
   $(FT_OBJDIR)/ftglyph.o    $(FT_OBJDIR)/ftmm.o        $(FT_OBJDIR)/ftsynth.o  \
   $(FT_OBJDIR)/autofit.o    $(FT_OBJDIR)/cff.o          $(FT_OBJDIR)/type1cid.o \
   $(FT_OBJDIR)/ftgzip.o     $(FT_OBJDIR)/ftlzw.o        $(FT_OBJDIR)/psaux.o   \
   $(FT_OBJDIR)/pshinter.o   $(FT_OBJDIR)/psnames.o      $(FT_OBJDIR)/raster.o  \
   $(FT_OBJDIR)/sfnt.o       $(FT_OBJDIR)/smooth.o        $(FT_OBJDIR)/truetype.o \
   $(FT_OBJDIR)/type1.o      $(FT_OBJDIR)/sdf.o            $(FT_OBJDIR)/svg.o    \
   $(FT_OBJDIR)/bdf.o        $(FT_OBJDIR)/pcf.o            $(FT_OBJDIR)/pfr.o    \
   $(FT_OBJDIR)/type42.o     $(FT_OBJDIR)/winfnt.o         $(FT_OBJDIR)/hvf.o

# ---- sgl_font_conv sources ----
SRCS = main.c font_render.c cmap_builder.c rle_compress.c \
       bitstream.c output_writer.c utf8.c
OBJS = $(SRCS:.c=.o)

# ==============================================================
all: $(TARGET)

# ---- Step 1: unzip FreeType ----
$(FT_DIR)/include/ft2build.h:
	@echo "=== Extracting FreeType ==="
	@test -d $(FT_DIR) || ( unzip -q $(FT_ZIP) && mv freetype-master $(FT_DIR) )

# ---- Step 2: build FreeType ----
$(FT_OBJDIR):
	@mkdir -p $(FT_OBJDIR)

$(FT_OBJDIR)/ftsystem.o:  $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/base/ftsystem.c -o $@
$(FT_OBJDIR)/ftinit.o:    $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/base/ftinit.c -o $@
$(FT_OBJDIR)/ftdebug.o:   $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/base/ftdebug.c -o $@
$(FT_OBJDIR)/ftbase.o:    $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/base/ftbase.c -o $@
$(FT_OBJDIR)/ftbbox.o:    $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/base/ftbbox.c -o $@
$(FT_OBJDIR)/ftbitmap.o:  $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/base/ftbitmap.c -o $@
$(FT_OBJDIR)/ftglyph.o:   $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/base/ftglyph.c -o $@
$(FT_OBJDIR)/ftmm.o:      $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/base/ftmm.c -o $@
$(FT_OBJDIR)/ftsynth.o:   $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/base/ftsynth.c -o $@
$(FT_OBJDIR)/autofit.o:   $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/autofit/autofit.c -o $@
$(FT_OBJDIR)/cff.o:       $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/cff/cff.c -o $@
$(FT_OBJDIR)/type1cid.o:  $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/cid/type1cid.c -o $@
$(FT_OBJDIR)/ftgzip.o:    $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/gzip/ftgzip.c -o $@
$(FT_OBJDIR)/ftlzw.o:     $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/lzw/ftlzw.c -o $@
$(FT_OBJDIR)/psaux.o:     $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/psaux/psaux.c -o $@
$(FT_OBJDIR)/pshinter.o:  $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/pshinter/pshinter.c -o $@
$(FT_OBJDIR)/psnames.o:   $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/psnames/psnames.c -o $@
$(FT_OBJDIR)/raster.o:    $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/raster/raster.c -o $@
$(FT_OBJDIR)/sfnt.o:      $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/sfnt/sfnt.c -o $@
$(FT_OBJDIR)/smooth.o:    $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/smooth/smooth.c -o $@
$(FT_OBJDIR)/truetype.o:  $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/truetype/truetype.c -o $@
$(FT_OBJDIR)/type1.o:     $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/type1/type1.c -o $@
$(FT_OBJDIR)/sdf.o:       $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/sdf/sdf.c -o $@
$(FT_OBJDIR)/svg.o:       $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/svg/svg.c -o $@
$(FT_OBJDIR)/bdf.o:       $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/bdf/bdf.c -o $@
$(FT_OBJDIR)/pcf.o:       $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/pcf/pcf.c -o $@
$(FT_OBJDIR)/pfr.o:       $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/pfr/pfr.c -o $@
$(FT_OBJDIR)/type42.o:    $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/type42/type42.c -o $@
$(FT_OBJDIR)/winfnt.o:    $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/winfonts/winfnt.c -o $@
$(FT_OBJDIR)/hvf.o:       $(FT_DIR)/include/ft2build.h | $(FT_OBJDIR)
	$(CC) $(FT_CFLAGS) -c $(FT_DIR)/src/hvf/hvf.c -o $@

$(FT_LIB): $(FT_OBJS)
	@echo "=== Creating $(FT_LIB) ==="
	$(AR) rcs $@ $^

# ---- Step 3: build sgl_font_conv ----
%.o: %.c
	$(CC) $(CFLAGS) $(FT_INC) -c $< -o $@

$(TARGET): $(FT_LIB) $(OBJS)
	@echo "=== Linking $(TARGET) ==="
	$(CC) $(CFLAGS) -o $@ $(OBJS) $(FT_LIB) -lm
	@echo "=== Build successful: $(TARGET) ==="

# ---- Header dependencies ----
main.o:          main.c utf8.h font_render.h cmap_builder.h output_writer.h
font_render.o:   font_render.c font_render.h
cmap_builder.o:  cmap_builder.c cmap_builder.h
rle_compress.o:  rle_compress.c rle_compress.h bitstream.h
bitstream.o:     bitstream.c bitstream.h
output_writer.o: output_writer.c output_writer.h font_render.h cmap_builder.h bitstream.h rle_compress.h
utf8.o:          utf8.c utf8.h

# ---- Cleanup ----
clean:
	rm -f $(OBJS) $(TARGET) $(FT_LIB)
	rm -rf $(FT_OBJDIR)

distclean: clean
	rm -rf $(FT_DIR)

.PHONY: all clean distclean
