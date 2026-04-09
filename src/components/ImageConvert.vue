<template>
  <div class="page-container">
    <div class="converter-form">
      
      <!-- 图片文件输入栏 -->
      <div class="form-section">
        <button class="add-image-btn" @click="selectImageFile">添加图片</button>
      </div>

      <!-- 图片预览框 -->
      <div class="form-section">
        <div class="form-label-with-button">
          <label class="form-label">图片预览 (双击分辨率可编辑大小)</label>
          <button 
            v-if="imageFiles.length > 0" 
            class="clear-all-btn" 
            @click="clearAllImages"
          >
            全部清除
          </button>
        </div>
        <div class="image-preview-container">
          <div v-if="imageFiles.length > 0" class="preview-grid">
            <div 
              v-for="(image, index) in imageFiles" 
              :key="index"
              class="preview-item"
            >
              <div class="preview-image-wrapper">
                <img :src="image.previewUrl" class="preview-image" alt="预览图片">
                <div class="preview-resolution-overlay" v-if="image.width && image.height">
                  <div class="resolution-editor" v-if="editingResolutionIndex !== index">
                    <span class="resolution-width" @dblclick="startEditingResolution(index, 'width')">{{ image.width }}</span>
                    <span class="resolution-separator">×</span>
                    <span class="resolution-height" @dblclick="startEditingResolution(index, 'height')">{{ image.height }}</span>
                  </div>
                  <div class="resolution-input" v-else>
                    <input 
                      v-if="editingResolutionField === 'width'" 
                      type="number" 
                      :value="image.width" 
                      @input="updateResolution(index, 'width', $event.target.value)"
                      @blur="stopEditingResolution"
                      @keydown.enter="stopEditingResolution"
                      @keydown.escape="stopEditingResolution"
                      class="resolution-input-field"
                      min="1"
                      ref="resolutionInput"
                    />
                    <span v-else>{{ image.width }}</span>
                    <span class="resolution-separator">×</span>
                    <input 
                      v-if="editingResolutionField === 'height'" 
                      type="number" 
                      :value="image.height" 
                      @input="updateResolution(index, 'height', $event.target.value)"
                      @blur="stopEditingResolution"
                      @keydown.enter="stopEditingResolution"
                      @keydown.escape="stopEditingResolution"
                      class="resolution-input-field"
                      min="1"
                      ref="resolutionInput"
                    />
                    <span v-else>{{ image.height }}</span>
                  </div>
                </div>
              </div>
              <div class="preview-info">
                <div class="preview-info-row">
                  <span class="preview-name">{{ image.name }}</span>
                  <button class="remove-image-btn" @click="removeImage(index)" title="删除">×</button>
                </div>
                <span class="preview-size" v-if="image.width && image.height">{{ formatBytes(calculateImageSize(image)) }}</span>
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
          <option value="RGB332">RGB332</option>
          <option value="ARGB8888">ARGB8888</option>
          <option value="ARGB4444">ARGB4444</option>
          <option value="ARGB2222">ARGB2222</option>
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
            <label class="form-label">输出文件夹</label>
            <div class="file-input-wrapper">
              <input v-model="outputFolder" type="text" class="form-input path-input" placeholder="选择输出文件夹">
              <button class="file-select-btn" @click="selectOutputFolder">浏览</button>
            </div>
          </div>
          <div class="setting-item">
            <label class="form-label">BIN格式起始地址(hex)</label>
            <input v-model="binStartAddress" type="text" class="form-input" placeholder="0x0000" :disabled="outputFormat !== 'bin'">
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

      <!-- 转换后预览框 -->
      <div v-if="conversionPreviews.length > 0" class="form-section">
        <div class="form-label">转换后预览</div>
        <div class="conversion-preview-container">
          <div class="preview-grid">
            <div v-for="(preview, index) in conversionPreviews" :key="index" class="preview-item">
              <div class="preview-image-wrapper">
                <img :src="preview.url" class="preview-image" alt="转换后预览">
                <div class="preview-resolution-overlay" v-if="preview.width && preview.height">
                  {{ preview.width }} × {{ preview.height }}
                </div>
              </div>
              <div class="preview-info">
                <span class="preview-name">{{ preview.name }}</span>
                <span class="preview-size">{{ formatBytes(preview.compressedSize) }}</span>
                <span class="preview-compression" v-if="preview.compressionRatio > 0">压缩率: {{ preview.compressionRatio }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 转换结果 -->
    <div v-if="conversionResults.length > 0" class="result-section">
      <h4>转换结果</h4>
      <div class="result-container">
        <div 
          v-for="(result, index) in conversionResults" 
          :key="index"
          class="result-item"
        >
          <div class="result-header">
            <span class="result-name">{{ result.name }}</span>
            <div class="result-actions">
              <button 
                class="copy-result-btn"
                @click="copyResult(result.code)"
                title="复制代码"
              >
                复制
              </button>
              <button 
                class="download-result-btn"
                @click="result.binData ? downloadBinResult(result.binData, result.name) : downloadResult(result.code, result.name)"
                title="下载文件"
              >
                下载
              </button>
            </div>
          </div>
          <pre class="result-code">{{ result.code }}</pre>
        </div>
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
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';

// 响应式数据
const imageFiles = ref([]);
const colorFormat = ref('RGB888');
const outputFormat = ref('c');
const compression = ref('none');
const enableTransparentFill = ref(true);
const transparentFillColor = ref('#FFFFFF');
const arrayName = ref('sgl_image');
const outputFolder = ref('');
const binStartAddress = ref('0x0000');
const combineAsArray = ref(true);
const swapBytes = ref(false);
const isConverting = ref(false);
const infoMessages = ref([]);
const infoMessagesRef = ref(null);
const showCopyTip = ref(false);
const conversionResults = ref([]);
const conversionPreviews = ref([]);

// 分辨率编辑相关
const editingResolutionIndex = ref(-1);
const editingResolutionField = ref('');
const resolutionInput = ref(null);

// 加载保存的设置
function loadSettings() {
  try {
    // 重置透明填充相关设置
    enableTransparentFill.value = true;
    transparentFillColor.value = '#FFFFFF';
    
    const savedSettings = localStorage.getItem('sgltoolkit-settings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      if (settings.colorFormat) colorFormat.value = settings.colorFormat;
      if (settings.outputFormat) outputFormat.value = settings.outputFormat;
      if (settings.compression) compression.value = settings.compression;
      if (settings.enableTransparentFill !== undefined) enableTransparentFill.value = settings.enableTransparentFill;
      // 只在本地存储中存在设置时才加载透明填充颜色
      if (settings.transparentFillColor) transparentFillColor.value = settings.transparentFillColor;
      if (settings.arrayName) arrayName.value = settings.arrayName;
      if (settings.outputFolder) outputFolder.value = settings.outputFolder;
      if (settings.binStartAddress) binStartAddress.value = settings.binStartAddress;
      if (settings.combineAsArray !== undefined) combineAsArray.value = settings.combineAsArray;
      if (settings.swapBytes !== undefined) swapBytes.value = settings.swapBytes;
    }
  } catch (error) {
    console.error('加载设置失败:', error);
  }
}

// 保存设置
function saveSettings() {
  try {
    const settings = {
      colorFormat: colorFormat.value,
      outputFormat: outputFormat.value,
      compression: compression.value,
      enableTransparentFill: enableTransparentFill.value,
      transparentFillColor: transparentFillColor.value,
      arrayName: arrayName.value,
      outputFolder: outputFolder.value,
      binStartAddress: binStartAddress.value,
      combineAsArray: combineAsArray.value,
      swapBytes: swapBytes.value
    };
    localStorage.setItem('sgltoolkit-settings', JSON.stringify(settings));
  } catch (error) {
    console.error('保存设置失败:', error);
  }
}

// 监听设置变化
watch([colorFormat, outputFormat, compression, enableTransparentFill, transparentFillColor, arrayName, outputFolder, binStartAddress, combineAsArray, swapBytes], () => {
  saveSettings();
}, { deep: true });

// 初始化时加载设置
loadSettings();

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
          
          const imageInfo = {
            path: filePath,
            previewUrl: url,
            name: filePath.split(/[/\\]/).pop() || '未命名',
            width: 0,
            height: 0
          };
          
          const index = imageFiles.value.length;
          imageFiles.value.push(imageInfo);
          
          const img = new Image();
          img.onload = () => {
            imageFiles.value[index].width = img.naturalWidth;
            imageFiles.value[index].height = img.naturalHeight;
          };
          img.src = url;
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

// 选择输出文件夹
async function selectOutputFolder() {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: '选择输出文件夹'
    });
    
    if (selected) {
      const folderPath = Array.isArray(selected) ? selected[0] : selected;
      outputFolder.value = folderPath;
      addInfoMessage(`已选择输出文件夹: ${folderPath}`, 'info');
    }
  } catch (err) {
    console.error('选择输出文件夹失败：', err);
    addInfoMessage(`选择输出文件夹失败: ${JSON.stringify(err)}`, 'error');
  }
}

