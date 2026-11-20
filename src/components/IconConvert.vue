<template>
  <div class="page-container icon-page">
    <div class="converter-card">
      <div class="card-title">
        <h3>图标转换 <span class="en">ICON CONVERT</span></h3>
        <span class="sub">带透明度图片 / ICO 图标 → ARGB8565 / ARGB8888 C 数组 · 支持等比高质量缩放</span>
      </div>

      <!-- 添加图片 -->
      <div class="form-section">
        <div class="section-head">
          <div class="form-label">图片文件（支持多选 / 拖拽）</div>
          <button v-if="sourceImages.length > 0" class="clear-all-btn" @click="clearAllImages">全部清除</button>
        </div>
        <div
          class="drop-zone"
          :class="{ dragging: isDragging }"
          @dragenter.prevent="isDragging = true"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="onDrop"
        >
          <button class="add-image-btn" @click="selectImageFile">添加图片</button>
          <span class="drop-hint">PNG / JPG / BMP / WEBP / GIF / ICO / CUR / ICNS · 可一次选择多张一起生成一个数组</span>
          <input
            ref="fileInputRef"
            class="hidden-file-input"
            type="file"
            multiple
            accept="image/*,.ico,.cur,.icns,image/x-icon,image/vnd.microsoft.icon"
            @change="onFileInputChange"
          >
        </div>
      </div>

      <!-- 原图卡片 -->
      <div class="form-section">
        <div class="form-label">
          原图预览
          <span v-if="sourceImages.length > 0" class="size-info">共 {{ sourceImages.length }} 张 · {{ scalingEnabled ? '等比缩放后输出' : '保持原始尺寸' }}</span>
        </div>
        <div class="preview-container">
          <div v-if="sourceImages.length > 0" class="card-grid">
            <div v-for="(image, index) in sourceImages" :key="image.id" class="icon-card">
              <div class="thumb-box" :class="previewBgClass">
                <img :src="image.previewUrl" class="thumb" alt="原图预览">
              </div>
              <div class="card-meta">
                <div class="meta-row top">
                  <span class="file-name" :title="image.path || image.name">{{ image.name }}</span>
                  <button class="remove-btn" title="移除" @click="removeImage(index)">×</button>
                </div>
                <div class="meta-row">
                  <span :title="sizeTooltip(image)">{{ sizeLabel(image) }}</span>
                  <span class="badge">{{ effectiveSize(image).changed ? '等比缩放' : '原始尺寸' }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="empty-hint">请点击「添加图片」选择带透明度的图片文件</div>
        </div>
      </div>

      <!-- 设置 -->
      <div class="form-section">
        <div class="settings-row">
          <div class="setting-item">
            <label class="form-label">颜色格式</label>
            <select v-model="colorFormat" class="form-select">
              <option value="ARGB8565">ARGB8565</option>
              <option value="ARGB8888">ARGB8888</option>
              <option value="BOTH">两种格式都生成</option>
            </select>
          </div>
          <div class="setting-item">
            <label class="form-label">输出数组名</label>
            <input v-model="arrayName" type="text" class="form-input" placeholder="icons">
          </div>
          <div class="setting-item">
            <label class="form-label">每行字节数</label>
            <select v-model.number="valuesPerLine" class="form-select">
              <option :value="12">12</option>
              <option :value="16">16</option>
              <option :value="24">24</option>
              <option :value="32">32</option>
            </select>
          </div>
          <div class="setting-item">
            <label class="form-label">预览底色</label>
            <select v-model="previewBg" class="form-select">
              <option value="checker">棋盘格</option>
              <option value="light">白色</option>
              <option value="dark">黑色</option>
            </select>
          </div>
        </div>
        <div class="settings-row second-row">
          <div class="setting-item scale-box">
            <label class="form-label">等比缩放 <span class="label-note">默认不缩放</span></label>
            <select v-model="scaleMode" class="form-select">
              <option value="none">不缩放（保持原始尺寸）</option>
              <option value="width">按宽度缩放</option>
              <option value="height">按高度缩放</option>
              <option value="max">限制最长边</option>
              <option value="fit">等比适配到宽 × 高</option>
            </select>
            <div v-if="scalingEnabled" class="scale-controls">
              <span class="scale-caption">{{ scaleCaption }}</span>
              <input
                v-if="scaleMode !== 'height'"
                v-model.number="targetWidth"
                type="number"
                min="1"
                max="4096"
                class="form-input scale-number"
                aria-label="目标宽度"
              >
              <input
                v-else
                v-model.number="targetHeight"
                type="number"
                min="1"
                max="4096"
                class="form-input scale-number"
                aria-label="目标高度"
              >
              <template v-if="scaleMode === 'fit'">
                <span class="scale-x">×</span>
                <input
                  v-model.number="targetHeight"
                  type="number"
                  min="1"
                  max="4096"
                  class="form-input scale-number"
                  aria-label="目标高度"
                >
              </template>
              <span class="scale-unit">px</span>
            </div>
            <div class="scale-hint" :class="{ 'hint-error': !scaleConfigValid }">{{ scaleSummary }}</div>
          </div>
          <div class="format-note">
            <div><b>字节序</b>：ARGB8565 = RGB565 低字节在前 + Alpha（3B/像素）；ARGB8888 = B,G,R,A（4B/像素），与「图片转换」一致。</div>
            <div><b>文件头</b>：仅一行 <code>#include &lt;sgl_core.h&gt;</code>，<code>sgl_icon_pixmap_t</code> 由 SGL 头文件提供，不输出文件级说明注释。</div>
            <div><b>固定合并</b>：无论几张图片，都合并为一个 <code>name_bitmap[图片数][最大字节数]</code> 二维数组 + 一个 <code>sgl_icon_pixmap_t</code> 描述数组，每行一张图标，行尾由 C 编译器自动补 0；<code>width/height</code> 取实际输出尺寸。</div>
            <div><b>图标文件</b>：ICO / CUR 自动挑选容器内分辨率最高的帧，并还原老式 DIB 的 AND mask 透明度；ICNS 提取最大内嵌 PNG。全部保留透明通道。</div>
            <div><b>缩放算法</b>：{{ qualityLabel }}；大幅缩小先做面积平均抗混叠，再由 Lanczos3 收尾，全程预乘 Alpha + 线性光，避免透明边缘发黑。</div>
            <div v-if="hasDifferentSizes" class="warn-line">提示：当前各图输出尺寸不同（{{ sizeSummary }}），二维数组第二维将取最大值 {{ maxRowBytes }} 字节，短行尾部补 0，不影响实际显示尺寸。</div>
          </div>
        </div>
      </div>

      <!-- 转换按钮 -->
      <div class="form-actions">
        <button class="convert-btn" :disabled="!canConvert || isConverting" @click="convertImages">
          {{ isConverting ? '转换中...' : '开始转换' }}
        </button>
      </div>

      <!-- 多格式结果切换 -->
      <div v-if="results.length > 1" class="result-tabs">
        <button
          v-for="(result, index) in results"
          :key="result.format"
          class="tab-btn"
          :class="{ active: activeResultIndex === index }"
          @click="activeResultIndex = index"
        >
          {{ result.format }} · {{ formatBytes(result.totalBytes) }}
        </button>
      </div>

      <!-- 转换后预览卡片 -->
      <div v-if="activeResult" class="form-section">
        <div class="form-label">
          转换后预览
          <span class="size-info">由生成的数组反解 · {{ activeResult.format }} · 共 {{ formatBytes(activeResult.totalBytes) }}</span>
        </div>
        <div class="preview-container">
          <div class="card-grid">
            <div v-for="(preview, index) in activeResult.previews" :key="index" class="icon-card">
              <div class="thumb-box" :class="previewBgClass">
                <img :src="preview.url" class="thumb pixelated" alt="转换后预览">
              </div>
              <div class="card-meta">
                <div class="meta-row top"><span class="file-name" :title="preview.name">{{ preview.name }}</span></div>
                <div class="meta-row">
                  <span>{{ preview.width }} × {{ preview.height }}</span>
                  <span>{{ formatBytes(preview.byteLength) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- C 代码卡片 -->
    <div v-if="activeResult" class="result-card">
      <div class="result-header">
        <h4>C 数组代码 <span class="result-format">{{ activeResult.format }}</span></h4>
        <div class="result-actions">
          <button class="action-btn primary" @click="copyText(activeResult.code, '全部代码')">复制全部代码</button>
          <button class="action-btn" @click="copyText(activeResult.dataCode, '数组数据')">复制数组数据</button>
          <button class="action-btn" @click="downloadCode">下载 .c</button>
        </div>
      </div>
      <textarea
        class="code-area"
        :value="codeForDisplay"
        readonly
        spellcheck="false"
        wrap="off"
      ></textarea>
      <div class="code-foot">
        <span>数据 {{ activeResult.totalBytes }} 字节 · 代码 {{ activeResult.code.length.toLocaleString() }} 字符</span>
        <span v-if="activeResult.rowLength">二维数组：{{ activeResult.previews.length }} × {{ activeResult.rowLength }} 字节</span>
        <span>文本框可直接全选复制</span>
      </div>
    </div>

    <!-- LOG -->
    <div class="info-bar">
      <div class="info-bar-head">
        <h4>LOG信息</h4>
        <button v-if="infoMessages.length" class="clear-log-btn" @click="infoMessages = []">清空</button>
      </div>
      <div class="info-messages" ref="infoMessagesRef">
        <div v-for="msg in infoMessages" :key="msg.id" :class="['info-message', msg.type]">
          <span class="msg-time">{{ msg.time }}</span>
          <span class="msg-content">{{ msg.content }}</span>
        </div>
        <div v-if="infoMessages.length === 0" class="empty-log">暂无日志信息</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onUnmounted, markRaw } from 'vue';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile, writeTextFile } from '@tauri-apps/plugin-fs';
import {
  encodeIconBitmap,
  decodeIconBitmap,
  buildIconCode,
  formatBytes,
  toCIdentifier
} from '../utils/iconPixmap';
import { normalizeImageFile } from '../utils/iconFile';
import {
  computeScaledSize,
  scaleRgbaKeepAspect,
  RESIZE_QUALITY_LABEL
} from '../utils/imageResize';

const isTauri = typeof window !== 'undefined'
  && Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);

