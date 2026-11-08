<template>
  <div class="page-container">
    <div class="converter-form">
      <div class="form-section">
        <label class="form-label">字体文件</label>
        <div class="file-input-wrapper">
          <input
            v-model="fontFilePath"
            type="text"
            placeholder="选择字体文件路径"
            class="form-input path-input"
            readonly
          />
          <button class="file-select-btn" @click="selectFontFile">浏览</button>
          <div class="system-font-picker" ref="fontPickerRef">
            <button
              class="system-font-btn"
              type="button"
              :disabled="fontsLoading"
              :title="fontsLoading ? '正在读取系统字体库...' : '从 Windows 字体库中选择已安装的字体'"
              @click="toggleFontPicker"
            >
              {{ fontsLoading ? '加载中...' : '系统字体 (' + systemFonts.length + ')' }}
              <span class="picker-arrow" :class="{ open: fontPickerOpen }">▾</span>
            </button>
            <div v-if="fontPickerOpen" class="system-font-dropdown">
              <input
                ref="fontSearchRef"
                v-model="fontSearch"
                type="text"
                class="form-input font-search-input"
                placeholder="搜索字体名称 / 文件名"
                @keydown.esc="fontPickerOpen = false"
              />
              <div class="font-list">
                <button
                  v-for="font in filteredSystemFonts"
                  :key="font.path"
                  type="button"
                  class="font-list-item"
                  :class="{ active: font.path === fontFilePath }"
                  :title="font.path"
                  @click="chooseSystemFont(font)"
                >
                  <span class="font-item-name">{{ font.name }}</span>
                  <span class="font-item-file">{{ font.file }}</span>
                </button>
                <div v-if="filteredSystemFonts.length === 0" class="font-list-empty">
                  {{ systemFonts.length === 0 ? '未找到系统字体' : '没有匹配的字体' }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="settings-row">
          <div class="setting-item">
            <label class="setting-label">字体大小</label>
            <input
              v-model.number="fontSize"
              type="number"
              min="8"
              max="128"
              class="form-input setting-input"
            />
          </div>
          <div class="setting-item">
            <label class="setting-label">抗锯齿级别</label>
            <select v-model.number="bpp" class="form-select setting-select">
              <option :value="1">1bpp</option>
              <option :value="2">2bpp</option>
              <option :value="4">4bpp</option>
            </select>
          </div>
          <div class="setting-item">
            <label class="setting-label">对齐</label>
            <select v-model.number="align" class="form-select setting-select">
              <option :value="1">1字节</option>
              <option :value="4">4字节</option>
              <option :value="8">8字节</option>
              <option :value="16">16字节</option>
              <option :value="32">32字节</option>
              <option :value="64">64字节</option>
              <option :value="128">128字节</option>
              <option :value="256">256字节</option>
              <option :value="512">512字节</option>
              <option :value="1024">1024字节</option>
            </select>
          </div>
          <div class="setting-item">
            <label class="setting-label">启用压缩</label>
            <div class="setting-checkbox-box" :class="{ disabled: flashFont }">
              <input v-model="compress" type="checkbox" :disabled="flashFont" />
              <span>压缩</span>
            </div>
          </div>
          <div class="setting-item">
            <label class="setting-label">智能等宽</label>
            <div class="setting-checkbox-box">
              <input v-model="smartMono" type="checkbox" />
              <span>等宽</span>
            </div>
          </div>
          <div class="setting-item flash-setting-item">
            <label class="setting-label">外部字体</label>
            <div class="setting-checkbox-box flash-checkbox-box">
              <input v-model="flashFont" type="checkbox" />
              <span>Flash</span>
              <div class="flash-addr-inline" :class="{ disabled: !flashFont }">
                <label class="flash-addr-label" for="flash-addr-input">偏移地址</label>
                <input
                  id="flash-addr-input"
                  v-model="flashAddr"
                  type="text"
                  class="form-input flash-addr-input"
                  placeholder="0x00000000"
                  title="外部 Flash 中 .bin 位图数据的起始地址，写入生成代码中的 .flash_addr"
                  :disabled="!flashFont"
                  @blur="normalizeFlashAddr"
                />
              </div>
            </div>
          </div>
          <div class="setting-item">
            <label class="setting-label">字符间距增加</label>
            <input
              v-model.number="charSpacing"
              type="number"
              min="0"
              max="32"
              class="form-input setting-input"
            />
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="range-fontname-row">
          <div class="range-section">
            <label class="form-label">字符范围</label>
            <div class="range-inputs">
              <select
                v-model="rangePreset"
                class="form-select range-preset-select"
                title="选择常用字符集预设：单段预设自动填入范围（可手动修改），多段预设一次添加多段可单独删除的范围"
              >
                <option
                  v-for="preset in rangePresets"
                  :key="preset.value"
                  :value="preset.value"
                >{{ preset.label }}</option>
              </select>
              <input
                v-model="charRangeStart"
                type="text"
                placeholder="0x20"
                class="form-input small"
                :readonly="isMultiSegmentPreset"
                :title="isMultiSegmentPreset ? '多段预设不使用手动范围，点添加即可' : '起始码点'"
              />
              <span>-</span>
              <input
                v-model="charRangeEnd"
                type="text"
                placeholder="0x7F"
                class="form-input small"
                :readonly="isMultiSegmentPreset"
                :title="isMultiSegmentPreset ? '多段预设不使用手动范围，点添加即可' : '结束码点'"
              />
              <button class="add-range-btn" @click="addCharRange">添加</button>
            </div>
            <div v-if="isMultiSegmentPreset" class="range-preset-hint">
              {{ activeRangePreset.hint }}
            </div>
            <div class="range-tags">
              <span
                v-for="(range, index) in charRanges"
                :key="index"
                class="range-tag"
              >
                <span v-if="range.label" class="range-tag-label">{{ range.label }}</span>
                {{ formatRange(range) }}
                <span class="remove-tag" @click="removeCharRange(index)">×</span>
              </span>
            </div>
          </div>
          <div class="fontname-section">
            <label class="form-label">字体名称</label>
            <input
              v-model="fontName"
              type="text"
              placeholder="输入字体名称"
              class="form-input fontname-input"
            />
          </div>
        </div>
      </div>

      <div class="form-section">
        <label class="form-label">自定义字符</label>
        <textarea
          v-model="customChars"
          rows="3"
          placeholder="输入要包含的字符"
          class="form-input custom-chars-textarea"
        ></textarea>
      </div>

      <div class="form-section icon-font-section">
        <label class="form-label">图标字体文件</label>
        <div class="file-input-wrapper">
          <input
            :value="iconFontSummary"
            type="text"
            placeholder="点「添加」可多次添加图标字体，图标会追加到下方预览"
            class="form-input path-input"
            readonly
          />
          <button class="file-select-btn" @click="addIconFontFiles">添加</button>
          <div class="system-font-picker" ref="iconFontPickerRef">
            <button
              class="system-font-btn"
              type="button"
              :disabled="builtinFontsLoading"
              :title="builtinFontsLoading ? '正在准备内置图标字体...' : '选择随工具打包的内置图标字体，点一项即追加到预览'"
              @click="toggleIconFontPicker"
            >
              {{ builtinFontsLoading ? '加载中...' : '内置图标 (' + builtinIconFonts.length + ')' }}
              <span class="picker-arrow" :class="{ open: iconFontPickerOpen }">▾</span>
            </button>
            <div v-if="iconFontPickerOpen" class="system-font-dropdown">
              <input
                ref="iconFontSearchRef"
                v-model="iconFontSearch"
                type="text"
                class="form-input font-search-input"
                placeholder="搜索内置图标字体"
                @keydown.esc="iconFontPickerOpen = false"
              />
              <div class="font-list">
                <button
                  v-for="font in filteredBuiltinIconFonts"
                  :key="font.file"
                  type="button"
                  class="font-list-item"
                  :class="{ active: isBuiltinFontAdded(font) }"
                  :title="isBuiltinFontAdded(font) ? '已添加：' + font.path : font.path"
                  @click="addBuiltinIconFont(font)"
                >
                  <span class="font-item-name">{{ isBuiltinFontAdded(font) ? '✓ ' : '' }}{{ font.name }}</span>
                  <span class="font-item-file">{{ font.file }}</span>
                </button>
                <div v-if="filteredBuiltinIconFonts.length === 0" class="font-list-empty">
                  {{ builtinIconFonts.length === 0 ? '未找到内置图标字体' : '没有匹配的字体' }}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="iconFonts.length > 0" class="added-font-tags">
          <span
            v-for="font in iconFonts"
            :key="font.id"
            class="added-font-tag"
            :title="font.path"
          >
            <span class="added-font-name">{{ font.name }}</span>
            <span class="added-font-count">{{ font.iconCount }} 个图标</span>
            <span class="remove-tag" title="移除该字体及其图标" @click="removeIconFont(font.id)">×</span>
          </span>
          <button class="clear-fonts-btn" type="button" @click="clearIconFonts">清空</button>
        </div>
      </div>

      <div class="form-section" v-if="iconFonts.length > 0">
        <div class="form-label-with-button">
          <label class="form-label">图标预览（{{ iconList.length }} 个图标 / {{ iconFonts.length }} 个字体，可滚动查看全部）</label>
          <div class="preview-btn-group">
            <button class="select-all-btn" @click="selectAllIcons">全选</button>
            <button class="deselect-all-btn" @click="deselectAllIcons">全删</button>
          </div>
        </div>
        <div class="preview-color-bar" title="仅改变此处的预览配色，不影响取模生成的位图数据">
          <span class="preview-color-title">预览配色</span>
          <label class="preview-color-field">
            <span>图标</span>
            <input v-model="previewFgPicker" type="color" aria-label="预览图标颜色" />
          </label>
          <label class="preview-color-field">
            <span>背景</span>
            <input v-model="previewBgPicker" type="color" aria-label="预览背景颜色" />
          </label>
          <div class="preview-color-presets">
            <button
              v-for="preset in previewColorPresets"
              :key="preset.key"
              type="button"
              class="preview-color-preset"
              :class="{ active: isPreviewPresetActive(preset) }"
              :title="preset.title"
              @click="applyPreviewPreset(preset)"
            >
              <span class="preset-swatch" :style="{ color: preset.fg || defaultPreviewFg, background: preset.bg || defaultPreviewBg }">A</span>
              {{ preset.label }}
            </button>
          </div>
          <span class="preview-color-hint">仅影响预览</span>
        </div>
        <div v-for="font in iconFonts" :key="font.id" class="icon-font-group">
          <div class="icon-font-group-header">
            <span class="icon-font-group-name" :title="font.path">{{ font.name }}</span>
            <span class="icon-font-group-count">{{ iconsOfFont(font.id).length }} 个图标 · {{ font.file }}</span>
            <div class="preview-btn-group">
              <button class="select-all-btn" @click="selectFontIcons(font.id)">选本组</button>
              <button class="deselect-all-btn" @click="deselectFontIcons(font.id)">清本组</button>
              <button class="group-toggle-btn" @click="toggleFontGroup(font.id)">
                {{ isCollapsed(font.id) ? '展开' : '折叠' }}
              </button>
            </div>
          </div>
          <div v-if="!isCollapsed(font.id)" class="icon-preview-container" :style="iconPreviewStyle">
            <div
              v-for="icon in iconsOfFont(font.id)"
              :key="icon.key"
              class="icon-item"
              :class="{ selected: isIconSelected(icon) }"
              :title="icon.fontName + ' · ' + icon.name"
              @click="toggleIconSelection(icon)"
            >
              <div class="icon-char">
                <svg v-if="icon.svg" class="icon-glyph" :viewBox="icon.svg.viewBox" aria-hidden="true">
                  <path :d="icon.svg.d" />
                </svg>
                <span v-else :style="{ fontFamily: icon.family + ', sans-serif' }">{{ icon.char }}</span>
              </div>
              <div class="icon-code">U+{{ icon.code > 0xFFFF ? icon.code.toString(16).toUpperCase().padStart(6, '0') : icon.code.toString(16).toUpperCase().padStart(4, '0') }}</div>
            </div>
            <div v-if="iconsOfFont(font.id).length === 0" class="no-icons">暂无图标</div>
          </div>
        </div>
      </div>

      <div class="form-section" v-if="selectedIcons.length > 0">
        <label class="form-label">选中预览（{{ selectedIcons.length }}）</label>
        <div class="icon-preview-container" :style="iconPreviewStyle">
          <div
            v-for="icon in selectedIcons"
            :key="icon.key"
            class="icon-item selected"
            :title="icon.fontName"
            @click="toggleIconSelection(icon)"
          >
            <div class="icon-char">
              <svg v-if="icon.svg" class="icon-glyph" :viewBox="icon.svg.viewBox" aria-hidden="true">
                <path :d="icon.svg.d" />
              </svg>
              <span v-else :style="{ fontFamily: icon.family + ', sans-serif' }">{{ icon.char }}</span>
            </div>
            <div class="icon-code">U+{{ icon.code > 0xFFFF ? icon.code.toString(16).toUpperCase().padStart(6, '0') : icon.code.toString(16).toUpperCase().padStart(4, '0') }}</div>
          </div>
        </div>
      </div>

      <div class="form-section">
        <label class="form-label">输出文件夹</label>
        <div class="file-input-wrapper">
          <input
            v-model="outputDirPath"
            type="text"
            placeholder="选择输出文件夹路径"
            class="form-input path-input"
            readonly
          />
          <button class="file-select-btn" @click="selectOutputDir">浏览</button>
        </div>
      </div>

      <div class="form-actions">
        <button
          class="convert-btn"
          @click="convertFont"
          :disabled="!canConvert || isConverting"
        >
          {{ isConverting ? '转换中...' : '开始转换' }}
        </button>
      </div>
    </div>

    <div v-if="showCopyTip" class="copy-tip">复制成功！</div>

    <!-- 信息输出栏 -->
    <div class="info-bar">
      <h4>LOG信息</h4>
      <div class="info-messages" ref="infoMessagesRef">
        <div
          v-for="(msg, index) in infoMessages"
          :key="index"
          :class="['info-message', msg.type]"
        >
          <span class="msg-time">{{ msg.time }}</span>
          <span class="msg-content">{{ msg.content }}</span>
          <button
            v-if="msg.type === 'error'"
            class="copy-msg-btn"
            @click="copyMessageContent(msg.content)"
            title="复制内容"
          >
            复制
          </button>
        </div>
        <div v-if="infoMessages.length === 0" class="empty-log">
          暂无日志信息
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick, markRaw } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { documentDir, join } from '@tauri-apps/api/path';