// 删除图片
function removeImage(index) {
  if (imageFiles.value[index] && imageFiles.value[index].previewUrl) {
    URL.revokeObjectURL(imageFiles.value[index].previewUrl);
  }
  imageFiles.value.splice(index, 1);
}

// 清除所有图片
function clearAllImages() {
  for (const image of imageFiles.value) {
    if (image.previewUrl) {
      URL.revokeObjectURL(image.previewUrl);
    }
  }
  imageFiles.value = [];
  // 清除预览数据
  conversionPreviews.value = [];
  // 清除转换结果
  conversionResults.value = [];
  // 清空缓存
  imageDataCache.clear();
  // 释放所有内存缓冲区
  freeAllMemoryBuffers();
  // 清空画布池
  canvasPool.canvases = [];
}

// 生成转换后预览
async function generatePreview(image) {
  return new Promise((resolve, reject) => {
    // 首先获取转换后的像素数据
    getImagePixelData(image).then(bitmapData => {
      const format = colorFormat.value;
      const width = image.width || 32;
      const height = image.height || 32;
      const bytesPerPixel = getBytesPerPixel(format);
      
      // 创建画布
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(width, height);
      const data = imageData.data;
      
      // 将转换后的像素数据转换回RGBA格式
      let offset = 0;
      let pixelCount = 0;
      
      // 检查是否是RLE压缩数据
      if (compression.value === 'rle') {
        // 解压RLE数据
        let i = 0;
        while (i < bitmapData.length && pixelCount < width * height) {
          const count = bitmapData[i];
          i++;
          
          let r, g, b, a = 255;
          
          switch (format) {
            case 'RGB888':
              // RGB888: 按 B, G, R 顺序（小端序）
              b = bitmapData[i];
              g = bitmapData[i + 1];
              r = bitmapData[i + 2];
              i += 3;
              break;
            case 'RGB565':
              // RGB565: 5 bits R, 6 bits G, 5 bits B（小端序）
              const rgb565 = bitmapData[i] | (bitmapData[i + 1] << 8);
              r = ((rgb565 >> 11) & 0x1F) << 3;
              g = ((rgb565 >> 5) & 0x3F) << 2;
              b = (rgb565 & 0x1F) << 3;
              i += 2;
              break;
            case 'RGB332':
              // RGB332: 3 bits R, 3 bits G, 2 bits B
              const rgb332 = bitmapData[i];
              r = ((rgb332 >> 5) & 0x07) << 5;
              g = ((rgb332 >> 2) & 0x07) << 5;
              b = (rgb332 & 0x03) << 6;
              i += 1;
              break;
            case 'ARGB8888':
              // ARGB8888: 按 B, G, R, A 顺序（小端序）
              b = bitmapData[i];
              g = bitmapData[i + 1];
              r = bitmapData[i + 2];
              a = bitmapData[i + 3];
              i += 4;
              break;
            case 'ARGB4444':
              // ARGB4444: 4 bits each
              const argb4444 = bitmapData[i] | (bitmapData[i + 1] << 8);
              a = ((argb4444 >> 12) & 0x0F) << 4;
              r = ((argb4444 >> 8) & 0x0F) << 4;
              g = ((argb4444 >> 4) & 0x0F) << 4;
              b = (argb4444 & 0x0F) << 4;
              i += 2;
              break;
            case 'ARGB2222':
              // ARGB2222: 2 bits each
              const argb2222 = bitmapData[i];
              a = ((argb2222 >> 6) & 0x03) << 6;
              r = ((argb2222 >> 4) & 0x03) << 6;
              g = ((argb2222 >> 2) & 0x03) << 6;
              b = (argb2222 & 0x03) << 6;
              i += 1;
              break;
            default:
              // 默认使用RGB888
              r = bitmapData[i];
              g = bitmapData[i + 1];
              b = bitmapData[i + 2];
              i += 3;
          }
          
          // 写入多个相同的像素
          for (let j = 0; j < count && pixelCount < width * height; j++) {
            const pixelIndex = pixelCount * 4;
            data[pixelIndex] = r;
            data[pixelIndex + 1] = g;
            data[pixelIndex + 2] = b;
            data[pixelIndex + 3] = a;
            pixelCount++;
          }
        }
      } else {
        // 非压缩数据
        while (offset < bitmapData.length && pixelCount < width * height) {
          let r, g, b, a = 255;
          
          switch (format) {
            case 'RGB888':
              // RGB888: 按 B, G, R 顺序（小端序）
              b = bitmapData[offset];
              g = bitmapData[offset + 1];
              r = bitmapData[offset + 2];
              offset += 3;
              break;
            case 'RGB565':
              // RGB565: 5 bits R, 6 bits G, 5 bits B（小端序）
              const rgb565 = bitmapData[offset] | (bitmapData[offset + 1] << 8);
              r = ((rgb565 >> 11) & 0x1F) << 3;
              g = ((rgb565 >> 5) & 0x3F) << 2;
              b = (rgb565 & 0x1F) << 3;
              offset += 2;
              break;
            case 'RGB332':
              // RGB332: 3 bits R, 3 bits G, 2 bits B
              const rgb332 = bitmapData[offset];
              r = ((rgb332 >> 5) & 0x07) << 5;
              g = ((rgb332 >> 2) & 0x07) << 5;
              b = (rgb332 & 0x03) << 6;
              offset += 1;
              break;
            case 'ARGB8888':
              // ARGB8888: 按 B, G, R, A 顺序（小端序）
              b = bitmapData[offset];
              g = bitmapData[offset + 1];
              r = bitmapData[offset + 2];
              a = bitmapData[offset + 3];
              offset += 4;
              break;
            case 'ARGB4444':
              // ARGB4444: 4 bits each
              const argb4444 = bitmapData[offset] | (bitmapData[offset + 1] << 8);
              a = ((argb4444 >> 12) & 0x0F) << 4;
              r = ((argb4444 >> 8) & 0x0F) << 4;
              g = ((argb4444 >> 4) & 0x0F) << 4;
              b = (argb4444 & 0x0F) << 4;
              offset += 2;
              break;
            case 'ARGB2222':
              // ARGB2222: 2 bits each
              const argb2222 = bitmapData[offset];
              a = ((argb2222 >> 6) & 0x03) << 6;
              r = ((argb2222 >> 4) & 0x03) << 6;
              g = ((argb2222 >> 2) & 0x03) << 6;
              b = (argb2222 & 0x03) << 6;
              offset += 1;
              break;
            default:
              // 默认使用RGB888
              r = bitmapData[offset];
              g = bitmapData[offset + 1];
              b = bitmapData[offset + 2];
              offset += 3;
          }
          
          // 写入RGBA数据
          const pixelIndex = pixelCount * 4;
          data[pixelIndex] = r;
          data[pixelIndex + 1] = g;
          data[pixelIndex + 2] = b;
          data[pixelIndex + 3] = a;
          pixelCount++;
        }
      }
      
      // 绘制到画布
      ctx.putImageData(imageData, 0, 0);
      const previewUrl = canvas.toDataURL('image/png');
      
      // 计算字节大小和压缩率
      const originalSize = width * height * bytesPerPixel;
      const compressedSize = bitmapData.length;
      const compressionRatio = originalSize > 0 ? ((originalSize - compressedSize) / originalSize * 100).toFixed(1) : 0;
      
      resolve({
        name: image.name,
        url: previewUrl,
        width: width,
        height: height,
        originalSize: originalSize,
        compressedSize: compressedSize,
        compressionRatio: compressionRatio
      });
    }).catch(err => {
      reject(err);
    });
  });
}

