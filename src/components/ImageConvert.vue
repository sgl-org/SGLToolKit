<template>
  <div class="page-container">
    <div class="converter-form">
      
      <!-- 图片文件输入栏 -->
      <div class="form-section">
        <label class="form-label">图片文件</label>
        <div class="file-input-wrapper">
          <input 
            v-model="imageFilePath" 
            type="text" 
            placeholder="选择图片文件路径"
            class="form-input path-input"
            readonly
          />
          <button class="file-select-btn" @click="selectImageFile">浏览</button>
        </div>
      </div>

      <!-- 图片预览框 -->
      <div class="form-section">
        <label class="form-label">图片预览</label>
        <div class="image-preview-container">
          <div v-if="imagePreviewUrl" class="preview-wrapper">
            <img :src="imagePreviewUrl" class="preview-image" alt="预览图片">
          </div>
          <div v-else class="preview-placeholder">
            <span>请点击浏览，选择图片文件</span>
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
const imageFilePath = ref('');
const imagePreviewUrl = ref('');
const colorFormat = ref('RGB888');
const outputFormat = ref('c');
const compression = ref('none');
const isConverting = ref(false);
const infoMessages = ref([]);
const infoMessagesRef = ref(null);
const showCopyTip = ref(false);

// 计算属性
const canConvert = computed(() => {
  return imageFilePath.value !== '';
});

// 选择图片文件
async function selectImageFile() {
  try {
    const selected = await open({
      directory: false,
      multiple: false,
      title: '选择图片文件',
      filters: [
        { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'bmp'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    
    if (selected) {
      imageFilePath.value = selected;
      addInfoMessage(`已选择图片文件: ${selected}`, 'info');
      
      // 生成预览URL
      try {
        // 使用后端的read_file_as_base64函数来读取文件
        const base64Data = await invoke('read_file_as_base64', { path: selected });
        
        // 将base64数据转换为Blob
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'image/*' });
        const url = URL.createObjectURL(blob);
        imagePreviewUrl.value = url;
      } catch (previewErr) {
        console.error('生成预览失败：', previewErr);
        addInfoMessage(`生成预览失败: ${previewErr.message || JSON.stringify(previewErr)}`, 'error');
      }
    }
  } catch (err) {
    console.error('选择图片文件失败：', err);
    addInfoMessage(`选择图片文件失败: ${JSON.stringify(err)}`, 'error');
  }
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
  height: 200px;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow: hidden;
  background: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
}

.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.preview-placeholder {
  color: #999;
  font-size: 14px;
  text-align: center;
  width: 100%;
  height: 100%;
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
  align-items: flex-start;
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

html.dark .preview-wrapper {
  background: #1a1d2b;
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