const MAX_IMAGE_PIXELS = 4 * 1024 * 1024;
const MAX_TOTAL_DATA_BYTES = 64 * 1024 * 1024;
const MAX_DISPLAY_CODE_CHARS = 2 * 1024 * 1024;
const SETTINGS_KEY = 'sgltoolkit-icon-settings';

const sourceImages = ref([]);
const colorFormat = ref('ARGB8565');
const arrayName = ref('icons');
const valuesPerLine = ref(24);
const previewBg = ref('checker');
const scaleMode = ref('none');
const targetWidth = ref(64);
const targetHeight = ref(64);
const qualityLabel = RESIZE_QUALITY_LABEL;
const isConverting = ref(false);
const isDragging = ref(false);
const results = ref([]);
const activeResultIndex = ref(0);
const infoMessages = ref([]);
const infoMessagesRef = ref(null);
const fileInputRef = ref(null);

let imageId = 0;
let messageId = 0;
let conversionRunId = 0;
/** 保留每个格式编码后的位图数据，改代码参数时无需重新解码图片 */
let rawResults = [];

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (['ARGB8565', 'ARGB8888', 'BOTH'].includes(saved.colorFormat)) colorFormat.value = saved.colorFormat;
    if (typeof saved.arrayName === 'string' && saved.arrayName) arrayName.value = saved.arrayName;
    if ([12, 16, 24, 32].includes(saved.valuesPerLine)) valuesPerLine.value = saved.valuesPerLine;
    if (['checker', 'light', 'dark'].includes(saved.previewBg)) previewBg.value = saved.previewBg;
    if (['none', 'width', 'height', 'max', 'fit'].includes(saved.scaleMode)) scaleMode.value = saved.scaleMode;
    if (Number.isFinite(saved.targetWidth) && saved.targetWidth > 0) targetWidth.value = saved.targetWidth;
    if (Number.isFinite(saved.targetHeight) && saved.targetHeight > 0) targetHeight.value = saved.targetHeight;
  } catch (error) {
    console.error('加载图标转换设置失败:', error);
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      colorFormat: colorFormat.value,
      arrayName: arrayName.value,
      valuesPerLine: valuesPerLine.value,
      previewBg: previewBg.value,
      scaleMode: scaleMode.value,
      targetWidth: targetWidth.value,
      targetHeight: targetHeight.value
    }));
  } catch (error) {
    console.error('保存图标转换设置失败:', error);
  }
}

