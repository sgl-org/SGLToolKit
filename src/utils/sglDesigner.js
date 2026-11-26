/**
 * SGL UI 设计器 —— 组件定义、默认值与 C 代码生成
 */

export const FONT_OPTIONS = [
  { value: 'consolas14', label: 'Consolas 14' },
  { value: 'consolas23', label: 'Consolas 23' },
  { value: 'consolas24', label: 'Consolas 24' },
  { value: 'consolas32', label: 'Consolas 32' },
  { value: 'song23', label: 'Song 23' },
]

export const ALIGN_OPTIONS = [
  { value: 'left', label: '左对齐' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '右对齐' },
]

const ALIGN_MAP = {
  left: 'SGL_ALIGN_LEFT_MID',
  center: 'SGL_ALIGN_CENTER',
  right: 'SGL_ALIGN_RIGHT_MID',
}

export const SCREEN_PRESETS = [
  { label: '800 × 480', width: 800, height: 480 },
  { label: '1024 × 600', width: 1024, height: 600 },
  { label: '480 × 320', width: 480, height: 320 },
  { label: '480 × 272', width: 480, height: 272 },
  { label: '320 × 240', width: 320, height: 240 },
  { label: '240 × 240', width: 240, height: 240 },
]

const numberField = (key, label, min, max) => ({ key, label, type: 'number', min, max })
const colorField = (key, label, allowEmpty = false) => ({ key, label, type: 'color', allowEmpty })
const textField = (key, label) => ({ key, label, type: 'text' })
const boolField = (key, label) => ({ key, label, type: 'checkbox' })
const selectField = (key, label, options) => ({ key, label, type: 'select', options })