// 转换图片
async function convertImage() {
  if (!canConvert.value || isConverting.value) return;

  isConverting.value = true;
  conversionResults.value = [];
  conversionPreviews.value = [];

  try {
    addInfoMessage('开始转换图片...', 'info');
    
    // 生成预览
    const previewPromises = imageFiles.value.map(image => generatePreview(image));
    const previews = await Promise.all(previewPromises);
    conversionPreviews.value = previews;
    
    // 存储所有bitmap数据，用于生成bin文件
    let combinedBitmap = new Uint8Array(0);
    
    // 存储所有pixmap信息，用于生成结构体
    const pixmapInfos = [];
    
    // 先生成所有bitmap数据
    const results = await Promise.all(imageFiles.value.map(async (image) => {
      addInfoMessage(`正在转换: ${image.name}`, 'info');
      
      // 获取图片的实际像素数据
      const bitmapData = await getImagePixelData(image);
      const width = image.width || 32;
      const height = image.height || 32;
      
      // 生成bitmap数组
      const filenameWithoutExt = image.name.replace(/\.[^/.]+$/, '');
      const safeFilename = filenameWithoutExt.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[^a-zA-Z_]/, '_');
      const bitmapName = `${safeFilename}_bitmap`;
      
      return {
        safeFilename: safeFilename,
        width: width,
        height: height,
        bitmapName: bitmapName,
        bitmapData: bitmapData
      };
    }));
    
    // 处理结果并构建combinedBitmap
    for (const result of results) {
      // 存储pixmap信息
      pixmapInfos.push({
        name: result.safeFilename,
        width: result.width,
        height: result.height,
        bitmapName: result.bitmapName,
        bitmapData: result.bitmapData
      });
      
      // 将bitmap数据添加到组合数组中（用于生成bin文件）
      // 创建新的Uint8Array，包含原有数据和新数据
      const newSize = combinedBitmap.length + result.bitmapData.length;
      const newCombinedBitmap = new Uint8Array(newSize);
      newCombinedBitmap.set(combinedBitmap, 0);
      newCombinedBitmap.set(result.bitmapData, combinedBitmap.length);
      combinedBitmap = newCombinedBitmap;
    }
    
    // 如果是bin文件输出格式，生成bin文件
    if (outputFormat.value === 'bin') {
      // 生成bin文件数据（用于下载）
      const binData = new Uint8Array(combinedBitmap);
      
      // 获取数组名，用于命名bin文件和结构体文件
      const arrayNameValue = arrayName.value || 'flash_image';
      
      // 添加bin文件下载选项
      conversionResults.value.push({
        name: `${arrayNameValue}.bin`,
        code: '',
        binData: binData,
        binSize: binData.length
      });
      
      // 生成包含地址信息的sgl_pixmap_t结构体
      let binCode = `#include <stdint.h>\n`;
      binCode += `#include <sgl_core.h>\n\n`;
      
      // 获取用户指定的起始地址偏移
      const startAddress = parseInt(binStartAddress.value, 16) || 0;
      let currentAddress = startAddress;
      
      // 生成每个图片的sgl_pixmap_t结构体
      for (const info of pixmapInfos) {
        const pixmapName = `${info.name}_image`;
        binCode += `const sgl_pixmap_t ${pixmapName} = {\n`;
        binCode += `    .width = ${info.width},\n`;
        binCode += `    .height = ${info.height},\n`;
        binCode += `    .bitmap.addr = 0x${currentAddress.toString(16).padStart(8, '0')},\n`;
        binCode += `    .format = ${getSGLFormat(colorFormat.value, compression.value)},\n`;
        binCode += `};\n\n`;
        
        // 更新当前地址
        currentAddress += info.bitmapData.length;
      }
      
      // 添加到结果数组
      conversionResults.value.push({
        name: `${arrayNameValue}.c`,
        code: binCode
      });
    } else {
      // 非bin文件格式，生成C代码
      let combinedCode = '';
      let resultName = '';
      
      if (combineAsArray.value && imageFiles.value.length > 1) {
        // 生成组合数组
        combinedCode = await generateCombinedArray();
        // 使用数组名输入框的值作为结果名称
        resultName = arrayName.value || 'combined_array';
      } else {
        // 为每张图片生成代码并合并，确保所有bitmap在前面，所有sgl_pixmap_t在后面
        resultName = 'combined_results';
        
        // 添加include头文件（只添加一份）
        combinedCode = `#include <stdint.h>\n`;
        combinedCode += `#include <sgl_core.h>\n\n`;
        
        // 先生成所有bitmap数组
        for (const info of pixmapInfos) {
          const totalBytes = info.bitmapData.length;
          
          // 生成bitmap数组代码
          let bitmapCode = '';
          // 添加压缩算法注释
          if (compression.value === 'rle') {
            bitmapCode += `// RLE压缩数据\n`;
          }
          
          bitmapCode += `static const uint8_t ${info.bitmapName}[${totalBytes}] = {\n`;
          
          let line = '    ';
          for (let j = 0; j < info.bitmapData.length; j++) {
            line += `0x${info.bitmapData[j].toString(16).padStart(2, '0')}`;
            if (j < info.bitmapData.length - 1) {
              line += ', ';
            }
            
            // 每24个字节换行
            if ((j + 1) % 24 === 0 && j < info.bitmapData.length - 1) {
              bitmapCode += line + '\n';
              line = '    ';
            }
          }
          
          if (line.trim()) {
            bitmapCode += line + '\n';
          }
          bitmapCode += `};\n\n`;
          
          // 添加bitmap数组代码
          combinedCode += bitmapCode;
        }
        
        // 最后生成所有sgl_pixmap_t结构体
        for (const info of pixmapInfos) {
          const pixmapName = `${info.name}_image`;
          combinedCode += `const sgl_pixmap_t ${pixmapName} = {\n`;
          combinedCode += `    .width = ${info.width},\n`;
          combinedCode += `    .height = ${info.height},\n`;
          combinedCode += `    .bitmap.array = ${info.bitmapName},\n`;
          combinedCode += `    .format = ${getSGLFormat(colorFormat.value, compression.value)},\n`;
          combinedCode += `};\n\n`;
        }
      }
      
      // 添加到结果数组
      conversionResults.value.push({
        name: resultName,
        code: combinedCode
      });
    }
    
    addInfoMessage('转换成功！', 'info');
    isConverting.value = false;

  } catch (err) {
    console.error('转换失败:', err);
    addInfoMessage(`转换失败：${String(err)}`, 'error');
    isConverting.value = false;
  }
}

