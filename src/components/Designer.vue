<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import {
  WIDGET_DEFS,
  PALETTE,
  FONT_OPTIONS,
  SCREEN_PRESETS,
  createWidget,
  createProject,
  generateC,
  collectIconGroups,
  collectUiFontGroups,
  isIconWidget,
  iconFontSize,
  iconWidgetChar,
  iconWidgetColor,
} from '../utils/sglDesigner'

const STORAGE_KEY = 'sglDesignerProject'
const GRID_STORAGE_KEY = 'sglDesignerGridSize'
const GRID_SNAP_STORAGE_KEY = 'sglDesignerGridSnap'
const BOTTOM_HEIGHT_STORAGE_KEY = 'sglDesignerBottomHeight'

const project = reactive(createProject())
const canvasRef = ref(null)
const viewportRef = ref(null)
const viewport = reactive({ w: 900, h: 600 })
const selectedId = ref(null)
const selectedIds = ref([])
const zoomMode = ref('fit')
const gridEnabled = ref(true)
const gridSnap = ref(true)
const gridSize = ref(16)
const activeTab = ref('inspect')
const bottomTab = ref('assets')
const bottomCollapsed = ref(false)
const bottomHeight = ref(150)
const bottomResizing = ref(false)
const menuOpen = ref('')
const mousePos = reactive({ x: 0, y: 0 })
const consoleLog = ref([])
const buildLogs = ref([])
const buildLogRef = ref(null)
const historySteps = ref(0)
const message = ref(null)
const busy = ref(false)
const screenPreset = ref('800x480')
const canUndo = ref(false)
const canRedo = ref(false)

/* 内置图标字体与图标库 */
const builtinFonts = ref([])
const iconFontFile = ref('')
const iconFontSearch = ref('')
const iconFontGlyphs = ref([])
const iconFontLoading = ref(false)
const iconGlyphLimit = ref(240)
const iconDefaultSize = ref(24)
const iconFontFamilies = reactive({})
const iconReplaceMode = ref(false)
const iconDragPayload = ref(null)
const iconFontPending = new Set()
const iconGlyphCache = new Map()

let messageTimer = null
let saveTimer = null
let historyTimer = null
let unlistenBuild = null
let disposed = false
let bottomResizeStart = null
let history = []
let historyIndex = -1
let dragState = null
let resizeObserver = null

const PRIMARY_WIDGETS = PALETTE.filter((type) => !['slider', 'progress', 'bar', 'arc'].includes(type))
const VISUAL_WIDGETS = ['slider', 'progress', 'bar', 'arc']

const generatedCode = computed(() => generateC(project))
const selectedWidget = computed(() => project.widgets.find((w) => w.id === selectedId.value) || null)

const fontOptions = computed(() => [
  ...FONT_OPTIONS,
  ...(project.fonts || []).map((font) => ({ value: font.symbol, label: `${font.name} ${font.size}px` })),
])

const systemFonts = ref([])
const systemFontsLoading = ref(false)
const systemFontsLoaded = ref(false)
const systemFontQuery = ref('')
const systemFontPick = ref('')
const systemFontSize = ref(24)
const filteredSystemFonts = computed(() => {
  const q = systemFontQuery.value.trim().toLowerCase()
  const list = q ? systemFonts.value.filter((font) => font.name.toLowerCase().includes(q)) : systemFonts.value
  return list.slice(0, 200)
})
const selectedDef = computed(() => (selectedWidget.value ? WIDGET_DEFS[selectedWidget.value.type] : null))
const layerList = computed(() => project.widgets.slice().reverse())
const selectedWidgets = computed(() => project.widgets.filter((widget) => selectedIds.value.includes(widget.id)))
const selectionCount = computed(() => selectedIds.value.length)
const hasGroupSelection = computed(() => selectedWidgets.value.some((widget) => !!widget.groupId))
const isIconSelection = computed(() => isIconWidget(selectedWidget.value))

const validationErrors = computed(() => {
  const list = []
  project.widgets.forEach((widget, index) => {
    const name = widget.name || `组件 ${index + 1}`
    if (widget.x + widget.w > project.width + 0.5 || widget.y + Math.max(1, widget.h) > project.height + 0.5) {
      list.push(`${name}：超出画布边界`)
    }
    if (widget.w < 1 || (widget.type !== 'line' && widget.h < 1)) {
      list.push(`${name}：尺寸无效`)
    }
    if (['label', 'button', 'textbox', 'checkbox'].includes(widget.type) && !isIconWidget(widget) && !String(widget.text || '').trim()) {
      list.push(`${name}：文本为空`)
    }
    if (['label', 'button'].includes(widget.type) && !isIconWidget(widget) && /[^\x00-\x7F]/.test(String(widget.text || ''))) {
      list.push(`${name}：包含非 ASCII 字符，内置点阵字体可能无法显示`)
    }
    if (isIconWidget(widget)) {
      if (!(widget.iconFontFile || widget.fontFile)) list.push(`${name}：未选择图标字体`)
      if (!iconWidgetChar(widget)) list.push(`${name}：未选择图标`)
    }
  })
  return list
})

const filteredIconGlyphs = computed(() => {
  const query = iconFontSearch.value.trim().toLowerCase()
  if (!query) return iconFontGlyphs.value
  return iconFontGlyphs.value.filter((glyph) => {
    const hex = glyph.code.toString(16)
    return glyph.name.toLowerCase().includes(query) || hex.includes(query) || `u+${hex}`.includes(query)
  })
})

const visibleIconGlyphs = computed(() => filteredIconGlyphs.value.slice(0, iconGlyphLimit.value))

const iconSizeOptions = Array.from({ length: 121 }, (_, index) => index + 8)

const fitScale = computed(() => {
  const vw = viewport.w - 32
  const vh = viewport.h - 64
  if (vw <= 0 || vh <= 0) return 1
  return Math.max(0.2, Math.min(vw / project.width, vh / project.height, 1.5))
})

const scale = computed(() => {
  if (zoomMode.value === 'fit') return fitScale.value
  const value = Number(zoomMode.value)
  return Number.isFinite(value) && value > 0 ? value : 1
})

const canvasStyle = computed(() => ({
  width: `${project.width}px`,
  height: `${project.height}px`,
  background: project.bgColor,
  transform: `scale(${scale.value})`,
}))

const stageStyle = computed(() => ({
  width: `${project.width * scale.value}px`,
  height: `${project.height * scale.value}px`,
}))

const commonFields = [
  { key: 'x', label: 'X', type: 'number', min: 0, max: 100000 },
  { key: 'y', label: 'Y', type: 'number', min: 0, max: 100000 },
  { key: 'w', label: '宽', type: 'number', min: 0, max: 100000 },
  { key: 'h', label: '高', type: 'number', min: 0, max: 100000 },
]

/* ---------------- 历史记录 ---------------- */

function snapshot() {
  return JSON.stringify(project)
}

function refreshHistoryFlags() {
  canUndo.value = historyIndex > 0
  canRedo.value = historyIndex >= 0 && historyIndex < history.length - 1
  historySteps.value = history.length
}

function pushHistory() {
  if (historyTimer) {
    clearTimeout(historyTimer)
    historyTimer = null
  }
  const snap = snapshot()
  if (historyIndex >= 0 && history[historyIndex] === snap) return
  history = history.slice(0, historyIndex + 1)
  history.push(snap)
  if (history.length > 80) history.shift()
  historyIndex = history.length - 1
  refreshHistoryFlags()
}

function scheduleHistory() {
  if (historyTimer) clearTimeout(historyTimer)
  historyTimer = setTimeout(pushHistory, 320)
}

function applySnapshot(text) {
  try {
    replaceProject(JSON.parse(text))
    selectedIds.value = selectedIds.value.filter((id) => project.widgets.some((w) => w.id === id))
    if (!selectedIds.value.includes(selectedId.value)) {
      selectedId.value = selectedIds.value[0] || null
    }
    refreshHistoryFlags()
  } catch (err) {
    console.error('恢复历史失败', err)
  }
}

function undo() {
  if (historyIndex <= 0) return
  historyIndex -= 1
  applySnapshot(history[historyIndex])
}

function redo() {
  if (historyIndex >= history.length - 1) return
  historyIndex += 1
  applySnapshot(history[historyIndex])
}

/* ---------------- 工程数据 ---------------- */

function normalizeProject(data) {
  const base = createProject()
  const next = {
    ...base,
    ...data,
    widgets: Array.isArray(data?.widgets)
      ? data.widgets
          .filter((w) => w && WIDGET_DEFS[w.type])
          .map((w) => {
            let source = w
            // 兼容旧工程：图标控件迁移为使用图标字体的 Label
            if (w.type === 'icon') {
              const char = w.char || (Number(w.code) ? String.fromCodePoint(Number(w.code)) : '')
              source = {
                ...w,
                type: 'label',
                text: char,
                textColor: w.color || w.textColor || '#ffffff',
                iconFontFile: w.fontFile || '',
                iconFontName: w.fontName || '',
                iconFontPath: w.fontPath || '',
                iconCode: Number(w.code) || (char ? char.codePointAt(0) : 0),
                iconSize: Number(w.size) || 24,
              }
            }
            const merged = { ...WIDGET_DEFS[source.type].defaults, ...source }
            if (merged.type === 'label' && merged.iconFontFile && !merged.text && Number(merged.iconCode) > 0) {
              merged.text = String.fromCodePoint(Number(merged.iconCode))
            }
            return merged
          })
      : [],
    fonts: Array.isArray(data?.fonts)
      ? data.fonts
          .filter((font) => font && font.symbol && font.path)
          .map((font) => ({
            id: Number(font.id) || 0,
            symbol: String(font.symbol),
            name: String(font.name || '系统字体'),
            path: String(font.path),
            size: clampNumber(font.size, 8, 128, 24),
          }))
      : [],
  }
  next.width = clampNumber(next.width, 64, 4096, 800)
  next.height = clampNumber(next.height, 64, 4096, 480)
  if (!next.bgColor) next.bgColor = '#101118'
  return next
}

function replaceProject(data) {
  const next = normalizeProject(data)
  Object.keys(project).forEach((key) => delete project[key])
  Object.assign(project, next)
  syncScreenPreset()
}

function loadSaved() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved) return
  try {
    replaceProject(JSON.parse(saved))
  } catch (err) {
    console.warn('读取本地设计稿失败', err)
  }
}

function syncScreenPreset() {
  const matched = SCREEN_PRESETS.find((p) => p.width === project.width && p.height === project.height)
  screenPreset.value = matched ? `${matched.width}x${matched.height}` : 'custom'
}

function applyScreenPreset() {
  const preset = SCREEN_PRESETS.find((p) => `${p.width}x${p.height}` === screenPreset.value)
  if (!preset) return
  project.width = preset.width
  project.height = preset.height
  clampWidgetsToScreen()
  pushHistory()
}

function setScreenDimension(key, value) {
  const size = clampNumber(value, 64, 4096, key === 'width' ? 800 : 480)
  project[key] = size
  clampWidgetsToScreen()
  syncScreenPreset()
  scheduleHistory()
}

function clampWidgetsToScreen() {
  project.widgets.forEach((w) => {
    w.x = clampNumber(w.x, 0, Math.max(0, project.width - Math.max(1, w.w)), 0)
    w.y = clampNumber(w.y, 0, Math.max(0, project.height - Math.max(1, w.h)), 0)
  })
}

/* ---------------- 工具函数 ---------------- */

function clampNumber(value, min, max, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function hexToRgb(hex) {
  const fallback = { r: 255, g: 255, b: 255 }
  if (!hex) return fallback
  let value = String(hex).replace('#', '')
  if (value.length === 3) value = value.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return fallback
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  }
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function customFont(font) {
  return (project.fonts || []).find((item) => item.symbol === font) || null
}

function fontPx(font) {
  const item = customFont(font)
  if (item) return clampNumber(item.size, 8, 128, 24)
  return { consolas14: 14, consolas23: 23, consolas24: 24, consolas32: 32, song23: 23 }[font] || 24
}

function fontFamily(font) {
  const item = customFont(font)
  return item ? `"${item.name}", sans-serif` : 'Consolas, "Courier New", monospace'
}

async function loadSystemFonts() {
  if (systemFontsLoading.value || systemFontsLoaded.value) return
  systemFontsLoading.value = true
  try {
    const list = await invoke('list_system_fonts')
    systemFonts.value = Array.isArray(list) ? list : []
    systemFontsLoaded.value = true
  } catch (err) {
    console.warn('读取系统字体失败', err)
    setMessage(`读取系统字体失败：${err}`, 'error')
  } finally {
    systemFontsLoading.value = false
  }
}

function systemFontUseCount(font) {
  return project.widgets.filter((widget) => widget.font === font.symbol).length
}

function addSystemFont() {
  if (!systemFontPick.value) {
    setMessage('请先选择系统字体', 'error')
    return
  }
  const meta = systemFonts.value.find((font) => font.path === systemFontPick.value)
  const name = meta?.name || systemFontPick.value.split(/[\\/]/).pop().replace(/\.[^.]+$/, '')
  const size = clampNumber(systemFontSize.value, 8, 128, 24)
  const id = Math.max(0, ...(project.fonts || []).map((font) => Number(font.id) || 0)) + 1
  const symbol = `sysfont_${id}`
  pushHistory()
  if (!Array.isArray(project.fonts)) project.fonts = []
  project.fonts.push({ id, symbol, name, path: systemFontPick.value, size })
  systemFontPick.value = ''
  setMessage(`已添加系统字体：${name} ${size}px`, 'success')
}

function applySystemFont(font) {
  const widget = selectedWidget.value
  if (!widget || !['label', 'button', 'checkbox', 'textbox'].includes(widget.type) || isIconWidget(widget)) {
    setMessage('请先选择一个文本控件', 'error')
    return
  }
  pushHistory()
  widget.font = font.symbol
  setMessage(`已将 ${font.name} 应用到 ${widget.name}`, 'success')
}

function removeSystemFont(font) {
  const used = systemFontUseCount(font)
  if (used > 0) {
    setMessage(`该字体正被 ${used} 个控件使用，无法删除`, 'error')
    return
  }
  pushHistory()
  project.fonts = project.fonts.filter((item) => item.symbol !== font.symbol)
  setMessage(`已删除字体：${font.name}`, 'success')
}

function alignFlex(align) {
  if (align === 'center') return 'center'
  if (align === 'right') return 'flex-end'
  return 'flex-start'
}

function widgetBoxStyle(widget) {
  const extra = widget.type === 'line' ? 6 : 0
  return {
    left: `${widget.x}px`,
    top: `${widget.y}px`,
    width: `${Math.max(1, widget.w)}px`,
    height: `${Math.max(1, widget.h + extra)}px`,
  }
}

function widgetInnerStyle(widget) {
  return {
    width: `${Math.max(1, widget.w)}px`,
    height: `${Math.max(1, widget.h)}px`,
  }
}

/* ---------------- 预览辅助 ---------------- */

function arcSpan(widget) {
  const start = Number(widget.startAngle) || 0
  const end = Number(widget.endAngle) || 0
  let span = end - start
  if (span <= 0) span += 360
  return Math.min(100, (span / 360) * 100)
}

function arcOffset(widget) {
  const start = Number(widget.startAngle) || 0
  return (start / 360) * 100
}

function sliderFillStyle(widget) {
  const value = Math.min(100, Math.max(0, Number(widget.value) || 0))
  if (widget.direct === 'vertical') {
    return { background: widget.fillColor, height: `${value}%`, width: '100%', bottom: '0', left: '0', top: 'auto', position: 'absolute', borderRadius: '100px' }
  }
  return { background: widget.fillColor, width: `${value}%`, height: '100%', left: '0', top: '0', position: 'absolute', borderRadius: '100px' }
}

function sliderKnobStyle(widget) {
  const value = Math.min(100, Math.max(0, Number(widget.value) || 0))
  const size = Math.max(8, Number(widget.thickness) + 8)
  if (widget.direct === 'vertical') {
    return { background: widget.knobColor, width: `${size}px`, height: `${size}px`, left: '50%', top: `${100 - value}%`, marginLeft: `${-size / 2}px`, marginTop: `${-size / 2}px` }
  }
  return { background: widget.knobColor, width: `${size}px`, height: `${size}px`, left: `${value}%`, top: '50%', marginLeft: `${-size / 2}px`, marginTop: `${-size / 2}px` }
}

function barFillStyle(widget) {
  const value = Math.min(100, Math.max(0, Number(widget.value) || 0))
  if (widget.direct === 'vertical') {
    return { background: widget.fillColor, height: `${value}%`, width: '100%', bottom: '0', left: '0', borderRadius: '100px' }
  }
  return { background: widget.fillColor, width: `${value}%`, height: '100%', left: '0', top: '0', borderRadius: '100px' }
}

/* ---------------- 选择 / 拖拽 / 缩放 ---------------- */

function isSelected(widget) {
  return selectedIds.value.includes(widget.id)
}

function syncPrimarySelection() {
  if (!selectedIds.value.length) {
    selectedId.value = null
    return
  }
  if (!selectedIds.value.includes(selectedId.value)) {
    selectedId.value = selectedIds.value[selectedIds.value.length - 1]
  }
}

function selectWidget(id, event) {
  if (!id) {
    clearSelection()
    return
  }
  const widget = project.widgets.find((w) => w.id === id)
  if (!widget) return
  const additive = !!(event && (event.ctrlKey || event.metaKey || event.shiftKey))
  const groupIds = widget.groupId
    ? project.widgets.filter((w) => w.groupId === widget.groupId).map((w) => w.id)
    : [widget.id]

  if (additive) {
    const allSelected = groupIds.every((gid) => selectedIds.value.includes(gid))
    if (allSelected) {
      selectedIds.value = selectedIds.value.filter((gid) => !groupIds.includes(gid))
    } else {
      selectedIds.value = [...new Set([...selectedIds.value, ...groupIds])]
    }
  } else {
    selectedIds.value = [...new Set(groupIds)]
  }

  if (selectedIds.value.includes(id)) selectedId.value = id
  syncPrimarySelection()
  if (selectedId.value) activeTab.value = 'inspect'
}

function clearSelection() {
  selectedId.value = null
  selectedIds.value = []
}

function startDrag(event, widget, handle) {
  if (event.button !== 0 || busy.value) return
  event.preventDefault()
  event.stopPropagation()

  if (event.ctrlKey || event.metaKey || event.shiftKey) {
    selectWidget(widget.id, event)
    return
  }
  if (!isSelected(widget)) selectWidget(widget.id)

  const ids = selectedIds.value.length ? selectedIds.value.slice() : [widget.id]
  const originals = new Map()
  project.widgets.forEach((item) => {
    if (ids.includes(item.id)) {
      originals.set(item.id, { x: item.x, y: item.y, w: item.w, h: item.h })
    }
  })
  dragState = {
    ids,
    primaryId: widget.id,
    handle: handle || '',
    startX: event.clientX,
    startY: event.clientY,
    originals,
    moved: false,
  }
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
}

function onDragMove(event) {
  if (!dragState) return
  const dx = (event.clientX - dragState.startX) / scale.value
  const dy = (event.clientY - dragState.startY) / scale.value
  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) dragState.moved = true

  const step = gridSnap.value ? Math.max(1, gridSize.value) : 1
  const snap = (value) => Math.round(value / step) * step

  if (!dragState.handle) {
    dragState.originals.forEach((orig, id) => {
      const widget = project.widgets.find((w) => w.id === id)
      if (!widget) return
      const maxX = Math.max(0, project.width - Math.max(1, orig.w))
      const maxY = Math.max(0, project.height - Math.max(1, orig.h))
      widget.x = clamp(snap(orig.x + dx), 0, maxX)
      widget.y = clamp(snap(orig.y + dy), 0, maxY)
    })
    return
  }

  const widget = project.widgets.find((w) => w.id === dragState.primaryId)
  const orig = dragState.originals.get(dragState.primaryId)
  if (!widget || !orig) return
  const minH = widget.type === 'line' ? 0 : 8

  let left = orig.x
  let top = orig.y
  let right = orig.x + orig.w
  let bottom = orig.y + orig.h
  if (dragState.handle.includes('w')) left = snap(orig.x + dx)
  if (dragState.handle.includes('e')) right = snap(orig.x + orig.w + dx)
  if (dragState.handle.includes('n')) top = snap(orig.y + dy)
  if (dragState.handle.includes('s')) bottom = snap(orig.y + orig.h + dy)

  left = clamp(left, 0, project.width - 8)
  right = clamp(right, left + 8, project.width)
  top = clamp(top, 0, project.height - Math.max(1, minH))
  bottom = clamp(bottom, top + minH, project.height)

  widget.x = left
  widget.y = top
  widget.w = Math.max(1, right - left)
  widget.h = Math.max(minH, bottom - top)
}

