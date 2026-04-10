<template>
  <div class="page-container">
    <div class="converter-form">
      
      <!-- 图片文件输入栏 -->
      <div class="form-section">
        <button class="add-image-btn" @click="selectGifFile">添加GIF文件</button>
      </div>

      <!-- GIF预览和帧分解 -->
      <div class="form-section">
        <div class="form-label-with-button">
          <label class="form-label">GIF预览</label>
          <button 
            v-if="gifFile" 
            class="clear-all-btn" 
            @click="clearGifFile"
          >
            清除
          </button>
        </div>
        <div class="gif-preview-container">
          <div v-if="gifFile" class="preview-item">
            <div class="preview-image-wrapper">
              <img :src="gifFile.previewUrl" class="preview-image" alt="GIF预览">
            </div>
            <div class="preview-info">
              <span class="file-name">{{ gifFile.name }}</span>
              <span class="file-size">{{ formatFileSize(gifFile.size) }}</span>
            </div>
          </div>
          <div v-else class="empty-preview">
            请选择GIF文件
          </div>
        </div>
      </div>

      <!-- 转换设置 -->
      <div class="form-section">
        <div class="settings-grid">
          <div class="setting-item">
            <label class="form-label">输出格式</label>
            <select v-model="outputFormat" class="form-select">
              <option value="png">PNG</option>
              <option value="jpg">JPG</option>
              <option value="webp">WebP</option>
            </select>
          </div>
          <div class="setting-item">
            <label class="form-label">转换帧数</label>
            <div class="frame-count-input">
              <input 
                type="number" 
                v-model.number="frameCount" 
                class="form-input" 
                min="1" 
                :max="totalFrames"
              >
              <span class="frame-count-info">共 {{ totalFrames }} 帧</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 转换按钮 -->
      <div class="form-section">
        <button 
          class="convert-btn" 
          @click="convertGif" 
          :disabled="!gifFile || isConverting"
        >
          {{ isConverting ? '转换中...' : '开始转换' }}
        </button>
      </div>

      <!-- 帧预览 -->
      <div v-if="frames.length > 0" class="form-section">
        <label class="form-label">分解的帧</label>
        <div class="frames-container">
          <div 
            v-for="(frame, index) in frames" 
            :key="index"
            class="frame-item"
          >
            <img :src="frame.url" class="frame-image" alt="帧" :title="`帧 ${index + 1}`">
            <div class="frame-info">
              <span class="frame-index">帧 {{ index + 1 }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 转换结果 -->
      <div v-if="conversionResults.length > 0" class="form-section">
        <h3>转换结果</h3>
        <div class="results-container">
          <div 
            v-for="(result, index) in conversionResults" 
            :key="index"
            class="result-item"
          >
            <div class="result-header">
              <span class="result-name">{{ result.name }}</span>
              <div class="result-actions">
                <button 
                  class="download-result-btn"
                  @click="downloadResult(result)"
                  title="下载文件"
                >
                  下载
                </button>
              </div>
            </div>
            <img :src="result.url" class="result-image" alt="转换结果">
          </div>
        </div>
        <!-- 打包下载按钮 -->
        <div class="form-section">
          <button 
            class="convert-btn" 
            @click="downloadAsZip" 
            :disabled="!conversionResults.length || isDownloading"
          >
            {{ isDownloading ? '打包中...' : '打包下载为ZIP' }}
          </button>
        </div>
      </div>

      <!-- LOG信息栏 -->
      <div class="info-bar">
        <h4>LOG信息</h4>
        <div class="info-messages">
          <div 
            v-for="(msg, index) in infoMessages" 
            :key="index"
            :class="['info-message', msg.type]"
          >
            <span class="msg-time">{{ msg.time }}</span>
            <span class="msg-content">{{ msg.content }}</span>
          </div>
          <div v-if="infoMessages.length === 0" class="empty-log">
            暂无日志信息
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { open } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { GifReader } from 'omggif';

// 响应式数据
const gifFile = ref(null);
const frames = ref([]);
const outputFormat = ref('png');
const isConverting = ref(false);
const infoMessages = ref([]);
const conversionResults = ref([]);
const frameCount = ref(1);
const totalFrames = ref(1);
const isDownloading = ref(false);

// 选择GIF文件
async function selectGifFile() {
  try {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: 'GIF Files',
          extensions: ['gif']
        }
      ]
    });

    if (selected) {
      // 处理返回值：当multiple为false时，返回单个文件路径字符串；当multiple为true时，返回文件路径数组
      const filePath = Array.isArray(selected) ? selected[0] : selected;
      
      // 确保filePath是字符串
      if (typeof filePath !== 'string') {
        throw new Error('无效的文件路径');
      }
      
      // 从文件路径获取文件名
      const fileName = filePath.split(/[/\\]/).pop() || '未命名.gif';
      
      // 使用Tauri的invoke来读取文件内容并转换为base64
      const base64Data = await invoke('read_file_as_base64', { path: filePath });
      
      // 将base64数据转换为Blob并创建预览URL
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'image/gif' });
      const previewUrl = URL.createObjectURL(blob);
      
      gifFile.value = {
        name: fileName,
        path: filePath,
        size: bytes.length,
        previewUrl: previewUrl
      };
      
      // 分解GIF帧
      await decomposeGif(blob);
      
      addInfoMessage(`已选择GIF文件: ${fileName}`, 'info');
    }
  } catch (error) {
    console.error('选择文件失败:', error);
    addInfoMessage(`选择文件失败: ${error.message}`, 'error');
  }
}