// 生成C语言数组
async function generateCArray(image, index) {
  // 获取图片的实际像素数据
  const bitmapData = await getImagePixelData(image);
  const width = image.width || 32;
  const height = image.height || 32;
  const bytesPerPixel = getBytesPerPixel(colorFormat.value);
  const totalBytes = bitmapData.length;
  
  // 生成C代码
  let cCode = `#include <stdint.h>\n`;
  cCode += `#include <sgl_core.h>\n\n`;
  
  // 生成bitmap数组
  const filenameWithoutExt = image.name.replace(/\.[^/.]+$/, '');
  const safeFilename = filenameWithoutExt.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[^a-zA-Z_]/, '_');
  const bitmapName = `${safeFilename}_bitmap`;
  
  // 添加压缩算法注释
  if (compression.value === 'rle') {
    cCode += `// RLE压缩数据\n`;
  }
  
  cCode += `static const uint8_t ${bitmapName}[${totalBytes}] = {\n`;
  
  let line = '    ';
  for (let i = 0; i < bitmapData.length; i++) {
    line += `0x${bitmapData[i].toString(16).padStart(2, '0')}`;
    if (i < bitmapData.length - 1) {
      line += ', ';
    }
    
    // 每24个字节换行
    if ((i + 1) % 24 === 0 && i < bitmapData.length - 1) {
      cCode += line + '\n';
      line = '    ';
    }
  }
  
  if (line.trim()) {
    cCode += line + '\n';
  }
  cCode += `};\n\n`;
  
  // 生成sgl_pixmap_t结构
  const pixmapName = combineAsArray.value ? (arrayName.value || `${safeFilename}_image`) : `${safeFilename}_image`;
  cCode += `const sgl_pixmap_t ${pixmapName} = {\n`;
  cCode += `    .width = ${width},\n`;
  cCode += `    .height = ${height},\n`;
  cCode += `    .bitmap.array = ${bitmapName},\n`;
  cCode += `    .format = ${getSGLFormat(colorFormat.value, compression.value)},\n`;
  cCode += `};\n`;
  
  return cCode;
}

