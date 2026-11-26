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

#include <string.h>
#include "sgl_scale.h"

static int32_t scale_value_at(const sgl_scale_t *scale, uint16_t index)
{
    int64_t range = (int64_t)scale->max_value - scale->min_value;
    int64_t offset = range * index / (scale->total_tick_count - 1);
    return (int32_t)((int64_t)scale->min_value + offset);
}

static uint16_t scale_span(const sgl_scale_t *scale)
{
    int32_t span = (int32_t)scale->angle_end - scale->angle_start;

    if (span == 0) {
        return 360;
    }
    if (span < 0) {
        span %= 360;
        if (span < 0) {
            span += 360;
        }
    }
    if (span == 0) {
        return 360;
    }
    if (span > 360) {
        span = 360;
    }
    return (uint16_t)span;
}

static void scale_draw_line(sgl_surf_t *surf, sgl_area_t *clip,
                            int32_t x1, int32_t y1, int32_t x2, int32_t y2,
                            uint8_t width, sgl_color_t color, uint8_t alpha)
{
    if (width == 0) {
        return;
    }
    sgl_draw_line_fill_slanted(surf, clip, (int16_t)x1, (int16_t)y1,
                               (int16_t)x2, (int16_t)y2, width, color, alpha);
}

static void scale_draw_label(sgl_surf_t *surf, sgl_scale_t *scale,
                             int32_t value, int32_t x, int32_t y)
{
    char text[16];
    int16_t width;
    int16_t height;

    if (!scale->labels_enabled || scale->font == NULL) {
        return;
    }

    sgl_sprintf(text, "%d", value);
    width = sgl_font_get_string_width(text, scale->font);
    height = sgl_font_get_height(scale->font);
    sgl_draw_string(surf, &scale->obj.area, (int16_t)(x - width / 2),
                    (int16_t)(y - height / 2), text, scale->label_color,
                    scale->alpha, scale->font);
}

static int32_t scale_get_max_label_width(const sgl_scale_t *scale)
{
    char text[16];
    int32_t width;

    if (!scale->labels_enabled || scale->font == NULL) {
        return 0;
    }

    sgl_sprintf(text, "%d", scale->min_value);
    width = sgl_font_get_string_width(text, scale->font);
    sgl_sprintf(text, "%d", scale->max_value);
    return sgl_max(width, sgl_font_get_string_width(text, scale->font));
}

static bool scale_is_major(const sgl_scale_t *scale, uint16_t index)
{
    return (index % scale->major_tick_every) == 0 ||
           index == scale->total_tick_count - 1;
}

static bool scale_show_label(const sgl_scale_t *scale, uint16_t index)
{
    uint16_t major_index = index / scale->major_tick_every;

    if (index == scale->total_tick_count - 1 &&
        (index % scale->major_tick_every) != 0) {
        major_index++;
    }

    if (!scale->labels_enabled || scale->font == NULL ||
        !scale_is_major(scale, index) ||
        (major_index % scale->label_interval) != 0) {
        return false;
    }
    if (scale->mode == SGL_SCALE_MODE_CIRCULAR &&
        scale_span(scale) == 360 &&
        index == scale->total_tick_count - 1) {
        return false;
    }
    return true;
}

static void scale_draw_horizontal(sgl_surf_t *surf, sgl_scale_t *scale)
{
    sgl_obj_t *obj = &scale->obj;
    int32_t label_width = scale_get_max_label_width(scale);
    int32_t x1 = obj->coords.x1 + 4 + label_width / 2;
    int32_t x2 = obj->coords.x2 - 4 - label_width / 2;
    int32_t label_height = scale->labels_enabled && scale->font != NULL ?
                           sgl_font_get_height(scale->font) : 0;
    int32_t axis_y = obj->coords.y2 - label_height - 5;

    if (x2 <= x1 || axis_y < obj->coords.y1) {
        return;
    }

    for (uint16_t i = 0; i < scale->total_tick_count; i++) {
        bool major = scale_is_major(scale, i);
        int32_t x = x1 + (int32_t)(((int64_t)(x2 - x1) * i) /
                                   (scale->total_tick_count - 1));
        uint8_t length = major ? scale->major_length : scale->minor_length;
        uint8_t width = major ? scale->major_width : scale->minor_width;
        sgl_color_t color = major ? scale->major_color : scale->minor_color;
        int32_t axis_overlap = scale->axis_width > 0 ?
                               sgl_max(0, (int32_t)width - scale->axis_width) : 0;

        scale_draw_line(surf, &obj->area, x, axis_y - axis_overlap,
                        x, axis_y - length,
                        width, color, scale->alpha);
        if (scale_show_label(scale, i)) {
            scale_draw_label(surf, scale, scale_value_at(scale, i),
                             x, axis_y + 3 + label_height / 2);
        }
    }

    scale_draw_line(surf, &obj->area, x1, axis_y, x2, axis_y,
                    scale->axis_width, scale->axis_color, scale->alpha);
}

