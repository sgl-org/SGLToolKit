/*
 * MIT License
 *
 * Copyright(c) 2023-present All contributors of SGL
 * Document reference link: https://sgl-docs.readthedocs.io
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

#ifndef __SGL_SCALE_H__
#define __SGL_SCALE_H__

#include <sgl_core.h>
#include <sgl_draw.h>
#include <sgl_font.h>
#include <sgl_log.h>
#include <sgl_math.h>
#include <sgl_mm.h>
#include <sgl_cfgfix.h>

#ifdef __cplusplus
extern "C" {
#endif

#define SGL_SCALE_COLOR       sgl_rgb(0, 0, 0)
#define SGL_SCALE_ALPHA       255

typedef enum {
    SGL_SCALE_MODE_HORIZONTAL = 0,
    SGL_SCALE_MODE_VERTICAL,
    SGL_SCALE_MODE_CIRCULAR,
} sgl_scale_mode_t;

typedef struct sgl_scale {
    sgl_obj_t obj;
    int32_t min_value;
    int32_t max_value;
    uint16_t total_tick_count;
    uint16_t major_tick_every;
    uint16_t label_interval;
    int16_t angle_start;
    int16_t angle_end;
    sgl_color_t major_color;
    sgl_color_t minor_color;
    sgl_color_t label_color;
    sgl_color_t axis_color;
    const sgl_font_t *font;
    uint8_t mode;
    uint8_t major_length;
    uint8_t minor_length;
    uint8_t major_width;
    uint8_t minor_width;
    uint8_t axis_width;
    uint8_t alpha;
    uint8_t labels_enabled;
} sgl_scale_t;

/**
 * @brief Create a scale object. Use sgl_obj_set_pos/size to place it.
 * @param parent parent object, NULL creates the scale on the active screen
 * @return scale object, or NULL if allocation fails
 */
sgl_obj_t *sgl_scale_create(sgl_obj_t *parent);

/**
 * @brief Select horizontal, vertical, or circular layout.
 */
void sgl_scale_set_mode(sgl_obj_t *obj, sgl_scale_mode_t mode);

/**
 * @brief Set the value range. min_value and max_value must differ.
 */
void sgl_scale_set_range(sgl_obj_t *obj, int32_t min_value, int32_t max_value);

/**
 * @brief Set the number of evenly-spaced ticks, including both endpoints.
 * @note count must be at least 2.
 */
void sgl_scale_set_total_tick_count(sgl_obj_t *obj, uint16_t count);

/**
 * @brief Set the major tick interval in tick indices. Must be at least 1.
 */
void sgl_scale_set_major_tick_every(sgl_obj_t *obj, uint16_t every);

/**
 * @brief Set the label interval in major ticks. Must be at least 1.
 */
void sgl_scale_set_label_interval(sgl_obj_t *obj, uint16_t interval);

/**
 * @brief Set the circular sweep angles (0 degrees is top, clockwise).
 * @note Equal start and end angles represent a full circle.
 */
void sgl_scale_set_angle_range(sgl_obj_t *obj, int16_t start, int16_t end);

/**
 * @brief Set major tick length, width, and color.
 */
void sgl_scale_set_major_tick_style(sgl_obj_t *obj, uint8_t length,
                                    uint8_t width, sgl_color_t color);

/**
 * @brief Set minor tick length, width, and color.
 */
void sgl_scale_set_minor_tick_style(sgl_obj_t *obj, uint8_t length,
                                    uint8_t width, sgl_color_t color);

/**
 * @brief Set the scale axis width and color. A width of zero hides the axis.
 */
void sgl_scale_set_axis_style(sgl_obj_t *obj, uint8_t width, sgl_color_t color);

/**
 * @brief Enable or disable value labels.
 */
void sgl_scale_set_labels_enabled(sgl_obj_t *obj, uint8_t enabled);

/**
 * @brief Set the value label font. A NULL font hides the labels.
 */
void sgl_scale_set_font(sgl_obj_t *obj, const sgl_font_t *font);

/**
 * @brief Set the value label color and font. A NULL font hides the labels.
 */
void sgl_scale_set_label_style(sgl_obj_t *obj, sgl_color_t color,
                               const sgl_font_t *font);

/**
 * @brief Set drawing alpha.
 */
void sgl_scale_set_alpha(sgl_obj_t *obj, uint8_t alpha);

#ifdef __cplusplus
}
#endif

#endif