loadSettings();

const activeResult = computed(() => results.value[activeResultIndex.value] || null);
const previewBgClass = computed(() => `bg-${previewBg.value}`);
const codeForDisplay = computed(() => {
  const code = activeResult.value?.code || '';
  if (code.length <= MAX_DISPLAY_CODE_CHARS) return code;
  return `/* 代码共 ${code.length.toLocaleString()} 字符，超过文本框显示上限。\n`
    + '   请直接点击「复制全部代码」或「下载 .c」获取完整内容。 */\n\n'
    + code.slice(0, 4000) + '\n/* ... 后续内容已省略 ... */';
});
const scalingEnabled = computed(() => scaleMode.value !== 'none');
const scaleCaption = computed(() => ({
  width: '目标宽度',
  height: '目标高度',
  max: '最长边',
  fit: '目标框'
}[scaleMode.value] || '目标尺寸'));

function currentScaleOptions() {
  return {
    mode: scaleMode.value,
    targetWidth: Number(targetWidth.value) || 0,
    targetHeight: Number(targetHeight.value) || 0
  };
}

/** 每张图的实际输出尺寸（模板与转换共用同一套计算，避免显示与数据不一致） */
function effectiveSize(image) {
  return computeScaledSize(image.width, image.height, currentScaleOptions());
}

function sizeLabel(image) {
  const size = effectiveSize(image);
  return size.changed
    ? `${image.width} × ${image.height} → ${size.width} × ${size.height}`
    : `${image.width} × ${image.height}`;
}

function sizeTooltip(image) {
  const parts = [`文件: ${image.name}`, `原始尺寸: ${image.width} × ${image.height}`];
  if (image.frameInfo) {
    const info = image.frameInfo;
    parts.push(`${info.container} 共 ${info.frameCount} 帧，选用 ${info.picked} (${info.encoding})`);
    if (info.mask) parts.push(`透明度来源: ${info.mask}`);
  }
  const size = effectiveSize(image);
  parts.push(size.changed ? `输出尺寸: ${size.width} × ${size.height}` : '输出尺寸: 保持原样');
  return parts.join('\n');
}

const scaleConfigValid = computed(() => sourceImages.value.every((image) => effectiveSize(image).valid));
const canConvert = computed(() => sourceImages.value.length > 0
  && !isConverting.value
  && scaleConfigValid.value);