const fontFileName = ref('');
const fontFilePath = ref(localStorage.getItem('lastFontFilePath') || '');
const fontName = ref('sgl_font');
const fontSize = ref(24);
const bpp = ref(4);
const charRangeStart = ref('0x20');
const infoMessages = ref([]);
const charRangeEnd = ref('0x7F');
const charRanges = ref([{ start: 0x20, end: 0x7F }]);

/* 「字符范围」常用预设：单段预设选中后自动填入起止码点，仍可手动微调再点添加；
 * 多段预设（segments）一次添加若干条独立、可分别删除的范围。
 * GBK/Shift_JIS 的码位在 Unicode 中并非连续区间，这里用常用大区近似覆盖：
 *   GBK 汉字 → CJK 统一表意文字 0x4E00-0x9FFF；
 *   Shift_JIS → 标点与假名 0x3000-0x30FF、汉字 0x4E00-0x9FFF、
 *               全角英数/半角片假名 0xFF00-0xFFEF；
 *   Hangul（EUC-KR/KS X 1001）→ 兼容字母 0x3130-0x318F、
 *               现代韩文音节 0xAC00-0xD7A3、CJK 标点 0x3000-0x303F。
 * Emoticons 0x1F600-0x1F64F 在 BMP 之外，工具与 SGL 的 offset/len 均为 uint32_t，
 * 可直接按单段范围取模；需选含 emoji 字形的字体（如 Segoe UI Emoji）。
 * 转换工具按 --range 逐个码点取模，段与段之间互不影响。 */
const rangePresets = [
  { value: 'custom', label: '自定义范围' },
  { value: 'ascii', label: 'ASCII (0x20-0x7F)', tag: 'ASCII', start: 0x20, end: 0x7F },
  { value: 'gbk', label: '中文GBK (0x4E00-0x9FFF)', tag: '中文GBK', start: 0x4E00, end: 0x9FFF },
  {
    value: 'shiftjis',
    label: '日文Shift_JIS (3 段)',
    tag: '日文Shift_JIS',
    hint: '将一次添加 3 段范围：0x3000-0x30FF（标点/平假名/片假名）、0x4E00-0x9FFF（汉字）、0xFF00-0xFFEF（全角英数与半角片假名），每段可单独删除',
    segments: [
      { start: 0x3000, end: 0x30FF, label: '日文Shift_JIS·假名' },
      { start: 0x4E00, end: 0x9FFF, label: '日文Shift_JIS·汉字' },
      { start: 0xFF00, end: 0xFFEF, label: '日文Shift_JIS·全角' },
    ],
  },
  {
    value: 'hangul',
    label: '韩文Hangul (3 段)',
    tag: '韩文Hangul',
    hint: '将一次添加 3 段范围：0x3130-0x318F（兼容韩文字母）、0xAC00-0xD7A3（韩文音节，覆盖 EUC-KR/KS X 1001 全部音节）、0x3000-0x303F（CJK 标点），每段可单独删除',
    segments: [
      { start: 0x3130, end: 0x318F, label: '韩文Hangul·字母' },
      { start: 0xAC00, end: 0xD7A3, label: '韩文Hangul·音节' },
      { start: 0x3000, end: 0x303F, label: '韩文Hangul·标点' },
    ],
  },
  {
    value: 'emoticons',
    label: 'Emoticons (0x1F600-0x1F64F)',
    tag: 'Emoticons',
    start: 0x1F600,
    end: 0x1F64F,
  },
];
const rangePreset = ref('custom');
const activeRangePreset = computed(() => rangePresets.find(p => p.value === rangePreset.value));
const isMultiSegmentPreset = computed(() => !!activeRangePreset.value?.segments);