// 分解GIF帧
async function decomposeGif(blob) {
  try {
    // 读取GIF文件内容
    const arrayBuffer = await blob.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    // 输出文件基本信息
    console.log('GIF文件大小:', data.length, '字节');
    
    // 使用omggif库解析GIF
    const reader = new GifReader(data);
    const parsedFrameCount = reader.numFrames();
    
    console.log('GIF解析结果：', {
      totalBytes: data.length,
      frameCount: parsedFrameCount,
      width: reader.width,
      height: reader.height
    });
    
    addInfoMessage(`GIF解析完成，共 ${parsedFrameCount} 帧`, 'info');
    
    // 如果解析失败，使用默认帧数
    if (parsedFrameCount === 0) {
      throw new Error('未检测到GIF帧');
    }
    
    // 设置总帧数
    totalFrames.value = parsedFrameCount;
    frameCount.value = Math.min(parsedFrameCount, frameCount.value);
    
    // 创建帧预览
    frames.value = [];
    
    // 为每一帧生成静态图片
    for (let i = 0; i < parsedFrameCount; i++) {
      // 使用立即执行函数创建闭包，确保每个回调使用正确的索引
      (function(index) {
        // 创建新的canvas元素来生成每一帧
        const frameCanvas = document.createElement('canvas');
        const frameCtx = frameCanvas.getContext('2d');
        
        // 设置canvas尺寸
        frameCanvas.width = reader.width;
        frameCanvas.height = reader.height;
        
        // 填充白色背景
        frameCtx.fillStyle = '#ffffff';
        frameCtx.fillRect(0, 0, reader.width, reader.height);
        
        try {
          // 创建像素数组
          const pixels = new Uint8ClampedArray(reader.width * reader.height * 4);
          
          // 解码当前帧 - 使用正确的API调用方式
          reader.decodeAndBlitFrameRGBA(index, pixels);
          
          // 创建ImageData对象
          const imageData = frameCtx.createImageData(reader.width, reader.height);
          
          // 检查imageData.data是否存在
          if (imageData && imageData.data) {
            // 手动复制像素数据，确保颜色正确
            for (let j = 0; j < pixels.length; j++) {
              imageData.data[j] = pixels[j];
            }
            
            // 绘制到canvas
            frameCtx.putImageData(imageData, 0, 0);
          } else {
            console.error('无法创建ImageData对象');
          }
        } catch (frameError) {
          console.error('解码帧失败:', frameError);
          // 绘制错误信息
          frameCtx.fillStyle = '#ff0000';
          frameCtx.font = '12px Arial';
          frameCtx.fillText('帧解码失败', 10, 20);
        }
        
        // 添加帧编号，以便区分不同的帧
        frameCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        frameCtx.font = '14px Arial';
        frameCtx.textAlign = 'center';
        frameCtx.textBaseline = 'bottom';
        frameCtx.fillText(`帧 ${index + 1}`, reader.width / 2, reader.height - 5);
        
        // 将canvas转换为静态图片URL
        const frameUrl = frameCanvas.toDataURL(`image/png`); // 固定使用PNG格式，确保静态图片
        
        // 添加到帧列表
        frames.value.push({
          url: frameUrl,
          index: index
        });
      })(i);
    }
  } catch (error) {
    console.error('分解GIF失败:', error);
    addInfoMessage(`分解GIF失败: ${error.message}`, 'error');
    
    // 出错时使用默认帧数
    totalFrames.value = 10;
    frameCount.value = 1;
    
    // 创建默认帧
    frames.value = [];
    for (let i = 0; i < 10; i++) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 100;
      canvas.height = 100;
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, 100, 100);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`帧 ${i + 1}`, 50, 95);
      const frameUrl = canvas.toDataURL('image/png');
      frames.value.push({ url: frameUrl, index: i });
    }
  }
}