static void scale_draw_vertical(sgl_surf_t *surf, sgl_scale_t *scale)
{
    sgl_obj_t *obj = &scale->obj;
    int32_t label_width = 0;
    int32_t axis_x;
    int32_t y1;
    int32_t y2;
    char text[16];
    int32_t label_height = scale->labels_enabled && scale->font != NULL ?
                           sgl_font_get_height(scale->font) : 0;

    label_width = scale_get_max_label_width(scale);
    axis_x = obj->coords.x1 + label_width + scale->major_length + 5;
    y1 = obj->coords.y1 + 4 + label_height / 2;
    y2 = obj->coords.y2 - 4 - label_height / 2;

    if (axis_x > obj->coords.x2 || y2 <= y1) {
        return;
    }

    for (uint16_t i = 0; i < scale->total_tick_count; i++) {
        bool major = scale_is_major(scale, i);
        int32_t y = y2 - (int32_t)(((int64_t)(y2 - y1) * i) /
                                   (scale->total_tick_count - 1));
        uint8_t length = major ? scale->major_length : scale->minor_length;
        uint8_t width = major ? scale->major_width : scale->minor_width;
        sgl_color_t color = major ? scale->major_color : scale->minor_color;
        int32_t axis_overlap = scale->axis_width > 0 ?
                               sgl_max(0, (int32_t)width - scale->axis_width) : 0;

        scale_draw_line(surf, &obj->area, axis_x - axis_overlap, y,
                        axis_x - length, y,
                        width, color, scale->alpha);
        if (scale_show_label(scale, i)) {
            int32_t value = scale_value_at(scale, i);
            sgl_sprintf(text, "%d", value);
            int16_t text_width = sgl_font_get_string_width(text, scale->font);
            int16_t text_height = sgl_font_get_height(scale->font);
            sgl_draw_string(surf, &obj->area,
                            (int16_t)(axis_x - scale->major_length - 4 - text_width),
                            (int16_t)(y - text_height / 2), text,
                            scale->label_color, scale->alpha, scale->font);
        }
    }

    scale_draw_line(surf, &obj->area, axis_x, y1, axis_x, y2,
                    scale->axis_width, scale->axis_color, scale->alpha);
}