watch(rangePreset, (value) => {
  const preset = rangePresets.find(p => p.value === value);
  if (preset && preset.start !== undefined) {
    charRangeStart.value = `0x${preset.start.toString(16).toUpperCase()}`;
    charRangeEnd.value = `0x${preset.end.toString(16).toUpperCase()}`;
  } else if (preset && preset.segments) {
    // 多段预设不占用手动输入框
    charRangeStart.value = '';
    charRangeEnd.value = '';
  }
});
const customChars = ref('');
const outputDirName = ref('');
const outputDirPath = ref(localStorage.getItem('lastOutputDirPath') || '');
/* 图标字体支持多次「添加」：每个字体独立 @font-face，预览按添加顺序追加。
 * iconFonts: { id, name, file, path, family, url, format, iconCount, builtin }
 * iconList : { key, code, char, name, fontId, family, fontName } */
const iconFonts = ref([]);
const iconList = ref([]);
const selectedIcons = ref([]);
let nextIconFontId = 1;

/* ---------- 图标预览配色（只影响预览显示，不进入取模数据） ---------- */

/* 主题由 App.vue 写到 html.dark，这里跟随它的切换以计算默认色 */
const isThemeDark = ref(document.documentElement.classList.contains('dark'));
let themeObserver = null;
const defaultPreviewFg = computed(() => isThemeDark.value ? '#e0e0e0' : '#333333');
const defaultPreviewBg = computed(() => isThemeDark.value ? '#1a1d2b' : '#fafafa');

/* 空字符串 = 跟随主题；有值 = 用户自定义颜色（持久化到 localStorage） */
const previewFgColor = ref(localStorage.getItem('lastIconPreviewFg') || '');
const previewBgColor = ref(localStorage.getItem('lastIconPreviewBg') || '');
const previewColorPresets = [
  { key: 'theme', label: '跟随主题', fg: '', bg: '', title: '跟随当前浅色 / 深色主题' },
  { key: 'light', label: '浅底深图', fg: '#333333', bg: '#fafafa', title: '浅色背景 + 深色图标' },
  { key: 'dark', label: '深底白图', fg: '#ffffff', bg: '#1a1d2b', title: '深色背景 + 白色图标' },
];

/* color input 需要始终有合法色值，取色器显示「当前实际生效」的颜色 */
const previewFgPicker = computed({
  get: () => previewFgColor.value || defaultPreviewFg.value,
  set: value => { previewFgColor.value = value; },
});
const previewBgPicker = computed({
  get: () => previewBgColor.value || defaultPreviewBg.value,
  set: value => { previewBgColor.value = value; },
});

/* 内联 CSS 变量覆盖 .icon-preview-container 上的主题默认值 */
const iconPreviewStyle = computed(() => {
  const style = {};
  if (previewFgColor.value) style['--icon-preview-fg'] = previewFgColor.value;
  if (previewBgColor.value) {
    style['--icon-preview-bg'] = previewBgColor.value;
    style['--icon-preview-item-bg'] = previewBgColor.value;
  }
  return style;
});

function isPreviewPresetActive(preset) {
  return previewFgColor.value === preset.fg && previewBgColor.value === preset.bg;
}

function applyPreviewPreset(preset) {
  previewFgColor.value = preset.fg;
  previewBgColor.value = preset.bg;
}

watch([previewFgColor, previewBgColor], ([fg, bg]) => {
  if (fg) localStorage.setItem('lastIconPreviewFg', fg);
  else localStorage.removeItem('lastIconPreviewFg');
  if (bg) localStorage.setItem('lastIconPreviewBg', bg);
  else localStorage.removeItem('lastIconPreviewBg');
});
const iconFontSummary = computed(() => {
  if (iconFonts.value.length === 0) return '';
  return `已添加 ${iconFonts.value.length} 个图标字体：${iconFonts.value.map(f => f.name).join('、')}`;
});
const align = ref(1);
const compress = ref(false);
const smartMono = ref(false);
const flashFont = ref(false);
/* 外部 Flash 中 .bin 位图的起始地址，生成代码里对应 .flash_addr */
const flashAddr = ref(localStorage.getItem('lastFlashAddr') || '0x00000000');
const charSpacing = ref(0);
const isConverting = ref(false);
const infoMessagesRef = ref(null);

const showCopyTip = ref(false);

const canConvert = computed(() => {
  const hasMainContent = charRanges.value.length > 0 || customChars.value.trim() !== '';
  // 只取图标（无字符范围/自定义字符）时不需要主字体；有范围则必须有主字体文件
  if (hasMainContent && !fontFilePath.value) return false;
  return !!outputDirPath.value && (hasMainContent || selectedIcons.value.length > 0);
});

/* ---------- Windows 本地系统字体库 ---------- */

const systemFonts = ref([]);
const fontPickerOpen = ref(false);
const fontSearch = ref('');
const fontsLoading = ref(false);
const fontPickerRef = ref(null);
const fontSearchRef = ref(null);

const filteredSystemFonts = computed(() => {
  const keyword = fontSearch.value.trim().toLowerCase();
  if (!keyword) return systemFonts.value;
  return systemFonts.value.filter(
    font => font.name.toLowerCase().includes(keyword) || font.file.toLowerCase().includes(keyword)
  );
});

async function loadSystemFonts() {
  fontsLoading.value = true;
  try {
    // Rust 侧扫描 %WINDIR%\Fonts 与当前用户字体目录，并解析 name 表得到可读字体名
    systemFonts.value = await invoke('list_system_fonts');
  } catch (err) {
    console.error('读取系统字体库失败：', err);
    systemFonts.value = [];
  } finally {
    fontsLoading.value = false;
  }
}

function toggleFontPicker() {
  fontPickerOpen.value = !fontPickerOpen.value;
  if (fontPickerOpen.value) {
    fontSearch.value = '';
    nextTick(() => fontSearchRef.value?.focus());
  }
}

function chooseSystemFont(font) {
  fontFilePath.value = font.path;
  fontFileName.value = font.file;
  autoGenerateFontName();
  localStorage.setItem('lastFontFilePath', font.path);
  fontPickerOpen.value = false;
  addInfoMessage(`已选择系统字体：${font.name} (${font.file})`, 'info');
}

/* ---------- 内置图标字体（随工具打包，点选即追加到预览） ---------- */

const builtinIconFonts = ref([]);
const builtinFontsLoading = ref(false);
const iconFontPickerOpen = ref(false);
const iconFontPickerRef = ref(null);
const iconFontSearchRef = ref(null);
const iconFontSearch = ref('');

const filteredBuiltinIconFonts = computed(() => {
  const keyword = iconFontSearch.value.trim().toLowerCase();
  if (!keyword) return builtinIconFonts.value;
  return builtinIconFonts.value.filter(
    font => font.name.toLowerCase().includes(keyword) || font.file.toLowerCase().includes(keyword)
  );
});

function isBuiltinFontAdded(font) {
  return iconFonts.value.some(f => f.builtin && f.file === font.file);
}

/* 只记住内置字体（临时释放路径每次启动会变），本地字体路径不持久化 */
function persistBuiltinIconFonts() {
  const files = iconFonts.value.filter(f => f.builtin).map(f => f.file);
  localStorage.setItem('lastBuiltinIconFonts', JSON.stringify(files));
}

async function loadBuiltinIconFonts() {
  builtinFontsLoading.value = true;
  try {
    // Rust 侧把 include_bytes! 内嵌的全部图标字体释放到临时目录并返回绝对路径
    builtinIconFonts.value = await invoke('list_builtin_icon_fonts');
    let saved = [];
    try {
      const raw = JSON.parse(localStorage.getItem('lastBuiltinIconFonts') || '[]');
      if (Array.isArray(raw)) saved = raw;
    } catch { saved = []; }
    localStorage.removeItem('lastBuiltinIconFont'); // 清理旧版单字体记录
    for (const file of saved) {
      const font = builtinIconFonts.value.find(f => f.file === file);
      if (font) await addIconFontFromPath(font.path, font.file, font.name, true, true);
    }
  } catch (err) {
    console.error('读取内置图标字体失败：', err);
    builtinIconFonts.value = [];
  } finally {
    builtinFontsLoading.value = false;
  }
}

