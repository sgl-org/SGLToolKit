<template>
  <div class="page-container">
    <!-- ffmpeg 环境警告条 -->
    <div v-if="ffmpegChecked && !ffmpegAvailable" class="ffmpeg-warning">
      <span class="warning-icon">⚠</span>
      <div class="warning-body">
        <div class="warning-title">未检测到 ffmpeg，请先安装并加入系统 PATH</div>
        <div class="warning-desc">
          推荐使用 Windows 构建版本：
          <a href="https://www.gyan.dev/ffmpeg/builds/" target="_blank" rel="noopener noreferrer">gyan.dev/ffmpeg/builds</a>
          或
          <a href="https://github.com/BtbN/FFmpeg-Builds/releases" target="_blank" rel="noopener noreferrer">BtbN/FFmpeg-Builds</a>
          ，解压后将 bin 目录添加到环境变量后重启本软件。
        </div>
      </div>
    </div>

    <div class="converter-form">
      <!-- 视频文件输入栏 -->
      <div class="form-section">
        <button class="add-video-btn" @click="selectVideoFile" :disabled="isConverting">加载视频文件</button>
      </div>

      <!-- 已选视频信息 -->
      <div class="form-section">
        <div class="form-label-with-button">
          <label class="form-label">已选视频</label>
          <button
            v-if="videoFile"
            class="clear-all-btn"
            @click="clearVideoFile"
            :disabled="isConverting"
          >
            清除
          </button>
        </div>
        <div class="video-info-container">
          <div v-if="videoFile" class="video-info-item">
            <div class="video-icon">🎬</div>
            <div class="video-meta">
              <span class="file-name">{{ videoFile.name }}</span>
              <span class="file-size">{{ formatFileSize(videoFile.size) }}</span>
              <span class="file-path">{{ videoFile.path }}</span>
            </div>
          </div>
          <div v-else class="empty-preview">
            请选择要转换的视频文件
          </div>
        </div>
      </div>

      <!-- 转换参数 -->
      <div class="form-section">
        <label class="form-label">转换参数</label>
        <div class="settings-row">
          <div class="setting-item setting-item-res">
            <label class="setting-label">分辨率（等比缩放 + 黑边填充）</label>
            <div class="resolution-row">
              <select class="form-select resolution-preset" v-model="resolutionPreset" :disabled="isConverting" @change="onPresetChange">
                <option value="1024x768">1024 × 768</option>
                <option value="800x480">800 × 480</option>
                <option value="640x480">640 × 480</option>
                <option value="480x320">480 × 320</option>
                <option value="480x272">480 × 272</option>
                <option value="320x240">320 × 240</option>
                <option value="320x172">320 × 172</option>
                <option value="280x240">280 × 240</option>
                <option value="240x240">240 × 240</option>
                <option value="240x180">240 × 180</option>
                <option value="240x135">240 × 135</option>
                <option value="180x135">180 × 135</option>
                <option value="160x80">160 × 80</option>
                <option value="128x128">128 × 128</option>
                <option value="custom">自定义</option>
              </select>
              <input type="number" v-model.number="videoWidth" class="form-input res-input" min="16" max="4096" :disabled="isConverting" @input="resolutionPreset = 'custom'">
              <span class="res-sep">×</span>
              <input type="number" v-model.number="videoHeight" class="form-input res-input" min="16" max="4096" :disabled="isConverting" @input="resolutionPreset = 'custom'">
            </div>
          </div>
          <div class="setting-item">
            <label class="setting-label">帧率 (-r)</label>
            <input type="number" v-model.number="fps" class="form-input" min="1" max="240">
          </div>
          <div class="setting-item">
            <label class="setting-label">质量 (-q:v，1-31，越小越好)</label>
            <input type="number" v-model.number="quality" class="form-input" min="1" max="31">
          </div>
          <div class="setting-item">
            <label class="setting-label">像素格式 (-pix_fmt)</label>
            <select class="form-select" v-model="pixelFormat" :disabled="isConverting">
              <option value="">默认（自动）</option>
              <option value="yuvj422p">yuvj422p</option>
              <option value="yuvj444p">yuvj444p</option>
              <option value="yuvj420p">yuvj420p</option>
            </select>
          </div>
        </div>
      </div>

      <!-- 输出路径 -->
      <div class="form-section">
        <label class="form-label">输出路径</label>
        <div class="file-input-wrapper">
          <input v-model="outputPath" type="text" class="form-input path-input" placeholder="选择输出 .avi 文件路径">
          <button class="file-select-btn" @click="selectOutputPath" :disabled="isConverting">浏览</button>
        </div>
      </div>

      <!-- 命令预览 -->
      <div class="form-section">
        <div class="form-label-with-button">
          <label class="form-label">命令预览</label>
          <button class="copy-cmd-btn" @click="copyCommand">复制</button>
        </div>
        <div class="command-preview">{{ displayCommand }}</div>
      </div>

      <!-- 转换按钮（转换中作为进度条：背景双色渐变填充） -->
      <div class="form-section">
        <button
          class="convert-btn"
          @click="convertVideo"
          :disabled="!canConvert"
          :style="convertBtnStyle"
        >
          {{ convertBtnLabel }}
        </button>
      </div>

      <!-- 转换结果 -->
      <div v-if="conversionResult" class="form-section">
        <label class="form-label">转换结果</label>
        <div class="result-item">
          <div class="result-header">
            <span class="result-name">{{ conversionResult.name }}</span>
            <div class="result-actions">
              <button
                class="download-result-btn"
                @click="revealOutput"
                title="在文件夹中显示"
              >
                打开所在文件夹
              </button>
            </div>
          </div>
          <div class="result-path">{{ conversionResult.path }}</div>
        </div>
      </div>

      <!-- 错误信息面板 -->
      <div v-if="errorMessage" class="form-section">
        <div class="form-label-with-button">
          <label class="form-label error-label">转换失败</label>
          <button class="clear-all-btn" @click="errorMessage = ''">关闭</button>
        </div>
        <div class="error-panel" :class="{ collapsed: errorCollapsed }">
          <pre>{{ errorMessage }}</pre>
        </div>
        <button class="toggle-error-btn" @click="errorCollapsed = !errorCollapsed">
          {{ errorCollapsed ? '展开详情' : '收起详情' }}
        </button>
      </div>
    </div>

    <!-- 日志信息栏 -->
    <div class="info-bar">
      <h4>转换日志</h4>
      <div v-if="infoMessages.length === 0" class="empty-log">暂无日志信息</div>
      <div class="info-messages">
        <div
          v-for="msg in infoMessages"
          :key="msg.id"
          class="info-message"
          :class="msg.type"
        >
          <span class="msg-time">{{ msg.time }}</span>
          <span class="msg-content">{{ msg.content }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { open, save } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { revealItemInDir } from '@tauri-apps/plugin-opener';

// 响应式数据
// 上次会话的参数记忆（参考字体转换页的 localStorage 持久化）
let savedSettings = {};
try {
  savedSettings = JSON.parse(localStorage.getItem('videoConvertSettings') || '{}');
} catch (e) { /* 数据损坏时忽略，使用默认值 */ }

const videoFile = ref(null);
const outputPath = ref('');
const resolutionPreset = ref(savedSettings.resolutionPreset || '240x180');
const videoWidth = ref(savedSettings.videoWidth ?? 240);
const videoHeight = ref(savedSettings.videoHeight ?? 180);
const fps = ref(savedSettings.fps ?? 12);
const quality = ref(savedSettings.quality ?? 7);
const pixelFormat = ref(savedSettings.pixelFormat ?? '');
const isConverting = ref(false);
const progressPercent = ref(0);
const progressTime = ref('');
let unlistenProgress = null;
const ffmpegChecked = ref(false);
const ffmpegAvailable = ref(true);
const conversionResult = ref(null);
const errorMessage = ref('');
const errorCollapsed = ref(false);
const infoMessages = ref([]);

// 参数变更时自动保存，下次启动直接恢复
watch(
  [resolutionPreset, videoWidth, videoHeight, fps, quality, pixelFormat],
  ([preset, w, h, r, q, pix]) => {
    localStorage.setItem('videoConvertSettings', JSON.stringify({
      resolutionPreset: preset, videoWidth: w, videoHeight: h, fps: r, quality: q, pixelFormat: pix
    }));
  }
);

// 进度文本：时长未知时（percent 恒为 0）只显示已转换时间
const progressText = computed(() => {
  if (progressPercent.value > 0) {
    return `${progressPercent.value.toFixed(1)}%（${progressTime.value || '--:--:--'}）`;
  }
  return progressTime.value ? `已转换 ${progressTime.value}` : '准备中...';
});

// 按钮文字
const convertBtnLabel = computed(() => {
  if (!isConverting.value) return '开始转换';
  return `转换中 ${progressText.value}`;
});

// 转换中用双色硬渐变把按钮背景当进度条用，颜色由 CSS 变量跟随主题
const convertBtnStyle = computed(() => {
  if (!isConverting.value) return {};
  const p = Math.min(100, Math.max(0, progressPercent.value));
  return {
    background: `linear-gradient(90deg, var(--btn-fill) 0 ${p}%, var(--btn-base) ${p}% 100%)`
  };
});

// 是否可以开始转换
const canConvert = computed(() => {
  return ffmpegAvailable.value
    && videoFile.value
    && outputPath.value.trim()
    && videoWidth.value >= 16
    && videoHeight.value >= 16
    && fps.value >= 1
    && quality.value >= 1
    && quality.value <= 31
    && !isConverting.value;
});

// ffmpeg 参数数组（与 run_ffmpeg_with_progress 实际传参一致）
const ffmpegArgs = computed(() => {
  const input = videoFile.value?.path || 'input.mp4';
  const output = outputPath.value.trim() || 'output.avi';
  const vf = `scale=${videoWidth.value}:${videoHeight.value}:force_original_aspect_ratio=decrease,pad=${videoWidth.value}:${videoHeight.value}:(ow-iw)/2:(oh-ih)/2`;
  const args = [
    '-i', input,
    '-vf', vf,
    '-c:v', 'mjpeg',
    '-q:v', String(quality.value || 7),
    '-r', String(fps.value || 12)
  ];
  // 像素格式选"默认"时不传 -pix_fmt，由 ffmpeg 自动选择
  if (pixelFormat.value) {
    args.push('-pix_fmt', pixelFormat.value);
  }
  // 保留音频并编码为 PCM（16位/22.05kHz/单声道）
  args.push('-c:a', 'pcm_s16le', '-ar', '22050', '-ac', '1', '-y', output);
  return args;
});

// 命令预览文本
const displayCommand = computed(() => {
  return 'ffmpeg ' + ffmpegArgs.value.map(quoteArg).join(' ');
});

function quoteArg(arg) {
  return /[\s"']/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

// 检测 ffmpeg 是否可用，并注册进度事件监听
onMounted(async () => {
  try {
    unlistenProgress = await listen('ffmpeg-progress', (event) => {
      progressPercent.value = event.payload.percent;
      progressTime.value = event.payload.time_str;
    });
  } catch (err) {
    console.error('注册进度监听失败:', err);
  }

  try {
    await invoke('run_shell_command', { cmd: 'ffmpeg', args: ['-version'] });
    ffmpegAvailable.value = true;
    addInfoMessage('已检测到系统 ffmpeg', 'info');
  } catch (err) {
    ffmpegAvailable.value = false;
    addInfoMessage('未检测到 ffmpeg，请安装并加入 PATH', 'error');
  } finally {
    ffmpegChecked.value = true;
  }
});

// 选择视频文件
async function selectVideoFile() {
  try {
    const selected = await open({
      directory: false,
      multiple: false,
      title: '选择视频文件',
      filters: [
        {
          name: '视频文件',
          extensions: ['mp4', 'avi', 'mkv', 'mov', 'webm', 'flv', 'wmv', 'ts', 'm4v']
        }
      ]
    });

    if (selected) {
      const filePath = Array.isArray(selected) ? selected[0] : selected;
      if (typeof filePath !== 'string') {
        throw new Error('无效的文件路径');
      }

      const fileName = filePath.split(/[/\\]/).pop() || '未命名视频';
      const size = await getFileSize(filePath);
      videoFile.value = {
        name: fileName,
        path: filePath,
        size: size
      };

      // 默认输出路径：与输入同目录，同名 .avi（同名时转换后直接覆盖源文件）
      const baseName = fileName.replace(/\.[^.]+$/, '');
      const dir = filePath.slice(0, Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/')));
      const sep = filePath.lastIndexOf('\\') >= 0 ? '\\' : '/';
      outputPath.value = `${dir}${sep}${baseName}.avi`;

      conversionResult.value = null;
      errorMessage.value = '';
      addInfoMessage(`已选择视频文件: ${fileName}`, 'info');
    }
  } catch (error) {
    console.error('选择视频文件失败:', error);
    addInfoMessage(`选择视频文件失败: ${error.message || JSON.stringify(error)}`, 'error');
  }
}

// 通过 Rust 端读取文件大小（仅读 metadata，不加载文件内容）
async function getFileSize(filePath) {
  try {
    return await invoke('get_file_size', { path: filePath });
  } catch (err) {
    return 0;
  }
}

// 选择输出路径
async function selectOutputPath() {
  try {
    const defaultName = videoFile.value
      ? videoFile.value.name.replace(/\.[^.]+$/, '') + '.avi'
      : 'output.avi';
    const selected = await save({
      title: '选择输出文件',
      defaultPath: defaultName,
      filters: [
        {
          name: 'AVI 视频',
          extensions: ['avi']
        }
      ]
    });
    if (selected) {
      outputPath.value = selected;
      addInfoMessage(`已选择输出路径: ${selected}`, 'info');
    }
  } catch (err) {
    console.error('选择输出路径失败:', err);
    addInfoMessage(`选择输出路径失败: ${JSON.stringify(err)}`, 'error');
  }
}

// 分辨率预设切换
function onPresetChange() {
  if (resolutionPreset.value === 'custom') return;
  const [w, h] = resolutionPreset.value.split('x').map(Number);
  videoWidth.value = w;
  videoHeight.value = h;
}

// 路径归一化（忽略大小写与斜杠差异），用于输入输出同文件检测
function normalizePath(p) {
  return p.replace(/[\\/]+/g, '\\').toLowerCase();
}

// 执行转换
async function convertVideo() {
  if (!canConvert.value) return;

  // 输出与输入同文件时：ffmpeg 无法原地读写，先输出临时文件，成功后覆盖回目标
  const overwriteSame = normalizePath(outputPath.value) === normalizePath(videoFile.value.path);
  const finalOutput = outputPath.value.trim();
  const tempOutput = overwriteSame ? `${finalOutput}.${Date.now()}.tmp.avi` : finalOutput;
  const args = ffmpegArgs.value.slice();
  if (overwriteSame) {
    args[args.length - 1] = tempOutput;
  }

  isConverting.value = true;
  progressPercent.value = 0;
  progressTime.value = '';
  conversionResult.value = null;
  errorMessage.value = '';
  addInfoMessage(`开始转换: ${videoFile.value.name} → ${finalOutput}`, 'info');

  try {
    await invoke('run_ffmpeg_with_progress', { args });

    if (overwriteSame) {
      await invoke('move_file', { from: tempOutput, to: finalOutput });
    }

    progressPercent.value = 100;
    conversionResult.value = {
      name: finalOutput.split(/[/\\]/).pop(),
      path: finalOutput
    };
    addInfoMessage(overwriteSame ? '转换完成（已覆盖源文件）' : '转换完成', 'info');
  } catch (err) {
    if (overwriteSame) {
      // 转换失败时清理临时文件，保留原文件不动
      try { await invoke('remove_file', { path: tempOutput }); } catch (e) { /* 忽略 */ }
    }
    const msg = String(err);
    errorMessage.value = msg;
    errorCollapsed.value = false;
    addInfoMessage('转换失败，请查看错误详情', 'error');
  } finally {
    isConverting.value = false;
  }
}

// 打开输出文件所在文件夹
async function revealOutput() {
  try {
    await revealItemInDir(outputPath.value);
  } catch (err) {
    console.error('打开文件夹失败:', err);
    addInfoMessage(`打开文件夹失败: ${JSON.stringify(err)}`, 'error');
  }
}

// 复制命令到剪贴板
async function copyCommand() {
  try {
    await navigator.clipboard.writeText(displayCommand.value);
    addInfoMessage('命令已复制到剪贴板', 'info');
  } catch (err) {
    addInfoMessage('复制命令失败', 'error');
  }
}

// 清除视频文件
function clearVideoFile() {
  videoFile.value = null;
  outputPath.value = '';
  conversionResult.value = null;
  errorMessage.value = '';
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 添加信息消息（5 秒后自动清除，参考字体转换的限流策略）
let messageId = 0;
function addInfoMessage(content, type = 'info') {
  const now = new Date();
  const time = now.toLocaleTimeString();
  const id = ++messageId;

  infoMessages.value.push({
    id,
    content: content,
    type: type,
    time: time
  });

  // 5 秒后自动移除该条日志
  setTimeout(() => {
    infoMessages.value = infoMessages.value.filter((m) => m.id !== id);
  }, 5000);

  // 与字体转换一致：最多保留 5 条日志，超出自动清理
  if (infoMessages.value.length > 5) {
    infoMessages.value.shift();
  }

  setTimeout(() => {
    const infoMessagesElement = document.querySelector('.info-messages');
    if (infoMessagesElement) {
      infoMessagesElement.scrollTop = infoMessagesElement.scrollHeight;
    }
  }, 100);
}

onUnmounted(() => {
  if (unlistenProgress) {
    unlistenProgress();
    unlistenProgress = null;
  }
});
</script>

<style scoped>
.page-container {
  padding: 30px;
  max-width: 1920px;
  margin: 0 auto;
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

.setting-label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: #666;
  font-weight: 500;
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

.ffmpeg-warning {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  background: #fffbe6;
  border: 1px solid #ffe58f;
  color: #614700;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  font-size: 13px;
}

.ffmpeg-warning .warning-icon {
  font-size: 18px;
  line-height: 1.2;
}

.ffmpeg-warning .warning-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.ffmpeg-warning .warning-desc a {
  color: #1890ff;
}

.add-video-btn {
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

.add-video-btn:hover:not(:disabled) {
  background: #4a76e9;
}

.add-video-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.video-info-container {
  width: 100%;
  min-height: 80px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #f5f5f5;
}

.video-info-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
}

.video-icon {
  font-size: 28px;
  flex-shrink: 0;
}

.video-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.video-meta .file-name {
  font-size: 13px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-meta .file-size {
  font-size: 11px;
  color: #666;
}

.video-meta .file-path {
  font-size: 11px;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
}

.empty-preview {
  color: #999;
  font-size: 14px;
  text-align: center;
  width: 100%;
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 参考字体转换页的 settings-row 弹性布局，窄窗口自动换行不会溢出 */
.settings-row {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px;
}

.setting-item {
  flex: 1;
  min-width: 140px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-item-res {
  flex: 2;
  min-width: 320px;
}

.resolution-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-select.resolution-preset {
  flex: 1;
  width: auto;
  min-width: 100px;
}

.form-input.res-input {
  width: 80px;
  flex: none;
}

.res-sep {
  color: #666;
  font-size: 14px;
}

.form-select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  box-sizing: border-box;
  background: white;
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

.file-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.path-input {
  flex: 1;
  min-width: 0;
}

.file-select-btn {
  background: #5a86ff;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}

.file-select-btn:hover {
  background: #4a76e9;
}

.command-preview {
  background: #f8f9fa;
  color: #333;
  border: 1px solid #ddd;
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
  padding: 12px;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
}

.copy-cmd-btn {
  background: transparent;
  border: 1px solid #5a86ff;
  color: #5a86ff;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.copy-cmd-btn:hover {
  background: #5a86ff;
  color: white;
}

.convert-btn {
  --btn-fill: #2f5fd6;
  --btn-base: #5a86ff;
  width: 100%;
  padding: 12px 24px;
  background: var(--btn-base);
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

.result-item {
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

.result-name {
  font-size: 13px;
  font-weight: 500;
  color: #333;
}

.result-path {
  padding: 8px 12px;
  font-size: 12px;
  color: #666;
  word-break: break-all;
}

.result-actions {
  display: flex;
  gap: 8px;
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

.error-label {
  color: #ff4d4f;
}

.error-panel {
  background: #fff1f0;
  border: 1px solid #ffccc7;
  border-radius: 6px;
  padding: 12px;
  max-height: 300px;
  overflow-y: auto;
}

.error-panel.collapsed {
  max-height: 60px;
  overflow: hidden;
}

.error-panel pre {
  margin: 0;
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
  color: #a8071a;
  white-space: pre-wrap;
  word-break: break-all;
}

.toggle-error-btn {
  margin-top: 6px;
  background: transparent;
  border: 1px solid #d9d9d9;
  color: #666;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.toggle-error-btn:hover {
  border-color: #5a86ff;
  color: #5a86ff;
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

html.dark .setting-label {
  color: #999;
}

html.dark .res-sep {
  color: #999;
}

html.dark .ffmpeg-warning {
  background: #3a3210;
  border-color: #7a6520;
  color: #e6d494;
}

html.dark .ffmpeg-warning .warning-desc a {
  color: #6699ff;
}

html.dark .clear-all-btn {
  border-color: #ff7875;
  color: #ff7875;
}

html.dark .clear-all-btn:hover {
  background: #ff7875;
  color: white;
}

html.dark .add-video-btn {
  background: #6699ff;
  color: white;
}

html.dark .add-video-btn:hover:not(:disabled) {
  background: #5588ee;
}

html.dark .video-info-container {
  border-color: #3a3f55;
  background: #252a3a;
}

html.dark .video-meta .file-name {
  color: #e0e0e0;
}

html.dark .video-meta .file-size {
  color: #999;
}

html.dark .video-meta .file-path {
  color: #777f95;
}

html.dark .empty-preview {
  color: #666;
  background: #252a3a;
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

html.dark .form-input {
  background: #252a3a;
  border-color: #3a3f55;
  color: #e0e0e0;
}

html.dark .form-input:focus {
  border-color: #6699ff;
  background: #2f354a;
}

html.dark .path-input {
  background: #252a3a;
  border-color: #3a3f55;
  color: #e0e0e0;
}

html.dark .path-input:focus {
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

html.dark .command-preview {
  background: #252a3a;
  color: #e0e0e0;
  border-color: #3a3f55;
}

html.dark .copy-cmd-btn {
  border-color: #6699ff;
  color: #6699ff;
}

html.dark .copy-cmd-btn:hover {
  background: #6699ff;
  color: white;
}

html.dark .convert-btn {
  --btn-fill: #3a6cd9;
  --btn-base: #6699ff;
  background: var(--btn-base);
  color: white;
}

html.dark .convert-btn:hover:not(:disabled) {
  background: #5588ee;
}

html.dark .result-item {
  border-color: #3a3f55;
  background: #1a1d2b;
}

html.dark .result-header {
  background: #252a3a;
  border-bottom-color: #3a3f55;
}

html.dark .result-name {
  color: #e0e0e0;
}

html.dark .result-path {
  color: #999;
}

html.dark .download-result-btn {
  border-color: #6699ff;
  color: #6699ff;
}

html.dark .download-result-btn:hover {
  background: #6699ff;
  color: white;
}

html.dark .error-panel {
  background: #2e1a1a;
  border-color: #ff7875;
}

html.dark .error-panel pre {
  color: #ff9c9a;
}

html.dark .toggle-error-btn {
  border-color: #3a3f55;
  color: #999;
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
