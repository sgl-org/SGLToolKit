<template>
  <div class="page-container">
    <div class="converter-form">
      
      <!-- 图片文件输入栏 -->
      <div class="form-section">
        <button class="add-image-btn" @click="selectImageFile">添加图片</button>
      </div>

      <!-- 图片预览框 -->
      <div class="form-section">
        <label class="form-label">图片预览</label>
        <div class="image-preview-container">
          <div v-if="imageFiles.length > 0" class="preview-grid">
            <div 
              v-for="(image, index) in imageFiles" 
              :key="index"
              class="preview-item"
            >
              <img :src="image.previewUrl" class="preview-image" alt="预览图片">
              <div class="preview-info">
                <span class="preview-name">{{ image.name }}</span>
                <button class="remove-image-btn" @click="removeImage(index)" title="删除">×</button>
              </div>
            </div>
          </div>
          <div v-else class="preview-placeholder">
            <span>请点击添加图片按钮，选择图片文件</span>
          </div>
        </div>
      </div>

      <!-- 格式设置 -->
      <div class="form-section">
        <div class="settings-row">
          <div class="setting-item">
            <label class="form-label">颜色格式</label>
            <select v-model="colorFormat" class="form-select">
              <option value="RGB888">RGB888</option>
              <option value="RGB565">RGB565</option>
              <option value="RGB232">RGB232</option>
              <option value="ARGB888">ARGB888</option>
              <option value="ARGB444">ARGB444</option>
              <option value="ARGB222">ARGB222</option>
            </select>
          </div>
          <div class="setting-item">
            <label class="form-label">输出格式</label>
            <select v-model="outputFormat" class="form-select">
              <option value="c">c文件</option>
              <option value="bin">bin文件</option>
            </select>
          </div>
          <div class="setting-item">
            <label class="form-label">压缩算法</label>
            <select v-model="compression" class="form-select">
              <option value="none">无压缩</option>
              <option value="rle">RLE压缩</option>
            </select>
          </div>
          <div class="setting-item">
            <label class="form-label">透明填充</label>
            <div class="transparent-fill-container">
              <input v-model="enableTransparentFill" type="checkbox" class="transparent-fill-checkbox">
              <div class="color-input-group">
                <input v-model="transparentFillColor" type="text" class="color-input" placeholder="#000000">
                <input v-model="transparentFillColor" type="color" class="color-picker">
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 附加设置 -->
      <div class="form-section">
        <div class="settings-row">
          <div class="setting-item">
            <label class="form-label">数组名</label>
            <input v-model="arrayName" type="text" class="form-input" placeholder="输入数组名">
          </div>
          <div class="setting-item">
            <label class="form-label">输出文件名</label>
            <input v-model="outputFileName" type="text" class="form-input" placeholder="输入输出文件名">
          </div>
          <div class="setting-item">
            <label class="form-label">BIN格式起始地址(hex)</label>
            <input v-model="binStartAddress" type="text" class="form-input" placeholder="0x0000">
          </div>
          <div class="setting-item">
            <label class="form-label">杂项</label>
            <div class="misc-container">
              <div class="misc-item">
                <input v-model="combineAsArray" type="checkbox" class="form-checkbox">
                <span>组合为数组</span>
              </div>
              <div class="misc-item">
                <input v-model="swapBytes" type="checkbox" class="form-checkbox">
                <span>交换字节</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 转换按钮 -->
      <div class="form-actions">
        <button 
          class="convert-btn" 
          @click="convertImage" 
          :disabled="!canConvert || isConverting"
        >
          {{ isConverting ? '转换中...' : '开始转换' }}
        </button>
      </div>
    </div>

    <!-- LOG信息栏 -->
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
import { ref, computed, nextTick } from 'vue';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

// 响应式数据
const imageFiles = ref([]);
const colorFormat = ref('RGB888');
const outputFormat = ref('c');
const compression = ref('none');
const enableTransparentFill = ref(false);
const transparentFillColor = ref('#000000');
const arrayName = ref('');
const outputFileName = ref('');
const binStartAddress = ref('0x0000');
const combineAsArray = ref(false);
const swapBytes = ref(false);
const isConverting = ref(false);
const infoMessages = ref([]);
const infoMessagesRef = ref(null);
const showCopyTip = ref(false);

// 计算属性
const canConvert = computed(() => {
  return imageFiles.value.length > 0;
});

