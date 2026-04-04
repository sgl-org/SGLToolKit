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
            <label class="setting-label">位深度</label>
            <select v-model.number="bpp" class="form-select setting-select">
              <option :value="1">1位</option>
              <option :value="2">2位</option>
              <option :value="4">4位</option>
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
            <div class="setting-checkbox-box">
              <input v-model="compress" type="checkbox" />
              <span>压缩</span>
            </div>
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="range-fontname-row">
          <div class="range-section">
            <label class="form-label">字符范围</label>
            <div class="range-inputs">
              <input 
                v-model="charRangeStart" 
                type="text" 
                placeholder="0x20"
                class="form-input small"
              />
              <span>-</span>
              <input 
                v-model="charRangeEnd" 
                type="text" 
                placeholder="0x7F"
                class="form-input small"
              />
              <button class="add-range-btn" @click="addCharRange">添加</button>
            </div>
            <div class="range-tags">
              <span 
                v-for="(range, index) in charRanges" 
                :key="index"
                class="range-tag"
              >
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

      <div class="form-section">
        <label class="form-label">图标字体文件</label>
        <div class="file-input-wrapper">
          <input 
            v-model="iconFontFilePath" 
            type="text" 
            placeholder="选择图标字体文件路径"
            class="form-input path-input"
            readonly
          />
          <button class="file-select-btn" @click="selectIconFontFile">浏览</button>
        </div>
      </div>

      <div class="form-section" v-if="iconFontFilePath">
        <label class="form-label">图标预览</label>
        <div class="icon-preview-container">
          <div 
            v-for="(icon, index) in iconList" 
            :key="index"
            class="icon-item"
            @click="toggleIconSelection(icon)"
            :class="{ selected: selectedIcons.includes(icon) }"
          >
            <div class="icon-char">{{ icon.char }}</div>
            <div class="icon-code">U+{{ icon.code > 0xFFFF ? icon.code.toString(16).toUpperCase().padStart(6, '0') : icon.code.toString(16).toUpperCase().padStart(4, '0') }}</div>
          </div>
          <div v-if="iconList.length === 0" class="no-icons">暂无图标</div>
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

    <div v-if="showModal" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>{{ modalTitle }}</h3>
          <button class="close-btn" @click="closeModal">×</button>
        </div>
        <div class="modal-body">
          <pre class="result-text">{{ modalContent }}</pre>
        </div>
        <div class="modal-footer">
          <button v-if="modalType === 'error'" class="copy-btn" @click="copyError">复制错误信息</button>
          <button class="confirm-btn" @click="closeModal">确定</button>
        </div>
      </div>
    </div>

    <div v-if="showCopyTip" class="copy-tip">复制成功！</div>

    <!-- 信息输出栏 -->
    <div class="info-bar" :class="{ 'info-success': hasSuccessMessage, 'info-error': hasErrorMessage }">
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
import { ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { resolve, join } from '@tauri-apps/api/path';
import { nextTick } from 'vue';

const fontFileName = ref('');
const fontFilePath = ref(localStorage.getItem('lastFontFilePath') || '');
const fontName = ref('sgl_font');
const fontSize = ref(24);
const bpp = ref(4);
const charRangeStart = ref('0x20');
const infoMessages = ref([]);
const charRangeEnd = ref('0x7F');
const charRanges = ref([{ start: 0x20, end: 0x7F }]);
const customChars = ref('');
const outputDirName = ref('');
const outputDirPath = ref(localStorage.getItem('lastOutputDirPath') || '');
const iconFontFilePath = ref('');
const iconList = ref([]);
const selectedIcons = ref([]);
const iconFontUrl = ref('');
const align = ref(1);
const compress = ref(false);
const isConverting = ref(false);
const infoMessagesRef = ref(null);

const showModal = ref(false);
const modalTitle = ref('');
const modalContent = ref('');
const modalType = ref('info');
const showCopyTip = ref(false);

const canConvert = computed(() => {
  return fontFilePath.value && outputDirPath.value && (charRanges.value.length > 0 || customChars.value.trim() !== '');
});

const hasSuccessMessage = computed(() => {
  return infoMessages.value.some(msg => msg.type === 'info');
});

const hasErrorMessage = computed(() => {
  return infoMessages.value.some(msg => msg.type === 'error');
});

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
      localStorage.setItem('lastFontFilePath', selected);
    }
  } catch (err) {
    console.error('选择字体文件失败：', err);
    showModal.value = true;
    modalTitle.value = '选择失败';
    modalContent.value = `选择字体文件失败: ${JSON.stringify(err)}`;
    modalType.value = 'error';
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
    showModal.value = true;
    modalTitle.value = '选择失败';
    modalContent.value = `选择文件夹失败: ${JSON.stringify(err)}`;
    modalType.value = 'error';
  }
}