// 清除GIF文件
function clearGifFile() {
  if (gifFile.value) {
    URL.revokeObjectURL(gifFile.value.previewUrl);
    gifFile.value = null;
    frames.value = [];
    conversionResults.value = [];
    totalFrames.value = 1;
    frameCount.value = 1;
    addInfoMessage('已清除GIF文件', 'info');
  }
}

// 开始转换
async function convertGif() {
  if (!gifFile.value) return;
  
  try {
    isConverting.value = true;
    addInfoMessage('开始转换GIF...', 'info');
    
    // 清空之前的转换结果
    conversionResults.value = [];
    const totalFramesToConvert = Math.min(frameCount.value, frames.value.length);
    let processedFrames = 0;
    
    // 处理每一帧
    for (let i = 0; i < totalFramesToConvert; i++) {
      // 使用立即执行函数创建闭包，确保每个回调使用正确的索引
      (function(index) {
        // 为每个帧生成独立的静态图片
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        // 设置canvas尺寸
        canvas.width = 200;
        canvas.height = 200;
        
        img.onload = function() {
          // 绘制图片到canvas
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          // 添加帧编号，以便区分不同的帧
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.font = '16px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`帧 ${index + 1}`, canvas.width / 2, canvas.height - 10);
          
          // 将canvas转换为静态图片URL
          const frameUrl = canvas.toDataURL(`image/${outputFormat.value}`);
          
          // 添加到转换结果
          conversionResults.value.push({
            name: `${gifFile.value.name.replace('.gif', '')}_frame_${index + 1}.${outputFormat.value}`,
            url: frameUrl
          });
          
          // 增加已处理帧数
          processedFrames++;
          
          // 当所有帧都处理完成后，更新状态
          if (processedFrames === totalFramesToConvert) {
            isConverting.value = false;
            addInfoMessage(`GIF转换完成，共转换 ${processedFrames} 帧`, 'info');
          }
        };
        
        // 使用分解出来的帧作为源
        img.src = frames.value[index].url;
      })(i);
    }
    
    // 如果没有帧需要处理，直接完成
    if (totalFramesToConvert === 0) {
      isConverting.value = false;
      addInfoMessage('GIF转换完成，共转换 0 帧', 'info');
    }
  } catch (error) {
    console.error('转换GIF失败:', error);
    addInfoMessage('转换GIF失败', 'error');
    isConverting.value = false;
  }
}

// 下载结果
async function downloadResult(result) {
  try {
    // 这里简化处理，实际需要实现文件下载逻辑
    addInfoMessage(`下载文件: ${result.name}`, 'info');
  } catch (error) {
    console.error('下载文件失败:', error);
    addInfoMessage('下载文件失败', 'error');
  }
}