static void scale_draw_circular(sgl_surf_t *surf, sgl_scale_t *scale)
{
    sgl_obj_t *obj = &scale->obj;
    int32_t cx = ((int32_t)obj->coords.x1 + obj->coords.x2) / 2;
    int32_t cy = ((int32_t)obj->coords.y1 + obj->coords.y2) / 2;
    int32_t radius = sgl_min(obj->coords.x2 - obj->coords.x1,
                             obj->coords.y2 - obj->coords.y1) / 2 - 2;
    int32_t label_height = scale->labels_enabled && scale->font != NULL ?
                           sgl_font_get_height(scale->font) : 0;
    uint16_t span = scale_span(scale);
    uint8_t axis_width = 0;

    if (radius <= 0) {
        return;
    }

    if (scale->axis_width > 0 && radius > 1) {
        axis_width = (uint8_t)sgl_min(scale->axis_width, radius - 1);
    }

    for (uint16_t i = 0; i < scale->total_tick_count; i++) {
        bool major = scale_is_major(scale, i);
        int16_t angle = sgl_mod360((int16_t)(sgl_mod360(scale->angle_start) +
                         ((uint32_t)span * i) / (scale->total_tick_count - 1)));
        int32_t sin_val = sgl_sin(angle);
        int32_t cos_val = sgl_cos(angle);
        uint8_t length = major ? scale->major_length : scale->minor_length;
        uint8_t width = major ? scale->major_width : scale->minor_width;
        sgl_color_t color = major ? scale->major_color : scale->minor_color;
        int32_t outer_radius = radius - sgl_max(axis_width, width);
        int32_t x_outer = cx + (outer_radius * sin_val) / SGL_SIN_FIXED_ONE;
        int32_t y_outer = cy - (outer_radius * cos_val) / SGL_SIN_FIXED_ONE;
        int32_t inner_radius = outer_radius - length;
        int32_t x_inner = cx + (inner_radius * sin_val) / SGL_SIN_FIXED_ONE;
        int32_t y_inner = cy - (inner_radius * cos_val) / SGL_SIN_FIXED_ONE;

        /* SDF line rasterization antialiases the radial tick edges. */
        scale_draw_line(surf, &obj->area, x_outer, y_outer, x_inner, y_inner,
                        width, color, scale->alpha);
        if (scale_show_label(scale, i)) {
            int32_t text_radius = inner_radius - label_height / 2 - 3;
            int32_t text_x = cx + (text_radius * sin_val) / SGL_SIN_FIXED_ONE;
            int32_t text_y = cy - (text_radius * cos_val) / SGL_SIN_FIXED_ONE;
            scale_draw_label(surf, scale, scale_value_at(scale, i),
                             text_x, text_y);
        }
    }

    if (axis_width > 0) {
        if (span == 360) {
            sgl_draw_fill_ring(surf, &obj->area, (int16_t)cx, (int16_t)cy,
                               (int16_t)(radius - axis_width), (int16_t)radius,
                               scale->axis_color, scale->alpha);
        } else {
            sgl_draw_arc_t axis = {
                .alpha = scale->alpha,
                .color = scale->axis_color,
                .cx = (int16_t)cx,
                .cy = (int16_t)cy,
                .radius_in = (int16_t)(radius - axis_width),
                .radius_out = (int16_t)radius,
                .mode = SGL_ARC_MODE_NORMAL,
            };
            axis.start_angle = sgl_mod360(scale->angle_start);
            axis.end_angle = sgl_mod360((int16_t)(axis.start_angle + span));
            sgl_draw_fill_arc(surf, &obj->area, &axis);
        }
    }
}

static void sgl_scale_construct_cb(sgl_surf_t *surf, sgl_obj_t *obj, sgl_event_t *evt)
{
    sgl_scale_t *scale = sgl_container_of(obj, sgl_scale_t, obj);

    if (evt->type != SGL_EVENT_DRAW_MAIN) {
        return;
    }
    switch (scale->mode) {
    case SGL_SCALE_MODE_HORIZONTAL:
        scale_draw_horizontal(surf, scale);
        break;
    case SGL_SCALE_MODE_VERTICAL:
        scale_draw_vertical(surf, scale);
        break;
    case SGL_SCALE_MODE_CIRCULAR:
        scale_draw_circular(surf, scale);
        break;
    default:
        break;
    }
}

sgl_obj_t *sgl_scale_create(sgl_obj_t *parent)
{
    sgl_scale_t *scale = sgl_malloc(sizeof(sgl_scale_t));
    if (scale == NULL) {
        SGL_LOG_ERROR("sgl_scale_create: malloc failed");
        return NULL;
    }

    memset(scale, 0, sizeof(sgl_scale_t));
    sgl_obj_init(&scale->obj, parent);
    scale->obj.construct_fn = sgl_scale_construct_cb;
    scale->min_value = 0;
    scale->max_value = 100;
    scale->total_tick_count = 11;
    scale->major_tick_every = 2;
    scale->label_interval = 1;
    scale->angle_start = 135;
    scale->angle_end = 405;
    scale->major_color = SGL_SCALE_COLOR;
    scale->minor_color = SGL_SCALE_COLOR;
    scale->label_color = SGL_SCALE_COLOR;
    scale->axis_color = SGL_SCALE_COLOR;
    scale->font = NULL;
    scale->mode = SGL_SCALE_MODE_HORIZONTAL;
    scale->major_length = 12;
    scale->minor_length = 6;
    scale->major_width = 2;
    scale->minor_width = 1;
    scale->axis_width = 1;
    scale->alpha = SGL_SCALE_ALPHA;
    scale->labels_enabled = 1;
    return &scale->obj;
}

void sgl_scale_set_mode(sgl_obj_t *obj, sgl_scale_mode_t mode)
{
    sgl_scale_t *scale = sgl_container_of(obj, sgl_scale_t, obj);

    if ((int)mode < (int)SGL_SCALE_MODE_HORIZONTAL ||
        (int)mode > (int)SGL_SCALE_MODE_CIRCULAR) {
        SGL_LOG_ERROR("sgl_scale_set_mode: invalid mode %d", mode);
        return;
    }
    scale->mode = (uint8_t)mode;
    sgl_obj_set_dirty(obj);
}