// 生成组合数组
async function generateCombinedArray() {
  // 生成C代码
  let cCode = `#include <stdint.h>\n`;
  cCode += `#include <sgl_core.h>\n\n`;
  
  // 为每张图片生成bitmap数组
  const bitmapNames = [];
  const pixmapInfos = [];
  
  for (let i = 0; i < imageFiles.value.length; i++) {
    const image = imageFiles.value[i];
    
    // 获取图片的实际像素数据
    const bitmapData = await getImagePixelData(image);
    const width = image.width || 32;
    const height = image.height || 32;
    const totalBytes = bitmapData.length;
    
    // 生成bitmap数组
    const filenameWithoutExt = image.name.replace(/\.[^/.]+$/, '');
    const safeFilename = filenameWithoutExt.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[^a-zA-Z_]/, '_');
    const bitmapName = `${safeFilename}_bitmap`;
    bitmapNames.push(bitmapName);
    
    pixmapInfos.push({
      width: width,
      height: height,
      bitmapName: bitmapName
    });
    
    // 添加压缩算法注释
    if (compression.value === 'rle') {
      cCode += `// RLE压缩数据\n`;
    }
    
    cCode += `static const uint8_t ${bitmapName}[${totalBytes}] = {\n`;
    
    let line = '    ';
    for (let j = 0; j < bitmapData.length; j++) {
      line += `0x${bitmapData[j].toString(16).padStart(2, '0')}`;
      if (j < bitmapData.length - 1) {
        line += ', ';
      }
      
      // 每24个字节换行
      if ((j + 1) % 24 === 0 && j < bitmapData.length - 1) {
        cCode += line + '\n';
        line = '    ';
      }
    }
    
    if (line.trim()) {
      cCode += line + '\n';
    }
    cCode += `};\n\n`;
  }
  
  // 生成组合数组
  const arrayNameValue = arrayName.value || 'combined_images';
  const imageCount = imageFiles.value.length;
  
  cCode += `const sgl_pixmap_t ${arrayNameValue}[${imageCount}] = {\n`;
  
  for (let i = 0; i < pixmapInfos.length; i++) {
    const info = pixmapInfos[i];
    
    cCode += `    {\n`;
    cCode += `        .width = ${info.width},\n`;
    cCode += `        .height = ${info.height},\n`;
    cCode += `        .bitmap.array = ${info.bitmapName},\n`;
    cCode += `        .format = ${getSGLFormat(colorFormat.value, compression.value)},\n`;
    cCode += `    }`;
    
    if (i < pixmapInfos.length - 1) {
      cCode += ',';
    }
    cCode += '\n';
  }
  
  cCode += `};\n`;
  
  return cCode;
}