const scaleSummary = computed(() => {
  if (!scalingEnabled.value) return '保持原始尺寸，不做任何重采样；开启后 width / height 取缩放结果。';
  const list = sourceImages.value;
  if (!list.length) return `${qualityLabel} · 添加图片后显示预计输出尺寸`;
  const bad = list.find((image) => !effectiveSize(image).valid);
  if (bad) return `目标尺寸无效：${effectiveSize(bad).error}`;
  const parts = list.slice(0, 3).map((image) => {
    const size = effectiveSize(image);
    return `${image.width}×${image.height}→${size.width}×${size.height}`;
  });
  return `预计输出：${parts.join('、')}${list.length > 3 ? ` … 共 ${list.length} 张` : ''} · 严格保持宽高比`;
});

const hasDifferentSizes = computed(() => {
  const sizes = new Set(sourceImages.value.map((image) => {
    const size = effectiveSize(image);
    return `${size.width}x${size.height}`;
  }));
  return sizes.size > 1;
});
const sizeSummary = computed(() => Array.from(new Set(sourceImages.value.map((image) => {
  const size = effectiveSize(image);
  return `${size.width}x${size.height}`;
}))).join(' / '));
const maxRowBytes = computed(() => {
  const bpp = colorFormat.value === 'ARGB8565' ? 3 : 4;
  return Math.max(0, ...sourceImages.value.map((image) => {
    const size = effectiveSize(image);
    return size.width * size.height * bpp;
  }));
});

function addInfoMessage(content, type = 'info') {
  const id = ++messageId;
  infoMessages.value.push({ id, time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), content, type });
  if (infoMessages.value.length > 30) infoMessages.value.shift();
  nextTick(() => {
    if (infoMessagesRef.value) infoMessagesRef.value.scrollTop = infoMessagesRef.value.scrollHeight;
  });
}

function currentCodeOptions() {
  return {
    arrayName: arrayName.value,
    valuesPerLine: valuesPerLine.value
  };
}

/** 只重新拼 C 文本，不重新解码/编码图片 */
function regenerateCode() {
  if (!rawResults.length) return;
  results.value = rawResults.map((raw, index) => {
    const built = buildIconCode(raw.infos, { format: raw.format, ...currentCodeOptions() });
    return {
      ...results.value[index],
      code: built.code,
      dataCode: built.dataCode,
      totalBytes: built.totalBytes,
      rowLength: built.rowLength
    };
  });
}

function releaseResultPreviews(list) {
  for (const result of list) {
    for (const preview of result.previews || []) {
      if (typeof preview.url === 'string' && preview.url.startsWith('blob:')) {
        URL.revokeObjectURL(preview.url);
      }
    }
  }
}

function clearResults() {
  releaseResultPreviews(results.value);
  results.value = [];
  rawResults = [];
  activeResultIndex.value = 0;
}

// 颜色格式变化会让预览/数据失效；代码排版参数变化可原地重生成
watch(colorFormat, () => {
  saveSettings();
  conversionRunId++;
  clearResults();
  if (sourceImages.value.length) addInfoMessage('颜色格式已更改，请重新点击「开始转换」', 'info');
});
watch([arrayName, valuesPerLine, previewBg], () => {
  saveSettings();
  regenerateCode();
});
// 缩放会改变像素数据，已有结果必须失效，需重新转换
watch([scaleMode, targetWidth, targetHeight], () => {
  saveSettings();
  const hadResults = results.value.length > 0;
  conversionRunId++;
  clearResults();
  if (hadResults) addInfoMessage('缩放设置已更改，请重新点击「开始转换」', 'info');
});

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法解码该图片文件'));
    image.src = url;
  });
}

async function readImageBytes(source) {
  if (source.file) return new Uint8Array(await source.file.arrayBuffer());
  return new Uint8Array(await readFile(source.path));
}

async function addFiles(files) {
  if (!files.length) return;
  clearResults();
  for (const source of files) {
    let url = null;
    let image = null;
    try {
      const rawBytes = await readImageBytes(source);
      // ICO / CUR / ICNS 在这里被规范化成 PNG；普通图片原样透传
      const normalized = await normalizeImageFile(rawBytes, source.name);
      url = URL.createObjectURL(new Blob([normalized.bytes], { type: normalized.mime || 'image/png' }));

      let width = normalized.width;
      let height = normalized.height;
      if (!normalized.rgba) {
        image = await loadImage(url);
        width = image.naturalWidth || image.width;
        height = image.naturalHeight || image.height;
      }
      if (!width || !height) throw new Error('无法获取图片尺寸');
      if (width * height > MAX_IMAGE_PIXELS) {
        throw new Error(`图片 ${width}x${height} 超过 ${MAX_IMAGE_PIXELS.toLocaleString()} 像素限制`);
      }
      if (sourceImages.value.length === 0 && arrayName.value === 'icons') {
        arrayName.value = `icon_${toCIdentifier(source.name, 'image')}`;
      }

      sourceImages.value.push({
        id: ++imageId,
        name: source.name,
        path: source.path || null,
        file: source.file || null,
        previewUrl: url,
        normalizedBytes: markRaw(normalized.bytes),
        normalizedMime: normalized.mime,
        normalizedRgba: normalized.rgba ? markRaw(normalized.rgba) : null,
        frameInfo: normalized.frameInfo,
        width,
        height
      });
      url = null; // 预览 URL 已由 sourceImages 接管，不能在异常分支释放

      const frameText = normalized.frameInfo
        ? ` · ${normalized.frameInfo.container} 共 ${normalized.frameInfo.frameCount} 帧，选用 ${normalized.frameInfo.picked} (${normalized.frameInfo.encoding})`
        : '';
      addInfoMessage(`已添加: ${source.name} (${width} × ${height})${frameText}`, 'info');
    } catch (error) {
      if (url) URL.revokeObjectURL(url);
      console.error('添加图片失败:', error);
      addInfoMessage(`添加图片失败: ${source.name} - ${error.message || error}`, 'error');
    } finally {
      if (image) { image.onload = null; image.onerror = null; image.src = ''; }
    }
  }
  const total = sourceImages.value.reduce((sum, image) => {
    const size = effectiveSize(image);
    return sum + size.width * size.height * 4;
  }, 0);
  if (total > MAX_TOTAL_DATA_BYTES) {
    addInfoMessage('图片总量较大，可能无法一次转换，请减少图片数量', 'error');
  }
}