function toggleIconFontPicker() {
  iconFontPickerOpen.value = !iconFontPickerOpen.value;
  if (iconFontPickerOpen.value) {
    iconFontSearch.value = '';
    nextTick(() => iconFontSearchRef.value?.focus());
  }
}

async function addBuiltinIconFont(font) {
  iconFontPickerOpen.value = false;
  if (isBuiltinFontAdded(font)) {
    addInfoMessage(`「${font.name}」已在预览中`, 'info');
    return;
  }
  await addIconFontFromPath(font.path, font.file, font.name, true);
}

function onDocumentClick(event) {
  if (fontPickerOpen.value && fontPickerRef.value && !fontPickerRef.value.contains(event.target)) {
    fontPickerOpen.value = false;
  }
  if (iconFontPickerOpen.value && iconFontPickerRef.value && !iconFontPickerRef.value.contains(event.target)) {
    iconFontPickerOpen.value = false;
  }
}

function onDocumentKeydown(event) {
  if (event.key === 'Escape') {
    fontPickerOpen.value = false;
    iconFontPickerOpen.value = false;
  }
}

onMounted(async () => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);

  // 「跟随主题」预览配色需要感知 App.vue 的主题切换
  themeObserver = new MutationObserver(() => {
    isThemeDark.value = document.documentElement.classList.contains('dark');
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  // 输出文件夹默认使用 Windows「文档」目录；用户手动选择过则沿用上次路径
  if (!outputDirPath.value) {
    try {
      const dir = await documentDir();
      if (dir) {
        outputDirPath.value = dir;
        outputDirName.value = dir.split(/[/\\]/).pop() || 'Documents';
      }
    } catch (err) {
      console.error('获取文档目录失败：', err);
      addInfoMessage('获取默认文档目录失败，请手动选择输出文件夹', 'error');
    }
  }

  loadSystemFonts();
  loadBuiltinIconFonts();
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onDocumentKeydown);
  if (themeObserver) themeObserver.disconnect();
  for (const font of iconFonts.value) {
    if (font.url) URL.revokeObjectURL(font.url);
  }
  const style = document.getElementById('icon-font-style');
  if (style) style.remove();
});

/* ---------- 字体名称自动生成 ---------- */

/* 判断是否为纯英文+下划线组合 */
function isValidEnglishName(name) {
  return /^[a-zA-Z_]+$/.test(name);
}

/* 根据字体文件名+大小自动生成字体名称 */
function autoGenerateFontName() {
  if (!fontFilePath.value) return;
  const parts = fontFilePath.value.split(/[/\\]/);
  const fileName = parts[parts.length - 1];
  /* 去掉扩展名 */
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.substring(0, dotIndex) : fileName;

  if (isValidEnglishName(baseName)) {
    fontName.value = `${baseName}_${fontSize.value}`;
  } else {
    fontName.value = `sgl_font_${fontSize.value}`;
  }
}

/* 监听字体大小变化，自动更新字体名称 */
watch(fontSize, () => {
  if (fontFilePath.value) {
    autoGenerateFontName();
  }
});

/* 外部Flash字体与RLE压缩互斥（压缩位图无统一stride，--fixed会失效），勾选后自动取消压缩 */
watch(flashFont, (checked) => {
  if (checked) {
    compress.value = false;
  }
});

/* 记住上次填写的偏移地址，同一块板上一般固定不变 */
watch(flashAddr, (value) => {
  localStorage.setItem('lastFlashAddr', value);
});

/* 偏移地址支持 0x 十六进制或十进制，统一规范为 0xXXXXXXXX */
function normalizeFlashAddr() {
  const raw = String(flashAddr.value ?? '').trim();
  if (raw === '') {
    flashAddr.value = '0x00000000';
    return true;
  }

  let value = NaN;
  if (/^0x[0-9a-f]+$/i.test(raw)) {
    value = parseInt(raw.slice(2), 16);
  } else if (/^[0-9]+$/.test(raw)) {
    value = parseInt(raw, 10);
  }

  if (!Number.isFinite(value) || value < 0 || value > 0xFFFFFFFF) {
    addInfoMessage('偏移地址无效，请输入 0x 开头的十六进制或十进制（0 ~ 0xFFFFFFFF）', 'error');
    return false;
  }

  flashAddr.value = `0x${value.toString(16).toUpperCase().padStart(8, '0')}`;
  return true;
}

/* 页面加载时，如果已从 localStorage 恢复上次的字体文件路径，自动生成字体名称 */
autoGenerateFontName();



async function selectFontFile() {
  try {
    const selected = await open({
      directory: false,
      multiple: false,
      title: '选择字体文件',
      filters: [
        { name: '字体文件', extensions: ['ttf', 'otf'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });

    if (selected) {
      fontFilePath.value = selected;
      fontFileName.value = selected.split(/[/\\]/).pop() || '已选择字体文件';
      autoGenerateFontName();
      localStorage.setItem('lastFontFilePath', selected);
    }
  } catch (err) {
    console.error('选择字体文件失败：', err);
    addInfoMessage(`选择字体文件失败: ${JSON.stringify(err)}`, 'error');
  }
}

async function selectOutputDir() {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: '选择输出文件夹'
    });

    if (selected) {
      outputDirPath.value = selected;
      outputDirName.value = selected.split(/[/\\]/).pop() || '已选择文件夹';
      localStorage.setItem('lastOutputDirPath', selected);
    }
  } catch (err) {
    console.error('选择文件夹失败：', err);
    addInfoMessage(`选择文件夹失败: ${JSON.stringify(err)}`, 'error');
  }
}

/* ---------- 图标字体：多次添加、预览追加 ---------- */