function snapWidgetToGrid(widget, snapSize = true) {
  if (!gridSnap.value) return
  const grid = Math.max(4, gridSize.value || 16)
  let width = Math.max(1, widget.w)
  let height = Math.max(1, widget.h)
  if (snapSize && !isIconWidget(widget)) {
    width = Math.max(grid, Math.round(width / grid) * grid)
    height = widget.type === 'line' ? widget.h : Math.max(grid, Math.round(height / grid) * grid)
  }
  width = Math.min(width, project.width)
  height = Math.min(height, project.height)
  widget.w = width
  widget.h = height
  widget.x = clamp(Math.round(widget.x / grid) * grid, 0, Math.max(0, project.width - Math.max(1, width)))
  widget.y = clamp(Math.round(widget.y / grid) * grid, 0, Math.max(0, project.height - Math.max(1, height)))
}

function setGridSize(value) {
  gridSize.value = clampNumber(value, 4, 128, 16)
}

function startBottomResize(event) {
  if (event.button !== 0) return
  event.preventDefault()
  bottomResizing.value = true
  bottomResizeStart = {
    y: event.clientY,
    height: bottomHeight.value,
    max: Math.max(120, (viewport.h || 300) + bottomHeight.value - 120),
  }
  window.addEventListener('mousemove', onBottomResizeMove)
  window.addEventListener('mouseup', onBottomResizeEnd)
}

function onBottomResizeMove(event) {
  if (!bottomResizeStart) return
  const delta = bottomResizeStart.y - event.clientY
  bottomHeight.value = clamp(Math.round(bottomResizeStart.height + delta), 80, bottomResizeStart.max)
}

function onBottomResizeEnd() {
  window.removeEventListener('mousemove', onBottomResizeMove)
  window.removeEventListener('mouseup', onBottomResizeEnd)
  bottomResizeStart = null
  bottomResizing.value = false
}

function onDragEnd() {
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  if (dragState && dragState.moved) {
    if (gridSnap.value) {
      dragState.ids.forEach((id) => {
        const widget = project.widgets.find((w) => w.id === id)
        if (widget) snapWidgetToGrid(widget)
      })
    }
    pushHistory()
  }
  dragState = null
}