async function selectImageFile() {
  if (!isTauri) {
    fileInputRef.value?.click();
    return;
  }
  try {
    const selected = await open({
      directory: false,
      multiple: true,
      title: '选择图标图片文件',
      filters: [
        { name: '图片 / 图标文件', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'webp', 'gif', 'ico', 'cur', 'icns'] },
        { name: '图标文件', extensions: ['ico', 'cur', 'icns'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    await addFiles(paths.map((path) => ({ path, name: path.split(/[/\\]/).pop() || 'image' })));
  } catch (error) {
    console.error('选择图片失败:', error);
    addInfoMessage(`选择图片失败: ${error.message || error}`, 'error');
  }
}

function onFileInputChange(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  addFiles(files.map((file) => ({ file, name: file.name })));
}

function onDrop(event) {
  isDragging.value = false;
  const files = Array.from(event.dataTransfer?.files || []);
  const images = files.filter((file) => file.type.startsWith('image/')
    || /\.(png|jpe?g|bmp|webp|gif|ico|cur|icns)$/i.test(file.name));
  if (!images.length) {
    addInfoMessage('拖入的文件中没有可识别的图片', 'error');
    return;
  }
  addFiles(images.map((file) => ({ file, name: file.name })));
}

function removeImage(index) {
  const image = sourceImages.value[index];
  if (image?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(image.previewUrl);
  sourceImages.value.splice(index, 1);
  clearResults();
}

function clearAllImages() {
  conversionRunId++;
  for (const image of sourceImages.value) {
    if (image.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(image.previewUrl);
  }
  sourceImages.value = [];
  clearResults();
}

/** 1:1 解码原图（不引入浏览器插值），再按需做高质量等比缩放 */
async function decodeSourceImage(source) {
  const options = currentScaleOptions();
  const precheck = computeScaledSize(source.width, source.height, options);
  if (!precheck.valid) throw new Error(`${source.name}: ${precheck.error}`);

  let srcWidth = source.width;
  let srcHeight = source.height;
  let rgba;

  if (source.normalizedRgba) {
    // ICO 的 DIB 帧已经解成 RGBA，直接用，避免 PNG 往返损失半透明精度
    rgba = source.normalizedRgba;
  } else {
    const url = URL.createObjectURL(new Blob([source.normalizedBytes], {
      type: source.normalizedMime || 'image/png'
    }));
    let image = null;
    let canvas = null;
    try {
      image = await loadImage(url);
      srcWidth = image.naturalWidth || image.width;
      srcHeight = image.naturalHeight || image.height;
      if (srcWidth !== source.width || srcHeight !== source.height) {
        addInfoMessage(`注意: ${source.name} 实际尺寸为 ${srcWidth}×${srcHeight}，按实际尺寸处理`, 'info');
      }
      canvas = document.createElement('canvas');
      canvas.width = srcWidth;   // 原尺寸
      canvas.height = srcHeight; // 原尺寸
      const context = canvas.getContext('2d', { willReadFrequently: true, alpha: true });
      context.drawImage(image, 0, 0); // 不传目标宽高 = 1:1，插值统一交给 Lanczos
      rgba = new Uint8ClampedArray(context.getImageData(0, 0, srcWidth, srcHeight).data);
    } finally {
      URL.revokeObjectURL(url);
      if (image) { image.onload = null; image.onerror = null; image.src = ''; }
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    }
  }

  const scaled = scaleRgbaKeepAspect(rgba, srcWidth, srcHeight, options);
  return {
    name: source.name,
    fileName: source.name,
    width: scaled.width,
    height: scaled.height,
    originalWidth: srcWidth,
    originalHeight: srcHeight,
    rgba: markRaw(scaled.rgba)
  };
}

/** 由量化后的数组反解成预览图（canvas 像素尺寸 = 原图尺寸） */
async function createPreviewUrl(rgba, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext('2d', { alpha: true });
    context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('无法生成转换后预览')), 'image/png');
    });
    return URL.createObjectURL(blob);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

async function convertImages() {
  if (!canConvert.value) return;
  const runId = ++conversionRunId;
  clearResults();
  isConverting.value = true;
  addInfoMessage('开始转换图标...', 'info');

  const built = [];
  const raw = [];
  try {
    const decoded = [];
    if (scalingEnabled.value) addInfoMessage(`等比缩放：${qualityLabel}`, 'info');
    for (const source of sourceImages.value) {
      addInfoMessage(`正在读取: ${source.name}`, 'info');
      decoded.push(await decodeSourceImage(source));
    }
    if (runId !== conversionRunId) return;

    const formats = colorFormat.value === 'BOTH'
      ? ['ARGB8565', 'ARGB8888']
      : [colorFormat.value];

    let grandTotal = 0;
    for (const format of formats) {
      addInfoMessage(`正在生成 ${format} 数据...`, 'info');
      const infos = decoded.map((item) => ({
        name: item.name,
        fileName: item.fileName,
        width: item.width,
        height: item.height,
        data: markRaw(encodeIconBitmap(item.rgba, item.width, item.height, format))
      }));
      const total = infos.reduce((sum, info) => sum + info.data.length, 0);
      grandTotal += total;
      if (grandTotal > MAX_TOTAL_DATA_BYTES) {
        throw new Error('输出数据超过 64 MB 限制，请减少图片或分批转换');
      }

      const builtCode = buildIconCode(infos, { format, ...currentCodeOptions() });
      const previews = [];
      for (const info of infos) {
        const rgba = decodeIconBitmap(info.data, info.width, info.height, format);
        previews.push({
          name: info.name,
          width: info.width,
          height: info.height,
          byteLength: info.data.length,
          url: await createPreviewUrl(rgba, info.width, info.height)
        });
      }
      if (runId !== conversionRunId) {
        releaseResultPreviews([{ previews }]);
        return;
      }
      raw.push(markRaw({ format, infos }));
      built.push({
        format,
        code: builtCode.code,
        dataCode: builtCode.dataCode,
        totalBytes: builtCode.totalBytes,
        rowLength: builtCode.rowLength,
        previews
      });
    }

    rawResults = raw;
    results.value = built;
    activeResultIndex.value = 0;
    const sizeText = decoded.map((item) => item.width !== item.originalWidth || item.height !== item.originalHeight
      ? `${item.originalWidth}×${item.originalHeight}→${item.width}×${item.height}`
      : `${item.width}×${item.height}`).join('、');
    addInfoMessage(
      `转换成功：${decoded.length} 张图片 / ${formats.length} 种格式，输出尺寸（${sizeText}）${scalingEnabled.value ? ' · 已等比缩放' : ' · 保持原样'}`,
      'info'
    );
  } catch (error) {
    releaseResultPreviews(built);
    console.error('图标转换失败:', error);
    addInfoMessage(`转换失败: ${error.message || error}`, 'error');
  } finally {
    isConverting.value = false;
  }
}

async function copyText(text, label) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else if (!fallbackCopy(text)) {
      throw new Error('剪贴板不可用');
    }
    addInfoMessage(`${label}已复制到剪贴板（${text.length.toLocaleString()} 字符）`, 'info');
  } catch (error) {
    if (fallbackCopy(text)) {
      addInfoMessage(`${label}已复制到剪贴板`, 'info');
    } else {
      addInfoMessage(`复制失败: ${error.message || error}，可在代码框中手动全选复制`, 'error');
    }
  }
}

function fallbackCopy(text) {
  let created = null;
  let area = null;
  try {
    // 优先复用页面上已经渲染出来的代码框（复制全部代码时内容一致）
    const existing = document.querySelector('.code-area');
    if (existing && existing.value === text) {
      area = existing;
    } else {
      created = document.createElement('textarea');
      created.value = text;
      created.style.position = 'fixed';
      created.style.top = '0';
      created.style.left = '0';
      created.style.width = '1px';
      created.style.height = '1px';
      created.style.opacity = '0';
      document.body.appendChild(created);
      area = created;
    }
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch (error) {
    return false;
  } finally {
    if (created) created.remove();
  }
}

async function downloadCode() {
  const result = activeResult.value;
  if (!result) return;
  const baseName = toCIdentifier(arrayName.value, 'icons');
  const fileName = `${baseName}_${result.format.toLowerCase()}.c`;
  try {
    if (isTauri) {
      const path = await save({
        title: '保存 C 数组文件',
        defaultPath: fileName,
        filters: [{ name: 'C 源文件', extensions: ['c'] }]
      });
      if (!path) return;
      await writeTextFile(path, result.code);
      addInfoMessage(`文件已保存: ${path}`, 'info');
    } else {
      const url = URL.createObjectURL(new Blob([result.code], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      addInfoMessage(`已导出 ${fileName}`, 'info');
    }
  } catch (error) {
    console.error('保存文件失败:', error);
    addInfoMessage(`保存失败: ${error.message || error}`, 'error');
  }
}

onUnmounted(() => {
  conversionRunId++;
  for (const image of sourceImages.value) {
    if (image.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(image.previewUrl);
  }
  clearResults();
});
</script>

<style scoped>
.icon-page {
  padding: 0;
  max-width: 1920px;
  margin: 0 auto;
}

.converter-card,
.result-card,
.info-bar {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 14px rgba(0, 0, 0, 0.08);
  padding: 20px;
  margin-bottom: 16px;
}

.card-title {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 12px;
  border-bottom: 1px solid #eceef4;
  padding-bottom: 12px;
  margin-bottom: 16px;
}
.card-title h3 {
  font-size: 19px;
  color: #2b3245;
  font-weight: 600;
}
.card-title .en {
  font-size: 11px;
  letter-spacing: 1px;
  color: #5a86ff;
  margin-left: 6px;
  font-weight: 500;
}
.card-title .sub {
  font-size: 12.5px;
  color: #7a8194;
}

.form-section { margin-bottom: 16px; }
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.form-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #333;
  font-size: 14px;
}
.size-info {
  font-size: 12px;
  color: #7a8194;
  margin-left: 8px;
  font-weight: normal;
}
.clear-all-btn {
  background: transparent;
  border: 1px solid #ff4d4f;
  color: #ff4d4f;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
.clear-all-btn:hover { background: #ff4d4f; color: #fff; }

.drop-zone {
  display: flex;
  align-items: center;
  gap: 16px;
  border: 1px dashed #c9d3e8;
  border-radius: 10px;
  padding: 12px;
  transition: all 0.2s ease;
}
.drop-zone.dragging {
  border-color: #5a86ff;
  background: rgba(90, 134, 255, 0.08);
}
.drop-hint { font-size: 12.5px; color: #8a91a3; }
.hidden-file-input { display: none; }
.add-image-btn {
  padding: 10px 26px;
  background: #5a86ff;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}
.add-image-btn:hover { background: #4a76e9; }

.preview-container {
  border: 1px solid #e4e7f0;
  border-radius: 10px;
  padding: 12px;
  max-height: 320px;
  overflow-y: auto;
  background: #fafbfe;
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
.icon-card {
  border: 1px solid #e4e7f0;
  border-radius: 9px;
  overflow: hidden;
  background: #fff;
  display: flex;
  flex-direction: column;
}
.thumb-box {
  height: 130px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  overflow: hidden;
}
.thumb {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  image-rendering: auto;
}
.thumb.pixelated { image-rendering: pixelated; }
.bg-checker {
  background-color: #fff;
  background-image:
    linear-gradient(45deg, #d9dce5 25%, transparent 25%, transparent 75%, #d9dce5 75%),
    linear-gradient(45deg, #d9dce5 25%, transparent 25%, transparent 75%, #d9dce5 75%);
  background-size: 16px 16px;
  background-position: 0 0, 8px 8px;
}
.bg-light { background: #ffffff; }
.bg-dark { background: #1b1e28; }

.card-meta { padding: 8px 10px 10px; }
.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #7a8194;
  margin-top: 4px;
}
.meta-row.top { margin-top: 0; }
.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #3b4256;
  font-weight: 500;
}
.remove-btn {
  border: none;
  background: transparent;
  color: #ff4d4f;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.badge {
  background: rgba(90, 134, 255, 0.12);
  color: #4a76e9;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 11px;
}
.empty-hint {
  text-align: center;
  color: #9aa1b2;
  font-size: 13px;
  padding: 34px 0;
}

.settings-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 12px;
}
.settings-row.second-row {
  grid-template-columns: minmax(300px, 0.9fr) minmax(0, 2fr);
  align-items: stretch;
}
.setting-item { min-width: 0; }
.scale-box {
  border: 1px solid #e4e7f0;
  border-radius: 6px;
  padding: 10px 12px;
  background: #fafbfe;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.scale-box .form-label { margin-bottom: 0; }
.label-note {
  font-size: 11.5px;
  color: #9aa1b2;
  font-weight: normal;
  margin-left: 6px;
}
.scale-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.scale-caption { font-size: 12px; color: #6b7288; white-space: nowrap; }
.scale-number { width: 88px; flex: 0 0 88px; padding: 7px 8px; }
.scale-x { color: #9aa1b2; }
.scale-unit { font-size: 12px; color: #9aa1b2; }
.scale-hint {
  font-size: 11.5px;
  line-height: 1.5;
  color: #7a8194;
  word-break: break-all;
}
.scale-hint.hint-error { color: #e14b4b; font-weight: 500; }
.form-input,
.form-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #dcdfe8;
  border-radius: 6px;
  font-size: 13.5px;
  background: #fff;
  color: #333;
  box-sizing: border-box;
}
.form-input:focus,
.form-select:focus { outline: none; border-color: #5a86ff; }
.format-note {
  border: 1px solid #e4e7f0;
  border-radius: 6px;
  padding: 9px 12px;
  font-size: 12px;
  line-height: 1.7;
  color: #6b7288;
  background: #fafbfe;
}
.format-note b { color: #4a5062; }
.warn-line { color: #d48806; }

.form-actions { margin: 4px 0 18px; }
.convert-btn {
  width: 100%;
  padding: 12px;
  background: #5a86ff;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
}
.convert-btn:hover:not(:disabled) { background: #4a76e9; }
.convert-btn:disabled { background: #b9c4dd; cursor: not-allowed; }

.result-tabs { display: flex; gap: 8px; margin-bottom: 14px; }
.tab-btn {
  border: 1px solid #dcdfe8;
  background: #fff;
  color: #5c6478;
  border-radius: 6px;
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
}
.tab-btn.active {
  background: #5a86ff;
  border-color: #5a86ff;
  color: #fff;
}

.result-card { padding-bottom: 14px; }
.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}
.result-header h4 { font-size: 15px; color: #2b3245; }
.result-format {
  font-size: 11px;
  color: #5a86ff;
  border: 1px solid #cfdbff;
  border-radius: 4px;
  padding: 1px 6px;
  margin-left: 6px;
  font-weight: normal;
}
.result-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.action-btn {
  border: 1px solid #dcdfe8;
  background: #fff;
  color: #4a5062;
  padding: 6px 12px;
  border-radius: 5px;
  font-size: 12.5px;
  cursor: pointer;
}
.action-btn:hover { border-color: #5a86ff; color: #4a76e9; }
.action-btn.primary { background: #5a86ff; border-color: #5a86ff; color: #fff; }
.action-btn.primary:hover { background: #4a76e9; color: #fff; }

.code-area {
  width: 100%;
  height: 360px;
  resize: vertical;
  border: 1px solid #dcdfe8;
  border-radius: 8px;
  padding: 12px;
  background: #f7f8fc;
  color: #2f3546;
  font-family: Consolas, "Courier New", monospace !important;
  font-size: 12.5px;
  line-height: 1.55;
  white-space: pre;
  box-sizing: border-box;
}
.code-area:focus { outline: none; border-color: #5a86ff; }
.code-foot {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11.5px;
  color: #9aa1b2;
  margin-top: 8px;
}

.info-bar-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.info-bar h4 { font-size: 14px; color: #2b3245; }
.clear-log-btn {
  border: none;
  background: transparent;
  color: #8a91a3;
  font-size: 12px;
  cursor: pointer;
}
.clear-log-btn:hover { color: #ff4d4f; }
.info-messages {
  max-height: 150px;
  overflow-y: auto;
  border: 1px solid #e4e7f0;
  border-radius: 6px;
  padding: 8px 10px;
  background: #fafbfe;
}
.info-message {
  display: flex;
  gap: 10px;
  font-size: 12px;
  line-height: 1.7;
  color: #4a5062;
}
.info-message.error { color: #e14b4b; }
.msg-time { color: #9aa1b2; white-space: nowrap; }
.msg-content { white-space: pre-wrap; word-break: break-all; }
.empty-log { text-align: center; color: #9aa1b2; font-size: 12px; padding: 8px; }

@media (max-width: 1100px) {
  .settings-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .settings-row.second-row { grid-template-columns: 1fr; }
}

html.dark .converter-card,
html.dark .result-card,
html.dark .info-bar {
  background: #1a1d2b;
  box-shadow: 0 2px 14px rgba(0, 0, 0, 0.3);
}
html.dark .card-title { border-bottom-color: #2e3345; }
html.dark .card-title h3,
html.dark .result-header h4,
html.dark .info-bar h4 { color: #e8ebf5; }
html.dark .card-title .sub,
html.dark .drop-hint,
html.dark .size-info,
html.dark .meta-row,
html.dark .code-foot { color: #858ca3; }
html.dark .form-label { color: #d8dcec; }
html.dark .drop-zone { border-color: #3a4059; }
html.dark .drop-zone.dragging { background: rgba(102, 153, 255, 0.12); }
html.dark .preview-container,
html.dark .info-messages,
html.dark .format-note { background: #141722; border-color: #2e3345; }
html.dark .icon-card { background: #1c2030; border-color: #2e3345; }
html.dark .file-name { color: #d8dcec; }
html.dark .bg-checker {
  background-color: #2a2f3f;
  background-image:
    linear-gradient(45deg, #202433 25%, transparent 25%, transparent 75%, #202433 75%),
    linear-gradient(45deg, #202433 25%, transparent 25%, transparent 75%, #202433 75%);
}
html.dark .bg-light { background: #ffffff; }
html.dark .bg-dark { background: #0c0e15; }
html.dark .badge { background: rgba(102, 153, 255, 0.18); color: #92b4ff; }
html.dark .empty-hint,
html.dark .empty-log { color: #6b7288; }
html.dark .form-input,
html.dark .form-select,
html.dark .action-btn,
html.dark .tab-btn {
  background: #20243a;
  border-color: #343a52;
  color: #d8dcec;
}
html.dark .action-btn.primary,
html.dark .tab-btn.active { background: #5a86ff; border-color: #5a86ff; color: #fff; }
html.dark .format-note b { color: #d8dcec; }
html.dark .warn-line { color: #e8b339; }
html.dark .scale-box { background: #141722; border-color: #2e3345; }
html.dark .label-note,
html.dark .scale-unit,
html.dark .scale-x { color: #6b7288; }
html.dark .scale-caption,
html.dark .scale-hint { color: #858ca3; }
html.dark .scale-hint.hint-error { color: #ff8a8a; }
html.dark .code-area { background: #121521; border-color: #343a52; color: #c9d1e8; }
html.dark .info-message { color: #c2c8da; }
html.dark .info-message.error { color: #ff8a8a; }
html.dark .msg-time { color: #6b7288; }
</style>