// 获取图片的像素数据
function getImagePixelData(image) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      // 获取目标宽度和高度
      const targetWidth = image.width || img.naturalWidth;
      const targetHeight = image.height || img.naturalHeight;
      
      // 设置画布大小为目标大小
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      
      // 使用双三次插值算法进行缩放
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const bitmapData = [];
      
      // 根据颜色格式转换像素数据
      const format = colorFormat.value;
      
      for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];
        const a = data[i + 3];
        
        // 处理透明像素
        if (a < 255 && enableTransparentFill.value) {
          // 使用透明填充颜色
          const fillColor = parseColor(transparentFillColor.value);
          if (fillColor) {
            // 计算透明度因子
            const alphaFactor = a / 255;
            // 混色算法：原始颜色 * 透明度 + 填充颜色 * (1 - 透明度)
            r = Math.round(r * alphaFactor + fillColor.r * (1 - alphaFactor));
            g = Math.round(g * alphaFactor + fillColor.g * (1 - alphaFactor));
            b = Math.round(b * alphaFactor + fillColor.b * (1 - alphaFactor));
          }
        }
        
        // 根据颜色格式转换
        switch (format) {
          case 'RGB888':
            // RGB888: 按 B, G, R 顺序（小端序）
            bitmapData.push(b, g, r);
            break;
          case 'RGB565':
            // RGB565: 5 bits R, 6 bits G, 5 bits B（小端序）
            const rgb565 = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
            bitmapData.push(rgb565 & 0xFF, (rgb565 >> 8) & 0xFF);
            break;
          case 'RGB332':
            // RGB332: 3 bits R, 3 bits G, 2 bits B
            const rgb332 = ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6);
            bitmapData.push(rgb332);
            break;
          case 'ARGB8888':
            // ARGB8888: 按 B, G, R, A 顺序（小端序）
            bitmapData.push(b, g, r, a);
            break;
          case 'ARGB4444':
            // ARGB4444: 4 bits each
            const argb4444 = ((a >> 4) << 12) | ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
            bitmapData.push(argb4444 & 0xFF, (argb4444 >> 8) & 0xFF);
            break;
          case 'ARGB2222':
            // ARGB2222: 2 bits each
            const argb2222 = ((a >> 6) << 6) | ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6);
            bitmapData.push(argb2222);
            break;
          default:
            bitmapData.push(r, g, b);
        }
      }
      
      // 应用压缩算法
      if (compression.value === 'rle') {
        const compressedData = rleCompress(bitmapData, format);
        resolve(compressedData);
      } else {
        resolve(bitmapData);
      }
    };
    
    img.onerror = () => {
      reject(new Error('无法加载图片'));
    };
    
    img.src = image.previewUrl;
  });
}

// 解析颜色值
function parseColor(color) {
  // 处理十六进制颜色
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16)
      };
    }
  }
  return null;
}

// RLE压缩算法
function rleCompress(data, format) {
  if (data.length === 0) return [];
  
  const compressed = [];
  
  // 根据颜色格式确定压缩单位
  const bytesPerPixel = getBytesPerPixel(format);
  
  if (bytesPerPixel === 1) {
    // 单字节格式：RGB332, ARGB2222
    let count = 1;
    let current = data[0];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i] === current && count < 255) {
        count++;
      } else {
        compressed.push(count, current);
        current = data[i];
        count = 1;
      }
    }
    
    // 添加最后一组
    compressed.push(count, current);
  } else if (bytesPerPixel === 2) {
    // 双字节格式：RGB565, ARGB4444
    let count = 1;
    let current1 = data[0];
    let current2 = data[1];
    
    for (let i = 2; i < data.length; i += 2) {
      if (data[i] === current1 && data[i + 1] === current2 && count < 255) {
        count++;
      } else {
        compressed.push(count, current1, current2);
        current1 = data[i];
        current2 = data[i + 1];
        count = 1;
      }
    }
    
    // 添加最后一组
    compressed.push(count, current1, current2);
  } else if (bytesPerPixel === 3) {
    // 三字节格式：RGB888
    let count = 1;
    let current1 = data[0];
    let current2 = data[1];
    let current3 = data[2];
    
    for (let i = 3; i < data.length; i += 3) {
      if (data[i] === current1 && data[i + 1] === current2 && data[i + 2] === current3 && count < 255) {
        count++;
      } else {
        compressed.push(count, current1, current2, current3);
        current1 = data[i];
        current2 = data[i + 1];
        current3 = data[i + 2];
        count = 1;
      }
    }
    
    // 添加最后一组
    compressed.push(count, current1, current2, current3);
  } else if (bytesPerPixel === 4) {
    // 四字节格式：ARGB8888
    let count = 1;
    let current1 = data[0];
    let current2 = data[1];
    let current3 = data[2];
    let current4 = data[3];
    
    for (let i = 4; i < data.length; i += 4) {
      if (data[i] === current1 && data[i + 1] === current2 && data[i + 2] === current3 && data[i + 3] === current4 && count < 255) {
        count++;
      } else {
        compressed.push(count, current1, current2, current3, current4);
        current1 = data[i];
        current2 = data[i + 1];
        current3 = data[i + 2];
        current4 = data[i + 3];
        count = 1;
      }
    }
    
    // 添加最后一组
    compressed.push(count, current1, current2, current3, current4);
  }
  
  return compressed;
}

// 获取每个像素的字节数
function getBytesPerPixel(format) {
  switch (format) {
    case 'RGB888': return 3;
    case 'RGB565': return 2;
    case 'RGB332': return 1;
    case 'ARGB8888': return 4;
    case 'ARGB4444': return 2;
    case 'ARGB2222': return 1;
    default: return 3;
  }
}