export const WIDGET_DEFS = {
  label: {
    name: '标签',
    hint: '文本',
    defaultSize: { w: 180, h: 32 },
    defaults: {
      text: 'Label',
      font: 'consolas24',
      textColor: '#ffffff',
      bgColor: '',
      align: 'left',
      radius: 4,
      iconFontFile: '',
      iconFontName: '',
      iconFontPath: '',
      iconCode: 0,
      iconSize: 24,
    },
    fields: [
      textField('text', '文本'),
      selectField('font', '字体', FONT_OPTIONS),
      colorField('textColor', '文字颜色'),
      colorField('bgColor', '背景色（留空透明）', true),
      selectField('align', '对齐', ALIGN_OPTIONS),
      numberField('radius', '圆角', 0, 64),
    ],
  },
  button: {
    name: '按钮',
    hint: '点击',
    defaultSize: { w: 140, h: 44 },
    defaults: {
      text: 'Button',
      font: 'consolas24',
      textColor: '#000000',
      color: '#e6e6e6',
      borderColor: '#000000',
      borderWidth: 2,
      radius: 8,
      alpha: 255,
    },
    fields: [
      textField('text', '文本'),
      selectField('font', '字体', FONT_OPTIONS),
      colorField('textColor', '文字颜色'),
      colorField('color', '背景颜色'),
      colorField('borderColor', '边框颜色'),
      numberField('borderWidth', '边框宽度', 0, 16),
      numberField('radius', '圆角', 0, 64),
      numberField('alpha', '透明度', 0, 255),
    ],
  },
  rect: {
    name: '矩形',
    hint: '面板',
    defaultSize: { w: 160, h: 100 },
    defaults: {
      color: '#2f6bff',
      radius: 8,
      borderWidth: 0,
      borderColor: '#ffffff',
      alpha: 255,
    },
    fields: [
      colorField('color', '填充颜色'),
      numberField('radius', '圆角', 0, 128),
      numberField('borderWidth', '边框宽度', 0, 16),
      colorField('borderColor', '边框颜色'),
      numberField('alpha', '透明度', 0, 255),
    ],
  },
  circle: {
    name: '圆形',
    hint: '圆',
    defaultSize: { w: 80, h: 80 },
    defaults: {
      color: '#ff6b3d',
      borderWidth: 0,
      borderColor: '#ffffff',
      alpha: 255,
    },
    fields: [
      colorField('color', '填充颜色'),
      numberField('borderWidth', '边框宽度', 0, 16),
      colorField('borderColor', '边框颜色'),
      numberField('alpha', '透明度', 0, 255),
    ],
  },
  line: {
    name: '直线',
    hint: '线',
    defaultSize: { w: 120, h: 0 },
    defaults: {
      color: '#ffffff',
      width: 2,
    },
    fields: [
      colorField('color', '线条颜色'),
      numberField('width', '线宽', 1, 16),
    ],
  },
  arc: {
    name: '圆弧',
    hint: '仪表',
    defaultSize: { w: 120, h: 120 },
    defaults: {
      color: '#5a86ff',
      bgColor: '#2a2f3a',
      startAngle: 0,
      endAngle: 270,
      mode: 'ring',
    },
    fields: [
      colorField('color', '进度颜色'),
      colorField('bgColor', '轨道颜色'),
      numberField('startAngle', '起始角度', 0, 360),
      numberField('endAngle', '结束角度', 0, 360),
      selectField('mode', '模式', [
        { value: 'ring', label: '圆环' },
        { value: 'normal', label: '实心' },
      ]),
    ],
  },
  slider: {
    name: '滑块',
    hint: '拖动',
    defaultSize: { w: 180, h: 32 },
    defaults: {
      fillColor: '#5a86ff',
      trackColor: '#3a3f4a',
      knobColor: '#ffffff',
      value: 50,
      thickness: 6,
      direct: 'horizontal',
      radius: 8,
    },
    fields: [
      numberField('value', '数值', 0, 100),
      colorField('fillColor', '填充颜色'),
      colorField('trackColor', '轨道颜色'),
      colorField('knobColor', '滑块颜色'),
      numberField('thickness', '轨道厚度', 1, 24),
      selectField('direct', '方向', [
        { value: 'horizontal', label: '水平' },
        { value: 'vertical', label: '垂直' },
      ]),
      numberField('radius', '圆角', 0, 64),
    ],
  },
  progress: {
    name: '进度条',
    hint: '进度',
    defaultSize: { w: 180, h: 20 },
    defaults: {
      trackColor: '#2f3542',
      fillColor: '#5a86ff',
      borderColor: '#3a404d',
      borderWidth: 1,
      radius: 6,
      value: 60,
    },
    fields: [
      numberField('value', '数值', 0, 100),
      colorField('trackColor', '轨道颜色'),
      colorField('fillColor', '填充颜色'),
      colorField('borderColor', '边框颜色'),
      numberField('borderWidth', '边框宽度', 0, 16),
      numberField('radius', '圆角', 0, 64),
    ],
  },
  bar: {
    name: '条形进度',
    hint: '条形',
    defaultSize: { w: 160, h: 16 },
    defaults: {
      fillColor: '#5a86ff',
      trackColor: '#2f3542',
      radius: 6,
      value: 55,
      direct: 'horizontal',
    },
    fields: [
      numberField('value', '数值', 0, 100),
      colorField('fillColor', '填充颜色'),
      colorField('trackColor', '轨道颜色'),
      numberField('radius', '圆角', 0, 64),
      selectField('direct', '方向', [
        { value: 'horizontal', label: '水平' },
        { value: 'vertical', label: '垂直' },
      ]),
    ],
  },
  switch: {
    name: '开关',
    hint: '开关',
    defaultSize: { w: 64, h: 32 },
    defaults: {
      color: '#5a86ff',
      bgColor: '#3a3f4a',
      knobColor: '#ffffff',
      status: true,
      radius: 16,
    },
    fields: [
      boolField('status', '开启'),
      colorField('color', '开启颜色'),
      colorField('bgColor', '关闭颜色'),
      colorField('knobColor', '滑块颜色'),
      numberField('radius', '圆角', 0, 64),
    ],
  },
  checkbox: {
    name: '复选框',
    hint: '勾选',
    defaultSize: { w: 160, h: 32 },
    defaults: {
      text: 'Checkbox',
      font: 'consolas23',
      textColor: '#ffffff',
      boxColor: '#5a86ff',
      checkColor: '#ffffff',
      status: true,
      radius: 4,
    },
    fields: [
      textField('text', '文本'),
      selectField('font', '字体', FONT_OPTIONS),
      colorField('textColor', '文字颜色'),
      colorField('boxColor', '选框颜色'),
      colorField('checkColor', '勾选颜色'),
      boolField('status', '勾选'),
      numberField('radius', '圆角', 0, 32),
    ],
  },
  led: {
    name: '指示灯',
    hint: 'LED',
    defaultSize: { w: 30, h: 30 },
    defaults: {
      onColor: '#00e676',
      offColor: '#1b3d24',
      bgColor: '#000000',
      status: true,
      alpha: 255,
    },
    fields: [
      boolField('status', '点亮'),
      colorField('onColor', '点亮颜色'),
      colorField('offColor', '熄灭颜色'),
      colorField('bgColor', '背景颜色'),
      numberField('alpha', '透明度', 0, 255),
    ],
  },
  textbox: {
    name: '文本框',
    hint: '输入',
    defaultSize: { w: 180, h: 36 },
    defaults: {
      text: 'Input text',
      font: 'consolas23',
      textColor: '#ffffff',
      bgColor: '#1f2430',
      borderColor: '#5a86ff',
      borderWidth: 1,
      radius: 6,
    },
    fields: [
      textField('text', '文本'),
      selectField('font', '字体', FONT_OPTIONS),
      colorField('textColor', '文字颜色'),
      colorField('bgColor', '背景颜色'),
      colorField('borderColor', '边框颜色'),
      numberField('borderWidth', '边框宽度', 0, 16),
      numberField('radius', '圆角', 0, 64),
    ],
  },
  qrcode: {
    name: '二维码',
    hint: 'QR',
    defaultSize: { w: 96, h: 96 },
    defaults: {
      text: 'https://github.com/sgl-org/sgl',
      version: 5,
      ecc: '2',
      bgColor: '#ffffff',
      cellColor: '#000000',
      zone: 2,
      scale: 2,
      alpha: 255,
    },
    fields: [
      textField('text', '内容'),
      numberField('version', '版本 (1-40)', 1, 40),
      selectField('ecc', '纠错等级', [
        { value: '0', label: 'L (7%)' },
        { value: '1', label: 'M (15%)' },
        { value: '2', label: 'Q (25%)' },
        { value: '3', label: 'H (30%)' },
      ]),
      colorField('bgColor', '背景颜色'),
      colorField('cellColor', '模块颜色'),
      numberField('zone', '静区', 0, 16),
      numberField('scale', '缩放', 1, 8),
      numberField('alpha', '透明度', 0, 255),
    ],
  },
  icon: {
    name: '图标',
    hint: '字体图标',
    defaultSize: { w: 32, h: 32 },
    defaults: {
      fontFile: '',
      fontName: '',
      fontPath: '',
      code: 0xe800,
      char: '',
      size: 24,
      color: '#ffffff',
    },
    fields: [
      numberField('size', '字号', 8, 128),
      colorField('color', '图标颜色'),
    ],
  },
}