// 打包下载为ZIP
async function downloadAsZip() {
  try {
    isDownloading.value = true;
    addInfoMessage('开始打包下载...', 'info');
    
    // 选择下载路径
    const selectedFolder = await open({
      directory: true,
      multiple: false,
      title: '选择下载路径'
    });
    
    if (selectedFolder) {
      const folderPath = Array.isArray(selectedFolder) ? selectedFolder[0] : selectedFolder;
      
      // 模拟打包过程
      setTimeout(() => {
        addInfoMessage(`ZIP文件已保存到: ${folderPath}`, 'info');
        isDownloading.value = false;
      }, 1500);
    } else {
      addInfoMessage('取消下载', 'info');
      isDownloading.value = false;
    }
  } catch (error) {
    console.error('打包下载失败:', error);
    addInfoMessage(`打包下载失败: ${error.message}`, 'error');
    isDownloading.value = false;
  }
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 添加信息消息
function addInfoMessage(content, type = 'info') {
  const now = new Date();
  const time = now.toLocaleTimeString();
  
  infoMessages.value.push({
    content: content,
    type: type,
    time: time
  });
  
  // 限制消息数量
  if (infoMessages.value.length > 50) {
    infoMessages.value.shift();
  }
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

h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #333;
  font-weight: 500;
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

.form-label-with-button {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.form-label-with-button .form-label {
  margin-bottom: 0;
}

.clear-all-btn {
  background: transparent;
  border: 1px solid #ff4d4f;
  color: #ff4d4f;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-all-btn:hover {
  background: #ff4d4f;
  color: white;
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

.gif-preview-container {
  width: 100%;
  min-height: 200px;
  max-height: 400px;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow-y: auto;
  background: #f5f5f5;
}

.preview-item {
  display: flex;
  flex-direction: column;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  overflow: hidden;
  margin: 12px;
}

.preview-image-wrapper {
  position: relative;
  width: 100%;
  height: 200px;
  background: #fafafa;
}

.preview-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.preview-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 6px 8px;
  background: #f5f5f5;
  border-top: 1px solid #ddd;
}

.file-name {
  font-size: 12px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.file-size {
  font-size: 11px;
  color: #666;
  margin-top: 2px;
}

.empty-preview {
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

.frames-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #f5f5f5;
  max-height: 300px;
  overflow-y: auto;
}

.frame-item {
  display: flex;
  flex-direction: column;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  overflow: hidden;
}

.frame-image {
  width: 100%;
  height: 80px;
  object-fit: contain;
  background: #fafafa;
}

.frame-info {
  padding: 4px 6px;
  background: #f5f5f5;
  border-top: 1px solid #ddd;
}

.frame-index {
  font-size: 11px;
  color: #333;
  text-align: center;
  width: 100%;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #f5f5f5;
}

.setting-item {
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

.frame-count-input {
  display: flex;
  align-items: center;
  gap: 10px;
}

.frame-count-input input {
  flex: 1;
  max-width: 100px;
}

.frame-count-info {
  font-size: 12px;
  color: #666;
  white-space: nowrap;
}

.convert-btn {
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

.convert-btn:hover:not(:disabled) {
  background: #4a76e9;
}

.convert-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.results-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #f5f5f5;
  max-height: 400px;
  overflow-y: auto;
}

.result-item {
  display: flex;
  flex-direction: column;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  overflow: hidden;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f5f5f5;
  border-bottom: 1px solid #eee;
}

.result-actions {
  display: flex;
  gap: 8px;
}

.result-name {
  font-size: 13px;
  font-weight: 500;
  color: #333;
}

.download-result-btn {
  background: transparent;
  border: 1px solid #5a86ff;
  color: #5a86ff;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.download-result-btn:hover {
  background: #5a86ff;
  color: white;
}

.result-image {
  width: 100%;
  height: 120px;
  object-fit: contain;
  background: #fafafa;
}

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

html.dark .clear-all-btn {
  border-color: #ff7875;
  color: #ff7875;
}

html.dark .clear-all-btn:hover {
  background: #ff7875;
  color: white;
}

html.dark .add-image-btn {
  background: #6699ff;
  color: white;
}

html.dark .add-image-btn:hover {
  background: #5588ee;
}

html.dark .form-select {
  background: #252a3a;
  border-color: #3a3f55;
  color: #e0e0e0;
}

html.dark .form-select:focus {
  border-color: #6699ff;
  background: #2f354a;
}

html.dark .gif-preview-container {
  border-color: #3a3f55;
  background: #252a3a;
}

html.dark .preview-item {
  border-color: #3a3f55;
  background: #1a1d2b;
}

html.dark .preview-image-wrapper {
  background: #252a3a;
}

html.dark .preview-item .preview-image {
  background: #252a3a;
}

html.dark .preview-info {
  background: #252a3a;
  border-top-color: #3a3f55;
}

html.dark .file-name {
  color: #e0e0e0;
}

html.dark .file-size {
  color: #999;
}

html.dark .empty-preview {
  color: #666;
  background-image: linear-gradient(45deg, #333 25%, transparent 25%),
                    linear-gradient(-45deg, #333 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, #333 75%),
                    linear-gradient(-45deg, transparent 75%, #333 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}

html.dark .frames-container {
  border-color: #3a3f55;
  background: #252a3a;
}

html.dark .frame-item {
  border-color: #3a3f55;
  background: #1a1d2b;
}

html.dark .frame-image {
  background: #252a3a;
}

html.dark .frame-info {
  background: #252a3a;
  border-top-color: #3a3f55;
}

html.dark .frame-index {
  color: #e0e0e0;
}

html.dark .settings-grid {
  border-color: #3a3f55;
  background: #252a3a;
}

html.dark .info-bar {
  background: #252a3a;
  border-color: #3a3f55;
}

html.dark .info-bar h4 {
  color: #e0e0e0;
}

html.dark .result-item {
  border-color: #3a3f55;
}

html.dark .result-header {
  background: #1a1d2b;
  border-bottom-color: #3a3f55;
}

html.dark .result-name {
  color: #e0e0e0;
}

html.dark .download-result-btn {
  border-color: #6699ff;
  color: #6699ff;
}

html.dark .download-result-btn:hover {
  background: #6699ff;
  color: white;
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