// 获取SGL格式宏
function getSGLFormat(format, compression) {
  if (compression === 'rle') {
    switch (format) {
      case 'RGB888': return 'SGL_PIXMAP_FMT_RLE_RGB888';
      case 'RGB565': return 'SGL_PIXMAP_FMT_RLE_RGB565';
      case 'RGB332': return 'SGL_PIXMAP_FMT_RLE_RGB332';
      case 'ARGB8888': return 'SGL_PIXMAP_FMT_RLE_ARGB8888';
      case 'ARGB4444': return 'SGL_PIXMAP_FMT_RLE_ARGB4444';
      case 'ARGB2222': return 'SGL_PIXMAP_FMT_RLE_ARGB2222';
      default: return 'SGL_PIXMAP_FMT_RLE_RGB888';
    }
  } else {
    switch (format) {
      case 'RGB888': return 'SGL_PIXMAP_FMT_RGB888';
      case 'RGB565': return 'SGL_PIXMAP_FMT_RGB565';
      case 'RGB332': return 'SGL_PIXMAP_FMT_RGB332';
      case 'ARGB8888': return 'SGL_PIXMAP_FMT_ARGB8888';
      case 'ARGB4444': return 'SGL_PIXMAP_FMT_ARGB4444';
      case 'ARGB2222': return 'SGL_PIXMAP_FMT_ARGB2222';
      default: return 'SGL_PIXMAP_FMT_RGB888';
    }
  }
}

// 计算图片字节大小
function calculateImageSize(image) {
  if (!image.width || !image.height) return 0;
  const bytesPerPixel = getBytesPerPixel(colorFormat.value);
  return image.width * image.height * bytesPerPixel;
}

// 格式化字节大小
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 开始编辑分辨率
function startEditingResolution(index, field) {
  editingResolutionIndex.value = index;
  editingResolutionField.value = field;
  
  // 等待DOM更新后聚焦输入框
  setTimeout(() => {
    if (resolutionInput.value) {
      resolutionInput.value.focus();
      resolutionInput.value.select();
    }
  }, 100);
}

// 停止编辑分辨率
function stopEditingResolution() {
  editingResolutionIndex.value = -1;
  editingResolutionField.value = '';
}

// 全局点击事件处理函数
function handleGlobalClick(event) {
  // 检查点击的元素是否是分辨率编辑相关的元素
  const target = event.target;
  if (
    !target.closest('.preview-resolution-overlay') &&
    !target.closest('.resolution-input-field')
  ) {
    stopEditingResolution();
  }
}

// 组件挂载时添加全局点击事件监听器
onMounted(() => {
  document.addEventListener('click', handleGlobalClick);
});

// 组件卸载时移除全局点击事件监听器
onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick);
});

// 更新分辨率
function updateResolution(index, field, value) {
  const numValue = parseInt(value);
  if (!isNaN(numValue) && numValue > 0) {
    imageFiles.value[index][field] = numValue;
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

// 复制转换结果
async function copyResult(code) {
  try {
    await navigator.clipboard.writeText(code);
    showCopyTip.value = true;
    setTimeout(() => showCopyTip.value = false, 1000);
    addInfoMessage('代码已复制到剪贴板', 'info');
  } catch (err) {
    console.error('复制失败：', err);
    addInfoMessage('复制失败', 'error');
  }
}

// 下载转换结果
async function downloadResult(code, filename) {
  try {
    // 生成文件名：使用数组名输入框的值
    let defaultFileName;
    if (combineAsArray.value && imageFiles.value.length > 1) {
      // 组合数组模式：使用数组名输入框的值
      const safeArrayName = arrayName.value.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[^a-zA-Z_]/, '_');
      defaultFileName = `${safeArrayName}.c`;
    } else {
      // 单个文件模式：使用原文件名
      const filenameWithoutExt = filename.replace(/\.[^/.]+$/, '');
      const safeFilename = filenameWithoutExt.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[^a-zA-Z_]/, '_');
      defaultFileName = `${safeFilename}.c`;
    }
    
    console.log('开始下载，文件名:', defaultFileName);
    
    // 检查是否存在输出文件夹
    if (!outputFolder.value) {
      console.error('未选择输出文件夹');
      addInfoMessage('请先选择输出文件夹', 'error');
      return;
    }
    
    console.log('使用用户选择的输出文件夹:', outputFolder.value);
    
    // 构建完整的文件路径
    const separator = outputFolder.value.endsWith('/') || outputFolder.value.endsWith('\\') ? '' : '/';
    const filePath = outputFolder.value + separator + defaultFileName;
    console.log('构建的文件路径:', filePath);
    
    // 尝试使用Tauri的invoke API来调用自定义的Rust命令
    try {
      console.log('尝试导入invoke API');
      const { invoke } = await import('@tauri-apps/api/core');
      console.log('invoke API导入成功');
      
      console.log('调用write_file命令');
      const result = await invoke('write_file', {
        path: filePath,
        content: code
      });
      
      console.log('write_file命令返回:', result);
      
      if (result && result.success === 'true') {
        console.log('文件保存成功');
        addInfoMessage(`文件已保存：${result.path || filePath}`, 'info');
      } else {
        console.log('文件保存失败');
        addInfoMessage(`文件保存失败：${result?.error || '未知错误'}`, 'error');
      }
    } catch (invokeError) {
      console.error('Invoke操作失败：', invokeError);
      console.error('错误名称:', invokeError.name);
      console.error('错误消息:', invokeError.message);
      console.error('错误堆栈:', invokeError.stack);
      addInfoMessage(`文件写入失败：${invokeError.message || '未知错误'}`, 'error');
    }
  } catch (err) {
    console.error('下载失败：', err);
    console.error('错误名称:', err.name);
    console.error('错误消息:', err.message);
    console.error('错误堆栈:', err.stack);
    addInfoMessage(`下载失败：${err.message || '未知错误'}`, 'error');
  }
}