export const PALETTE = [
  'label',
  'button',
  'rect',
  'circle',
  'line',
  'arc',
  'slider',
  'progress',
  'bar',
  'switch',
  'checkbox',
  'led',
  'textbox',
  'qrcode',
]

let idSeed = 1

export function createWidget(type, x, y, width, height) {
  const def = WIDGET_DEFS[type]
  const size = def.defaultSize
  const w = width ?? size.w
  const h = height ?? size.h
  return {
    id: `w${Date.now().toString(36)}${idSeed++}`,
    type,
    name: def.name,
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
    ...def.defaults,
  }
}

export function createProject() {
  return {
    version: 1,
    name: 'main_screen',
    width: 800,
    height: 480,
    bgColor: '#101118',
    widgets: [],
    fonts: [],
  }
}

/* ---------------- C 代码生成 ---------------- */

function hexToRgb(hex) {
  const fallback = { r: 255, g: 255, b: 255 }
  if (!hex || typeof hex !== 'string') return fallback
  let value = hex.trim().replace('#', '')
  if (value.length === 3) {
    value = value.split('').map((c) => c + c).join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return fallback
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

function cColor(hex) {
  const { r, g, b } = hexToRgb(hex)
  return `sgl_rgb(${r}, ${g}, ${b})`
}

function cString(text) {
  const escaped = String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
  return `"${escaped}"`
}

function utf8Bytes(text) {
  const bytes = []
  for (const ch of String(text ?? '')) {
    const code = ch.codePointAt(0)
    if (code <= 0x7f) bytes.push(code)
    else if (code <= 0x7ff) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    else if (code <= 0xffff) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
  }
  return bytes
}

/* 图标字形按 UTF-8 字节转义，避免 C 源文件编码问题 */
function cUtf8String(text) {
  const bytes = utf8Bytes(text)
  if (!bytes.length) return '""'
  return `"${bytes.map((b) => '\\x' + b.toString(16).padStart(2, '0')).join('')}"`
}

/* 图标本质上是一个使用图标字体的 Label 控件 */
export function isIconWidget(widget) {
  return !!widget && (
    widget.type === 'icon' ||
    (widget.type === 'label' && !!widget.iconFontFile)
  )
}

export function iconFontSize(widget) {
  const raw = widget?.type === 'icon' ? widget.size : (widget?.iconSize ?? widget?.size)
  const size = Number.parseInt(raw, 10)
  if (!Number.isFinite(size)) return 24
  return Math.min(128, Math.max(8, size))
}

export function iconFontSymbol(size) {
  return `designer_icons_${size}`
}

export function iconWidgetChar(widget) {
  if (!widget) return ''
  if (widget.type === 'icon') {
    return widget.char || (Number(widget.code) ? String.fromCodePoint(Number(widget.code)) : '')
  }
  return widget.text || (Number(widget.iconCode) ? String.fromCodePoint(Number(widget.iconCode)) : '')
}

export function iconWidgetColor(widget) {
  return widget.textColor || widget.color || '#ffffff'
}

function clampInt(value, min, max, fallback) {
  const num = Number.parseInt(value, 10)
  if (Number.isNaN(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

function emitIconLabel(lines, widget, v, x, y, w, h) {
  const size = iconFontSize(widget)
  const symbol = iconFontSymbol(size)
  lines.push(`    sgl_obj_t *${v} = sgl_label_create(root);`)
  lines.push(`    sgl_obj_set_pos(${v}, ${x}, ${y});`)
  lines.push(`    sgl_obj_set_size(${v}, ${w}, ${h});`)
  lines.push(`    sgl_label_set_font(${v}, &${symbol});`)
  lines.push(`    sgl_label_set_text(${v}, ${cUtf8String(iconWidgetChar(widget))});`)
  lines.push(`    sgl_label_set_text_color(${v}, ${cColor(iconWidgetColor(widget))});`)
  lines.push(`    sgl_label_set_text_align(${v}, ${ALIGN_MAP.center || 'SGL_ALIGN_CENTER'});`)
}

function emitWidget(lines, widget, index) {
  const def = WIDGET_DEFS[widget.type]
  if (!def) return
  const v = `obj${index + 1}`
  const x = Math.round(widget.x)
  const y = Math.round(widget.y)
  const w = Math.max(1, Math.round(widget.w))
  const h = Math.max(1, Math.round(widget.h))
  const comment = `    /* ${index + 1}. ${def.name}${widget.name ? ' : ' + widget.name : ''} */`

  lines.push(comment)
  switch (widget.type) {
    case 'label': {
      if (isIconWidget(widget)) {
        emitIconLabel(lines, widget, v, x, y, w, h)
        break
      }
      lines.push(`    sgl_obj_t *${v} = sgl_label_create(root);`)
      lines.push(`    sgl_obj_set_pos(${v}, ${x}, ${y});`)
      lines.push(`    sgl_obj_set_size(${v}, ${w}, ${h});`)
      lines.push(`    sgl_label_set_font(${v}, &${widget.font || 'consolas24'});`)
      lines.push(`    sgl_label_set_text(${v}, ${cString(widget.text)});`)
      lines.push(`    sgl_label_set_text_color(${v}, ${cColor(widget.textColor)});`)
      lines.push(`    sgl_label_set_text_align(${v}, ${ALIGN_MAP[widget.align] || 'SGL_ALIGN_LEFT_MID'});`)
      if (widget.bgColor) {
        lines.push(`    sgl_label_set_bg_color(${v}, ${cColor(widget.bgColor)});`)
        if (Number(widget.radius) > 0) {
          lines.push(`    sgl_label_set_radius(${v}, ${clampInt(widget.radius, 0, 255, 0)});`)
        }
      }
      break
    }
    case 'icon': {
      emitIconLabel(lines, widget, v, x, y, w, h)
      break
    }
    case 'button': {
      lines.push(`    sgl_obj_t *${v} = sgl_button_create(root);`)
      lines.push(`    sgl_obj_set_pos(${v}, ${x}, ${y});`)
      lines.push(`    sgl_obj_set_size(${v}, ${w}, ${h});`)
      lines.push(`    sgl_button_set_font(${v}, &${widget.font || 'consolas24'});`)
      lines.push(`    sgl_button_set_text(${v}, ${cString(widget.text)});`)
      lines.push(`    sgl_button_set_text_color(${v}, ${cColor(widget.textColor)});`)
      lines.push(`    sgl_button_set_color(${v}, ${cColor(widget.color)});`)
      if (Number(widget.borderWidth) > 0) {
        lines.push(`    sgl_button_set_border_width(${v}, ${clampInt(widget.borderWidth, 0, 255, 0)});`)
        lines.push(`    sgl_button_set_border_color(${v}, ${cColor(widget.borderColor)});`)
      }
      if (Number(widget.radius) > 0) {
        lines.push(`    sgl_button_set_radius(${v}, ${clampInt(widget.radius, 0, 255, 0)});`)
      }
      lines.push(`    sgl_button_set_alpha(${v}, ${clampInt(widget.alpha, 0, 255, 255)});`)
      break
    }
    case 'rect': {
      lines.push(`    sgl_obj_t *${v} = sgl_rect_create(root);`)
      lines.push(`    sgl_obj_set_pos(${v}, ${x}, ${y});`)
      lines.push(`    sgl_obj_set_size(${v}, ${w}, ${h});`)
      lines.push(`    sgl_rect_set_color(${v}, ${cColor(widget.color)});`)
      if (Number(widget.radius) > 0) {
        lines.push(`    sgl_rect_set_radius(${v}, ${clampInt(widget.radius, 0, 65535, 0)});`)
      }
      if (Number(widget.borderWidth) > 0) {
        lines.push(`    sgl_rect_set_border_width(${v}, ${clampInt(widget.borderWidth, 0, 255, 0)});`)
        lines.push(`    sgl_rect_set_border_color(${v}, ${cColor(widget.borderColor)});`)
      }
      lines.push(`    sgl_rect_set_main_alpha(${v}, ${clampInt(widget.alpha, 0, 255, 255)});`)
      break
    }
    case 'circle': {
      lines.push(`    sgl_obj_t *${v} = sgl_circle_create(root);`)
      lines.push(`    sgl_obj_set_pos(${v}, ${x}, ${y});`)
      lines.push(`    sgl_obj_set_size(${v}, ${w}, ${h});`)
      lines.push(`    sgl_circle_set_color(${v}, ${cColor(widget.color)});`)
      if (Number(widget.borderWidth) > 0) {
        lines.push(`    sgl_circle_set_border_width(${v}, ${clampInt(widget.borderWidth, 0, 255, 0)});`)
        lines.push(`    sgl_circle_set_border_color(${v}, ${cColor(widget.borderColor)});`)
      }
      lines.push(`    sgl_circle_set_alpha(${v}, ${clampInt(widget.alpha, 0, 255, 255)});`)
      break
    }
    case 'line': {
      lines.push(`    sgl_obj_t *${v} = sgl_line_create(root);`)
      lines.push(`    sgl_line_set_pos(${v}, ${x}, ${y}, ${x + w}, ${y + h});`)
      lines.push(`    sgl_line_set_width(${v}, ${clampInt(widget.width, 1, 255, 2)});`)
      lines.push(`    sgl_line_set_color(${v}, ${cColor(widget.color)});`)
      break
    }
    case 'arc': {
      const min = Math.min(w, h)
      const outer = Math.max(4, Math.round(min / 2) - 2)
      const inner = Math.max(1, outer - Math.max(6, Math.round(min * 0.16)))
      lines.push(`    sgl_obj_t *${v} = sgl_arc_create(root);`)
      lines.push(`    sgl_obj_set_pos(${v}, ${x}, ${y});`)
      lines.push(`    sgl_obj_set_size(${v}, ${w}, ${h});`)
      lines.push(`    sgl_arc_set_radius(${v}, ${inner}, ${outer});`)
      lines.push(`    sgl_arc_set_color(${v}, ${cColor(widget.color)});`)
      lines.push(`    sgl_arc_set_bg_color(${v}, ${cColor(widget.bgColor)});`)
      lines.push(`    sgl_arc_set_start_angle(${v}, ${clampInt(widget.startAngle, 0, 360, 0)});`)
      lines.push(`    sgl_arc_set_end_angle(${v}, ${clampInt(widget.endAngle, 0, 360, 270)});`)
      lines.push(`    sgl_arc_set_mode(${v}, ${widget.mode === 'normal' ? 'SGL_ARC_MODE_NORMAL' : 'SGL_ARC_MODE_RING'});`)
      break
    }
    case 'slider': {
      lines.push(`    sgl_obj_t *${v} = sgl_slider_create(root);`)
      lines.push(`    sgl_obj_set_pos(${v}, ${x}, ${y});`)
      lines.push(`    sgl_obj_set_size(${v}, ${w}, ${h});`)
      lines.push(`    sgl_slider_set_value(${v}, ${clampInt(widget.value, 0, 100, 50)});`)
      lines.push(`    sgl_slider_set_fill_color(${v}, ${cColor(widget.fillColor)});`)
      lines.push(`    sgl_slider_set_track_color(${v}, ${cColor(widget.trackColor)});`)
      lines.push(`    sgl_slider_set_knob_color(${v}, ${cColor(widget.knobColor)});`)
      lines.push(`    sgl_slider_set_thickness(${v}, ${clampInt(widget.thickness, 1, 255, 6)});`)
      lines.push(`    sgl_slider_set_direct(${v}, ${widget.direct === 'vertical' ? 'SGL_DIRECT_VERTICAL' : 'SGL_DIRECT_HORIZONTAL'});`)
      if (Number(widget.radius) > 0) {
        lines.push(`    sgl_slider_set_radius(${v}, ${clampInt(widget.radius, 0, 255, 0)});`)
      }
      break
    }
    case 'progress': {
      lines.push(`    sgl_obj_t *${v} = sgl_progress_create(root);`)
      lines.push(`    sgl_obj_set_pos(${v}, ${x}, ${y});`)
      lines.push(`    sgl_obj_set_size(${v}, ${w}, ${h});`)
      lines.push(`    sgl_progress_set_value(${v}, ${clampInt(widget.value, 0, 100, 60)});`)
      lines.push(`    sgl_progress_set_track_color(${v}, ${cColor(widget.trackColor)});`)
      lines.push(`    sgl_progress_set_fill_color(${v}, ${cColor(widget.fillColor)});`)
      if (Number(widget.borderWidth) > 0) {
        lines.push(`    sgl_progress_set_border_width(${v}, ${clampInt(widget.borderWidth, 0, 255, 0)});`)
        lines.push(`    sgl_progress_set_border_color(${v}, ${cColor(widget.borderColor)});`)
      }
      if (Number(widget.radius) > 0) {
        lines.push(`    sgl_progress_set_radius(${v}, ${clampInt(widget.radius, 0, 255, 0)});`)
      }
      break
    }
    case 'bar': {
      lines.push(`    sgl_obj_t *${v} = sgl_bar_create(root);`)
      lines.push(`    sgl_obj_set_pos(${v}, ${x}, ${y});`)
      lines.push(`    sgl_obj_set_size(${v}, ${w}, ${h});`)
      lines.push(`    sgl_bar_set_value(${v}, ${clampInt(widget.value, 0, 100, 55)});`)
      lines.push(`    sgl_bar_set_fill_color(${v}, ${cColor(widget.fillColor)});`)
      lines.push(`    sgl_bar_set_track_color(${v}, ${cColor(widget.trackColor)});`)
      lines.push(`    sgl_bar_set_direct(${v}, ${widget.direct === 'vertical' ? 'SGL_DIRECT_VERTICAL' : 'SGL_DIRECT_HORIZONTAL'});`)
      if (Number(widget.radius) > 0) {
        lines.push(`    sgl_bar_set_radius(${v}, ${clampInt(widget.radius, 0, 255, 0)});`)
      }
      break
    }
    case 'switch': {
      lines.push(`    sgl_obj_t *${v} = sgl_switch_create(root);`)
      lines.push(`    sgl_obj_set_pos(${v}, ${x}, ${y});`)
      lines.push(`    sgl_obj_set_size(${v}, ${w}, ${h});`)
      lines.push(`    sgl_switch_set_status(${v}, ${widget.status ? 'true' : 'false'});`)
      lines.push(`    sgl_switch_set_color(${v}, ${cColor(widget.color)});`)
      lines.push(`    sgl_switch_set_bg_color(${v}, ${cColor(widget.bgColor)});`)
      lines.push(`    sgl_switch_set_knob_color(${v}, ${cColor(widget.knobColor)});`)
      if (Number(widget.radius) > 0) {
        lines.push(`    sgl_switch_set_radius(${v}, ${clampInt(widget.radius, 0, 65535, 0)});`)
      }
      break
    }
    case 'checkbox': {
      lines.push(`    sgl_obj_t *${v} = sgl_checkbox_create(root);`)
      lines.push(`    sgl_obj_set_pos(${v}, ${x}, ${y});`)
      lines.push(`    sgl_obj_set_size(${v}, ${w}, ${h});`)
      lines.push(`    sgl_checkbox_set_font(${v}, &${widget.font || 'consolas23'});`)
      lines.push(`    sgl_checkbox_set_text(${v}, ${cString(widget.text)});`)
      lines.push(`    sgl_checkbox_set_text_color(${v}, ${cColor(widget.textColor)});`)
      lines.push(`    sgl_checkbox_set_box_color(${v}, ${cColor(widget.boxColor)});`)
      lines.push(`    sgl_checkbox_set_check_color(${v}, ${cColor(widget.checkColor)});`)
      lines.push(`    sgl_checkbox_set_status(${v}, ${widget.status ? 'true' : 'false'});`)
      if (Number(widget.radius) > 0) {
        lines.push(`    sgl_checkbox_set_radius(${v}, ${clampInt(widget.radius, 0, 255, 0)});`)
      }
      break
    }
    case 'led': {
      lines.push(`    sgl_obj_t *${v} = sgl_led_create(root);`)
      lines.push(`    sgl_obj_set_pos(${v}, ${x}, ${y});`)
      lines.push(`    sgl_obj_set_size(${v}, ${w}, ${h});`)
      lines.push(`    sgl_led_set_on_color(${v}, ${cColor(widget.onColor)});`)
      lines.push(`    sgl_led_set_off_color(${v}, ${cColor(widget.offColor)});`)
      lines.push(`    sgl_led_set_bg_color(${v}, ${cColor(widget.bgColor)});`)
      lines.push(`    sgl_led_set_status(${v}, ${widget.status ? 'true' : 'false'});`)
      lines.push(`    sgl_led_set_alpha(${v}, ${clampInt(widget.alpha, 0, 255, 255)});`)
      break
    }
    case 'textbox': {
      lines.push(`    sgl_obj_t *${v} = sgl_textbox_create(root);`)
      lines.push(`    sgl_obj_set_pos(${v}, ${x}, ${y});`)
      lines.push(`    sgl_obj_set_size(${v}, ${w}, ${h});`)
      lines.push(`    sgl_textbox_set_text_font(${v}, &${widget.font || 'consolas23'});`)
      lines.push(`    sgl_textbox_set_text(${v}, ${cString(widget.text)});`)
      lines.push(`    sgl_textbox_set_text_color(${v}, ${cColor(widget.textColor)});`)
      lines.push(`    sgl_textbox_set_bg_color(${v}, ${cColor(widget.bgColor)});`)
      if (Number(widget.borderWidth) > 0) {
        lines.push(`    sgl_textbox_set_border_width(${v}, ${clampInt(widget.borderWidth, 0, 255, 0)});`)
        lines.push(`    sgl_textbox_set_border_color(${v}, ${cColor(widget.borderColor)});`)
      }
      if (Number(widget.radius) > 0) {
        lines.push(`    sgl_textbox_set_radius(${v}, ${clampInt(widget.radius, 0, 255, 0)});`)
      }
      break
    }
    case 'qrcode': {
      lines.push(`    sgl_obj_t *${v} = sgl_qrcode_create(root);`)
      lines.push(`    sgl_obj_set_pos(${v}, ${x}, ${y});`)
      lines.push(`    sgl_obj_set_size(${v}, ${w}, ${h});`)
      lines.push(`    sgl_qrcode_set_version(${v}, ${clampInt(widget.version, 1, 40, 5)});`)
      lines.push(`    sgl_qrcode_set_ecc(${v}, ${clampInt(widget.ecc, 0, 3, 2)});`)
      lines.push(`    sgl_qrcode_set_text(${v}, ${cString(widget.text)});`)
      lines.push(`    sgl_qrcode_set_bg_color(${v}, ${cColor(widget.bgColor)});`)
      lines.push(`    sgl_qrcode_set_cell_color(${v}, ${cColor(widget.cellColor)});`)
      lines.push(`    sgl_qrcode_set_zone(${v}, ${clampInt(widget.zone, 0, 255, 2)});`)
      lines.push(`    sgl_qrcode_set_scale(${v}, ${clampInt(widget.scale, 1, 255, 2)});`)
      lines.push(`    sgl_qrcode_set_alpha(${v}, ${clampInt(widget.alpha, 0, 255, 255)});`)
      break
    }
    default:
      break
  }
  lines.push('')
}

export function generateC(project) {
  const lines = []
  lines.push('/*')
  lines.push(' * Auto-generated by SGLToolKit UI Designer')
  lines.push(` * Project : ${project.name || 'main_screen'}`)
  lines.push(` * Screen  : ${project.width} x ${project.height}`)
  lines.push(' */')
  lines.push('')
  lines.push('#include <sgl.h>')
  lines.push('')

  const visibleWidgets = project.widgets.filter((widget) => !widget.hidden)
  const iconSizes = [...new Set(
    visibleWidgets.filter((widget) => isIconWidget(widget)).map((widget) => iconFontSize(widget)),
  )].sort((a, b) => a - b)
  if (iconSizes.length) {
    lines.push('/* 图标字体：相同字号的图标已合并生成 */')
    iconSizes.forEach((size) => {
      lines.push(`extern const sgl_font_t ${iconFontSymbol(size)};`)
    })
    lines.push('')
  }

  const uiFonts = collectUiFontGroups(project)
  if (uiFonts.length) {
    lines.push('/* 本地字体：仅转换界面中实际出现的字符 */')
    uiFonts.forEach((font) => {
      lines.push(`extern const sgl_font_t ${font.symbol};`)
    })
    lines.push('')
  }

  lines.push('void sgl_designer_ui_create(sgl_obj_t *parent)')
  lines.push('{')
  lines.push('    sgl_obj_t *root = parent ? parent : sgl_screen_act();')
  lines.push('')
  lines.push('    if (parent == NULL) {')
  lines.push(`        sgl_page_set_color(root, ${cColor(project.bgColor || '#101118')});`)
  lines.push('    }')
  lines.push('')
  visibleWidgets.forEach((widget, index) => emitWidget(lines, widget, index))
  if (visibleWidgets.length === 0) {
    lines.push('    /* 画布还是空的，从左侧拖入组件开始设计 */')
    lines.push('')
  }
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}

/**
 * 收集图标组件，按字号合并，供后端调用 sgl_font_conv 生成字体文件。
 * resolvePath 用于把组件里的字体文件名解析成当前释放出的绝对路径。
 */
export function collectIconGroups(project, resolvePath) {
  const groups = new Map()
  project.widgets
    .filter((widget) => isIconWidget(widget) && !widget.hidden)
    .forEach((widget) => {
      const path = resolvePath ? resolvePath(widget) : (widget.iconFontPath || widget.fontPath)
      let code = Number(widget.type === 'icon' ? widget.code : widget.iconCode)
      if (!Number.isFinite(code)) {
        const char = iconWidgetChar(widget)
        if (char) code = String(char).codePointAt(0)
      }
      if (!path || !Number.isFinite(code)) return
      const size = iconFontSize(widget)
      if (!groups.has(size)) groups.set(size, { size, bpp: 4, sources: new Map() })
      const group = groups.get(size)
      if (!group.sources.has(path)) group.sources.set(path, new Set())
      group.sources.get(path).add(code)
    })

  return [...groups.values()]
    .map((group) => ({
      size: group.size,
      bpp: group.bpp,
      sources: [...group.sources.entries()].map(([path, codes]) => ({
        path,
        codes: [...codes].sort((a, b) => a - b),
      })),
    }))
    .filter((group) => group.sources.length > 0)
}

const TEXT_WIDGET_TYPES = new Set(['label', 'button', 'checkbox', 'textbox'])

/**
 * 收集界面中实际使用的本地系统字体及其字符。
 * 仅供后端按字符子集转换，不会转换所有字体或全部字形。
 */
export function collectUiFontGroups(project) {
  const fonts = Array.isArray(project.fonts) ? project.fonts : []
  if (!fonts.length) return []
  const bySymbol = new Map()
  project.widgets
    .filter((widget) => !widget.hidden && TEXT_WIDGET_TYPES.has(widget.type) && !isIconWidget(widget))
    .forEach((widget) => {
      const font = fonts.find((item) => item.symbol === widget.font)
      if (!font || !font.path) return
      if (!bySymbol.has(font.symbol)) {
        bySymbol.set(font.symbol, {
          symbol: font.symbol,
          path: font.path,
          size: Math.max(8, Math.min(128, Number(font.size) || 24)),
          chars: new Set([0x20]),
        })
      }
      const group = bySymbol.get(font.symbol)
      for (const char of Array.from(String(widget.text || ''))) {
        const code = char.codePointAt(0)
        if (Number.isFinite(code) && code >= 0x20) group.chars.add(code)
      }
    })
  return [...bySymbol.values()].map((group) => ({
    ...group,
    chars: [...group.chars].sort((a, b) => a - b),
  }))
}