// 选择图片文件
async function selectImageFile() {
  try {
    const selected = await open({
      directory: false,
      multiple: true,
      title: '选择图片文件',
      filters: [
        { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'bmp'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    
    if (selected) {
      const files = Array.isArray(selected) ? selected : [selected];
      
      for (const filePath of files) {
        addInfoMessage(`已选择图片文件: ${filePath}`, 'info');
        
        try {
          const base64Data = await invoke('read_file_as_base64', { path: filePath });
          
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'image/*' });
          const url = URL.createObjectURL(blob);
          
          imageFiles.value.push({
            path: filePath,
            previewUrl: url,
            name: filePath.split(/[/\\]/).pop() || '未命名'
          });
        } catch (previewErr) {
          console.error('生成预览失败：', previewErr);
          addInfoMessage(`生成预览失败: ${previewErr.message || JSON.stringify(previewErr)}`, 'error');
        }
      }
    }
  } catch (err) {
    console.error('选择图片文件失败：', err);
    addInfoMessage(`选择图片文件失败: ${JSON.stringify(err)}`, 'error');
  }
}

// 删除图片
function removeImage(index) {
  if (imageFiles.value[index] && imageFiles.value[index].previewUrl) {
    URL.revokeObjectURL(imageFiles.value[index].previewUrl);
  }
  imageFiles.value.splice(index, 1);
}

// 转换图片
async function convertImage() {
  if (!canConvert.value || isConverting.value) return;

  isConverting.value = true;

  try {
    // 这里添加转换逻辑
    addInfoMessage('开始转换图片...', 'info');
    
    // 模拟转换过程
    setTimeout(() => {
      addInfoMessage('转换成功！', 'info');
      isConverting.value = false;
    }, 2000);

  } catch (err) {
    console.error('转换失败:', err);
    addInfoMessage(`转换失败：${String(err)}`, 'error');
    isConverting.value = false;
  }
}

// 复制消息内容
async function copyMessageContent(content) {
  try {
    await navigator.clipboard.writeText(content);
    showCopyTip.value = true;
    setTimeout(() => showCopyTip.value = false, 1000);
  } catch (err) {
    console.error('复制失败：', err);
  }
}

// 添加信息消息
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

.add-image-btn {
  width: 100%;
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

.add-image-btn:hover {
  background: #4a76e9;
}

.form-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #5a86ff;
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

/* 图片预览样式 */
.image-preview-container {
  width: 100%;
  min-height: 200px;
  max-height: 400px;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow-y: auto;
  background: #f5f5f5;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  padding: 12px;
}

.preview-item {
  display: flex;
  flex-direction: column;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  overflow: hidden;
}

.preview-item .preview-image {
  width: 100%;
  height: 120px;
  object-fit: contain;
  background: #fafafa;
}

.preview-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: #f5f5f5;
  border-top: 1px solid #ddd;
}

.preview-name {
  font-size: 12px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.remove-image-btn {
  background: transparent;
  border: none;
  color: #ff4d4f;
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.remove-image-btn:hover {
  color: #ff7875;
}

.preview-placeholder {
  color: #999;
  font-size: 14px;
  text-align: center;
  width: 100%;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-image: linear-gradient(45deg, #f0f0f0 25%, transparent 25%),
                    linear-gradient(-45deg, #f0f0f0 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, #f0f0f0 75%),
                    linear-gradient(-45deg, transparent 75%, #f0f0f0 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}

/* 设置行样式 */
.settings-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.setting-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.form-select:focus {
  outline: none;
  border-color: #5a86ff;
}

/* 透明填充样式 */
.transparent-fill-container {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  box-sizing: border-box;
  height: 36px;
}

.transparent-fill-checkbox {
  margin: 0;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.color-input-group {
  flex: 1;
  display: flex;
  gap: 4px;
  align-items: center;
}

.color-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  box-sizing: border-box;
  transition: border-color 0.2s;
  height: 26px;
}

.color-input:focus {
  outline: none;
  border-color: #5a86ff;
}

.color-picker {
  width: 32px;
  height: 26px;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
}

/* 复选框容器样式 */
.checkbox-container {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  box-sizing: border-box;
  height: 36px;
}

.form-checkbox {
  margin: 0;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

/* 杂项容器样式 */
.misc-container {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  box-sizing: border-box;
  height: 36px;
  width: 100%;
}

.misc-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.misc-item span {
  font-size: 14px;
  color: #333;
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

html.dark .add-image-btn {
  background: #6699ff;
  color: white;
}

html.dark .add-image-btn:hover {
  background: #5588ee;
}

html.dark .form-input {
  background: #252a3a;
  border-color: #3a3f55;
  color: #e0e0e0;
}

html.dark .form-input:focus {
  border-color: #6699ff;
  background: #2f354a;
}

html.dark .file-select-btn {
  background: #6699ff;
  color: white;
}

html.dark .file-select-btn:hover {
  background: #5588ee;
}

/* 图片预览深色主题 */
html.dark .image-preview-container {
  border-color: #3a3f55;
  background: #252a3a;
}

html.dark .preview-item {
  border-color: #3a3f55;
  background: #1a1d2b;
}

html.dark .preview-item .preview-image {
  background: #252a3a;
}

html.dark .preview-info {
  background: #252a3a;
  border-top-color: #3a3f55;
}

html.dark .preview-name {
  color: #e0e0e0;
}

html.dark .preview-placeholder {
  color: #666;
  background-image: linear-gradient(45deg, #333 25%, transparent 25%),
                    linear-gradient(-45deg, #333 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, #333 75%),
                    linear-gradient(-45deg, transparent 75%, #333 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}

/* 深色主题下拉框样式 */
html.dark .form-select {
  background: #252a3a;
  border-color: #3a3f55;
  color: #e0e0e0;
}

html.dark .form-select:focus {
  border-color: #6699ff;
  background: #2f354a;
}

/* 深色主题透明填充样式 */
html.dark .transparent-fill-container {
  background: #252a3a;
  border-color: #3a3f55;
}

html.dark .color-input {
  background: #1a1d2b;
  border-color: #3a3f55;
  color: #e0e0e0;
}

html.dark .color-input:focus {
  border-color: #6699ff;
  background: #2f354a;
}

html.dark .color-picker {
  border-color: #3a3f55;
}

html.dark .transparent-fill-checkbox {
  accent-color: #6699ff;
}

/* 深色主题复选框容器样式 */
html.dark .checkbox-container {
  background: #252a3a;
  border-color: #3a3f55;
}

html.dark .form-checkbox {
  accent-color: #6699ff;
}

/* 深色主题杂项容器样式 */
html.dark .misc-container {
  background: #252a3a;
  border-color: #3a3f55;
}

html.dark .misc-item span {
  color: #e0e0e0;
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

html.dark .empty-log {
  color: #666;
}
</style>