function onCanvasMouseMove(event) {
  if (!canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  mousePos.x = Math.round((event.clientX - rect.left) / scale.value)
  mousePos.y = Math.round((event.clientY - rect.top) / scale.value)
}

/* ---------------- 拖入新组件 ---------------- */

function onPaletteDragStart(event, type) {
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('text/sgl-widget', type)
  event.dataTransfer.setData('text/plain', type)
}

function onCanvasDrop(event) {
  const rect = canvasRef.value.getBoundingClientRect()
  const x = (event.clientX - rect.left) / scale.value
  const y = (event.clientY - rect.top) / scale.value

  let icon = iconDragPayload.value
  const raw = event.dataTransfer.getData('text/sgl-icon')
  if (raw) {
    try {
      icon = JSON.parse(raw)
    } catch {
      icon = iconDragPayload.value
    }
  }
  if (icon) {
    iconDragPayload.value = null
    createIconWidget(
      { file: icon.file, name: icon.name, path: icon.path },
      { code: icon.code, char: icon.char, name: icon.glyphName },
      x,
      y,
    )
    return
  }

  const type = event.dataTransfer.getData('text/sgl-widget') || event.dataTransfer.getData('text/plain')
  if (!type || !WIDGET_DEFS[type]) return
  addWidget(type, x, y)
}

function addWidgetFromPalette(type) {
  addWidget(type, project.width / 2, project.height / 2)
}

function addWidget(type, centerX, centerY) {
  const widget = createWidget(type, 0, 0)
  widget.x = clamp(Math.round(centerX - widget.w / 2), 0, Math.max(0, project.width - widget.w))
  widget.y = clamp(Math.round(centerY - widget.h / 2), 0, Math.max(0, project.height - Math.max(1, widget.h)))
  project.widgets.push(widget)
  selectedId.value = widget.id
  selectedIds.value = [widget.id]
  activeTab.value = 'inspect'
  pushHistory()
}

/* ---------------- 属性编辑 ---------------- */

function onFieldInput(field, event) {
  if (!selectedWidget.value) return
  const target = event.target
  let value
  if (field.type === 'checkbox') value = target.checked
  else if (field.type === 'number') value = target.value === '' ? 0 : Number(target.value)
  else value = target.value

  if (selectedWidget.value.type === 'icon' && field.key === 'size') {
    const size = clampNumber(value, 8, 128, 24)
    selectedWidget.value.size = size
    selectedWidget.value.w = size + 6
    selectedWidget.value.h = size + 6
    scheduleHistory()
    return
  }

  selectedWidget.value[field.key] = value
  scheduleHistory()
}

function onProjectNameInput(event) {
  project.name = event.target.value
  scheduleHistory()
}

function onProjectColorInput(value) {
  project.bgColor = value
  scheduleHistory()
}

function updateCommon(field, event) {
  onFieldInput(field, event)
}

/* ---------------- 图层操作 ---------------- */

function deleteSelected() {
  if (!selectedIds.value.length) return
  const ids = new Set(selectedIds.value)
  project.widgets = project.widgets.filter((widget) => !ids.has(widget.id))
  selectedId.value = null
  selectedIds.value = []
  pushHistory()
}

function duplicateSelected() {
  if (!selectedWidget.value) return
  const copy = JSON.parse(JSON.stringify(selectedWidget.value))
  copy.id = `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  copy.name = `${copy.name || copy.type} 副本`
  delete copy.groupId
  copy.x = clamp(copy.x + 12, 0, Math.max(0, project.width - copy.w))
  copy.y = clamp(copy.y + 12, 0, Math.max(0, project.height - Math.max(1, copy.h)))
  project.widgets.push(copy)
  selectedId.value = copy.id
  selectedIds.value = [copy.id]
  pushHistory()
}

function moveLayer(dir) {
  if (!selectedId.value) return
  const index = project.widgets.findIndex((w) => w.id === selectedId.value)
  const target = index + dir
  if (index < 0 || target < 0 || target >= project.widgets.length) return
  const [item] = project.widgets.splice(index, 1)
  project.widgets.splice(target, 0, item)
  pushHistory()
}

function toggleHidden(widget) {
  widget.hidden = !widget.hidden
  pushHistory()
}

/* ---------------- 对齐 / 分布 / 缩放 / 组合 ---------------- */

function selectionBounds(list) {
  const x1 = Math.min(...list.map((w) => w.x))
  const y1 = Math.min(...list.map((w) => w.y))
  const x2 = Math.max(...list.map((w) => w.x + Math.max(1, w.w)))
  const y2 = Math.max(...list.map((w) => w.y + Math.max(1, w.h)))
  return { x1, y1, x2, y2 }
}

function alignSelection(mode) {
  const list = selectedWidgets.value
  if (!list.length) return
  const single = list.length === 1
  const bounds = single
    ? { x1: 0, y1: 0, x2: project.width, y2: project.height }
    : selectionBounds(list)
  const width = bounds.x2 - bounds.x1
  const height = bounds.y2 - bounds.y1

  list.forEach((widget) => {
    if (mode === 'left') widget.x = Math.round(bounds.x1)
    else if (mode === 'hcenter') widget.x = Math.round(bounds.x1 + (width - widget.w) / 2)
    else if (mode === 'right') widget.x = Math.round(bounds.x2 - widget.w)
    else if (mode === 'top') widget.y = Math.round(bounds.y1)
    else if (mode === 'vcenter') widget.y = Math.round(bounds.y1 + (height - Math.max(1, widget.h)) / 2)
    else if (mode === 'bottom') widget.y = Math.round(bounds.y2 - Math.max(1, widget.h))
    widget.x = clamp(widget.x, 0, Math.max(0, project.width - Math.max(1, widget.w)))
    widget.y = clamp(widget.y, 0, Math.max(0, project.height - Math.max(1, widget.h)))
  })
  pushHistory()
}

function distributeSelection(axis) {
  const list = selectedWidgets.value.slice()
  if (list.length < 3) return

  if (axis === 'h') {
    list.sort((a, b) => a.x - b.x)
    const first = list[0]
    const last = list[list.length - 1]
    const total = list.reduce((sum, widget) => sum + Math.max(1, widget.w), 0)
    const span = last.x + last.w - first.x
    const gap = (span - total) / (list.length - 1)
    let cursor = first.x
    list.forEach((widget) => {
      widget.x = Math.round(cursor)
      cursor += Math.max(1, widget.w) + gap
    })
  } else {
    list.sort((a, b) => a.y - b.y)
    const first = list[0]
    const last = list[list.length - 1]
    const total = list.reduce((sum, widget) => sum + Math.max(1, widget.h), 0)
    const span = last.y + Math.max(1, last.h) - first.y
    const gap = (span - total) / (list.length - 1)
    let cursor = first.y
    list.forEach((widget) => {
      widget.y = Math.round(cursor)
      cursor += Math.max(1, widget.h) + gap
    })
  }
  pushHistory()
}

function scaleSelection(factor) {
  const list = selectedWidgets.value
  if (!list.length) return
  list.forEach((widget) => {
    const centerX = widget.x + Math.max(1, widget.w) / 2
    const centerY = widget.y + Math.max(1, widget.h) / 2
    if (isIconWidget(widget)) {
      const size = clamp(Math.round(iconFontSize(widget) * factor), 8, 128)
      if (widget.type === 'icon') widget.size = size
      else widget.iconSize = size
      widget.w = size + 6
      widget.h = size + 6
    } else {
      widget.w = Math.max(4, Math.round(widget.w * factor))
      widget.h = widget.type === 'line' ? widget.h : Math.max(4, Math.round(Math.max(1, widget.h) * factor))
    }
    widget.x = clamp(Math.round(centerX - widget.w / 2), 0, Math.max(0, project.width - widget.w))
    widget.y = clamp(Math.round(centerY - Math.max(1, widget.h) / 2), 0, Math.max(0, project.height - Math.max(1, widget.h)))
    snapWidgetToGrid(widget)
  })
  pushHistory()
}

function mergeSelected() {
  const list = selectedWidgets.value
  if (list.length < 2) return
  const groupId = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
  list.forEach((widget) => {
    widget.groupId = groupId
  })
  pushHistory()
  setMessage(`已合并 ${list.length} 个控件为一个组合`, 'success')
}

function ungroupSelected() {
  const groups = new Set(selectedWidgets.value.map((widget) => widget.groupId).filter(Boolean))
  if (!groups.size) return
  project.widgets.forEach((widget) => {
    if (groups.has(widget.groupId)) delete widget.groupId
  })
  pushHistory()
  setMessage('已取消组合', 'success')
}

/* ---------------- 缩放 / 视图 ---------------- */

function updateViewportSize() {
  if (!viewportRef.value) return
  const rect = viewportRef.value.getBoundingClientRect()
  viewport.w = rect.width
  viewport.h = rect.height
}

function stepZoom(dir) {
  const options = [0.5, 0.75, 1, 1.5, 2]
  const current = scale.value
  if (dir > 0) {
    zoomMode.value = String(options.find((v) => v > current + 0.001) || 2)
  } else {
    zoomMode.value = String([...options].reverse().find((v) => v < current - 0.001) || 0.5)
  }
}

function fitZoom() {
  zoomMode.value = 'fit'
}

/* ---------------- 菜单 ---------------- */

function toggleMenu(name) {
  menuOpen.value = menuOpen.value === name ? '' : name
}

function menuDo(action) {
  menuOpen.value = ''
  const actions = {
    new: newProject,
    import: importProjectFile,
    save: saveProjectFile,
    undo,
    redo,
    duplicate: duplicateSelected,
    delete: deleteSelected,
    export: exportCFile,
    run: runSimulation,
    stop: stopSimulation,
    fit: fitZoom,
    help: showHelp,
  }
  const fn = actions[action]
  if (fn) fn()
}

function showHelp() {
  setMessage('拖动左侧组件到画布；选中组件后在右侧检查器调整参数；点击工具栏播放按钮可用 SGL + SDL2 仿真运行。', 'info')
}

/* ---------------- 消息 / 控制台 ---------------- */

function logConsole(text, type = 'info') {
  const now = new Date()
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  consoleLog.value.unshift({ time, text: String(text), type })
  if (consoleLog.value.length > 200) consoleLog.value.pop()
}

function clearConsole() {
  consoleLog.value = []
}

function appendBuildLog(line) {
  const text = String(line ?? '')
  if (!text) return
  buildLogs.value.push(text)
  if (buildLogs.value.length > 600) {
    buildLogs.value.splice(0, buildLogs.value.length - 600)
  }
  nextTick(() => {
    const el = buildLogRef.value
    const scroller = el ? el.closest('.ds-bottom-body') : null
    if (scroller) scroller.scrollTop = scroller.scrollHeight
  })
}

function clearBuildLogs() {
  buildLogs.value = []
}

function setMessage(text, type = 'info') {
  message.value = { text, type }
  logConsole(text, type)
  if (messageTimer) clearTimeout(messageTimer)
  if (type !== 'error') {
    messageTimer = setTimeout(() => {
      message.value = null
    }, 5000)
  }
}

/* ---------------- 文件操作 ---------------- */

async function saveProjectFile() {
  try {
    const path = await save({
      title: '保存设计稿',
      defaultPath: `${project.name || 'ui_design'}.sgld`,
      filters: [{ name: 'SGL 设计稿', extensions: ['sgld'] }, { name: 'JSON', extensions: ['json'] }],
    })
    if (!path) return
    await writeTextFile(path, JSON.stringify(project, null, 2))
    setMessage(`设计稿已保存：${path}`, 'success')
  } catch (err) {
    setMessage(`保存失败：${err}`, 'error')
  }
}

async function importProjectFile() {
  try {
    const selected = await open({
      title: '打开设计稿',
      multiple: false,
      filters: [{ name: 'SGL 设计稿', extensions: ['sgld', 'json'] }],
    })
    if (!selected) return
    const path = Array.isArray(selected) ? selected[0] : selected
    const content = await readTextFile(path)
    replaceProject(JSON.parse(content))
    selectedId.value = null
    selectedIds.value = []
    pushHistory()
    setMessage('设计稿已导入', 'success')
  } catch (err) {
    setMessage(`导入失败：${err}`, 'error')
  }
}

async function exportCFile() {
  try {
    const path = await save({
      title: '导出 SGL C 代码',
      defaultPath: `${project.name || 'ui_design'}.c`,
      filters: [{ name: 'C 源文件', extensions: ['c'] }],
    })
    if (!path) return
    await writeTextFile(path, generatedCode.value)

    const groups = collectIconGroups(project, resolveIconPath)
    const uiFonts = collectUiFontGroups(project)
    try {
      let fontFiles = []
      if (groups.length || uiFonts.length) {
        const dir = path.replace(/[\\/][^\\/]*$/, '') || '.'
        const iconFiles = groups.length
          ? await invoke('designer_generate_icon_fonts', { groups, outputDir: dir })
          : []
        const uiFiles = uiFonts.length
          ? await invoke('designer_generate_ui_fonts', { uiFonts, outputDir: dir })
          : []
        fontFiles = [...iconFiles, ...uiFiles]
      }
      setMessage(
        fontFiles.length
          ? `C 代码已导出：${path}；已生成 ${fontFiles.length} 个字体文件`
          : `C 代码已导出：${path}`,
        'success',
      )
    } catch (err) {
      setMessage(`C 代码已导出，但字体生成失败：${err}`, 'error')
    }
  } catch (err) {
    setMessage(`导出失败：${err}`, 'error')
  }
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(generatedCode.value)
    setMessage('已复制到剪贴板', 'success')
  } catch (err) {
    setMessage('复制失败，请手动选择代码复制', 'error')
  }
}

function newProject() {
  if (!window.confirm('新建会清空当前画布，是否继续？')) return
  replaceProject(createProject())
  selectedId.value = null
  selectedIds.value = []
  pushHistory()
}

/* ---------------- 仿真 ---------------- */

async function runSimulation() {
  if (busy.value) return
  busy.value = true
  clearBuildLogs()
  bottomTab.value = 'build'
  bottomCollapsed.value = false
  setMessage('正在编译 SGL 仿真程序，日志实时显示在“编译”标签页...', 'info')
  try {
    const iconGroups = collectIconGroups(project, resolveIconPath)
    const uiFonts = collectUiFontGroups(project)
    const result = await invoke('designer_run_simulation', {
      code: generatedCode.value,
      width: project.width,
      height: project.height,
      title: `SGL Designer - ${project.name || 'main_screen'}`,
      iconGroups,
      uiFonts,
    })
    setMessage(result, 'success')
  } catch (err) {
    appendBuildLog(`[ERROR] ${err}`)
    setMessage(String(err), 'error')
  } finally {
    busy.value = false
  }
}

async function stopSimulation() {
  try {
    await invoke('designer_stop_simulation')
    setMessage('已停止仿真窗口', 'success')
  } catch (err) {
    setMessage(String(err), 'error')
  }
}

/* ---------------- 键盘快捷键 ---------------- */

function isEditableTarget(target) {
  if (!target) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function onKeyDown(event) {
  if (isEditableTarget(event.target)) return
  const mod = event.ctrlKey || event.metaKey
  if (mod && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
    return
  }
  if (mod && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    redo()
    return
  }
  if (mod && event.key.toLowerCase() === 's') {
    event.preventDefault()
    saveProjectFile()
    return
  }
  if (mod && event.key.toLowerCase() === 'd') {
    event.preventDefault()
    duplicateSelected()
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (selectedId.value) {
      event.preventDefault()
      deleteSelected()
    }
    return
  }
  if (event.key === 'Escape') {
    menuOpen.value = ''
    clearSelection()
    return
  }
  if (selectedWidget.value && event.key.startsWith('Arrow')) {
    event.preventDefault()
    const step = event.shiftKey ? 10 : 1
    const w = selectedWidget.value
    if (event.key === 'ArrowLeft') w.x = Math.max(0, w.x - step)
    if (event.key === 'ArrowRight') w.x = Math.min(Math.max(0, project.width - w.w), w.x + step)
    if (event.key === 'ArrowUp') w.y = Math.max(0, w.y - step)
    if (event.key === 'ArrowDown') w.y = Math.min(Math.max(0, project.height - Math.max(1, w.h)), w.y + step)
    scheduleHistory()
  }
}

/* ---------------- 内置图标字体 ---------------- */

function base64ToBytes(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function iconFaceFamily(file) {
  return `sglIconFont_${String(file).replace(/[^a-zA-Z0-9]/g, '_')}`
}

async function registerIconFace(file, bytes) {
  if (iconFontFamilies[file]) return
  const mime = /\.otf$/i.test(file) ? 'font/otf' : 'font/ttf'
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
  try {
    const face = new FontFace(iconFaceFamily(file), `url(${url})`)
    await face.load()
    document.fonts.add(face)
    iconFontFamilies[file] = iconFaceFamily(file)
  } catch (err) {
    console.warn('注册图标字体失败', file, err)
  }
}

async function loadBuiltinFonts() {
  if (builtinFonts.value.length) return builtinFonts.value
  try {
    const fonts = await invoke('list_builtin_icon_fonts')
    builtinFonts.value = Array.isArray(fonts) ? fonts : []
    if (!iconFontFile.value && builtinFonts.value.length) {
      const preferred = builtinFonts.value.find((font) => /fontawesome/i.test(font.file))
      iconFontFile.value = (preferred || builtinFonts.value[0]).file
    }
    return builtinFonts.value
  } catch (err) {
    console.error('读取内置图标字体失败', err)
    logConsole(`读取内置图标字体失败：${err}`, 'error')
    return []
  }
}

async function ensureIconFont(file) {
  if (!file || iconFontFamilies[file] || iconFontPending.has(file)) return
  const font = builtinFonts.value.find((item) => item.file === file)
  if (!font) return
  iconFontPending.add(file)
  try {
    const base64 = await invoke('read_file_as_base64', { path: font.path })
    await registerIconFace(file, base64ToBytes(base64))
  } catch (err) {
    console.warn('加载图标字体失败', file, err)
  } finally {
    iconFontPending.delete(file)
  }
}

function iconFontFileOf(widget) {
  return widget?.iconFontFile || widget?.fontFile || ''
}

function ensureProjectIconFonts() {
  project.widgets
    .filter((widget) => isIconWidget(widget))
    .forEach((widget) => {
      const file = iconFontFileOf(widget)
      if (!file) return
      const font = builtinFonts.value.find((item) => item.file === file)
      if (font) {
        if (widget.type === 'label') widget.iconFontPath = font.path
        else widget.fontPath = font.path
      }
      ensureIconFont(file)
    })
}

async function loadIconGlyphs(file) {
  if (!file) return
  if (iconGlyphCache.has(file)) {
    iconFontGlyphs.value = iconGlyphCache.get(file)
    ensureIconFont(file)
    return
  }
  const font = builtinFonts.value.find((item) => item.file === file)
  if (!font) return
  iconFontLoading.value = true
  try {
    const base64 = await invoke('read_file_as_base64', { path: font.path })
    const bytes = base64ToBytes(base64)
    const opentype = await import('opentype.js')
    const parsed = opentype.parse(bytes.buffer)
    const seen = new Set()
    const glyphs = []
    for (const [name, glyph] of Object.entries(parsed.glyphs.glyphs)) {
      if (!glyph || glyph.unicode === undefined || glyph.unicode === null) continue
      const code = glyph.unicode
      if (code <= 0x20 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) || seen.has(code)) continue
      let visible = false
      try {
        visible = !!(glyph.path && glyph.path.commands && glyph.path.commands.length)
      } catch {
        visible = false
      }
      if (!visible) continue
      seen.add(code)
      glyphs.push({ code, char: String.fromCodePoint(code), name: String(glyph.name || name) })
    }
    glyphs.sort((a, b) => a.code - b.code)
    iconGlyphCache.set(file, glyphs)
    iconFontGlyphs.value = glyphs
    await registerIconFace(file, bytes)
  } catch (err) {
    console.error('解析图标字体失败', file, err)
    setMessage(`解析图标字体失败：${err}`, 'error')
    iconFontGlyphs.value = []
  } finally {
    iconFontLoading.value = false
  }
}

function onIconFontChange() {
  iconFontSearch.value = ''
  iconGlyphLimit.value = 240
  loadIconGlyphs(iconFontFile.value)
}

async function openIconLibrary(replace = false, tab = 'assets') {
  iconReplaceMode.value = !!replace
  bottomTab.value = tab
  bottomCollapsed.value = false
  await loadBuiltinFonts()
  if (!iconFontGlyphs.value.length) {
    await loadIconGlyphs(iconFontFile.value)
  } else {
    ensureIconFont(iconFontFile.value)
  }
}

function resolveIconPath(widget) {
  const file = iconFontFileOf(widget)
  return builtinFonts.value.find((font) => font.file === file)?.path || widget.iconFontPath || widget.fontPath || ''
}

function iconFamilyFor(widget) {
  return iconFontFamilies[iconFontFileOf(widget)] || 'inherit'
}

function iconCodeFor(widget) {
  let code = Number(widget?.iconCode)
  if (!Number.isFinite(code) || code <= 0) code = Number(widget?.code)
  if (!Number.isFinite(code) || code <= 0) {
    const char = iconWidgetChar(widget)
    code = char ? char.codePointAt(0) : 0
  }
  return code
}

function onIconSizeChange(event) {
  const widget = selectedWidget.value
  if (!isIconWidget(widget)) return
  const size = clampNumber(event.target.value, 8, 128, 24)
  if (widget.type === 'icon') widget.size = size
  else widget.iconSize = size
  widget.w = size + 6
  widget.h = size + 6
  pushHistory()
}

function onIconColorChange(event) {
  const widget = selectedWidget.value
  if (!isIconWidget(widget)) return
  if (widget.type === 'icon') widget.color = event.target.value
  else widget.textColor = event.target.value
  pushHistory()
}

function addIconWidget(glyph) {
  const font = builtinFonts.value.find((item) => item.file === iconFontFile.value)
  if (!font) {
    setMessage('请先选择图标字体', 'error')
    return
  }

  if (iconReplaceMode.value && isIconWidget(selectedWidget.value)) {
    const target = selectedWidget.value
    if (target.type === 'icon') {
      Object.assign(target, {
        fontFile: font.file,
        fontName: font.name,
        fontPath: font.path,
        code: glyph.code,
        char: glyph.char,
      })
    } else {
      // 图标控件本质是使用图标字体的 Label
      Object.assign(target, {
        text: glyph.char,
        iconFontFile: font.file,
        iconFontName: font.name,
        iconFontPath: font.path,
        iconCode: glyph.code,
      })
    }
    iconReplaceMode.value = false
    pushHistory()
    ensureIconFont(font.file)
    setMessage(`已更换图标：${font.name} U+${glyph.code.toString(16).toUpperCase()}`, 'success')
    return
  }

  createIconWidget(font, glyph, project.width / 2, project.height / 2)
}

function createIconWidget(font, glyph, centerX, centerY) {
  const size = clampNumber(iconDefaultSize.value, 8, 128, 24)
  const boxSize = size + 6
  const widget = createWidget('label', 0, 0)
  Object.assign(widget, {
    name: glyph.name || `icon_${glyph.code.toString(16)}`,
    text: glyph.char,
    textColor: widget.textColor || '#ffffff',
    iconFontFile: font.file,
    iconFontName: font.name,
    iconFontPath: font.path,
    iconCode: glyph.code,
    iconSize: size,
    w: boxSize,
    h: boxSize,
  })
  widget.x = clamp(Math.round(centerX - boxSize / 2), 0, Math.max(0, project.width - boxSize))
  widget.y = clamp(Math.round(centerY - boxSize / 2), 0, Math.max(0, project.height - boxSize))
  snapWidgetToGrid(widget, false)
  project.widgets.push(widget)
  selectedId.value = widget.id
  selectedIds.value = [widget.id]
  activeTab.value = 'inspect'
  iconReplaceMode.value = false
  pushHistory()
  ensureIconFont(font.file)
  logConsole(`已添加图标：${font.name} U+${glyph.code.toString(16).toUpperCase()}`, 'success')
  return widget
}

function onIconDragStart(event, glyph) {
  const font = builtinFonts.value.find((item) => item.file === iconFontFile.value)
  if (!font) {
    event.preventDefault()
    return
  }
  const payload = {
    file: font.file,
    name: font.name,
    path: font.path,
    code: glyph.code,
    char: glyph.char,
    glyphName: glyph.name,
  }
  iconDragPayload.value = payload
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('text/sgl-icon', JSON.stringify(payload))
  event.dataTransfer.setData('text/plain', glyph.char)
}

/* ---------------- 二维码预览 ---------------- */

const qrCache = new Map()

function qrCells(widget) {
  const key = `${widget.text || ''}`
  if (qrCache.has(key)) return qrCache.get(key)
  const size = 21
  let hash = 2166136261
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const rand = () => {
    hash ^= hash << 13
    hash ^= hash >>> 17
    hash ^= hash << 5
    return (hash >>> 0) / 4294967296
  }
  const finder = (x, y, ox, oy) => {
    const dx = x - ox
    const dy = y - oy
    if (dx < 0 || dx > 6 || dy < 0 || dy > 6) return null
    const edge = dx === 0 || dx === 6 || dy === 0 || dy === 6
    const center = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4
    return edge || center
  }
  const cells = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let filled = null
      if (x < 7 && y < 7) filled = finder(x, y, 0, 0)
      else if (x >= size - 7 && y < 7) filled = finder(x, y, size - 7, 0)
      else if (x < 7 && y >= size - 7) filled = finder(x, y, 0, size - 7)
      if (filled === null) filled = rand() > 0.52
      if (filled) cells.push([x, y])
    }
  }
  qrCache.set(key, cells)
  return cells
}

/* ---------------- 生命周期 ---------------- */

onMounted(() => {
  loadSaved()
  const savedGrid = Number(localStorage.getItem(GRID_STORAGE_KEY))
  if (Number.isFinite(savedGrid) && savedGrid > 0) {
    gridSize.value = clampNumber(savedGrid, 4, 128, 16)
  }
  const savedSnap = localStorage.getItem(GRID_SNAP_STORAGE_KEY)
  if (savedSnap !== null) gridSnap.value = savedSnap !== '0'
  const savedBottom = Number(localStorage.getItem(BOTTOM_HEIGHT_STORAGE_KEY))
  if (Number.isFinite(savedBottom) && savedBottom > 0) {
    bottomHeight.value = clampNumber(savedBottom, 80, Math.max(120, Math.round(window.innerHeight * 0.7)), 150)
  }
  pushHistory()
  updateViewportSize()
  if (window.ResizeObserver && viewportRef.value) {
    resizeObserver = new ResizeObserver(() => updateViewportSize())
    resizeObserver.observe(viewportRef.value)
  }
  window.addEventListener('keydown', onKeyDown)
  logConsole('设计器已就绪，从左侧拖入组件开始设计', 'info')
  loadBuiltinFonts().then(() => {
    ensureProjectIconFonts()
    if (bottomTab.value === 'assets') {
      loadIconGlyphs(iconFontFile.value)
    }
  })

  listen('designer-build-log', (event) => appendBuildLog(event.payload))
    .then((unlisten) => {
      if (disposed) unlisten()
      else unlistenBuild = unlisten
    })
    .catch((err) => console.warn('监听编译日志失败', err))
})

onBeforeUnmount(() => {
  disposed = true
  if (bottomResizeStart) onBottomResizeEnd()
  if (unlistenBuild) {
    unlistenBuild()
    unlistenBuild = null
  }
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  if (resizeObserver) resizeObserver.disconnect()
  if (historyTimer) clearTimeout(historyTimer)
  if (saveTimer) clearTimeout(saveTimer)
  if (messageTimer) clearTimeout(messageTimer)
})

watch(
  () => project.widgets.filter((widget) => isIconWidget(widget)).map((widget) => iconFontFileOf(widget)).join('|'),
  () => ensureProjectIconFonts(),
)

watch(iconFontSearch, () => {
  iconGlyphLimit.value = 240
})

watch(gridSize, (value) => {
  localStorage.setItem(GRID_STORAGE_KEY, String(value))
})

watch(gridSnap, (value) => {
  localStorage.setItem(GRID_SNAP_STORAGE_KEY, value ? '1' : '0')
})

watch(activeTab, (tab) => {
  if (tab === 'fonts') loadSystemFonts()
})

watch(bottomHeight, (value) => {
  localStorage.setItem(BOTTOM_HEIGHT_STORAGE_KEY, String(value))
})

watch(
  project,
  () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
      } catch (err) {
        console.warn('自动保存失败', err)
      }
    }, 600)
  },
  { deep: true }
)
</script>

<template>
  <div class="page-container designer-page">
    <!-- 顶部菜单栏 -->
    <div class="ds-menubar">
      <div class="ds-menu" @click.stop="toggleMenu('file')">
        <span class="ds-menu-label" :class="{ active: menuOpen === 'file' }">文件</span>
        <div v-if="menuOpen === 'file'" class="ds-dropdown">
          <button class="ds-menu-item" @click="menuDo('new')">新建设计稿</button>
          <button class="ds-menu-item" @click="menuDo('import')">打开设计稿...</button>
          <button class="ds-menu-item" @click="menuDo('save')">保存设计稿...</button>
        </div>
      </div>
      <div class="ds-menu" @click.stop="toggleMenu('edit')">
        <span class="ds-menu-label" :class="{ active: menuOpen === 'edit' }">编辑</span>
        <div v-if="menuOpen === 'edit'" class="ds-dropdown">
          <button class="ds-menu-item" :disabled="!canUndo" @click="menuDo('undo')">撤销</button>
          <button class="ds-menu-item" :disabled="!canRedo" @click="menuDo('redo')">重做</button>
          <div class="ds-menu-sep"></div>
          <button class="ds-menu-item" :disabled="!selectedWidget" @click="menuDo('duplicate')">复制组件</button>
          <button class="ds-menu-item" :disabled="!selectedWidget" @click="menuDo('delete')">删除组件</button>
        </div>
      </div>
      <div class="ds-menu" @click.stop="toggleMenu('export')">
        <span class="ds-menu-label" :class="{ active: menuOpen === 'export' }">导出</span>
        <div v-if="menuOpen === 'export'" class="ds-dropdown">
          <button class="ds-menu-item" @click="menuDo('export')">导出 C 代码...</button>
          <div class="ds-menu-sep"></div>
          <button class="ds-menu-item" @click="menuDo('run')">仿真运行</button>
          <button class="ds-menu-item" @click="menuDo('stop')">停止仿真</button>
        </div>
      </div>
      <div class="ds-menu" @click.stop="toggleMenu('help')">
        <span class="ds-menu-label" :class="{ active: menuOpen === 'help' }">帮助</span>
        <div v-if="menuOpen === 'help'" class="ds-dropdown">
          <button class="ds-menu-item" @click="menuDo('help')">使用说明</button>
        </div>
      </div>
      <div class="ds-menubar-title">{{ project.name }}</div>
      <div class="ds-menubar-right">SGL UI Designer</div>
    </div>
    <div v-if="menuOpen" class="ds-backdrop" @click="menuOpen = ''"></div>

    <!-- 工具栏 -->
    <div class="ds-toolbar">
      <button class="ds-icon-btn" :disabled="!canUndo" title="撤销 (Ctrl+Z)" @click="undo">
        <svg viewBox="0 0 16 16"><path d="M6 3 L2 6.5 L6 10" fill="none" stroke="currentColor" stroke-width="1.4" /><path d="M2 6.5 H9 A4 4 0 0 1 9 14.5 H6" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
      </button>
      <button class="ds-icon-btn" :disabled="!canRedo" title="重做 (Ctrl+Y)" @click="redo">
        <svg viewBox="0 0 16 16"><path d="M10 3 L14 6.5 L10 10" fill="none" stroke="currentColor" stroke-width="1.4" /><path d="M14 6.5 H7 A4 4 0 0 0 7 14.5 H10" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
      </button>
      <span class="ds-toolbar-sep"></span>
      <span class="ds-meta">屏幕: <b>1</b></span>
      <span class="ds-meta">组件: <b>{{ project.widgets.length }}</b></span>
      <span class="ds-toolbar-sep"></span>
      <span class="ds-meta mono">Mouse X: {{ mousePos.x }} Y: {{ mousePos.y }}</span>
      <span class="ds-toolbar-spacer"></span>
      <button class="ds-icon-btn" title="缩小" @click="stepZoom(-1)">
        <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.4" /><path d="M10.5 10.5 L14 14 M5 7 H9" stroke="currentColor" stroke-width="1.4" /></svg>
      </button>
      <select class="ds-select ds-zoom" v-model="zoomMode">
        <option value="fit">适应</option>
        <option value="0.5">50%</option>
        <option value="0.75">75%</option>
        <option value="1">100%</option>
        <option value="1.5">150%</option>
        <option value="2">200%</option>
      </select>
      <button class="ds-icon-btn" title="放大" @click="stepZoom(1)">
        <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.4" /><path d="M10.5 10.5 L14 14 M5 7 H9 M7 5 V9" stroke="currentColor" stroke-width="1.4" /></svg>
      </button>
      <button class="ds-icon-btn" title="适应窗口" @click="fitZoom">
        <svg viewBox="0 0 16 16"><path d="M2 6 V2 H6 M10 2 H14 V6 M14 10 V14 H10 M6 14 H2 V10" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
      </button>
      <span class="ds-toolbar-sep"></span>
      <label class="ds-check"><input type="checkbox" v-model="gridEnabled" /> 栅格</label>
      <input
        class="ds-input ds-grid-input"
        type="number"
        min="4"
        max="128"
        step="1"
        :value="gridSize"
        :disabled="!gridEnabled && !gridSnap"
        title="栅格大小（px）"
        @change="setGridSize($event.target.value)"
      />
      <span class="ds-grid-unit">px</span>
      <label class="ds-check" title="拖动和缩放时强制吸附到栅格"><input type="checkbox" v-model="gridSnap" /> 吸附</label>
      <span class="ds-toolbar-sep"></span>
      <button class="ds-run-btn" :disabled="busy" title="编译并打开 SDL 仿真窗口" @click="runSimulation">
        <svg viewBox="0 0 16 16"><path d="M4 2.5 L13 8 L4 13.5 Z" fill="currentColor" /></svg>
        {{ busy ? '编译中' : '运行' }}
      </button>
      <button class="ds-stop-btn" title="停止仿真" @click="stopSimulation">
        <svg viewBox="0 0 16 16"><rect x="4" y="4" width="8" height="8" fill="currentColor" /></svg>
      </button>
    </div>

    <transition name="fade">
      <div v-if="message" class="ds-message" :class="message.type" @click="message = null">
        <span class="ds-message-text">{{ message.text }}</span>
        <span class="ds-message-close">×</span>
      </div>
    </transition>

    <div class="ds-main">
      <!-- 左侧：屏幕树 + 组件库 -->
      <aside class="ds-left">
        <div class="ds-section-head">屏幕</div>
        <div class="ds-tree">
          <div class="ds-tree-root" :class="{ active: !selectedId }" @click="clearSelection">
            <span class="ds-screen-glyph"></span>
            <span class="ds-tree-name">{{ project.name }}</span>
          </div>
          <div
            v-for="widget in project.widgets"
            :key="widget.id"
            class="ds-tree-item"
            :class="{ active: isSelected(widget), off: widget.hidden }"
            @click="selectWidget(widget.id, $event)"
          >
            <span class="ds-tree-dot"></span>
            <span class="ds-tree-name">{{ widget.name }}</span>
            <button class="ds-eye" :title="widget.hidden ? '显示' : '隐藏'" @click.stop="toggleHidden(widget)">
              {{ widget.hidden ? '○' : '●' }}
            </button>
          </div>
          <div v-if="!project.widgets.length" class="ds-empty-small">暂无组件</div>
        </div>

        <div class="ds-section-head">组件</div>
        <div class="ds-widget-grid">
          <div
            v-for="type in PRIMARY_WIDGETS"
            :key="type"
            class="ds-tile"
            draggable="true"
            @dragstart="onPaletteDragStart($event, type)"
            @click="addWidgetFromPalette(type)"
          >
            <span class="ds-tile-icon" :class="`ico-${type}`"></span>
            <span class="ds-tile-name">{{ WIDGET_DEFS[type].name }}</span>
          </div>
          <div class="ds-tile" title="从内置图标字体中选择图标" @click="openIconLibrary()">
            <span class="ds-tile-icon ico-icon"></span>
            <span class="ds-tile-name">图标</span>
          </div>
        </div>

        <div class="ds-section-head">可视化</div>
        <div class="ds-widget-grid">
          <div
            v-for="type in VISUAL_WIDGETS"
            :key="type"
            class="ds-tile"
            draggable="true"
            @dragstart="onPaletteDragStart($event, type)"
            @click="addWidgetFromPalette(type)"
          >
            <span class="ds-tile-icon" :class="`ico-${type}`"></span>
            <span class="ds-tile-name">{{ WIDGET_DEFS[type].name }}</span>
          </div>
        </div>

        <div class="ds-section-head">画布</div>
        <div class="ds-widget-grid single">
          <div class="ds-tile" @click="clearSelection">
            <span class="ds-tile-icon ico-screen"></span>
            <span class="ds-tile-name">Screen</span>
          </div>
        </div>
        <div class="ds-left-tip">拖拽组件到画布，或单击添加到中心</div>
      </aside>

      <!-- 中间：画布 + 底部面板 -->
      <div class="ds-center">
        <div class="ds-commandbar">
          <span class="ds-cmd-group-label">对齐</span>
          <button class="ds-cmd-btn" title="左对齐（单选时相对画布）" :disabled="!selectionCount" @click="alignSelection('left')">
            <svg viewBox="0 0 16 16"><path d="M2 2V14" fill="none" stroke="currentColor" stroke-width="1.3" /><rect x="4" y="3.5" width="9" height="3" fill="currentColor" /><rect x="4" y="9.5" width="5.5" height="3" fill="currentColor" /></svg>
          </button>
          <button class="ds-cmd-btn" title="水平居中" :disabled="!selectionCount" @click="alignSelection('hcenter')">
            <svg viewBox="0 0 16 16"><path d="M8 1.5V14.5" fill="none" stroke="currentColor" stroke-width="1.3" /><rect x="3.5" y="3.5" width="9" height="3" fill="currentColor" /><rect x="5" y="9.5" width="6" height="3" fill="currentColor" /></svg>
          </button>
          <button class="ds-cmd-btn" title="右对齐" :disabled="!selectionCount" @click="alignSelection('right')">
            <svg viewBox="0 0 16 16"><path d="M14 2V14" fill="none" stroke="currentColor" stroke-width="1.3" /><rect x="3" y="3.5" width="9" height="3" fill="currentColor" /><rect x="6.5" y="9.5" width="5.5" height="3" fill="currentColor" /></svg>
          </button>
          <span class="ds-cmd-sep"></span>
          <button class="ds-cmd-btn" title="顶部对齐" :disabled="!selectionCount" @click="alignSelection('top')">
            <svg viewBox="0 0 16 16"><path d="M2 2H14" fill="none" stroke="currentColor" stroke-width="1.3" /><rect x="3.5" y="4" width="3" height="9" fill="currentColor" /><rect x="9.5" y="4" width="3" height="5.5" fill="currentColor" /></svg>
          </button>
          <button class="ds-cmd-btn" title="垂直居中" :disabled="!selectionCount" @click="alignSelection('vcenter')">
            <svg viewBox="0 0 16 16"><path d="M1.5 8H14.5" fill="none" stroke="currentColor" stroke-width="1.3" /><rect x="3.5" y="3.5" width="3" height="9" fill="currentColor" /><rect x="9.5" y="5" width="3" height="6" fill="currentColor" /></svg>
          </button>
          <button class="ds-cmd-btn" title="底部对齐" :disabled="!selectionCount" @click="alignSelection('bottom')">
            <svg viewBox="0 0 16 16"><path d="M2 14H14" fill="none" stroke="currentColor" stroke-width="1.3" /><rect x="3.5" y="3" width="3" height="9" fill="currentColor" /><rect x="9.5" y="6.5" width="3" height="5.5" fill="currentColor" /></svg>
          </button>
          <span class="ds-cmd-sep"></span>
          <span class="ds-cmd-group-label">分布</span>
          <button class="ds-cmd-btn" title="水平等距分布（至少 3 个）" :disabled="selectionCount < 3" @click="distributeSelection('h')">
            <svg viewBox="0 0 16 16"><rect x="1.5" y="3" width="2.5" height="10" fill="currentColor" /><rect x="6.75" y="3" width="2.5" height="10" fill="currentColor" /><rect x="12" y="3" width="2.5" height="10" fill="currentColor" /></svg>
          </button>
          <button class="ds-cmd-btn" title="垂直等距分布（至少 3 个）" :disabled="selectionCount < 3" @click="distributeSelection('v')">
            <svg viewBox="0 0 16 16"><rect x="3" y="1.5" width="10" height="2.5" fill="currentColor" /><rect x="3" y="6.75" width="10" height="2.5" fill="currentColor" /><rect x="3" y="12" width="10" height="2.5" fill="currentColor" /></svg>
          </button>
          <span class="ds-cmd-sep"></span>
          <button class="ds-cmd-btn danger" title="删除选中控件 (Delete)" :disabled="!selectionCount" @click="deleteSelected">
            <svg viewBox="0 0 16 16"><path d="M3 4H13M6 4V2.5H10V4M4.5 4L5 14H11L11.5 4M7 7V11.5M9 7V11.5" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
          </button>
          <button class="ds-cmd-btn" title="放大 10%" :disabled="!selectionCount" @click="scaleSelection(1.1)">
            <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.3" /><path d="M10.5 10.5L14 14M5 7H9M7 5V9" fill="none" stroke="currentColor" stroke-width="1.3" /></svg>
          </button>
          <button class="ds-cmd-btn" title="缩小 10%" :disabled="!selectionCount" @click="scaleSelection(0.9)">
            <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.3" /><path d="M10.5 10.5L14 14M5 7H9" fill="none" stroke="currentColor" stroke-width="1.3" /></svg>
          </button>
          <span class="ds-cmd-sep"></span>
          <button class="ds-cmd-btn" title="合并为组合（多选后一起移动）" :disabled="selectionCount < 2" @click="mergeSelected">
            <svg viewBox="0 0 16 16"><rect x="2" y="2" width="7.5" height="7.5" fill="none" stroke="currentColor" stroke-width="1.3" /><rect x="6.5" y="6.5" width="7.5" height="7.5" fill="none" stroke="currentColor" stroke-width="1.3" /></svg>
          </button>
          <button class="ds-cmd-btn" title="取消组合" :disabled="!hasGroupSelection" @click="ungroupSelected">
            <svg viewBox="0 0 16 16"><rect x="1.5" y="1.5" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.3" /><rect x="8.5" y="8.5" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.3" /></svg>
          </button>
          <span class="ds-commandbar-spacer"></span>
          <span class="ds-cmd-meta">{{ selectionCount ? `已选择 ${selectionCount} 个控件` : '单击选择，Ctrl / Shift 多选' }}</span>
        </div>
        <section ref="viewportRef" class="ds-canvas-viewport" @mousedown.self="clearSelection">
          <div class="ds-stage-column">
            <div class="ds-screen-tab">
              <span class="ds-screen-dot"></span>
              {{ project.name }}
              <span class="ds-screen-size">{{ project.width }} × {{ project.height }}</span>
            </div>
            <div class="ds-canvas-stage" :style="stageStyle">
              <div
                ref="canvasRef"
                class="ds-canvas"
                :style="canvasStyle"
                @dragover.prevent
                @drop.prevent="onCanvasDrop"
                @mousemove="onCanvasMouseMove"
                @mousedown.self="clearSelection"
              >
                <div
                  v-if="gridEnabled"
                  class="ds-canvas-grid"
                  :style="{ backgroundSize: `${gridSize}px ${gridSize}px` }"
                ></div>
                <div
                  v-for="widget in project.widgets"
                  v-show="!widget.hidden"
                  :key="widget.id"
                  class="ds-widget"
                  :class="{ selected: isSelected(widget) }"
                  :style="widgetBoxStyle(widget)"
                  @mousedown="startDrag($event, widget, '')"
                >
                  <div class="ds-widget-inner" :style="widgetInnerStyle(widget)">
                    <div
                      v-if="widget.type === 'label' && !isIconWidget(widget)"
                      class="pv-label"
                      :style="{
                        color: widget.textColor,
                        fontSize: fontPx(widget.font) + 'px',
                        fontFamily: fontFamily(widget.font),
                        background: widget.bgColor || 'transparent',
                        borderRadius: widget.radius + 'px',
                        justifyContent: alignFlex(widget.align),
                      }"
                    >{{ widget.text }}</div>

                    <div
                      v-else-if="isIconWidget(widget)"
                      class="pv-icon"
                      :style="{
                        color: iconWidgetColor(widget),
                        fontSize: iconFontSize(widget) + 'px',
                        '--icon-family': iconFamilyFor(widget),
                      }"
                    >{{ iconWidgetChar(widget) }}</div>

                    <div
                      v-else-if="widget.type === 'button'"
                      class="pv-button"
                      :style="{
                        background: widget.color,
                        color: widget.textColor,
                        border: `${widget.borderWidth}px solid ${widget.borderColor}`,
                        borderRadius: widget.radius + 'px',
                        opacity: widget.alpha / 255,
                        fontSize: fontPx(widget.font) + 'px',
                        fontFamily: fontFamily(widget.font),
                      }"
                    >{{ widget.text }}</div>

                    <div
                      v-else-if="widget.type === 'rect'"
                      class="pv-rect"
                      :style="{
                        background: widget.color,
                        border: `${widget.borderWidth}px solid ${widget.borderColor}`,
                        borderRadius: widget.radius + 'px',
                        opacity: widget.alpha / 255,
                      }"
                    ></div>

                    <div
                      v-else-if="widget.type === 'circle'"
                      class="pv-circle"
                      :style="{
                        background: widget.color,
                        border: `${widget.borderWidth}px solid ${widget.borderColor}`,
                        opacity: widget.alpha / 255,
                      }"
                    ></div>

                    <svg v-else-if="widget.type === 'line'" class="pv-line" :width="Math.max(1, widget.w)" :height="Math.max(1, widget.h)">
                      <line x1="0" y1="0" :x2="widget.w" :y2="widget.h" :stroke="widget.color" :stroke-width="widget.width" />
                    </svg>

                    <svg v-else-if="widget.type === 'arc'" class="pv-arc" :viewBox="`0 0 ${Math.max(1, widget.w)} ${Math.max(1, widget.h)}`">
                      <circle
                        :cx="widget.w / 2"
                        :cy="widget.h / 2"
                        :r="Math.max(1, Math.min(widget.w, widget.h) / 2 - Math.max(6, Math.min(widget.w, widget.h) * 0.08))"
                        fill="none"
                        :stroke="widget.bgColor"
                        :stroke-width="Math.max(6, Math.min(widget.w, widget.h) * 0.16)"
                        :opacity="widget.mode === 'normal' ? 0 : 1"
                      />
                      <circle
                        :cx="widget.w / 2"
                        :cy="widget.h / 2"
                        :r="Math.max(1, Math.min(widget.w, widget.h) / 2 - Math.max(6, Math.min(widget.w, widget.h) * 0.08))"
                        fill="none"
                        :stroke="widget.color"
                        :stroke-width="Math.max(6, Math.min(widget.w, widget.h) * (widget.mode === 'normal' ? 0.24 : 0.16))"
                        pathLength="100"
                        :stroke-dasharray="`${arcSpan(widget)} 100`"
                        :stroke-dashoffset="-arcOffset(widget)"
                        stroke-linecap="round"
                        :transform="`rotate(-90 ${widget.w / 2} ${widget.h / 2})`"
                      />
                    </svg>

                    <div v-else-if="widget.type === 'slider'" class="pv-slider" :class="widget.direct">
                      <div class="pv-slider-track" :style="{ background: widget.trackColor, borderRadius: widget.radius + 'px' }"></div>
                      <div class="pv-slider-fill" :style="sliderFillStyle(widget)"></div>
                      <div class="pv-slider-knob" :style="sliderKnobStyle(widget)"></div>
                    </div>

                    <div
                      v-else-if="widget.type === 'progress'"
                      class="pv-progress"
                      :style="{
                        background: widget.trackColor,
                        border: `${widget.borderWidth}px solid ${widget.borderColor}`,
                        borderRadius: widget.radius + 'px',
                      }"
                    >
                      <div
                        class="pv-progress-fill"
                        :style="{ background: widget.fillColor, width: clamp(widget.value, 0, 100) + '%', borderRadius: widget.radius + 'px' }"
                      ></div>
                    </div>

                    <div
                      v-else-if="widget.type === 'bar'"
                      class="pv-bar"
                      :style="{ background: widget.trackColor, borderRadius: widget.radius + 'px' }"
                    >
                      <div class="pv-bar-fill" :style="barFillStyle(widget)"></div>
                    </div>

                    <div
                      v-else-if="widget.type === 'switch'"
                      class="pv-switch"
                      :style="{ background: widget.status ? widget.color : widget.bgColor, borderRadius: (widget.radius || widget.h / 2) + 'px' }"
                    >
                      <div
                        class="pv-switch-knob"
                        :style="{
                          background: widget.knobColor,
                          width: Math.max(4, widget.h - 6) + 'px',
                          height: Math.max(4, widget.h - 6) + 'px',
                          transform: widget.status ? `translateX(${Math.max(0, widget.w - widget.h)}px)` : 'translateX(0)',
                        }"
                      ></div>
                    </div>

                    <div v-else-if="widget.type === 'checkbox'" class="pv-checkbox">
                      <span
                        class="pv-check-box"
                        :style="{ background: widget.status ? widget.boxColor : 'transparent', borderColor: widget.boxColor, borderRadius: widget.radius + 'px' }"
                      >
                        <svg v-if="widget.status" viewBox="0 0 12 12" class="pv-check-mark">
                          <path d="M2 6 L5 9 L10 3" fill="none" :stroke="widget.checkColor" stroke-width="2" />
                        </svg>
                      </span>
                      <span :style="{ color: widget.textColor, fontSize: fontPx(widget.font) + 'px', fontFamily: fontFamily(widget.font) }">{{ widget.text }}</span>
                    </div>

                    <div
                      v-else-if="widget.type === 'led'"
                      class="pv-led"
                      :style="{
                        background: widget.status ? widget.onColor : widget.offColor,
                        boxShadow: widget.status ? `0 0 10px ${rgba(widget.onColor, 0.8)}` : 'none',
                        opacity: widget.alpha / 255,
                      }"
                    ></div>

                    <div
                      v-else-if="widget.type === 'textbox'"
                      class="pv-textbox"
                      :style="{
                        background: widget.bgColor,
                        border: `${widget.borderWidth}px solid ${widget.borderColor}`,
                        borderRadius: widget.radius + 'px',
                        color: widget.textColor,
                        fontSize: fontPx(widget.font) + 'px',
                        fontFamily: fontFamily(widget.font),
                      }"
                    >{{ widget.text }}</div>

                    <svg v-else-if="widget.type === 'qrcode'" class="pv-qrcode" viewBox="0 0 21 21" preserveAspectRatio="none">
                      <rect x="0" y="0" width="21" height="21" :fill="widget.bgColor" />
                      <rect
                        v-for="(cell, index) in qrCells(widget)"
                        :key="index"
                        :x="cell[0]"
                        :y="cell[1]"
                        width="1"
                        height="1"
                        :fill="widget.cellColor"
                      />
                    </svg>
                  </div>

                  <template v-if="selectedIds.length === 1 && widget.id === selectedId">
                    <span
                      v-for="handle in ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']"
                      :key="handle"
                      class="ds-handle"
                      :class="`handle-${handle}`"
                      @mousedown.stop="startDrag($event, widget, handle)"
                    ></span>
                    <span class="ds-selection-tag">{{ widget.name }} · {{ Math.round(widget.w) }}×{{ Math.round(widget.h) }}</span>
                  </template>
                </div>
              </div>
            </div>
          </div>
          <div v-if="project.widgets.length === 0" class="ds-canvas-hint">从左侧拖入组件开始设计</div>
          <div v-if="busy" class="ds-busy">
            <div class="ds-spinner"></div>
            <div class="ds-busy-text">正在编译 SGL 仿真程序...</div>
          </div>
        </section>

        <div
          v-if="!bottomCollapsed"
          class="ds-bottom-resizer"
          :class="{ active: bottomResizing }"
          title="拖动调整底部面板高度"
          @mousedown="startBottomResize"
        ></div>

        <!-- 底部面板 -->
        <div
          class="ds-bottom"
          :class="{ collapsed: bottomCollapsed }"
          :style="bottomCollapsed ? undefined : { height: bottomHeight + 'px' }"
        >
          <div class="ds-bottom-tabs">
            <button class="ds-bottom-tab" :class="{ active: bottomTab === 'assets' }" @click="openIconLibrary(false, 'assets')">
              资源 <span class="ds-count">{{ builtinFonts.length }}</span>
            </button>
            <button class="ds-bottom-tab" :class="{ active: bottomTab === 'console' }" @click="bottomTab = 'console'">
              控制台 <span class="ds-count">{{ consoleLog.length }}</span>
            </button>
            <button class="ds-bottom-tab" :class="{ active: bottomTab === 'errors' }" @click="bottomTab = 'errors'">
              错误 <span class="ds-count" :class="{ warn: validationErrors.length }">{{ validationErrors.length }}</span>
            </button>
            <button class="ds-bottom-tab" :class="{ active: bottomTab === 'code' }" @click="bottomTab = 'code'">代码</button>
            <button class="ds-bottom-tab" :class="{ active: bottomTab === 'build' }" @click="bottomTab = 'build'">
              编译 <span class="ds-count">{{ buildLogs.length }}</span>
            </button>
            <span class="ds-bottom-spacer"></span>
            <button v-if="bottomTab === 'console'" class="ds-mini-btn" @click="clearConsole">清空</button>
            <button v-if="bottomTab === 'build'" class="ds-mini-btn" @click="clearBuildLogs">清空</button>
            <template v-if="bottomTab === 'code'">
              <button class="ds-mini-btn" @click="copyCode">复制</button>
              <button class="ds-mini-btn" @click="exportCFile">导出 .c</button>
            </template>
            <button class="ds-collapse-btn" :title="bottomCollapsed ? '展开面板' : '收起面板'" @click="bottomCollapsed = !bottomCollapsed">
              <svg viewBox="0 0 16 16"><path :d="bottomCollapsed ? 'M4 10 L8 6 L12 10' : 'M4 6 L8 10 L12 6'" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
            </button>
          </div>
          <div class="ds-bottom-body">
            <div v-if="bottomTab === 'assets'" class="ds-icons">
              <div class="ds-icons-toolbar">
                <select class="ds-input ds-select-inline ds-icon-font-select" v-model="iconFontFile" @change="onIconFontChange">
                  <option v-for="font in builtinFonts" :key="font.file" :value="font.file">{{ font.name }}</option>
                </select>
                <input v-model="iconFontSearch" class="ds-input ds-icon-search" type="text" placeholder="搜索图标名称或 Unicode" />
                <label class="ds-check">字号
                  <select v-model.number="iconDefaultSize" class="ds-select ds-icon-size">
                    <option v-for="size in iconSizeOptions" :key="size" :value="size">{{ size }}</option>
                  </select>
                </label>
                <span class="ds-icons-count">{{ filteredIconGlyphs.length }} 个图标</span>
                <span class="ds-icons-hint">拖拽图标到画布 · 相同字号会合并生成字体</span>
              </div>
              <div v-if="iconFontLoading" class="ds-bottom-empty">正在解析图标字体...</div>
              <div v-else-if="!builtinFonts.length" class="ds-bottom-empty">未找到内置图标字体</div>
              <div v-else class="ds-icon-wrap">
                <button
                  v-for="glyph in visibleIconGlyphs"
                  :key="glyph.code"
                  class="ds-icon-cell"
                  draggable="true"
                  :title="`${glyph.name}  U+${glyph.code.toString(16).toUpperCase()}（拖拽或单击添加到画布）`"
                  @dragstart="onIconDragStart($event, glyph)"
                  @dragend="iconDragPayload = null"
                  @click="addIconWidget(glyph)"
                >
                  <span class="ds-icon-glyph" :style="{ '--icon-family': iconFontFamilies[iconFontFile] || 'inherit' }">{{ glyph.char }}</span>
                </button>
                <span v-if="!visibleIconGlyphs.length" class="ds-bottom-empty">没有匹配的图标</span>
              </div>
              <button
                v-if="visibleIconGlyphs.length < filteredIconGlyphs.length"
                class="ds-load-more"
                @click="iconGlyphLimit += 240"
              >加载更多（剩余 {{ filteredIconGlyphs.length - visibleIconGlyphs.length }}）</button>
            </div>

            <div v-else-if="bottomTab === 'console'" class="ds-console">
              <div v-for="(line, index) in consoleLog" :key="index" class="ds-console-line" :class="line.type">
                <span class="ds-console-time">{{ line.time }}</span>
                <span class="ds-console-text">{{ line.text }}</span>
              </div>
              <div v-if="!consoleLog.length" class="ds-bottom-empty">暂无输出</div>
            </div>

            <div v-else-if="bottomTab === 'errors'" class="ds-errors">
              <div v-for="(err, index) in validationErrors" :key="index" class="ds-error-line">
                <span class="ds-error-dot"></span>{{ err }}
              </div>
              <div v-if="!validationErrors.length" class="ds-bottom-empty ok">未发现明显问题</div>
            </div>

            <div v-else-if="bottomTab === 'build'" ref="buildLogRef" class="ds-build">
              <div
                v-for="(line, index) in buildLogs"
                :key="index"
                class="ds-build-line"
                :class="{ error: /\[ERROR\]|失败|error/i.test(line), ok: /完成|已启动/.test(line) }"
              >{{ line }}</div>
              <div v-if="!buildLogs.length" class="ds-bottom-empty">点击“运行”后，gcc 与图标字体生成的编译日志会显示在这里</div>
            </div>

            <pre v-else class="ds-code">{{ generatedCode }}</pre>
          </div>
        </div>
      </div>

      <!-- 右侧：检查器 -->
      <aside class="ds-right">
        <div class="ds-inspector-tabs">
          <button class="ds-inspector-tab" :class="{ active: activeTab === 'inspect' }" @click="activeTab = 'inspect'">检查器</button>
          <button class="ds-inspector-tab" :class="{ active: activeTab === 'layers' }" @click="activeTab = 'layers'">图层</button>
          <button class="ds-inspector-tab" :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">历史</button>
          <button class="ds-inspector-tab" :class="{ active: activeTab === 'fonts' }" @click="activeTab = 'fonts'">字体</button>
        </div>

        <div class="ds-inspector-body">
          <div v-if="activeTab === 'inspect'" class="ds-pane">
            <div v-if="selectionCount > 1" class="ds-multi-note">
              已选择 {{ selectionCount }} 个控件，命令栏的对齐、分布、缩放和删除会作用于全部选中项。
            </div>
            <template v-if="selectedWidget">
              <details class="ds-group" open>
                <summary>对象</summary>
                <div class="ds-group-body">
                  <div class="ds-row">
                    <label class="ds-label">类型</label>
                    <span class="ds-value">{{ selectedDef.name }}</span>
                  </div>
                  <div class="ds-row">
                    <label class="ds-label">名称</label>
                    <input class="ds-input" type="text" :value="selectedWidget.name" @input="onFieldInput({ key: 'name', type: 'text' }, $event)" />
                  </div>
                </div>
              </details>

              <details class="ds-group" open>
                <summary>位置与尺寸</summary>
                <div class="ds-group-body">
                  <div v-for="field in commonFields" :key="field.key" class="ds-row">
                    <label class="ds-label">{{ field.label }}</label>
                    <input class="ds-input" type="number" :min="field.min" :value="selectedWidget[field.key]" @input="updateCommon(field, $event)" />
                  </div>
                </div>
              </details>

              <details class="ds-group" open>
                <summary>{{ isIconSelection ? '图标（Label）' : selectedDef.name }} 参数</summary>
                <div class="ds-group-body">
                  <div v-for="field in (isIconSelection ? [] : selectedDef.fields)" :key="field.key" class="ds-row">
                    <label class="ds-label">{{ field.label }}</label>

                    <input
                      v-if="field.type === 'number'"
                      class="ds-input"
                      type="number"
                      :min="field.min"
                      :max="field.max"
                      :value="selectedWidget[field.key]"
                      @input="onFieldInput(field, $event)"
                    />

                    <input
                      v-else-if="field.type === 'text'"
                      class="ds-input"
                      type="text"
                      :value="selectedWidget[field.key]"
                      @input="onFieldInput(field, $event)"
                    />

                    <div v-else-if="field.type === 'color'" class="ds-color">
                      <input class="ds-swatch" type="color" :value="selectedWidget[field.key] || '#000000'" @input="onFieldInput(field, $event)" />
                      <input
                        class="ds-input ds-color-text"
                        type="text"
                        :placeholder="field.allowEmpty ? '透明' : '#RRGGBB'"
                        :value="selectedWidget[field.key]"
                        @input="onFieldInput(field, $event)"
                      />
                    </div>

                    <select
                      v-else-if="field.type === 'select'"
                      class="ds-input ds-select-inline"
                      :value="selectedWidget[field.key]"
                      @change="onFieldInput(field, $event)"
                    >
                      <option
                        v-for="option in (field.key === 'font' ? fontOptions : field.options)"
                        :key="option.value"
                        :value="option.value"
                      >{{ option.label }}</option>
                    </select>

                    <label v-else-if="field.type === 'checkbox'" class="ds-switch-row">
                      <input type="checkbox" :checked="selectedWidget[field.key]" @change="onFieldInput(field, $event)" />
                      <span>{{ selectedWidget[field.key] ? '已启用' : '未启用' }}</span>
                    </label>
                  </div>

                  <template v-if="isIconSelection">
                    <div class="ds-row">
                      <label class="ds-label">字号</label>
                      <input
                        class="ds-input"
                        type="number"
                        min="8"
                        max="128"
                        :value="iconFontSize(selectedWidget)"
                        @change="onIconSizeChange"
                      />
                    </div>
                    <div class="ds-row">
                      <label class="ds-label">图标颜色</label>
                      <input
                        class="ds-color"
                        type="color"
                        :value="iconWidgetColor(selectedWidget)"
                        @change="onIconColorChange"
                      />
                    </div>
                    <div class="ds-row">
                      <label class="ds-label">字体</label>
                      <span class="ds-value">{{ selectedWidget.iconFontName || selectedWidget.fontName || '未选择' }}</span>
                    </div>
                    <div class="ds-row">
                      <label class="ds-label">Unicode</label>
                      <span class="ds-value mono">U+{{ (iconCodeFor(selectedWidget) || 0).toString(16).toUpperCase() }}</span>
                    </div>
                    <div class="ds-btn-row">
                      <button class="ds-mini-btn" @click="openIconLibrary(true)">更换图标</button>
                    </div>
                  </template>
                </div>
              </details>

              <details class="ds-group" open>
                <summary>操作</summary>
                <div class="ds-group-body">
                  <div class="ds-btn-row">
                    <button class="ds-mini-btn" @click="moveLayer(1)">上移</button>
                    <button class="ds-mini-btn" @click="moveLayer(-1)">下移</button>
                    <button class="ds-mini-btn" @click="duplicateSelected">复制</button>
                    <button class="ds-mini-btn danger" @click="deleteSelected">删除</button>
                  </div>
                </div>
              </details>
            </template>

            <template v-else>
              <details class="ds-group" open>
                <summary>画布</summary>
                <div class="ds-group-body">
                  <div class="ds-row">
                    <label class="ds-label">工程名</label>
                    <input class="ds-input" type="text" :value="project.name" @input="onProjectNameInput" />
                  </div>
                  <div class="ds-row">
                    <label class="ds-label">预设</label>
                    <select class="ds-input ds-select-inline" v-model="screenPreset" @change="applyScreenPreset">
                      <option v-for="p in SCREEN_PRESETS" :key="`${p.width}x${p.height}`" :value="`${p.width}x${p.height}`">{{ p.label }}</option>
                      <option value="custom">自定义</option>
                    </select>
                  </div>
                  <div class="ds-row">
                    <label class="ds-label">宽</label>
                    <input class="ds-input" type="number" min="64" max="4096" :value="project.width" @change="setScreenDimension('width', $event.target.value)" />
                  </div>
                  <div class="ds-row">
                    <label class="ds-label">高</label>
                    <input class="ds-input" type="number" min="64" max="4096" :value="project.height" @change="setScreenDimension('height', $event.target.value)" />
                  </div>
                  <div class="ds-row">
                    <label class="ds-label">背景色</label>
                    <div class="ds-color">
                      <input class="ds-swatch" type="color" :value="project.bgColor" @input="onProjectColorInput($event.target.value)" />
                      <input class="ds-input ds-color-text" type="text" :value="project.bgColor" @input="onProjectColorInput($event.target.value)" />
                    </div>
                  </div>
                </div>
              </details>

              <details class="ds-group" open>
                <summary>操作提示</summary>
                <div class="ds-group-body">
                  <ul class="ds-hints">
                    <li>从左侧拖入组件，单击组件后在右侧调整参数</li>
                    <li>拖拽组件移动，拖拽控制点缩放</li>
                    <li>方向键微调，Shift + 方向键 10 像素</li>
                    <li>Delete 删除，Ctrl + Z / Y 撤销重做</li>
                    <li>运行按钮会用 SGL + SDL2 打开真实渲染窗口</li>
                  </ul>
                </div>
              </details>
            </template>
          </div>

          <div v-else-if="activeTab === 'layers'" class="ds-pane">
            <div class="ds-btn-row">
              <button class="ds-mini-btn" :disabled="!selectedWidget" @click="moveLayer(1)">上移</button>
              <button class="ds-mini-btn" :disabled="!selectedWidget" @click="moveLayer(-1)">下移</button>
              <button class="ds-mini-btn danger" :disabled="!selectedWidget" @click="deleteSelected">删除</button>
            </div>
            <div v-if="!layerList.length" class="ds-bottom-empty">暂无组件</div>
            <div
              v-for="widget in layerList"
              :key="widget.id"
              class="ds-layer"
              :class="{ active: isSelected(widget), off: widget.hidden }"
              @click="selectWidget(widget.id, $event)"
            >
              <span class="ds-tree-dot"></span>
              <span class="ds-layer-name">{{ widget.name }}</span>
              <span class="ds-layer-type">{{ WIDGET_DEFS[widget.type].name }}</span>
              <button class="ds-eye" @click.stop="toggleHidden(widget)">{{ widget.hidden ? '○' : '●' }}</button>
            </div>
          </div>

          <div v-else-if="activeTab === 'history'" class="ds-pane">
            <div class="ds-history-stat">
              <div class="ds-history-num">{{ historySteps }}</div>
              <div class="ds-history-label">历史快照</div>
            </div>
            <div class="ds-btn-row">
              <button class="ds-mini-btn" :disabled="!canUndo" @click="undo">撤销</button>
              <button class="ds-mini-btn" :disabled="!canRedo" @click="redo">重做</button>
            </div>
            <p class="ds-hint-text">每次拖拽、缩放或修改参数都会生成历史快照，最多保留 80 步。</p>
          </div>

          <div v-else class="ds-pane">
            <div v-for="font in FONT_OPTIONS" :key="font.value" class="ds-font-item">
              <div class="ds-font-name">{{ font.label }}</div>
              <div class="ds-font-sample" :style="{ fontSize: fontPx(font.value) + 'px' }">Aa 0123 SGL</div>
            </div>
            <p class="ds-hint-text">内置点阵字体主要覆盖 ASCII。</p>

            <div class="ds-font-section">
              <div class="ds-font-section-title">本地系统字体</div>
              <div class="ds-row">
                <label class="ds-label">字体</label>
                <input v-model="systemFontQuery" class="ds-input" type="text" placeholder="搜索系统字体" />
              </div>
              <div class="ds-row">
                <label class="ds-label">选择</label>
                <select v-model="systemFontPick" class="ds-input ds-select-inline">
                  <option value="">请选择</option>
                  <option v-for="font in filteredSystemFonts" :key="font.path" :value="font.path">{{ font.name }}</option>
                </select>
              </div>
              <div class="ds-row">
                <label class="ds-label">字号</label>
                <input v-model.number="systemFontSize" class="ds-input" type="number" min="8" max="128" />
              </div>
              <div class="ds-btn-row">
                <button class="ds-mini-btn" :disabled="systemFontsLoading" @click="addSystemFont">添加字体</button>
                <button class="ds-mini-btn" :disabled="systemFontsLoading" @click="loadSystemFonts">刷新列表</button>
              </div>
              <div v-if="systemFontsLoading" class="ds-hint-text">正在读取系统字体...</div>
              <div v-else-if="!systemFonts.length" class="ds-hint-text">未读取到系统字体，可点击“刷新列表”。</div>
              <div v-else class="ds-hint-text">共 {{ systemFonts.length }} 个系统字体，最多显示前 200 个。</div>

              <div v-for="font in project.fonts || []" :key="font.symbol" class="ds-font-item">
                <div class="ds-font-title-row">
                  <div class="ds-font-name">{{ font.name }} · {{ font.size }}px</div>
                  <button class="ds-mini-btn" @click="applySystemFont(font)">应用</button>
                  <button class="ds-mini-btn danger" @click="removeSystemFont(font)">删除</button>
                </div>
                <div
                  class="ds-font-sample"
                  :style="{ fontSize: Math.min(font.size, 32) + 'px', fontFamily: `'${font.name}', sans-serif` }"
                >Aa 0123 中文</div>
                <div v-if="systemFontUseCount(font)" class="ds-hint-text">已被 {{ systemFontUseCount(font) }} 个控件使用</div>
              </div>
              <p class="ds-hint-text">编译时只转换所选字体在界面中实际使用到的字符。</p>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <div class="ds-statusbar">
      <span>{{ selectionCount > 1 ? `已选择 ${selectionCount} 个控件` : (selectedWidget ? `已选择：${selectedWidget.name}` : '就绪') }}</span>
      <span v-if="validationErrors.length" class="ds-status-warn">{{ validationErrors.length }} 个警告</span>
      <span class="ds-status-right">SGL UI Designer · {{ project.width }}×{{ project.height }} · {{ Math.round(scale * 100) }}%{{ gridEnabled ? ` · 栅格 ${gridSize}px` : '' }}{{ gridSnap ? ' · 吸附' : '' }}</span>
    </div>
  </div>
</template>

<style scoped>
/* ============ SquareLine 风格深色编辑器 ============ */
.designer-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1b1b1b;
  overflow: hidden;
  color: #cfcfcf;
  font-size: 12px;
  user-select: none;
}

.designer-page,
.designer-page * {
  font-family: "Segoe UI", "Microsoft YaHei", Arial, sans-serif !important;
}

.designer-page pre,
.designer-page code,
.designer-page .mono {
  font-family: Consolas, "Courier New", monospace !important;
}

/* ---------- 菜单栏 ---------- */
.ds-menubar {
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 4px;
  background: #202020;
  border-bottom: 1px solid #333;
  position: relative;
  z-index: 20;
}
.ds-menu {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
}
.ds-menu-label {
  padding: 0 12px;
  height: 100%;
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #bdbdbd;
  cursor: default;
  border: 1px solid transparent;
}
.ds-menu-label:hover,
.ds-menu-label.active {
  background: #2f2f2f;
  color: #fff;
  border-color: #4c4c4c;
}
.ds-dropdown {
  position: absolute;
  top: 27px;
  left: 0;
  min-width: 168px;
  background: #2a2a2b;
  border: 1px solid #444;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
  padding: 4px 0;
  z-index: 30;
}
.ds-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 14px;
  background: transparent;
  border: none;
  color: #d2d2d2;
  font-size: 12px;
  cursor: pointer;
}
.ds-menu-item:hover:not(:disabled) {
  background: #3a4a3c;
  color: #fff;
}
.ds-menu-item:disabled {
  color: #6a6a6a;
  cursor: default;
}
.ds-menu-sep {
  height: 1px;
  background: #3c3c3c;
  margin: 4px 0;
}
.ds-menubar-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  color: #e0e0e0;
  letter-spacing: 0.5px;
  pointer-events: none;
}
.ds-menubar-right {
  margin-left: auto;
  padding-right: 8px;
  font-size: 10.5px;
  color: #767676;
  letter-spacing: 0.5px;
}
.ds-backdrop {
  position: fixed;
  inset: 0;
  z-index: 15;
}

/* ---------- 工具栏 ---------- */
.ds-toolbar {
  height: 38px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  background: #262626;
  border-bottom: 1px solid #333;
}
.ds-icon-btn {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #b9b9b9;
  cursor: pointer;
  padding: 0;
}
.ds-icon-btn svg {
  width: 15px;
  height: 15px;
}
.ds-icon-btn:hover:not(:disabled) {
  background: #343434;
  border-color: #454545;
  color: #fff;
}
.ds-icon-btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.ds-toolbar-sep {
  width: 1px;
  height: 18px;
  background: #3c3c3c;
  margin: 0 6px;
}
.ds-toolbar-spacer {
  flex: 1;
}
.ds-meta {
  font-size: 11px;
  color: #8f8f8f;
  white-space: nowrap;
}
.ds-meta b {
  color: #d8d8d8;
  font-weight: 600;
}
.ds-select {
  height: 24px;
  background: #1e1e1e;
  border: 1px solid #3d3d3d;
  border-radius: 3px;
  color: #d2d2d2;
  font-size: 11px;
  padding: 0 4px;
  outline: none;
}
.ds-zoom {
  width: 68px;
}
.ds-check {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #9a9a9a;
  white-space: nowrap;
}
.ds-run-btn,
.ds-stop-btn {
  height: 26px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 4px;
  border: 1px solid #3f7a44;
  background: #2f6b35;
  color: #eafaea;
  font-size: 11.5px;
  padding: 0 10px;
  cursor: pointer;
}
.ds-run-btn svg,
.ds-stop-btn svg {
  width: 12px;
  height: 12px;
}
.ds-run-btn:hover:not(:disabled) {
  background: #3a8443;
  border-color: #4caf50;
}
.ds-run-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
.ds-stop-btn {
  background: #2a2a2a;
  border-color: #4a3a3a;
  color: #d98b8b;
  padding: 0 7px;
}
.ds-stop-btn:hover {
  background: #3a2a2a;
  border-color: #7a4a4a;
  color: #ffb0b0;
}

/* ---------- 画布命令栏 ---------- */
.ds-commandbar {
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  background: #232323;
  border-bottom: 1px solid #333;
}
.ds-cmd-group-label {
  font-size: 10px;
  color: #767676;
  letter-spacing: 1px;
  margin: 0 3px;
}
.ds-cmd-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 3px;
  background: transparent;
  color: #a8a8a8;
  cursor: pointer;
}
.ds-cmd-btn svg {
  width: 14px;
  height: 14px;
}
.ds-cmd-btn:hover:not(:disabled) {
  background: #343434;
  border-color: #4a4a4a;
  color: #fff;
}
.ds-cmd-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
.ds-cmd-btn.danger:hover:not(:disabled) {
  background: #4a2c2c;
  border-color: #8a5050;
  color: #ffc0c0;
}
.ds-cmd-sep {
  width: 1px;
  height: 16px;
  background: #3c3c3c;
  margin: 0 5px;
}
.ds-commandbar-spacer {
  flex: 1;
}
.ds-cmd-meta {
  font-size: 10.5px;
  color: #7d7d7d;
  white-space: nowrap;
}
.ds-multi-note {
  background: #2c3b2e;
  border: 1px solid #3f5d43;
  color: #a9d3ae;
  font-size: 10.5px;
  line-height: 1.6;
  padding: 5px 7px;
  border-radius: 3px;
  margin-bottom: 6px;
}

/* ---------- 消息 ---------- */
.ds-message {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 10px;
  font-size: 11.5px;
  border-bottom: 1px solid #333;
  cursor: pointer;
  flex-shrink: 0;
}
.ds-message.info { background: #1e2a35; color: #9dc7e8; }
.ds-message.success { background: #1e2f23; color: #9ed8ab; }
.ds-message.error { background: #35201f; color: #f0a3a3; white-space: pre-wrap; }
.ds-message-text {
  flex: 1;
  max-height: 100px;
  overflow: auto;
  word-break: break-word;
}
.ds-message-close { font-size: 14px; line-height: 1; }

/* ---------- 主区域 ---------- */
.ds-main {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* ---------- 左侧 ---------- */
.ds-left {
  width: 188px;
  flex-shrink: 0;
  background: #232323;
  border-right: 1px solid #333;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}
.ds-section-head {
  height: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 8px;
  margin-top: 6px;
  background: #2c2c2c;
  border-top: 1px solid #383838;
  border-bottom: 1px solid #383838;
  font-size: 10.5px;
  font-weight: 600;
  color: #9d9d9d;
  letter-spacing: 1.5px;
}
.ds-tree {
  padding: 3px 0;
  flex-shrink: 0;
  max-height: 190px;
  overflow-y: auto;
}
.ds-tree-root,
.ds-tree-item {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 8px;
  cursor: pointer;
  border-left: 2px solid transparent;
}
.ds-tree-root:hover,
.ds-tree-item:hover {
  background: #2c2c2c;
}
.ds-tree-root.active,
.ds-tree-item.active {
  background: #2c3b2e;
  border-left-color: #4caf50;
}
.ds-tree-item {
  padding-left: 22px;
}
.ds-tree-item.off { opacity: 0.45; }
.ds-tree-name {
  flex: 1;
  font-size: 11.5px;
  color: #cfcfcf;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ds-tree-root.active .ds-tree-name,
.ds-tree-item.active .ds-tree-name {
  color: #b9e6be;
}
.ds-screen-glyph {
  width: 14px;
  height: 10px;
  border: 1px solid #7fae84;
  border-radius: 1px;
  background: #1e3322;
  flex-shrink: 0;
}
.ds-tree-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6d6d6d;
  flex-shrink: 0;
}
.ds-tree-item.active .ds-tree-dot {
  background: #4caf50;
  box-shadow: 0 0 4px rgba(76, 175, 80, 0.8);
}
.ds-eye {
  border: none;
  background: transparent;
  color: #7c7c7c;
  font-size: 10px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}
.ds-eye:hover { color: #bdbdbd; }
.ds-empty-small {
  font-size: 10.5px;
  color: #6c6c6c;
  padding: 6px 10px;
}

.ds-widget-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
  padding: 5px;
  flex-shrink: 0;
}
.ds-widget-grid.single {
  grid-template-columns: repeat(3, 1fr);
}
.ds-tile {
  height: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  background: #2b2b2b;
  border: 1px solid #383838;
  border-radius: 3px;
  cursor: grab;
  transition: border-color 0.12s, background 0.12s;
}
.ds-tile:hover {
  background: #333;
  border-color: #5a8f5f;
}
.ds-tile:active { cursor: grabbing; }
.ds-tile-name {
  font-size: 10px;
  color: #b9b9b9;
  line-height: 1;
  white-space: nowrap;
}
.ds-tile-icon {
  width: 18px;
  height: 14px;
  border: 1px solid #8d8d8d;
  border-radius: 2px;
  position: relative;
  flex-shrink: 0;
  background: #1e1e1e;
}
.ico-label {
  border: none;
  background: repeating-linear-gradient(#a9a9a9 0 1px, transparent 1px 4px);
  height: 10px;
}
.ico-button {
  background: #5d5d5d;
  border-color: #9a9a9a;
  border-radius: 4px;
}
.ico-rect {
  background: #3d5a41;
  border-color: #64a86d;
}
.ico-circle {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #4b4b4b;
  border-color: #9a9a9a;
}
.ico-line {
  border: none;
  background: linear-gradient(160deg, transparent 44%, #b0b0b0 45%, #b0b0b0 52%, transparent 53%);
}
.ico-switch {
  width: 20px;
  height: 11px;
  border-radius: 6px;
  background: #3d5a41;
  border-color: #64a86d;
}
.ico-switch::after {
  content: "";
  position: absolute;
  right: 1px;
  top: 1px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d8d8d8;
}
.ico-checkbox {
  border-color: #64a86d;
  background: #2d3f31;
}
.ico-checkbox::after {
  content: "";
  position: absolute;
  left: 3px;
  top: 3px;
  width: 8px;
  height: 4px;
  border-left: 1.5px solid #9fdfa7;
  border-bottom: 1.5px solid #9fdfa7;
  transform: rotate(-45deg);
}
.ico-led {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #4caf50;
  border: none;
  box-shadow: 0 0 5px rgba(76, 175, 80, 0.9);
}
.ico-textbox {
  background: #1e1e1e;
}
.ico-textbox::after {
  content: "";
  position: absolute;
  left: 3px;
  top: 5px;
  width: 10px;
  height: 1px;
  background: #8d8d8d;
}
.ico-qrcode {
  background-image: repeating-conic-gradient(#cfcfcf 0 25%, #1e1e1e 0 50%);
  background-size: 5px 5px;
}
.ico-slider {
  border: none;
  background: linear-gradient(#b0b0b0, #b0b0b0) center / 100% 2px no-repeat;
}
.ico-slider::after {
  content: "";
  position: absolute;
  left: 6px;
  top: 3px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d8d8d8;
}
.ico-progress {
  border: none;
  background: #3a3a3a;
}
.ico-progress::after {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  width: 65%;
  height: 100%;
  background: #4caf50;
}
.ico-bar {
  border: none;
  background: linear-gradient(90deg, #4caf50 0 25%, transparent 25% 37%, #4caf50 37% 68%, transparent 68% 80%, #4caf50 80% 100%);
}
.ico-arc {
  border: 2px solid #4caf50;
  border-radius: 50%;
  background: transparent;
  clip-path: polygon(50% 50%, 100% 0, 100% 100%, 0 100%, 0 0, 50% 0);
}
.ico-icon {
  border: none;
  background: transparent;
  width: 16px;
  height: 16px;
}
.ico-icon::after {
  content: "★";
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #d0b45a;
  font-size: 15px;
  line-height: 1;
}
.ico-screen {
  width: 16px;
  height: 12px;
  border-color: #8fae92;
  background: #203024;
}
.ico-screen::after {
  content: "";
  position: absolute;
  left: 5px;
  bottom: -4px;
  width: 4px;
  height: 4px;
  border-left: 1px solid #8fae92;
  border-right: 1px solid #8fae92;
}
.ds-left-tip {
  padding: 4px 8px 10px;
  font-size: 10px;
  color: #6c6c6c;
  line-height: 1.5;
}

/* ---------- 中间画布 ---------- */
.ds-center {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #2b2b2b;
}
.ds-canvas-viewport {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background-color: #2b2b2b;
  background-image: radial-gradient(#3d3d3d 1px, transparent 1px);
  background-size: 16px 16px;
}
.ds-stage-column {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
.ds-screen-tab {
  height: 24px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 0 12px;
  background: #343434;
  border: 1px solid #414141;
  border-bottom: none;
  border-radius: 4px 4px 0 0;
  font-size: 11px;
  color: #c8c8c8;
  max-width: 100%;
}
.ds-screen-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4caf50;
}
.ds-screen-size {
  color: #7d7d7d;
  font-size: 10px;
  margin-left: 4px;
}
.ds-canvas-stage {
  position: relative;
  flex-shrink: 0;
}
.ds-canvas {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: top left;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
  outline: 1px solid #444;
}
.ds-canvas-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 16px 16px;
  z-index: 0;
}
.ds-canvas-hint {
  position: absolute;
  pointer-events: none;
  color: rgba(255, 255, 255, 0.25);
  font-size: 12px;
  letter-spacing: 1px;
}
.ds-busy {
  position: absolute;
  inset: 0;
  background: rgba(20, 20, 20, 0.62);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  z-index: 50;
}
.ds-spinner {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.2);
  border-top-color: #4caf50;
  animation: ds-spin 0.9s linear infinite;
}
.ds-busy-text { color: #ddd; font-size: 12px; }
@keyframes ds-spin { to { transform: rotate(360deg); } }

/* ---------- 画布控件 ---------- */
.ds-widget {
  position: absolute;
  cursor: move;
  z-index: 1;
}
.ds-widget:hover {
  outline: 1px dashed rgba(76, 175, 80, 0.8);
  outline-offset: 1px;
}
.ds-widget.selected {
  outline: 1px solid #4caf50;
  outline-offset: 0;
  z-index: 10;
}
.ds-widget-inner {
  position: relative;
  pointer-events: none;
  overflow: hidden;
  display: flex;
}
.pv-label,
.pv-button,
.pv-textbox,
.pv-checkbox {
  font-family: Consolas, "Courier New", monospace !important;
}
.pv-label {
  width: 100%;
  display: flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  line-height: 1.1;
}
.pv-button,
.pv-textbox {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  overflow: hidden;
}
.pv-textbox {
  justify-content: flex-start;
  padding: 0 6px;
}
.pv-rect,
.pv-circle,
.pv-led {
  width: 100%;
  height: 100%;
}
.pv-icon {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  overflow: hidden;
  font-family: var(--icon-family, inherit) !important;
}
.pv-circle,
.pv-led { border-radius: 50%; }
.pv-line {
  overflow: visible;
  position: absolute;
  left: 0;
  top: 0;
}
.pv-arc { width: 100%; height: 100%; }
.pv-slider {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
}
.pv-slider-track,
.pv-slider-fill { position: absolute; }
.pv-slider-track { inset: 35% 0; }
.pv-slider.vertical .pv-slider-track { inset: 0 35%; }
.pv-slider-fill { inset: 35% auto 35% 0; width: 50%; }
.pv-slider.vertical .pv-slider-fill { inset: auto 35% 0 35%; height: 50%; }
.pv-slider-knob {
  position: absolute;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
}
.pv-progress,
.pv-bar {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.pv-progress-fill,
.pv-bar-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
}
.pv-switch {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  padding: 3px;
}
.pv-switch-knob {
  border-radius: 50%;
  transition: transform 0.2s ease;
}
.pv-checkbox {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  overflow: hidden;
  line-height: 1.1;
}
.pv-check-box {
  width: 18px;
  height: 18px;
  border: 2px solid;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pv-check-mark { width: 12px; height: 12px; }
.pv-qrcode { width: 100%; height: 100%; display: block; }

.ds-handle {
  position: absolute;
  width: 7px;
  height: 7px;
  background: #4caf50;
  border: 1px solid #1c3d20;
  border-radius: 1px;
  z-index: 20;
}
.handle-nw { left: -4px; top: -4px; cursor: nwse-resize; }
.handle-n { left: 50%; top: -4px; margin-left: -3px; cursor: ns-resize; }
.handle-ne { right: -4px; top: -4px; cursor: nesw-resize; }
.handle-e { right: -4px; top: 50%; margin-top: -3px; cursor: ew-resize; }
.handle-se { right: -4px; bottom: -4px; cursor: nwse-resize; }
.handle-s { left: 50%; bottom: -4px; margin-left: -3px; cursor: ns-resize; }
.handle-sw { left: -4px; bottom: -4px; cursor: nesw-resize; }
.handle-w { left: -4px; top: 50%; margin-top: -3px; cursor: ew-resize; }
.ds-selection-tag {
  position: absolute;
  left: 0;
  top: -18px;
  background: #4caf50;
  color: #10250f;
  font-size: 9.5px;
  font-weight: 600;
  line-height: 1;
  padding: 3px 5px;
  border-radius: 3px 3px 3px 0;
  white-space: nowrap;
  pointer-events: none;
}

/* ---------- 底部面板 ---------- */
.ds-bottom {
  height: 150px;
  flex-shrink: 0;
  background: #262626;
  border-top: 1px solid #333;
  display: flex;
  flex-direction: column;
}
.ds-bottom.collapsed { height: 26px; }
.ds-bottom.collapsed .ds-bottom-body { display: none; }
.ds-bottom-resizer {
  height: 5px;
  flex-shrink: 0;
  cursor: row-resize;
  background: #232323;
  border-top: 1px solid #3a3a3a;
  position: relative;
  transition: background 0.12s ease;
}
.ds-bottom-resizer::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 1px;
  width: 40px;
  height: 2px;
  border-radius: 1px;
  transform: translateX(-50%);
  background: #464646;
}
.ds-bottom-resizer:hover,
.ds-bottom-resizer.active {
  background: #2f3b30;
}
.ds-bottom-resizer:hover::after,
.ds-bottom-resizer.active::after {
  background: #7fb07f;
}
.ds-collapse-btn {
  width: 20px;
  height: 20px;
  margin-left: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #3d3d3d;
  border-radius: 3px;
  background: #2b2b2b;
  color: #9a9a9a;
  cursor: pointer;
  padding: 0;
}
.ds-collapse-btn svg { width: 12px; height: 12px; }
.ds-collapse-btn:hover { color: #e0e0e0; border-color: #555; }
.ds-bottom-tabs {
  height: 26px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px;
  background: #202020;
  border-bottom: 1px solid #333;
}
.ds-bottom-tab {
  height: 100%;
  border: none;
  background: transparent;
  color: #8f8f8f;
  font-size: 11px;
  padding: 0 10px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.ds-bottom-tab:hover { color: #cfcfcf; }
.ds-bottom-tab.active {
  color: #e8e8e8;
  border-bottom-color: #4caf50;
}
.ds-count {
  display: inline-block;
  min-width: 14px;
  padding: 0 3px;
  margin-left: 2px;
  border-radius: 7px;
  background: #3a3a3a;
  color: #a8a8a8;
  font-size: 9.5px;
  line-height: 13px;
  text-align: center;
}
.ds-count.warn {
  background: #4a2f2f;
  color: #e8a1a1;
}
.ds-bottom-spacer { flex: 1; }
.ds-mini-btn {
  height: 20px;
  padding: 0 8px;
  border: 1px solid #434343;
  border-radius: 3px;
  background: #303030;
  color: #c4c4c4;
  font-size: 10.5px;
  cursor: pointer;
}
.ds-mini-btn:hover:not(:disabled) {
  background: #3c4a3e;
  border-color: #5a8f5f;
  color: #e2f5e4;
}
.ds-mini-btn:disabled { opacity: 0.4; cursor: default; }
.ds-mini-btn.danger:hover:not(:disabled) {
  background: #4a2c2c;
  border-color: #8a5050;
  color: #ffc0c0;
}
.ds-bottom-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px;
}
.ds-assets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ds-icons {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.ds-icons-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ds-icon-font-select {
  flex: none;
  width: 190px;
}
.ds-icon-search {
  flex: 1;
  min-width: 120px;
  max-width: 240px;
}
.ds-icon-size {
  width: 56px;
  margin-left: 4px;
}
.ds-icons-count {
  font-size: 10.5px;
  color: #8b8b8b;
}
.ds-icons-hint {
  font-size: 10px;
  color: #6d6d6d;
}
.ds-icon-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
.ds-icon-cell {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: #2c2c2c;
  border: 1px solid #383838;
  border-radius: 3px;
  color: #d2d2d2;
  cursor: grab;
}
.ds-icon-cell:active {
  cursor: grabbing;
}
.ds-icon-cell:hover {
  background: #2c3b2e;
  border-color: #4caf50;
  color: #fff;
}
.ds-icon-glyph {
  font-size: 20px;
  line-height: 1;
  font-family: var(--icon-family, inherit) !important;
}
.ds-load-more {
  align-self: flex-start;
  margin-top: 4px;
  height: 22px;
  padding: 0 10px;
  background: #303030;
  border: 1px solid #434343;
  border-radius: 3px;
  color: #bdbdbd;
  font-size: 10.5px;
  cursor: pointer;
}
.ds-load-more:hover {
  background: #3c4a3e;
  border-color: #5a8f5f;
  color: #e2f5e4;
}
.ds-asset {
  width: 76px;
  height: 58px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  background: #2c2c2c;
  border: 1px solid #3a3a3a;
  border-radius: 3px;
  cursor: pointer;
}
.ds-asset:hover { border-color: #5a8f5f; }
.ds-asset.active {
  border-color: #4caf50;
  background: #2c3b2e;
}
.ds-asset-icon {
  width: 18px;
  height: 14px;
  border: 1px solid #8d8d8d;
  border-radius: 2px;
  position: relative;
  background: #1e1e1e;
}
.ds-asset-name {
  font-size: 9.5px;
  color: #c8c8c8;
  max-width: 68px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ds-asset-type {
  font-size: 9px;
  color: #6f6f6f;
}
.ds-console {
  font-size: 11px;
  line-height: 1.65;
}
.ds-console-line {
  display: flex;
  gap: 8px;
  color: #b5b5b5;
  padding: 1px 0;
}
.ds-console-line.success { color: #9ed8ab; }
.ds-console-line.error { color: #f0a3a3; }
.ds-console-time {
  color: #6f6f6f;
  flex-shrink: 0;
  font-family: Consolas, monospace !important;
}
.ds-console-text { word-break: break-word; }
.ds-errors { font-size: 11px; }
.ds-error-line {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #d8b28a;
  padding: 2px 0;
}
.ds-error-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #d08a3c;
  flex-shrink: 0;
}
.ds-bottom-empty {
  color: #6f6f6f;
  font-size: 11px;
  padding: 8px;
}
.ds-bottom-empty.ok { color: #7fae84; }
.ds-build {
  font-size: 10.5px;
  line-height: 1.55;
  color: #b9c4b9;
  white-space: pre-wrap;
  word-break: break-word;
}
.ds-build-line {
  padding: 0 2px;
}
.ds-build-line.error {
  color: #f0a3a3;
}
.ds-build-line.ok {
  color: #9ed8ab;
}
.ds-code {
  margin: 0;
  color: #c8d3f5;
  font-size: 10.5px;
  line-height: 1.5;
  white-space: pre;
  padding: 2px;
}

/* ---------- 右侧 ---------- */
.ds-right {
  width: 286px;
  flex-shrink: 0;
  background: #232323;
  border-left: 1px solid #333;
  display: flex;
  flex-direction: column;
}
.ds-inspector-tabs {
  height: 30px;
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  background: #202020;
  border-bottom: 1px solid #333;
  padding: 0 4px;
}
.ds-inspector-tab {
  flex: 1;
  border: none;
  background: transparent;
  color: #8c8c8c;
  font-size: 11px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  padding: 0;
}
.ds-inspector-tab:hover { color: #cfcfcf; }
.ds-inspector-tab.active {
  color: #f0f0f0;
  border-bottom-color: #4caf50;
}
.ds-inspector-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.ds-pane { padding: 6px; }
.ds-group {
  background: #262626;
  border: 1px solid #363636;
  border-radius: 3px;
  margin-bottom: 5px;
}
.ds-group summary {
  height: 24px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  background: #2e2e2e;
  color: #bdbdbd;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.6px;
  cursor: pointer;
  list-style: none;
  user-select: none;
}
.ds-group summary::-webkit-details-marker { display: none; }
.ds-group summary::before {
  content: "";
  width: 0;
  height: 0;
  border-left: 4px solid #8f8f8f;
  border-top: 3px solid transparent;
  border-bottom: 3px solid transparent;
  margin-right: 6px;
  transform: rotate(90deg);
  transition: transform 0.12s;
}
.ds-group:not([open]) summary::before { transform: rotate(0deg); }
.ds-group-body { padding: 6px 8px; }
.ds-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  margin-bottom: 3px;
}
.ds-label {
  width: 74px;
  flex-shrink: 0;
  font-size: 10.5px;
  color: #909090;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ds-value {
  font-size: 11px;
  color: #cfcfcf;
}
.ds-input {
  flex: 1;
  min-width: 0;
  height: 23px;
  background: #1d1d1d;
  border: 1px solid #3b3b3b;
  border-radius: 3px;
  color: #d2d2d2;
  font-size: 11px;
  padding: 0 5px;
  outline: none;
}
.ds-input:focus {
  border-color: #4caf50;
  box-shadow: 0 0 0 1px rgba(76, 175, 80, 0.25);
}
.ds-select-inline {
  padding: 0 2px;
}
.ds-color {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}
.ds-swatch {
  width: 23px;
  height: 23px;
  padding: 0;
  border: 1px solid #444;
  border-radius: 3px;
  background: none;
  cursor: pointer;
  flex-shrink: 0;
}
.ds-color-text { text-transform: lowercase; }
.ds-switch-row {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  color: #a8a8a8;
}
.ds-btn-row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  padding: 2px 0;
}
.ds-hints {
  margin: 0;
  padding-left: 14px;
  font-size: 10.5px;
  line-height: 1.75;
  color: #8f8f8f;
}
.ds-layer {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 6px;
  border-radius: 3px;
  cursor: pointer;
  border-left: 2px solid transparent;
}
.ds-layer:hover { background: #2c2c2c; }
.ds-layer.active {
  background: #2c3b2e;
  border-left-color: #4caf50;
}
.ds-layer.off { opacity: 0.5; }
.ds-layer-name {
  flex: 1;
  font-size: 11px;
  color: #c8c8c8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ds-layer-type {
  font-size: 9.5px;
  color: #7a7a7a;
}
.ds-history-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 18px 0 14px;
}
.ds-history-num {
  font-size: 34px;
  font-weight: 300;
  color: #d8d8d8;
  line-height: 1;
}
.ds-history-label {
  font-size: 10.5px;
  color: #7f7f7f;
  margin-top: 4px;
  letter-spacing: 1px;
}
.ds-hint-text {
  font-size: 10.5px;
  line-height: 1.7;
  color: #7f7f7f;
  margin: 10px 2px 0;
}
.ds-font-item {
  padding: 6px 8px;
  border-bottom: 1px solid #303030;
}
.ds-font-name {
  font-size: 10px;
  color: #8a8a8a;
  margin-bottom: 2px;
}
.ds-font-sample {
  color: #d8d8d8;
  font-family: Consolas, monospace !important;
  line-height: 1.2;
  overflow: hidden;
  white-space: nowrap;
}

/* ---------- 状态栏 ---------- */
.ds-statusbar {
  height: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 10px;
  background: #1f1f1f;
  border-top: 1px solid #333;
  font-size: 10.5px;
  color: #808080;
}
.ds-status-warn { color: #d8b28a; }
.ds-status-right { margin-left: auto; }
.ds-grid-input {
  width: 46px;
  flex: none;
  height: 22px;
  padding: 0 4px;
  text-align: center;
}
.ds-grid-input:disabled {
  opacity: 0.45;
}
.ds-grid-unit {
  font-size: 10px;
  color: #6d6d6d;
  margin-left: -3px;
}

/* ---------- 简约滚动条 ---------- */
.ds-left,
.ds-tree,
.ds-canvas-viewport,
.ds-bottom-body,
.ds-inspector-body,
.ds-code {
  scrollbar-width: thin;
  scrollbar-color: #4b4b4b transparent;
}
.ds-left::-webkit-scrollbar,
.ds-tree::-webkit-scrollbar,
.ds-canvas-viewport::-webkit-scrollbar,
.ds-bottom-body::-webkit-scrollbar,
.ds-inspector-body::-webkit-scrollbar,
.ds-code::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.ds-left::-webkit-scrollbar-track,
.ds-tree::-webkit-scrollbar-track,
.ds-canvas-viewport::-webkit-scrollbar-track,
.ds-bottom-body::-webkit-scrollbar-track,
.ds-inspector-body::-webkit-scrollbar-track,
.ds-code::-webkit-scrollbar-track {
  background: transparent;
}
.ds-left::-webkit-scrollbar-thumb,
.ds-tree::-webkit-scrollbar-thumb,
.ds-canvas-viewport::-webkit-scrollbar-thumb,
.ds-bottom-body::-webkit-scrollbar-thumb,
.ds-inspector-body::-webkit-scrollbar-thumb,
.ds-code::-webkit-scrollbar-thumb {
  background: #4b4b4b;
  border: 2px solid transparent;
  border-radius: 5px;
  background-clip: content-box;
}
.ds-left::-webkit-scrollbar-thumb:hover,
.ds-tree::-webkit-scrollbar-thumb:hover,
.ds-canvas-viewport::-webkit-scrollbar-thumb:hover,
.ds-bottom-body::-webkit-scrollbar-thumb:hover,
.ds-inspector-body::-webkit-scrollbar-thumb:hover,
.ds-code::-webkit-scrollbar-thumb:hover {
  background: #5c7a5f;
}
.ds-left::-webkit-scrollbar-corner,
.ds-canvas-viewport::-webkit-scrollbar-corner,
.ds-bottom-body::-webkit-scrollbar-corner,
.ds-inspector-body::-webkit-scrollbar-corner,
.ds-code::-webkit-scrollbar-corner {
  background: transparent;
}

/* ---------- 动效 ---------- */
.fade-enter-active,
.fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }

/* =====================================================================
   浅色主题（仅在 html 无 .dark 时生效）
   只覆盖编辑器外壳；画布工程表面与控件预览(.pv-*)保持用户配色不变。
   ===================================================================== */
html:not(.dark) .designer-page {
  background: #f2f3f5;
  color: #333a45;
  color-scheme: light;
}

/* ---------- 菜单栏 ---------- */
html:not(.dark) .ds-menubar {
  background: #f7f8fa;
  border-bottom-color: #d9dde3;
}
html:not(.dark) .ds-menu-label { color: #4a5261; }
html:not(.dark) .ds-menu-label:hover,
html:not(.dark) .ds-menu-label.active {
  background: #eef2f5;
  color: #1f2733;
  border-color: #c7ccd4;
}
html:not(.dark) .ds-dropdown {
  background: #ffffff;
  border-color: #d9dde3;
  box-shadow: 0 8px 24px rgba(15, 23, 32, 0.14);
}
html:not(.dark) .ds-menu-item { color: #333a45; }
html:not(.dark) .ds-menu-item:hover:not(:disabled) {
  background: #e6f2e7;
  color: #1f2733;
}
html:not(.dark) .ds-menu-item:disabled { color: #9aa1ab; }
html:not(.dark) .ds-menu-sep { background: #e4e7ec; }
html:not(.dark) .ds-menubar-title { color: #2b323d; }
html:not(.dark) .ds-menubar-right { color: #8b93a1; }

/* ---------- 工具栏 ---------- */
html:not(.dark) .ds-toolbar {
  background: #f7f8fa;
  border-bottom-color: #d9dde3;
}
html:not(.dark) .ds-icon-btn { color: #5b6472; }
html:not(.dark) .ds-icon-btn:hover:not(:disabled) {
  background: #eef2f5;
  border-color: #c7ccd4;
  color: #1f2733;
}
html:not(.dark) .ds-toolbar-sep { background: #d9dde3; }
html:not(.dark) .ds-meta { color: #6b7280; }
html:not(.dark) .ds-meta b { color: #333a45; }
html:not(.dark) .ds-select {
  background: #ffffff;
  border-color: #d9dde3;
  color: #333a45;
}
html:not(.dark) .ds-check { color: #5b6472; }
html:not(.dark) .ds-check input[type="checkbox"] { accent-color: #4caf50; }
html:not(.dark) .ds-run-btn {
  background: #e6f2e7;
  border-color: #b7d6ba;
  color: #2e7d32;
}
html:not(.dark) .ds-run-btn:hover:not(:disabled) {
  background: #d6ead8;
  border-color: #4caf50;
}
html:not(.dark) .ds-stop-btn {
  background: #ffffff;
  border-color: #e3cccc;
  color: #c0392b;
}
html:not(.dark) .ds-stop-btn:hover {
  background: #fdf1f1;
  border-color: #d99a9a;
  color: #a93226;
}

/* ---------- 画布命令栏 ---------- */
html:not(.dark) .ds-commandbar {
  background: #f7f8fa;
  border-bottom-color: #d9dde3;
}
html:not(.dark) .ds-cmd-group-label { color: #8b93a1; }
html:not(.dark) .ds-cmd-btn { color: #5b6472; }
html:not(.dark) .ds-cmd-btn:hover:not(:disabled) {
  background: #eef2f5;
  border-color: #c7ccd4;
  color: #1f2733;
}
html:not(.dark) .ds-cmd-btn.danger:hover:not(:disabled) {
  background: #fdf1f1;
  border-color: #e0b4b4;
  color: #c0392b;
}
html:not(.dark) .ds-cmd-sep { background: #d9dde3; }
html:not(.dark) .ds-cmd-meta { color: #7b8492; }
html:not(.dark) .ds-multi-note {
  background: #eef7ef;
  border-color: #cfe4d2;
  color: #3d6b45;
}

/* ---------- 消息提示 ---------- */
html:not(.dark) .ds-message { border-bottom-color: #d9dde3; }
html:not(.dark) .ds-message.info { background: #eaf3fb; color: #2b5f8a; }
html:not(.dark) .ds-message.success { background: #eaf6ec; color: #2e7d32; }
html:not(.dark) .ds-message.error { background: #fdeceb; color: #c0392b; }

/* ---------- 左侧面板 ---------- */
html:not(.dark) .ds-left {
  background: #f7f8fa;
  border-right-color: #d9dde3;
}
html:not(.dark) .ds-section-head {
  background: #eef0f4;
  border-top-color: #e1e4e9;
  border-bottom-color: #e1e4e9;
  color: #6b7280;
}
html:not(.dark) .ds-tree-root:hover,
html:not(.dark) .ds-tree-item:hover { background: #eef2f5; }
html:not(.dark) .ds-tree-root.active,
html:not(.dark) .ds-tree-item.active {
  background: #e6f2e7;
  border-left-color: #4caf50;
}
html:not(.dark) .ds-tree-name { color: #3a4048; }
html:not(.dark) .ds-tree-root.active .ds-tree-name,
html:not(.dark) .ds-tree-item.active .ds-tree-name { color: #2e7d32; }
html:not(.dark) .ds-screen-glyph {
  border-color: #57a05e;
  background: #e6f2e7;
}
html:not(.dark) .ds-tree-dot { background: #a3a9b3; }
html:not(.dark) .ds-eye { color: #9aa1ab; }
html:not(.dark) .ds-eye:hover { color: #4b5563; }
html:not(.dark) .ds-empty-small { color: #9aa1ab; }

/* 组件磁贴 */
html:not(.dark) .ds-tile {
  background: #ffffff;
  border-color: #d9dde3;
}
html:not(.dark) .ds-tile:hover {
  background: #eef2f5;
  border-color: #4caf50;
}
html:not(.dark) .ds-tile-name { color: #4a5261; }
html:not(.dark) .ds-left-tip { color: #9aa1ab; }

/* 组件磁贴内的示意图标 */
html:not(.dark) .ds-tile-icon {
  background: #f2f3f5;
  border-color: #a8b0ba;
}
html:not(.dark) .ico-label {
  background: repeating-linear-gradient(#8b93a1 0 1px, transparent 1px 4px);
}
html:not(.dark) .ico-button {
  background: #d5dae1;
  border-color: #a8b0ba;
}
html:not(.dark) .ico-circle {
  background: #c7ccd4;
  border-color: #a8b0ba;
}
html:not(.dark) .ico-line {
  background: linear-gradient(160deg, transparent 44%, #8b93a1 45%, #8b93a1 52%, transparent 53%);
}
html:not(.dark) .ico-switch::after { background: #ffffff; }
html:not(.dark) .ico-textbox { background: #f2f3f5; }
html:not(.dark) .ico-textbox::after { background: #8b93a1; }
html:not(.dark) .ico-qrcode {
  background-image: repeating-conic-gradient(#4b5563 0 25%, #f2f3f5 0 50%);
}
html:not(.dark) .ico-slider {
  background: linear-gradient(#a8b0ba, #a8b0ba) center / 100% 2px no-repeat;
}
html:not(.dark) .ico-slider::after {
  background: #ffffff;
  box-shadow: 0 0 0 1px #a8b0ba;
}
html:not(.dark) .ico-progress { background: #e1e4e9; }
html:not(.dark) .ico-screen {
  border-color: #57a05e;
  background: #e6f2e7;
}
html:not(.dark) .ico-screen::after {
  border-left-color: #57a05e;
  border-right-color: #57a05e;
}

/* ---------- 中间画布视口（工程表面保持原样） ---------- */
html:not(.dark) .ds-center { background: #f2f3f5; }
html:not(.dark) .ds-canvas-viewport {
  background-color: #e9ebef;
  background-image: radial-gradient(rgba(0, 0, 0, 0.07) 1px, transparent 1px);
}
html:not(.dark) .ds-screen-tab {
  background: #f7f8fa;
  border-color: #c7ccd4;
  color: #4a5261;
}
html:not(.dark) .ds-screen-size { color: #8b93a1; }
html:not(.dark) .ds-canvas {
  outline-color: #c7ccd4;
  box-shadow: 0 10px 30px rgba(15, 23, 32, 0.18);
}
html:not(.dark) .ds-canvas-grid {
  background-image: linear-gradient(rgba(0, 0, 0, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 0, 0, 0.07) 1px, transparent 1px);
}
html:not(.dark) .ds-canvas-hint { color: rgba(0, 0, 0, 0.28); }
html:not(.dark) .ds-busy { background: rgba(244, 245, 247, 0.72); }
html:not(.dark) .ds-spinner {
  border-color: rgba(0, 0, 0, 0.12);
  border-top-color: #4caf50;
}
html:not(.dark) .ds-busy-text { color: #333a45; }

/* ---------- 底部面板 ---------- */
html:not(.dark) .ds-bottom {
  background: #f7f8fa;
  border-top-color: #d9dde3;
}
html:not(.dark) .ds-bottom-resizer {
  background: #eef0f4;
  border-top-color: #d9dde3;
}
html:not(.dark) .ds-bottom-resizer::after { background: #c7ccd4; }
html:not(.dark) .ds-bottom-resizer:hover,
html:not(.dark) .ds-bottom-resizer.active { background: #e6f2e7; }
html:not(.dark) .ds-bottom-resizer:hover::after,
html:not(.dark) .ds-bottom-resizer.active::after { background: #4caf50; }
html:not(.dark) .ds-collapse-btn {
  background: #ffffff;
  border-color: #d9dde3;
  color: #6b7280;
}
html:not(.dark) .ds-collapse-btn:hover {
  color: #1f2733;
  border-color: #c7ccd4;
}
html:not(.dark) .ds-bottom-tabs {
  background: #f7f8fa;
  border-bottom-color: #d9dde3;
}
html:not(.dark) .ds-bottom-tab { color: #6b7280; }
html:not(.dark) .ds-bottom-tab:hover { color: #333a45; }
html:not(.dark) .ds-bottom-tab.active {
  color: #1f2733;
  border-bottom-color: #4caf50;
}
html:not(.dark) .ds-count {
  background: #e6e9ee;
  color: #6b7280;
}
html:not(.dark) .ds-count.warn {
  background: #fbe9e7;
  color: #c0392b;
}
html:not(.dark) .ds-mini-btn {
  background: #ffffff;
  border-color: #d9dde3;
  color: #4a5261;
}
html:not(.dark) .ds-mini-btn:hover:not(:disabled) {
  background: #e6f2e7;
  border-color: #4caf50;
  color: #2e7d32;
}
html:not(.dark) .ds-mini-btn.danger:hover:not(:disabled) {
  background: #fdf1f1;
  border-color: #e0b4b4;
  color: #c0392b;
}

/* 图标库 */
html:not(.dark) .ds-icons-count { color: #6b7280; }
html:not(.dark) .ds-icons-hint { color: #8b93a1; }
html:not(.dark) .ds-icon-cell {
  background: #ffffff;
  border-color: #d9dde3;
  color: #333a45;
}
html:not(.dark) .ds-icon-cell:hover {
  background: #e6f2e7;
  border-color: #4caf50;
  color: #1f2733;
}
html:not(.dark) .ds-load-more {
  background: #ffffff;
  border-color: #d9dde3;
  color: #4a5261;
}
html:not(.dark) .ds-load-more:hover {
  background: #e6f2e7;
  border-color: #4caf50;
  color: #2e7d32;
}
html:not(.dark) .ds-asset {
  background: #ffffff;
  border-color: #d9dde3;
}
html:not(.dark) .ds-asset:hover { border-color: #4caf50; }
html:not(.dark) .ds-asset.active {
  background: #e6f2e7;
  border-color: #4caf50;
}
html:not(.dark) .ds-asset-icon {
  background: #f2f3f5;
  border-color: #a8b0ba;
}
html:not(.dark) .ds-asset-name { color: #4a5261; }
html:not(.dark) .ds-asset-type { color: #8b93a1; }

/* 控制台 / 错误 / 编译 / 代码 */
html:not(.dark) .ds-console-line { color: #3c4652; }
html:not(.dark) .ds-console-line.success { color: #2e7d32; }
html:not(.dark) .ds-console-line.error { color: #c0392b; }
html:not(.dark) .ds-console-time { color: #9aa1ab; }
html:not(.dark) .ds-error-line { color: #a05a1d; }
html:not(.dark) .ds-bottom-empty { color: #8b93a1; }
html:not(.dark) .ds-bottom-empty.ok { color: #2e7d32; }
html:not(.dark) .ds-build { color: #3c4652; }
html:not(.dark) .ds-build-line.error { color: #c0392b; }
html:not(.dark) .ds-build-line.ok { color: #2e7d32; }
html:not(.dark) .ds-code { color: #2c3e63; }

/* ---------- 右侧检查器 ---------- */
html:not(.dark) .ds-right {
  background: #f7f8fa;
  border-left-color: #d9dde3;
}
html:not(.dark) .ds-inspector-tabs {
  background: #f7f8fa;
  border-bottom-color: #d9dde3;
}
html:not(.dark) .ds-inspector-tab { color: #6b7280; }
html:not(.dark) .ds-inspector-tab:hover { color: #333a45; }
html:not(.dark) .ds-inspector-tab.active {
  color: #1f2733;
  border-bottom-color: #4caf50;
}
html:not(.dark) .ds-group {
  background: #ffffff;
  border-color: #dfe3e8;
}
html:not(.dark) .ds-group summary {
  background: #eef0f4;
  color: #4a5261;
}
html:not(.dark) .ds-group summary::before { border-left-color: #8b93a1; }
html:not(.dark) .ds-label { color: #6b7280; }
html:not(.dark) .ds-value { color: #333a45; }
html:not(.dark) .ds-input {
  background: #ffffff;
  border-color: #d9dde3;
  color: #333a45;
}
html:not(.dark) .ds-input::placeholder { color: #9aa1ab; }
html:not(.dark) .ds-swatch {
  background: #ffffff;
  border-color: #c7ccd4;
}
html:not(.dark) .ds-switch-row { color: #4a5261; }
html:not(.dark) .ds-switch-row input[type="checkbox"] { accent-color: #4caf50; }
html:not(.dark) .ds-hints { color: #6b7280; }
html:not(.dark) .ds-layer:hover { background: #eef2f5; }
html:not(.dark) .ds-layer.active {
  background: #e6f2e7;
  border-left-color: #4caf50;
}
html:not(.dark) .ds-layer-name { color: #3a4048; }
html:not(.dark) .ds-layer-type { color: #8b93a1; }
html:not(.dark) .ds-history-num { color: #333a45; }
html:not(.dark) .ds-history-label { color: #8b93a1; }
html:not(.dark) .ds-hint-text { color: #7b8492; }
html:not(.dark) .ds-font-item { border-bottom-color: #e4e7ec; }
html:not(.dark) .ds-font-name { color: #7b8492; }
html:not(.dark) .ds-font-sample { color: #333a45; }

/* ---------- 状态栏 ---------- */
html:not(.dark) .ds-statusbar {
  background: #f7f8fa;
  border-top-color: #d9dde3;
  color: #6b7280;
}
html:not(.dark) .ds-status-warn { color: #a05a1d; }
html:not(.dark) .ds-grid-unit { color: #8b93a1; }

/* ---------- 滚动条 ---------- */
html:not(.dark) .ds-left,
html:not(.dark) .ds-tree,
html:not(.dark) .ds-canvas-viewport,
html:not(.dark) .ds-bottom-body,
html:not(.dark) .ds-inspector-body,
html:not(.dark) .ds-code {
  scrollbar-width: thin;
  scrollbar-color: #c7ccd4 transparent;
}
html:not(.dark) .ds-left::-webkit-scrollbar-thumb,
html:not(.dark) .ds-tree::-webkit-scrollbar-thumb,
html:not(.dark) .ds-canvas-viewport::-webkit-scrollbar-thumb,
html:not(.dark) .ds-bottom-body::-webkit-scrollbar-thumb,
html:not(.dark) .ds-inspector-body::-webkit-scrollbar-thumb,
html:not(.dark) .ds-code::-webkit-scrollbar-thumb {
  background: #c7ccd4;
  border: 2px solid transparent;
  border-radius: 5px;
  background-clip: content-box;
}
html:not(.dark) .ds-left::-webkit-scrollbar-thumb:hover,
html:not(.dark) .ds-tree::-webkit-scrollbar-thumb:hover,
html:not(.dark) .ds-canvas-viewport::-webkit-scrollbar-thumb:hover,
html:not(.dark) .ds-bottom-body::-webkit-scrollbar-thumb:hover,
html:not(.dark) .ds-inspector-body::-webkit-scrollbar-thumb:hover,
html:not(.dark) .ds-code::-webkit-scrollbar-thumb:hover {
  background: #9aa1ab;
}
.ds-font-section {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid #3a3a3a;
}
.ds-font-section-title {
  font-size: 12px;
  font-weight: 600;
  color: #d8d8d8;
  margin-bottom: 8px;
}
.ds-font-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ds-font-title-row .ds-font-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
html:not(.dark) .ds-font-section {
  border-top-color: #e1e4e8;
}
html:not(.dark) .ds-font-section-title {
  color: #444b55;
}
</style>
