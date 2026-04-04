<template>
  <div class="page-container">
    <h2>字体转换</h2>
    
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

      <div class="form-section">
        <label class="form-label">自定义字符</label>
        <input 
          v-model="customChars" 
          type="text" 
          placeholder="输入要包含的字符"
          class="form-input"
        />
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
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { resolve, join } from '@tauri-apps/api/path';

const fontFileName = ref('');
const fontFilePath = ref('');
const fontSize = ref(24);
const bpp = ref(4);
const charRangeStart = ref('0x20');
const charRangeEnd = ref('0x7F');
const charRanges = ref([{ start: 0x20, end: 0x7F }]);
const customChars = ref('');
const outputDirName = ref('');
const outputDirPath = ref('');
const align = ref(1);
const compress = ref(false);
const isConverting = ref(false);

const showModal = ref(false);
const modalTitle = ref('');
const modalContent = ref('');
const modalType = ref('info');
const showCopyTip = ref(false);

const canConvert = computed(() => {
  return fontFilePath.value !== '' && charRanges.value.length > 0;
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
    }
  } catch (err) {
    console.error('选择文件夹失败：', err);
    showModal.value = true;
    modalTitle.value = '选择失败';
    modalContent.value = `选择文件夹失败: ${JSON.stringify(err)}`;
    modalType.value = 'error';
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
    let outputPath;
    if (outputDirPath.value) {
      const outputFileName = `font_${fontSize.value}px_bpp${bpp.value}.c`;
      outputPath = await join(outputDirPath.value, outputFileName);
    } else {
      // 使用默认输出路径
      const { appDir } = await import('@tauri-apps/api/path');
      const appDirPath = await appDir();
      const outputFileName = `font_${fontSize.value}px_bpp${bpp.value}.c`;
      outputPath = await join(appDirPath, outputFileName);
    }
    args.push('-o', outputPath);

    // 构建完整的命令字符串用于打印
    const commandStr = `${exePath} ${args.join(' ')}`;
    console.log("========================================");
    console.log("调用命令:");
    console.log(commandStr);
    console.log("========================================");

    const result = await invoke("run_shell_command", { cmd: exePath, args });

    console.log("转换成功:", result);
    modalTitle.value = '转换成功';
    modalContent.value = result;
    modalType.value = 'info';
    showModal.value = true;

  } catch (err) {
    console.error("转换失败:", err);
    modalTitle.value = '转换失败';
    modalContent.value = String(err);
    modalType.value = 'error';
    showModal.value = true;
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
</script>

<style scoped>
.page-container {
  padding: 30px;
  max-width: 800px;
  margin: 0 auto;
}

h2 {
  margin-bottom: 30px;
  color: #333;
}

.converter-form {
  background: white;
  padding: 30px;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.form-section {
  margin-bottom: 24px;
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
  padding: 10px 12px;
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
</style>