async function addIconFontFiles() {
  try {
    const selected = await open({
      directory: false,
      multiple: true,
      title: '添加图标字体文件（可多选）',
      filters: [
        { name: '字体文件', extensions: ['ttf', 'otf', 'woff', 'woff2'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
    for (const path of paths) {
      const file = path.split(/[/\\]/).pop() || path;
      const name = file.replace(/\.[^.]+$/, '') || file;
      await addIconFontFromPath(path, file, name, false);
    }
  } catch (err) {
    console.error('添加图标字体文件失败：', err);
    addInfoMessage(`添加图标字体文件失败: ${JSON.stringify(err)}`, 'error');
  }
}

/* 把字形轮廓压缩成整数坐标的 SVG path；坐标单位统一为 1000/em。 */
function compactGlyphPath(commands) {
  let d = '';
  const n = v => Math.round(v);
  for (const c of commands) {
    if (c.type === 'M') d += `M${n(c.x)} ${n(c.y)}`;
    else if (c.type === 'L') d += `L${n(c.x)} ${n(c.y)}`;
    else if (c.type === 'C') d += `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`;
    else if (c.type === 'Q') d += `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`;
    else if (c.type === 'Z') d += 'Z';
  }
  return d;
}

/* 直接取字形轮廓，预览用 SVG 画出来，不依赖浏览器 @font-face 能否加载成功。
 * 少数没有有效轮廓的字形返回 null，模板会回退到字符 + @font-face 显示。 */
function glyphToSvg(glyph) {
  try {
    const path = glyph.getPath(0, 0, 1000);
    if (!path.commands || path.commands.length === 0) return null;
    const box = path.getBoundingBox();
    if (!(box.x2 > box.x1 && box.y2 > box.y1)) return null;
    const padX = (box.x2 - box.x1) * 0.06;
    const padY = (box.y2 - box.y1) * 0.06;
    const r = v => Math.round(v * 100) / 100;
    return {
      d: compactGlyphPath(path.commands),
      viewBox: `${r(box.x1 - padX)} ${r(box.y1 - padY)} ${r(box.x2 - box.x1 + padX * 2)} ${r(box.y2 - box.y1 + padY * 2)}`,
    };
  } catch {
    return null;
  }
}

/* 读取并解析单个图标字体，返回按码点排序、字体内去重的字形列表。
 * 不再套用原先只针对 FontAwesome 的私用区过滤：新增的 dingbat 字体把图标
 * 映射在 ASCII / 拉丁扩展区，统一展示字体中所有已映射的可打印字形即可。 */
async function readIconFontGlyphs(path) {
  const opentype = await import('opentype.js');
  const base64Data = await invoke('read_file_as_base64', { path });
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const font = opentype.parse(bytes.buffer);

  const seen = new Set();
  const icons = [];
  for (const [name, glyph] of Object.entries(font.glyphs.glyphs)) {
    if (!glyph || glyph.unicode === undefined || glyph.unicode === null) continue;
    const code = glyph.unicode;
    // 跳过 .notdef / 控制字符 / 空格、代理项及非法码点
    if (code <= 0x20 || code > 0x10FFFF ||
        (code >= 0xD800 && code <= 0xDFFF) || seen.has(code)) continue;
    // 跳过没有可见轮廓的字形。部分 dingbat 字体把 ASCII 码点映射成空占位字形，
    // 它们按码点排在最前面，会让预览首屏出现大片空白。
    const svg = glyphToSvg(glyph);
    if (!svg) continue;
    seen.add(code);
    icons.push({
      code,
      char: String.fromCodePoint(code),
      name: String(glyph.name || name),
      svg,
    });
  }
  icons.sort((a, b) => a.code - b.code);

  const names = font.names?.fontFamily || {};
  const familyName = typeof names === 'string' ? names : (names.en || Object.values(names)[0] || '');
  return { icons, bytes, familyName };
}

function fontFaceFormat(file) {
  if (/\.otf$/i.test(file)) return { format: 'opentype', mime: 'font/otf' };
  if (/\.woff2$/i.test(file)) return { format: 'woff2', mime: 'font/woff2' };
  if (/\.woff$/i.test(file)) return { format: 'woff', mime: 'font/woff' };
  return { format: 'truetype', mime: 'font/ttf' };
}

/* 每个字体一个独立的 @font-face / family，作为轮廓渲染的兜底 */
function iconFontFaceRule(f) {
  return `@font-face {
        font-family: '${f.family}';
        src: url('${f.url}') format('${f.format}');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }`;
}

function warmIconFont(f) {
  // 不阻塞「添加」流程，加载失败也不影响 SVG 轮廓预览
  try {
    document.fonts.load(`16px ${f.family}`).catch(() => {});
  } catch { /* 忽略单个字体加载失败 */ }
}

/* 新增字体时只追加一条规则，避免整体重建让上千个预览元素重新排版 */
function appendIconFontStyle(f) {
  let style = document.getElementById('icon-font-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'icon-font-style';
    document.head.appendChild(style);
  }
  style.textContent += iconFontFaceRule(f) + '\n';
  warmIconFont(f);
}

/* 移除字体后用剩余字体重建一次 */
function rebuildIconFontStyles() {
  const oldStyle = document.getElementById('icon-font-style');
  if (oldStyle) oldStyle.remove();
  if (iconFonts.value.length === 0) return;

  const style = document.createElement('style');
  style.id = 'icon-font-style';
  style.textContent = iconFonts.value.map(iconFontFaceRule).join('\n');
  document.head.appendChild(style);
  for (const f of iconFonts.value) warmIconFont(f);
}

async function addIconFontFromPath(path, file, name, builtin, silent = false) {
  const key = path.toLowerCase();
  if (iconFonts.value.some(f =>
    f.path.toLowerCase() === key || (f.builtin && builtin && f.file === file)
  )) {
    if (!silent) addInfoMessage(`「${name}」已添加，未重复追加`, 'info');
    return;
  }

  try {
    const { icons, bytes, familyName } = await readIconFontGlyphs(path);
    if (icons.length === 0) {
      if (!silent) addInfoMessage(`「${name}」中没有可用的图标字形`, 'error');
      return;
    }
    const id = nextIconFontId++;
    const { format, mime } = fontFaceFormat(file);
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const displayName = familyName || name;
    const fontEntry = {
      id,
      name: displayName,
      file,
      path,
      builtin,
      family: `IconFont_${id}`,
      url,
      format,
      iconCount: icons.length,
    };

    iconFonts.value.push(fontEntry);
    // 追加而非替换：之前添加的字体、已勾选的图标都保留。
    // 轮廓数据不会变化，markRaw 避免上千个大对象被逐层响应式代理拖慢渲染。
    iconList.value.push(...icons.map(icon => markRaw({
      ...icon,
      key: `${id}:${icon.code}`,
      fontId: id,
      family: fontEntry.family,
      fontName: displayName,
    })));

    appendIconFontStyle(fontEntry);
    persistBuiltinIconFonts();
    if (!silent) {
      addInfoMessage(`已添加「${displayName}」：追加 ${icons.length} 个图标到预览`, 'info');
    }
  } catch (err) {
    console.error('解析图标字体失败：', path, err);
    if (!silent) {
      addInfoMessage(`添加「${name}」失败：${err?.message || String(err)}`, 'error');
    }
  }
}

function removeIconFont(id) {
  const index = iconFonts.value.findIndex(f => f.id === id);
  if (index < 0) return;
  const [font] = iconFonts.value.splice(index, 1);
  iconList.value = iconList.value.filter(icon => icon.fontId !== id);
  selectedIcons.value = selectedIcons.value.filter(icon => icon.fontId !== id);
  if (font.url) URL.revokeObjectURL(font.url);
  rebuildIconFontStyles();
  persistBuiltinIconFonts();
  addInfoMessage(`已移除「${font.name}」及其 ${font.iconCount} 个图标`, 'info');
}

function clearIconFonts() {
  for (const font of iconFonts.value) {
    if (font.url) URL.revokeObjectURL(font.url);
  }
  iconFonts.value = [];
  iconList.value = [];
  selectedIcons.value = [];
  rebuildIconFontStyles();
  persistBuiltinIconFonts();
  addInfoMessage('已清空全部图标字体', 'info');
}

/* 预览按来源字体分组：每次「添加」都在末尾追加一个分组，可单独折叠 */
const iconsByFont = computed(() => {
  const map = new Map();
  for (const icon of iconList.value) {
    if (!map.has(icon.fontId)) map.set(icon.fontId, []);
    map.get(icon.fontId).push(icon);
  }
  return map;
});
const iconsOfFont = id => iconsByFont.value.get(id) || [];

const collapsedFontIds = ref([]);
function isCollapsed(id) {
  return collapsedFontIds.value.includes(id);
}
function toggleFontGroup(id) {
  const index = collapsedFontIds.value.indexOf(id);
  if (index >= 0) collapsedFontIds.value.splice(index, 1);
  else collapsedFontIds.value.push(id);
}

function selectFontIcons(id) {
  const keys = new Set(selectedIcons.value.map(i => i.key));
  for (const icon of iconsOfFont(id)) {
    if (!keys.has(icon.key)) selectedIcons.value.push(icon);
  }
}

function deselectFontIcons(id) {
  selectedIcons.value = selectedIcons.value.filter(i => i.fontId !== id);
}

/* 同一码点可能同时存在于多个图标字体，选中状态用 (字体, 码点) 唯一标识。
 * 用 Set 缓存，避免「全选」上千个图标时预览逐项线性查找 */
const selectedIconKeys = computed(() => new Set(selectedIcons.value.map(i => i.key)));
function isIconSelected(icon) {
  return selectedIconKeys.value.has(icon.key);
}

function toggleIconSelection(icon) {
  const index = selectedIcons.value.findIndex(i => i.key === icon.key);
  if (index > -1) {
    selectedIcons.value.splice(index, 1);
  } else {
    selectedIcons.value.push(icon);
  }
}

function selectAllIcons() {
  selectedIcons.value = [...iconList.value];
}

function deselectAllIcons() {
  selectedIcons.value = [];
}

function parseHexValue(str) {
  str = str.trim();
  if (str.startsWith('0x') || str.startsWith('0X')) {
    return parseInt(str, 16);
  }
  const parsed = parseInt(str, 10);
  if (!isNaN(parsed)) {
    return parsed;
  }
  return parseInt(str, 16);
}

function formatRange(range) {
  return `0x${range.start.toString(16).toUpperCase().padStart(4, '0')}-0x${range.end.toString(16).toUpperCase().padStart(4, '0')}`;
}

function addCharRange() {
  const preset = rangePresets.find(p => p.value === rangePreset.value);

  // 多段字符集：一次加入多条独立范围，每条都能用 × 单独删除
  if (preset && preset.segments) {
    for (const seg of preset.segments) {
      charRanges.value.push({ start: seg.start, end: seg.end, label: seg.label });
    }
    addInfoMessage(`已添加${preset.tag}：${preset.segments.length} 段范围，可逐段删除`, 'info');
    charRangeStart.value = '';
    charRangeEnd.value = '';
    rangePreset.value = 'custom';
    return;
  }

  const start = parseHexValue(charRangeStart.value);
  const end = parseHexValue(charRangeEnd.value);

  if (isNaN(start) || isNaN(end)) {
    addInfoMessage('请输入有效的字符范围', 'error');
    return;
  }

  if (start > end) {
    addInfoMessage('起始字符不能大于结束字符', 'error');
    return;
  }

  // 只有范围与预设完全一致时才标注名称，避免手动微调后标签名不副实
  const label = preset && preset.tag && start === preset.start && end === preset.end
    ? preset.tag
    : '';
  charRanges.value.push(label ? { start, end, label } : { start, end });
  charRangeStart.value = '';
  charRangeEnd.value = '';
  rangePreset.value = 'custom';
}

function removeCharRange(index) {
  charRanges.value.splice(index, 1);
}

/* 把 [start,end] 中被 excluded 占用的码点挖掉，返回剩余的连续子区间 */
function subtractCodesFromRange(start, end, excluded) {
  const holes = [...excluded].filter(code => code >= start && code <= end).sort((a, b) => a - b);
  const remaining = [];
  let cursor = start;
  for (const hole of holes) {
    if (hole > cursor) remaining.push([cursor, hole - 1]);
    cursor = hole + 1;
  }
  if (cursor <= end) remaining.push([cursor, end]);
  return remaining;
}

async function convertFont() {
  if (!canConvert.value || isConverting.value) return;

  isConverting.value = true;

  try {
    // 直接使用当前目录中的sgl_font_conv.exe文件
    // 测试使用：const exePath = '../src/sgl_font_conv/sgl_font_conv.exe';
    const exePath = 'sgl_font_conv.exe';
    let commandStr = exePath; // 提前声明，异常时也能打印已拼出的命令
    console.log('使用的sgl_font_conv.exe路径:', exePath);

    // 勾选的图标按来源字体分组：C 工具支持重复 --font，每组跟一组 --symbols
    const sortedIcons = [...selectedIcons.value].sort((a, b) => a.code - b.code);
    const iconGroups = new Map();
    const fontById = new Map(iconFonts.value.map(f => [f.id, f]));
    for (const icon of sortedIcons) {
      const font = fontById.get(icon.fontId);
      if (!font) continue;
      if (!iconGroups.has(font.path)) iconGroups.set(font.path, []);
      iconGroups.get(font.path).push(icon);
    }

    // 明确勾选的图标优先于主字体的批量范围：把这些码点从主字体范围里挖掉，
    // 否则 C 工具合并时会保留先出现的主字体字形（很多 dingbat 图标正好在 ASCII 区）。
    const iconCodeSet = new Set(sortedIcons.map(i => i.code));
    const mainRanges = [];
    for (const range of charRanges.value) {
      mainRanges.push(...subtractCodesFromRange(range.start, range.end, iconCodeSet));
    }
    const mainSymbols = Array.from(customChars.value)
      .map(c => c.codePointAt(0))
      .filter(code => !iconCodeSet.has(code))
      .sort((a, b) => a - b);
    const hasMainFontContent = !!fontFilePath.value && (mainRanges.length > 0 || mainSymbols.length > 0);

    let duplicateCount = 0;
    const codeOwners = new Set();
    for (const icons of iconGroups.values()) {
      for (const icon of icons) {
        if (codeOwners.has(icon.code)) duplicateCount++;
        else codeOwners.add(icon.code);
      }
    }
    if (duplicateCount > 0) {
      addInfoMessage(`注意：不同图标字体间有 ${duplicateCount} 个重复码点，取模时保留先添加字体的字形`, 'info');
    }
    const excluded = charRanges.value.reduce((n, r) => n + (r.end - r.start + 1), 0)
      - mainRanges.reduce((n, r) => n + (r[1] - r[0] + 1), 0)
      + (Array.from(customChars.value).length - mainSymbols.length);
    if (excluded > 0) {
      addInfoMessage(`已为主字体排除 ${excluded} 个与图标冲突的码点，图标字形优先生效`, 'info');
    }

    const args = [
      '--size', fontSize.value.toString(),
      '--bpp', bpp.value.toString(),
    ];

    // 检查是否需要添加字体文件
    if (hasMainFontContent) {
      args.push('--font', fontFilePath.value);
      // 添加主字体的范围（已剔除图标占用的码点）
      for (const [start, end] of mainRanges) {
        args.push('--range', `0x${start.toString(16)}-0x${end.toString(16)}`);
      }
      // 添加主字体的自定义字符（按完整码点排序，超 BMP 字符不会被拆成代理项）
      if (mainSymbols.length > 0) {
        args.push('--symbols', mainSymbols.map(code => String.fromCodePoint(code)).join(''));
      }
    }

    // 每个图标字体单独一组 --font + --symbols，符号沿用该字体自己的字形
    for (const [fontPath, icons] of iconGroups) {
      const symbols = icons.map(icon => icon.char).join('');
      if (symbols) {
        args.push('--font', fontPath);
        args.push('--symbols', symbols);
      }
    }

    if (compress.value) {
      args.push('--compress');
    }

    if (smartMono.value) {
      args.push('--smart-mono');
    }

    if (flashFont.value) {
      // 先校验并规范化偏移地址，再传给 C 取模工具写入 .flash_addr
      if (!normalizeFlashAddr()) {
        addInfoMessage('转换已取消：请先修正偏移地址', 'error');
        return;
      }
      // 外部Flash字体自动启用等宽块共享描述符，节省内部Flash字体表
      args.push('--flash', '--fixed', '--flash-addr', flashAddr.value);
    }

    if (charSpacing.value > 0) {
      args.push('--spacing', charSpacing.value.toString());
    }

    // 设置输出路径（必需）
    let outputFullPath;
    if (outputDirPath.value) {
      const outputFileName = fontName.value ? `${fontName.value}.c` : `font_${fontSize.value}px_bpp${bpp.value}.c`;
      outputFullPath = await join(outputDirPath.value, outputFileName);
    } else {
      // 兜底：输出目录被清空时仍写到「文档」目录，避免落在只读的程序目录
      const docDir = await documentDir();
      const outputFileName = fontName.value ? `${fontName.value}.c` : `font_${fontSize.value}px_bpp${bpp.value}.c`;
      outputFullPath = await join(docDir, outputFileName);
    }
    args.push('--output', outputFullPath);

    // 构建完整的命令字符串用于打印（--参数不加引号，参数值使用单引号）
    commandStr = exePath;
    for (let i = 0; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        commandStr += ` ${args[i]}`;
      } else {
        commandStr += ` '${args[i]}'`;
      }
    }
    console.log("========================================");
    console.log("调用命令:");
    console.log(commandStr);
    console.log("========================================");

    // 确保参数格式正确
    console.log("参数列表:", args);

    const result = await invoke("run_shell_command", { cmd: exePath, args });

    console.log("转换成功:", result);

    // 如果有图标字体，在C文件末尾追加宏定义
    if (selectedIcons.value.length > 0) {
      try {
        const { readTextFile, writeTextFile } = await import('@tauri-apps/plugin-fs');
        let cFileContent = await readTextFile(outputFullPath);

        // 生成宏定义：多个字体可能含同一码点，按码点去重避免 C 里重复 #define。
        // TextEncoder 直接按 UTF-8 编码整个码点，超 BMP 字符不会拆成代理项对。
        let macroDefinitions = '\n\n// Icon macros\n';
        const seenCodes = new Set();
        for (const icon of sortedIcons) {
          if (seenCodes.has(icon.code)) continue;
          seenCodes.add(icon.code);
          const macroName = `SGL_ICON_${icon.code.toString(16).toUpperCase()}`;
          const charBytes = Array.from(new TextEncoder().encode(icon.char))
            .map(b => `\\x${b.toString(16).padStart(2, '0')}`)
            .join('');
          macroDefinitions += `#define ${macroName} "${charBytes}"\n`;
        }

        cFileContent += macroDefinitions;
        await writeTextFile(outputFullPath, cFileContent);
        console.log('已追加图标宏定义到C文件');
        addInfoMessage('转换成功！', 'info');
      } catch (err) {
        console.error('追加宏定义失败:', err);
        const errMsg = typeof err === 'object' ? JSON.stringify(err, null, 2) : String(err);
        addInfoMessage(`追加图标宏定义失败\n错误: ${errMsg}`, 'error');
        return;
      }
    } else {
      addInfoMessage('转换成功！', 'info');
    }

    // 外部字体会额外生成同名的 .bin 位图文件
    if (flashFont.value) {
      const binPath = outputFullPath.replace(/\.c$/i, '.bin');
      addInfoMessage(`已生成外部字体位图文件: ${binPath}`, 'info');
      addInfoMessage(`外部字体偏移地址(.flash_addr): ${flashAddr.value}`, 'info');
    }

  } catch (err) {
    console.error("转换失败:", err);
    const errorMsg = typeof err === 'object' ? JSON.stringify(err, null, 2) : String(err);
    const fullErrorMsg = `转换失败\n命令: ${commandStr}\n错误: ${errorMsg}`;
    addInfoMessage(fullErrorMsg, 'error');
  } finally {
    isConverting.value = false;
  }
}

function clearLog() {
  infoMessages.value = [];
}

let messageId = 0;
function addInfoMessage(content, type = 'info') {
  const time = new Date().toLocaleString('zh-CN');
  const id = ++messageId;
  infoMessages.value.push({ id, time, content, type });
  // 限制最多显示5条信息
  if (infoMessages.value.length > 5) {
    infoMessages.value.shift();
  }
  // 滚动到底部
  nextTick(() => {
    if (infoMessagesRef.value) {
      infoMessagesRef.value.scrollTop = infoMessagesRef.value.scrollHeight;
    }
  });
  // 5秒后自动消除
  setTimeout(() => {
    const idx = infoMessages.value.findIndex(m => m.id === id);
    if (idx !== -1) {
      infoMessages.value.splice(idx, 1);
    }
  }, 5000);
}
</script>

<style scoped>
.page-container {
  padding: 30px;
  max-width: 1920px;
  margin: 0 auto;
}

h2 {
  margin-bottom: 30px;
  color: #333;
}

.converter-form {
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.form-section {
  margin-bottom: 12px;
}

.icon-font-section {
  margin-top: 20px;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #333;
  font-size: 14px;
}

.form-input,
.form-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: #5a86ff;
}

.form-input.small {
  width: 120px;
}

.file-input-wrapper {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.path-input {
  flex: 1;
  min-width: 0;
}

.file-input {
  display: none;
}

.file-select-btn {
  padding: 10px 16px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: #333;
  transition: all 0.2s;
  text-align: left;
}

.file-select-btn:hover {
  background: #e8e8e8;
  border-color: #ccc;
}

/* 浏览按钮右侧：Windows 本地系统字体库下拉列表 */
.system-font-picker {
  position: relative;
  flex: none;
}

.system-font-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: #333;
  white-space: nowrap;
  transition: all 0.2s;
}

.system-font-btn:hover:not(:disabled) {
  background: #e8e8e8;
  border-color: #ccc;
}

.system-font-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.picker-arrow {
  font-size: 12px;
  transition: transform 0.2s;
}

.picker-arrow.open {
  transform: rotate(180deg);
}

.system-font-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 100;
  width: 320px;
  padding: 8px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

.font-search-input {
  width: 100%;
  margin-bottom: 8px;
}

.font-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 280px;
  overflow-y: auto;
}

.font-list-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.font-list-item:hover {
  background: #f0f5ff;
}

.font-list-item.active {
  background: #e6f7ff;
}

.font-item-name {
  max-width: 100%;
  font-size: 13px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.font-item-file {
  font-size: 11px;
  color: #999;
  font-family: Consolas, 'Courier New', monospace;
}

.font-list-empty {
  text-align: center;
  color: #999;
  font-size: 12px;
  padding: 20px 0;
}

/* 已添加的图标字体：可逐个移除，移除后预览中该字体的图标一起消失 */
.added-font-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.added-font-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 320px;
  padding: 5px 10px;
  background: #e8f4ff;
  color: #5a86ff;
  border-radius: 16px;
  font-size: 12px;
}

.added-font-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.added-font-count {
  flex: none;
  font-size: 11px;
  opacity: 0.75;
}

.clear-fonts-btn {
  padding: 4px 10px;
  border: 1px solid #ff7875;
  border-radius: 14px;
  background: transparent;
  color: #ff7875;
  font-size: 12px;
  cursor: pointer;
}

.clear-fonts-btn:hover {
  background: #ff7875;
  color: white;
}

html.dark .added-font-tag {
  background: #2a3550;
  color: #8fb4ff;
}

html.dark .clear-fonts-btn {
  border-color: #ff7875;
  color: #ff7875;
}

.file-path {
  font-size: 12px;
  color: #666;
  word-break: break-all;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 4px;
}

.spin-input {
  width: 120px;
}

.settings-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.setting-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-label {
  font-size: 12px;
  color: #666;
  font-weight: 500;
}

.setting-input,
.setting-select {
  width: 100%;
  box-sizing: border-box;
}

.setting-checkbox-box {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  box-sizing: border-box;
  cursor: pointer;
}

.setting-checkbox-box input[type="checkbox"] {
  margin: 0;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.setting-checkbox-box span {
  font-size: 14px;
  color: #333;
}

.setting-checkbox-box.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 外部字体：勾选框与偏移地址共用同一个外框 */
.flash-setting-item {
  flex: 2;
}

.flash-checkbox-box {
  flex-wrap: wrap;
  gap: 6px;
  padding: 7px 8px;
  cursor: default;
}

.flash-checkbox-box > span {
  flex: none;
}

.flash-addr-inline {
  display: flex;
  flex: 1 1 150px;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.flash-addr-inline.disabled {
  opacity: 0.5;
}

.flash-addr-label {
  flex: none;
  font-size: 12px;
  color: #666;
  white-space: nowrap;
}

.flash-addr-input {
  flex: 1;
  width: auto;
  min-width: 0;
  padding: 3px 6px;
  border-radius: 4px;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
  text-align: right;
  background: white;
}

.flash-addr-input:disabled {
  cursor: not-allowed;
}

.custom-chars-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
  line-height: 1.5;
}

.range-fontname-row {
  display: flex;
  gap: 16px;
}

.range-section {
  flex: 2;
}

.fontname-section {
  flex: 1;
  min-width: 150px;
}

.fontname-input {
  width: 100%;
  box-sizing: border-box;
}

.range-inputs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.range-inputs span {
  color: #666;
}

/* 预设下拉：覆盖 .form-select 的 width:100%，不挤压两个码点输入框 */
.range-preset-select {
  width: auto;
  min-width: 200px;
  flex: 0 0 auto;
  padding: 8px 10px;
}

.range-inputs .form-input[readonly] {
  background: #f2f2f2;
  color: #999;
}

.range-preset-hint {
  margin: -4px 0 10px;
  font-size: 12px;
  line-height: 1.5;
  color: #888;
}

.range-tag-label {
  margin-right: 6px;
  font-family: inherit;
  font-weight: 600;
}

.add-range-btn {
  padding: 10px 16px;
  background: #5a86ff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
}

.add-range-btn:hover {
  background: #4a76e9;
}

.range-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.range-tag {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  background: #e8f4ff;
  color: #5a86ff;
  border-radius: 16px;
  font-size: 13px;
  font-family: 'Consolas', 'Monaco', monospace;
}

.remove-tag {
  margin-left: 6px;
  cursor: pointer;
  font-size: 16px;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.remove-tag:hover {
  opacity: 1;
}

.checkbox-section {
  display: flex;
  align-items: center;
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-weight: normal;
}

.checkbox-label input[type="checkbox"] {
  margin-right: 8px;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.form-actions {
  display: flex;
  gap: 12px;
  margin-top: 32px;
}

.convert-btn {
  flex: 1;
  padding: 12px 24px;
  background: #5a86ff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  transition: background 0.2s;
}

.convert-btn:hover:not(:disabled) {
  background: #4a76e9;
}

.convert-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 800px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #999;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  margin: 0;
}

.close-btn:hover {
  background: #f5f5f5;
  color: #333;
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.result-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 14px;
  line-height: 1.6;
  color: #333;
  background: #f8f9fa;
  padding: 12px;
  border-radius: 6px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #eee;
  background: #fafafa;
}

.copy-btn {
  background: #28a745;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  margin: 0;
}

.copy-btn:hover {
  background: #218838;
}

.confirm-btn {
  background: #5a86ff;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  margin: 0;
}

.confirm-btn:hover {
  background: #4a76e9;
}

.copy-tip {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  z-index: 10000;
  animation: fadeInOut 1s ease forwards;
}

@keyframes fadeInOut {
  0% { opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { opacity: 0; }
}

/* 信息输出栏样式 */
.info-bar {
  margin-top: 24px;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  transition: all 0.3s ease;
}



.info-bar h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #333;
  font-weight: 500;
}

.empty-log {
  text-align: center;
  color: #999;
  font-size: 13px;
  padding: 20px 0;
  font-style: italic;
}

.info-messages {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: calc(2 * (13px * 1.4 + 24px + 8px));
  overflow-y: auto;
}

.info-message {
  padding: 12px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.4;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.info-message.info {
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  color: #1890ff;
}

.info-message.error {
  background: #fff1f0;
  border: 1px solid #ffccc7;
  color: #ff7875;
}

.msg-time {
  font-size: 12px;
  color: #999;
  flex-shrink: 0;
  min-width: 120px;
}

.msg-content {
  flex: 1;
  white-space: pre-wrap;
  word-break: break-all;
}

.copy-msg-btn {
  background: transparent;
  border: 1px solid #ff7875;
  color: #ff7875;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 2px;
}

.copy-msg-btn:hover {
  background: #ff7875;
  color: white;
}

.form-label-with-button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.select-all-btn {
  background: transparent;
  border: 1px solid #1890ff;
  color: #1890ff;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.select-all-btn:hover {
  background: #1890ff;
  color: white;
}

.preview-btn-group {
  display: flex;
  gap: 6px;
}

.deselect-all-btn {
  background: transparent;
  border: 1px solid #ff4d4f;
  color: #ff4d4f;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.deselect-all-btn:hover {
  background: #ff4d4f;
  color: white;
}

/* 深色主题样式 */
html.dark .form-label-with-button .form-label {
  color: rgba(255, 255, 255, 0.88);
}

html.dark .select-all-btn {
  border-color: #40a9ff;
  color: #40a9ff;
}

html.dark .select-all-btn:hover {
  background: #40a9ff;
  color: white;
}

html.dark .deselect-all-btn {
  border-color: #ff7875;
  color: #ff7875;
}

html.dark .deselect-all-btn:hover {
  background: #ff7875;
  color: white;
}

/* 预览配色工具条 */
.preview-color-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 12px;
  padding: 8px 10px;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  background: #fafafa;
  font-size: 12px;
}

.preview-color-title {
  font-weight: 600;
  color: #555;
}

.preview-color-field {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #666;
  cursor: pointer;
}

.preview-color-field input[type='color'] {
  width: 28px;
  height: 22px;
  padding: 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.preview-color-presets {
  display: inline-flex;
  gap: 6px;
}

.preview-color-preset {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  font-size: 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: #fff;
  color: #555;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preview-color-preset:hover {
  border-color: #5a86ff;
  color: #5a86ff;
}

.preview-color-preset.active {
  border-color: #5a86ff;
  background: #eef3ff;
  color: #3358cc;
}

.preset-swatch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  border-radius: 3px;
  font: 700 10px/1 sans-serif;
}

.preview-color-hint {
  margin-left: auto;
  color: #aaa;
  font-size: 11px;
}

/* 图标预览样式 */
.icon-font-group {
  margin-bottom: 14px;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  overflow: hidden;
}

.icon-font-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 7px 10px;
  background: #f0f4ff;
  border-bottom: 1px solid #e8e8e8;
  font-size: 12px;
}

.icon-font-group-name {
  font-weight: 600;
  color: #3457c5;
  max-width: 260px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.icon-font-group-count {
  color: #7a8699;
  flex: 1;
  min-width: 120px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.group-toggle-btn {
  padding: 3px 10px;
  border: 1px solid #b9c6de;
  border-radius: 4px;
  background: white;
  color: #5a6b8c;
  font-size: 11px;
  cursor: pointer;
}

.group-toggle-btn:hover {
  border-color: #5a86ff;
  color: #5a86ff;
}

.icon-preview-container {
  /* 默认跟随主题，工具条选择颜色后用内联变量覆盖 */
  --icon-preview-fg: #333;
  --icon-preview-bg: #fafafa;
  --icon-preview-item-bg: #fff;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  gap: 6px;
  max-height: calc(6 * (50px + 6px) + 16px);
  overflow-y: auto;
  padding: 8px;
  border: none;
  border-radius: 0;
  background: var(--icon-preview-bg);
}

.icon-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 4px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: var(--icon-preview-item-bg, white);
  cursor: pointer;
  transition: all 0.2s ease;
  height: 50px;
  /* 几千个图标时长列表跳过视口外渲染，避免界面卡住 */
  content-visibility: auto;
  contain-intrinsic-size: auto 50px;
}

.icon-item:hover {
  border-color: #5a86ff;
  background: #f0f5ff;
  transform: translateY(-1px);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}

.icon-item.selected {
  border-color: #5a86ff;
  background: #e6f7ff;
  box-shadow: 0 0 0 1px #5a86ff;
}

.icon-char {
  font-size: 20px;
  margin-bottom: 2px;
  font-family: 'Segoe UI Symbol', 'Arial Unicode MS', sans-serif;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 预览直接画字形轮廓，颜色由预览配色工具条控制 */
.icon-glyph {
  width: 26px;
  height: 26px;
  display: block;
  fill: var(--icon-preview-fg, #333);
}

/* 没有轮廓、回退到 @font-face 文本渲染的字形同样跟随配色 */
.icon-char > span {
  color: var(--icon-preview-fg, #333);
}

.icon-code {
  font-size: 9px;
  color: #999;
  font-family: monospace;
}

.no-icons {
  grid-column: 1 / -1;
  text-align: center;
  color: #999;
  padding: 40px 0;
  font-size: 14px;
}
</style>

<style>
/* 深色主题样式 */
html.dark .page-container {
  background: transparent;
}

html.dark .converter-form {
  background: #1a1d2b;
  border-color: #3a3f55;
}

html.dark .form-section {
  color: #e0e0e0;
}

html.dark .form-label {
  color: #e0e0e0;
}

html.dark .setting-label {
  color: #e0e0e0;
}

html.dark .form-input,
html.dark .form-select {
  background: #252a3a;
  border-color: #3a3f55;
  color: #e0e0e0;
}

html.dark .form-input:focus,
html.dark .form-select:focus {
  border-color: #6699ff;
  background: #2f354a;
}

html.dark .range-inputs span {
  color: #a0a6b8;
}

html.dark .range-tag {
  background: #2a3550;
  color: #8fb4ff;
}

html.dark .range-inputs .form-input[readonly] {
  background: #20243a;
  color: #7a8199;
}

html.dark .range-preset-hint {
  color: #8a90a5;
}

html.dark .file-input-wrapper {
  background: #252a3a;
}

html.dark .file-select-btn {
  background: #6699ff;
  color: white;
}

html.dark .file-select-btn:hover {
  background: #5588ee;
}

html.dark .system-font-btn {
  background: #6699ff;
  border-color: #6699ff;
  color: white;
}

html.dark .system-font-btn:hover:not(:disabled) {
  background: #5588ee;
  border-color: #5588ee;
}

html.dark .system-font-dropdown {
  background: #252a3a;
  border-color: #3a3f55;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
}

html.dark .system-font-dropdown .font-search-input {
  background: #1c2030;
  border-color: #3a3f55;
  color: #e0e0e0;
}

html.dark .system-font-dropdown .font-search-input:focus {
  border-color: #6699ff;
}

html.dark .font-list-item:hover {
  background: #2f354a;
}

html.dark .font-list-item.active {
  background: #1a2e3a;
}

html.dark .font-item-name {
  color: #e0e0e0;
}

html.dark .font-item-file {
  color: #8a90a5;
}

html.dark .font-list-empty {
  color: #888;
}

html.dark .info-bar {
  background: #252a3a;
  border-color: #3a3f55;
}

html.dark .info-bar h4 {
  color: #e0e0e0;
}



html.dark .info-message {
  background: #252a3a;
  border-color: #3a3f55;
}

html.dark .info-message.info {
  background: #1a2e3a;
  border-color: #1890ff;
  color: #e0e0e0;
}

html.dark .info-message.error {
  background: #2e1a1a;
  border-color: #ff7875;
  color: #ff7875;
}

html.dark .msg-time {
  color: #999;
}

html.dark .msg-content {
  color: #e0e0e0;
}

html.dark .icon-preview-container {
  --icon-preview-fg: #e0e0e0;
  --icon-preview-bg: #1a1d2b;
  --icon-preview-item-bg: #252a3a;
  background: var(--icon-preview-bg);
  border-color: #3a3f55;
}

html.dark .icon-item {
  /* 自定义预览背景时格子跟着变，不能用硬编码色盖掉变量 */
  background: var(--icon-preview-item-bg, #252a3a);
  border-color: #3a3f55;
}

html.dark .icon-item:hover {
  background: #2f354a;
  border-color: #6699ff;
}

html.dark .icon-item.selected {
  background: #1a2e3a;
  border-color: #6699ff;
}

html.dark .preview-color-bar {
  background: #1f2331;
  border-color: #3a3f55;
}

html.dark .preview-color-title,
html.dark .preview-color-field {
  color: #b9c0d4;
}

html.dark .preview-color-field input[type='color'] {
  border-color: #4a5068;
}

html.dark .preview-color-preset {
  background: #252a3a;
  border-color: #3a3f55;
  color: #b9c0d4;
}

html.dark .preview-color-preset.active {
  background: #2a3550;
  border-color: #6699ff;
  color: #9fc0ff;
}

html.dark .preview-color-hint {
  color: #7d849b;
}

html.dark .icon-font-group {
  border-color: #3a3f55;
}

html.dark .icon-font-group-header {
  background: #252a3a;
  border-bottom-color: #3a3f55;
}

html.dark .icon-font-group-name {
  color: #8fb4ff;
}

html.dark .icon-font-group-count {
  color: #a0a6b8;
}

html.dark .group-toggle-btn {
  background: #2f354a;
  border-color: #3a3f55;
  color: #c0c8dc;
}

html.dark .icon-code {
  color: #999;
}

html.dark .no-icons {
  color: #666;
}

html.dark .empty-log {
  color: #666;
}

html.dark .setting-checkbox-box {
  background: #252a3a;
  border-color: #3a3f55;
}

html.dark .setting-checkbox-box span {
  color: #e0e0e0;
}

html.dark .setting-checkbox-box input[type="checkbox"] {
  accent-color: #6699ff;
}

html.dark .flash-checkbox-box {
  background: #252a3a;
  border-color: #3a3f55;
}

html.dark .flash-addr-label {
  color: #e0e0e0;
}

html.dark .setting-checkbox-box .flash-addr-input {
  background: #1c2030;
  border-color: #3a3f55;
  color: #e0e0e0;
}

html.dark .setting-checkbox-box .flash-addr-input:focus {
  background: #252a3a;
  border-color: #6699ff;
}
</style>