// 下载bin文件结果
async function downloadBinResult(binData, filename) {
  try {
    // 生成文件名：使用传入的文件名，确保使用.bin扩展名
    const safeFilename = filename.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[^a-zA-Z_]/, '_');
    const defaultFileName = `${safeFilename}.bin`;
    
    console.log('开始下载bin文件，文件名:', defaultFileName);
    
    // 检查是否存在输出文件夹
    if (!outputFolder.value) {
      console.error('未选择输出文件夹');
      addInfoMessage('请先选择输出文件夹', 'error');
      return;
    }
    
    console.log('使用用户选择的输出文件夹:', outputFolder.value);
    
    // 构建完整的文件路径
    const separator = outputFolder.value.endsWith('/') || outputFolder.value.endsWith('\\') ? '' : '/';
    const filePath = outputFolder.value + separator + defaultFileName;
    console.log('构建的文件路径:', filePath);
    
    // 尝试使用Tauri的invoke API来调用自定义的Rust命令
    try {
      console.log('尝试导入invoke API');
      const { invoke } = await import('@tauri-apps/api/core');
      console.log('invoke API导入成功');
      
      // 使用更可靠的方法将Uint8Array转换为base64字符串
      // 创建一个Blob对象
      const blob = new Blob([binData], { type: 'application/octet-stream' });
      
      // 使用FileReader来读取并转换为base64
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          // 移除data URL前缀，只获取base64部分
          const result = reader.result;
          if (typeof result === 'string') {
            const base64 = result.split(',')[1];
            resolve(base64);
          } else {
            reject(new Error('Failed to read blob'));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      
      console.log('调用write_bin_file命令');
      const result = await invoke('write_bin_file', {
        path: filePath,
        content: base64Data
      });
      
      console.log('write_bin_file命令返回:', result);
      
      if (result && result.success === 'true') {
        console.log('bin文件保存成功');
        addInfoMessage(`bin文件已保存：${result.path || filePath}`, 'info');
      } else {
        console.log('bin文件保存失败');
        addInfoMessage(`bin文件保存失败：${result?.error || '未知错误'}`, 'error');
      }
    } catch (invokeError) {
      console.error('Invoke操作失败：', invokeError);
      console.error('错误名称:', invokeError.name);
      console.error('错误消息:', invokeError.message);
      console.error('错误堆栈:', invokeError.stack);
      addInfoMessage(`bin文件写入失败：${invokeError.message || '未知错误'}`, 'error');
    }
  } catch (err) {
    console.error('bin文件下载失败：', err);
    console.error('错误名称:', err.name);
    console.error('错误消息:', err.message);
    console.error('错误堆栈:', err.stack);
    addInfoMessage(`bin文件下载失败：${err.message || '未知错误'}`, 'error');
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

/* 转换后预览样式 */
.conversion-preview-container {
  width: 100%;
  min-height: 200px;
  max-height: 400px;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow-y: auto;
  background: #f5f5f5;
}

.conversion-preview-container .preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  padding: 12px;
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

.preview-image-wrapper {
  position: relative;
  width: 100%;
  height: 120px;
  background: #fafafa;
}

.preview-item .preview-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.preview-resolution-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  font-size: 11px;
  padding: 2px 6px;
  text-align: center;
}

.resolution-editor {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.resolution-width,
.resolution-height {
  cursor: pointer;
  padding: 0 4px;
  border-radius: 2px;
  transition: background-color 0.2s;
}

.resolution-width:hover,
.resolution-height:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

.resolution-separator {
  color: white;
}

.resolution-input {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.resolution-input-field {
  width: 40px;
  font-size: 10px;
  padding: 1px 2px;
  border: 1px solid #ddd;
  border-radius: 2px;
  text-align: center;
  background-color: white;
  color: #333;
}

.resolution-input-field:focus {
  outline: none;
  border-color: #1890ff;
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
}

.preview-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 6px 8px;
  background: #f5f5f5;
  border-top: 1px solid #ddd;
}

.preview-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-bottom: 2px;
}

.preview-name {
  font-size: 12px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.preview-size {
  font-size: 11px;
  color: #666;
  margin-top: 2px;
}

.preview-compression {
  font-size: 11px;
  color: #52c41a;
  margin-top: 2px;
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
  margin-bottom: 20px;
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

/* 转换结果样式 */
.result-section {
  margin-top: 24px;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  transition: all 0.3s ease;
}

.result-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #333;
  font-weight: 500;
}

.result-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.result-item {
  border: 1px solid #eee;
  border-radius: 6px;
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

.copy-result-btn {
  background: transparent;
  border: 1px solid #5a86ff;
  color: #5a86ff;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.copy-result-btn:hover {
  background: #5a86ff;
  color: white;
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

.result-code {
  margin: 0;
  padding: 12px;
  background: #fafafa;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.4;
  overflow-x: auto;
  white-space: pre;
  max-height: 300px;
  overflow-y: auto;
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

html.dark .result-section {
  background: #252a3a;
  border-color: #3a3f55;
}

html.dark .result-section h4 {
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

html.dark .copy-result-btn {
  border-color: #6699ff;
  color: #6699ff;
}

html.dark .copy-result-btn:hover {
  background: #6699ff;
  color: white;
}

html.dark .download-result-btn {
  border-color: #6699ff;
  color: #6699ff;
}

html.dark .download-result-btn:hover {
  background: #6699ff;
  color: white;
}

html.dark .result-code {
  background: #1a1d2b;
  color: #e0e0e0;
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