void sgl_scale_set_range(sgl_obj_t *obj, int32_t min_value, int32_t max_value)
{
    sgl_scale_t *scale = sgl_container_of(obj, sgl_scale_t, obj);

    if (min_value == max_value) {
        SGL_LOG_ERROR("sgl_scale_set_range: min and max must differ");
        return;
    }
    scale->min_value = min_value;
    scale->max_value = max_value;
    sgl_obj_set_dirty(obj);
}

void sgl_scale_set_total_tick_count(sgl_obj_t *obj, uint16_t count)
{
    sgl_scale_t *scale = sgl_container_of(obj, sgl_scale_t, obj);

    if (count < 2) {
        SGL_LOG_ERROR("sgl_scale_set_total_tick_count: count must be at least 2");
        return;
    }
    scale->total_tick_count = count;
    if (scale->major_tick_every > count) {
        scale->major_tick_every = count;
    }
    sgl_obj_set_dirty(obj);
}

void sgl_scale_set_major_tick_every(sgl_obj_t *obj, uint16_t every)
{
    sgl_scale_t *scale = sgl_container_of(obj, sgl_scale_t, obj);

    if (every == 0 || every > scale->total_tick_count) {
        SGL_LOG_ERROR("sgl_scale_set_major_tick_every: invalid interval %u", (unsigned)every);
        return;
    }
    scale->major_tick_every = every;
    sgl_obj_set_dirty(obj);
}

void sgl_scale_set_label_interval(sgl_obj_t *obj, uint16_t interval)
{
    sgl_scale_t *scale = sgl_container_of(obj, sgl_scale_t, obj);

    if (interval == 0) {
        SGL_LOG_ERROR("sgl_scale_set_label_interval: interval must be at least 1");
        return;
    }
    scale->label_interval = interval;
    sgl_obj_set_dirty(obj);
}

void sgl_scale_set_angle_range(sgl_obj_t *obj, int16_t start, int16_t end)
{
    sgl_scale_t *scale = sgl_container_of(obj, sgl_scale_t, obj);
    scale->angle_start = start;
    scale->angle_end = end;
    sgl_obj_set_dirty(obj);
}

void sgl_scale_set_major_tick_style(sgl_obj_t *obj, uint8_t length,
                                    uint8_t width, sgl_color_t color)
{
    sgl_scale_t *scale = sgl_container_of(obj, sgl_scale_t, obj);
    scale->major_length = length;
    scale->major_width = width;
    scale->major_color = color;
    sgl_obj_set_dirty(obj);
}

void sgl_scale_set_minor_tick_style(sgl_obj_t *obj, uint8_t length,
                                    uint8_t width, sgl_color_t color)
{
    sgl_scale_t *scale = sgl_container_of(obj, sgl_scale_t, obj);
    scale->minor_length = length;
    scale->minor_width = width;
    scale->minor_color = color;
    sgl_obj_set_dirty(obj);
}

void sgl_scale_set_axis_style(sgl_obj_t *obj, uint8_t width, sgl_color_t color)
{
    sgl_scale_t *scale = sgl_container_of(obj, sgl_scale_t, obj);
    scale->axis_width = width;
    scale->axis_color = color;
    sgl_obj_set_dirty(obj);
}

void sgl_scale_set_labels_enabled(sgl_obj_t *obj, uint8_t enabled)
{
    sgl_scale_t *scale = sgl_container_of(obj, sgl_scale_t, obj);
    scale->labels_enabled = (enabled != 0);
    sgl_obj_set_dirty(obj);
}

void sgl_scale_set_font(sgl_obj_t *obj, const sgl_font_t *font)
{
    sgl_scale_t *scale = sgl_container_of(obj, sgl_scale_t, obj);
    scale->font = font;
    sgl_obj_set_dirty(obj);
}

void sgl_scale_set_label_style(sgl_obj_t *obj, sgl_color_t color,
                               const sgl_font_t *font)
{
    sgl_scale_t *scale = sgl_container_of(obj, sgl_scale_t, obj);
    scale->label_color = color;
    scale->font = font;
    sgl_obj_set_dirty(obj);
}

void sgl_scale_set_alpha(sgl_obj_t *obj, uint8_t alpha)
{
    sgl_scale_t *scale = sgl_container_of(obj, sgl_scale_t, obj);
    scale->alpha = alpha;
    sgl_obj_set_dirty(obj);
}