async function selectIconFontFile() {
  try {
    const selected = await open({
      directory: false,
      multiple: false,
      title: '选择图标字体文件',
      filters: [
        { name: '字体文件', extensions: ['ttf', 'otf', 'woff', 'woff2'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    
    if (selected) {
      iconFontFilePath.value = selected;
      await parseIconFont(selected);
    }
  } catch (err) {
    console.error('选择图标字体文件失败：', err);
    showModal.value = true;
    modalTitle.value = '选择失败';
    modalContent.value = `选择图标字体文件失败: ${JSON.stringify(err)}`;
    modalType.value = 'error';
  }
}

async function parseIconFont(filePath) {
  try {
    console.log('开始解析图标字体:', filePath);
    
    const opentype = await import('opentype.js');
    const base64Data = await invoke('read_file_as_base64', { path: filePath });
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const arrayBuffer = bytes.buffer;
    console.log('ArrayBuffer 创建成功，大小:', arrayBuffer.byteLength);
    
    const font = opentype.parse(arrayBuffer);
    console.log('字体解析成功，字体名称:', font.names.fontFamily);
    console.log('字体表数量:', font.tables ? Object.keys(font.tables).length : 0);
    
    // 移除旧的字体样式
    const oldStyle = document.getElementById('icon-font-style');
    if (oldStyle) {
      oldStyle.remove();
    }
    if (iconFontUrl.value) {
      URL.revokeObjectURL(iconFontUrl.value);
    }
    
    // 创建字体 URL 用于显示
    const fontBlob = new Blob([bytes], { type: 'font/ttf' });
    const fontUrl = URL.createObjectURL(fontBlob);
    iconFontUrl.value = fontUrl;
    
    // 动态创建 @font-face 样式
    const fontFaceStyle = document.createElement('style');
    fontFaceStyle.id = 'icon-font-style';
    fontFaceStyle.textContent = `
      @font-face {
        font-family: 'IconFont';
        src: url('${fontUrl}') format('truetype');
        font-weight: normal;
        font-style: normal;
        font-display: swap;
      }
      .icon-char {
        font-family: 'IconFont', 'Font Awesome 6 Free', 'Font Awesome 5 Free', 'FontAwesome', sans-serif !important;
      }
    `;
    document.head.appendChild(fontFaceStyle);
    
    // 等待字体加载
    await document.fonts.load('16px IconFont');
    console.log('字体加载完成');
    
    const icons = [];
    const glyphNames = Object.keys(font.glyphs.glyphs);
    console.log('字形数量:', glyphNames.length);
    
    glyphNames.forEach(name => {
      const glyph = font.glyphs.glyphs[name];
      if (glyph && glyph.unicode !== undefined && glyph.unicode !== null) {
        const unicode = glyph.unicode;
        // Font Awesome 图标通常在私用区 (Private Use Area)
        // 基本多文种平面 (BMP): U+E000-U+F8FF
        // 第一辅助平面: U+F0000-U+FFFFD (Font Awesome 6+)
        // 第二辅助平面: U+100000-U+10FFFD
        // Font Awesome 7/8 常用范围
        if ((unicode >= 0xE000 && unicode <= 0xF8FF) || 
            (unicode >= 0xF000 && unicode <= 0xF2FF) ||
            (unicode >= 0xF400 && unicode <= 0xF4FF) ||
            (unicode >= 0x2000 && unicode <= 0x2BFF) ||
            (unicode >= 0x1F000 && unicode <= 0x1FFFF) ||  // 第一辅助平面
            (unicode >= 0xF0000 && unicode <= 0xFFFFD) ||   // 私用区补充 A
            (unicode >= 0x100000 && unicode <= 0x10FFFD)) { // 私用区补充 B
          icons.push({
            code: unicode,
            char: String.fromCodePoint(unicode),
            name: name
          });
        }
      }
    });
    
    // 如果没有找到图标，尝试包含所有非零 unicode 的字形
    if (icons.length === 0) {
      console.log('在标准范围内未找到图标，尝试包含所有字形...');
      glyphNames.forEach(name => {
        const glyph = font.glyphs.glyphs[name];
        if (glyph && glyph.unicode !== undefined && glyph.unicode !== null && glyph.unicode > 0) {
          icons.push({
            code: glyph.unicode,
            char: glyph.unicode > 0xFFFF ? String.fromCodePoint(glyph.unicode) : String.fromCharCode(glyph.unicode),
            name: name
          });
        }
      });
    }
    
    icons.sort((a, b) => a.code - b.code);
    console.log('找到图标数量:', icons.length);
    
    // 显示前10个图标的详细信息用于调试
    if (icons.length > 0) {
      console.log('前10个图标:', icons.slice(0, 10));
    }
    
    iconList.value = icons;
    selectedIcons.value = [];
  } catch (err) {
    console.error('解析图标字体失败：', err);
    console.error('错误详情:', err.message, err.stack);
    iconList.value = [];
    selectedIcons.value = [];
  }
}

function toggleIconSelection(icon) {
  const index = selectedIcons.value.findIndex(i => i.code === icon.code);
  if (index > -1) {
    selectedIcons.value.splice(index, 1);
  } else {
    selectedIcons.value.push(icon);
  }
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
  const start = parseHexValue(charRangeStart.value);
  const end = parseHexValue(charRangeEnd.value);

  if (isNaN(start) || isNaN(end)) {
    showModal.value = true;
    modalTitle.value = '输入错误';
    modalContent.value = '请输入有效的字符范围';
    modalType.value = 'error';
    return;
  }

  if (start > end) {
    showModal.value = true;
    modalTitle.value = '输入错误';
    modalContent.value = '起始字符不能大于结束字符';
    modalType.value = 'error';
    return;
  }

  charRanges.value.push({ start, end });
  charRangeStart.value = '';
  charRangeEnd.value = '';
}

function removeCharRange(index) {
  charRanges.value.splice(index, 1);
}

async function convertFont() {
  if (!canConvert.value || isConverting.value) return;

  isConverting.value = true;

  try {
    const exePath = '../src/sgl_font_conv/sgl_font_conv.exe';

    const args = [
      '--font', fontFilePath.value,
      '--size', fontSize.value.toString(),
      '--bpp', bpp.value.toString(),
      '--format', 'sgl',
      '--align', align.value.toString()
    ];

    for (const range of charRanges.value) {
      args.push('-r', `0x${range.start.toString(16)}-0x${range.end.toString(16)}`);
    }

    if (customChars.value) {
      args.push('--symbols', customChars.value);
    }

    if (compress.value) {
      args.push('--compress');
    }

    // 设置输出路径（必需）
    let outputFullPath;
    if (outputDirPath.value) {
      const outputFileName = fontName.value ? `${fontName.value}.c` : `font_${fontSize.value}px_bpp${bpp.value}.c`;
      outputFullPath = await join(outputDirPath.value, outputFileName);
    } else {
      // 使用默认输出路径
      const { appDir } = await import('@tauri-apps/api/path');
      const appDirPath = await appDir();
      const outputFileName = fontName.value ? `${fontName.value}.c` : `font_${fontSize.value}px_bpp${bpp.value}.c`;
      outputFullPath = await join(appDirPath, outputFileName);
    }
    args.push('--output', outputFullPath);

    // 构建完整的命令字符串用于打印
    const commandStr = `${exePath} ${args.join(' ')}`;
    console.log("========================================");
    console.log("调用命令:");
    console.log(commandStr);
    console.log("========================================");

    const result = await invoke("run_shell_command", { cmd: exePath, args });

    console.log("转换成功:", result);
    addInfoMessage(`转换成功！\n${result}`, 'info');

  } catch (err) {
    console.error("转换失败:", err);
    addInfoMessage(`转换失败：\n${String(err)}`, 'error');
  } finally {
    isConverting.value = false;
  }
}

function closeModal() {
  showModal.value = false;
  modalTitle.value = '';
  modalContent.value = '';
  modalType.value = 'info';
}

async function copyError() {
  try {
    await navigator.clipboard.writeText(modalContent.value);
    showCopyTip.value = true;
    setTimeout(() => showCopyTip.value = false, 1000);
  } catch (err) {
    console.error('复制失败：', err);
  }
}

async function copyMessageContent(content) {
  try {
    await navigator.clipboard.writeText(content);
    showCopyTip.value = true;
    setTimeout(() => showCopyTip.value = false, 1000);
  } catch (err) {
    console.error('复制失败：', err);
  }
}

function addInfoMessage(content, type = 'info') {
  const time = new Date().toLocaleString('zh-CN');
  infoMessages.value.push({ time, content, type });
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
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  height: 40px;
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
  gap: 8px;
  margin-bottom: 12px;
}

.range-inputs span {
  color: #666;
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
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  background: #fafafa;
  transition: all 0.3s ease;
}

.info-bar.info-success {
  border-color: #52c41a;
  background: #f6ffed;
}

.info-bar.info-error {
  border-color: #ff4d4f;
  background: #fff1f0;
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
  color: #ff4d4f;
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
  border: 1px solid #ff4d4f;
  color: #ff4d4f;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 2px;
}

.copy-msg-btn:hover {
  background: #ff4d4f;
  color: white;
}

/* 图标预览样式 */
.icon-preview-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  gap: 6px;
  max-height: calc(4 * (50px + 6px) + 16px);
  overflow-y: auto;
  padding: 8px;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  background: #fafafa;
}

.icon-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 6px 4px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  transition: all 0.2s ease;
  height: 50px;
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

html.dark .info-bar {
  background: #1a1d2b;
  border-color: #3a3f55;
}

html.dark .info-bar h4 {
  color: #e0e0e0;
}

html.dark .info-bar.info-success {
  border-color: #52c41a;
  background: #1a2e1a;
}

html.dark .info-bar.info-error {
  border-color: #ff4d4f;
  background: #2e1a1a;
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
  border-color: #ff4d4f;
  color: #e0e0e0;
}

html.dark .msg-time {
  color: #999;
}

html.dark .msg-content {
  color: #e0e0e0;
}

html.dark .icon-preview-container {
  background: #1a1d2b;
  border-color: #3a3f55;
}

html.dark .icon-item {
  background: #252a3a;
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
</style>