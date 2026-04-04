<template>
  <div class="page-container">
    <h2>字体转换</h2>
    <p>功能区域</p>
    <button @click="runFontConvert">点击执行转换</button>

    <div v-if="showModal" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>{{ modalTitle }}</h3>
          <button class="close-btn" @click="closeModal">×</button>
        </div>
        <div class="modal-body">
          <pre class="error-text">{{ modalContent }}</pre>
        </div>
        <div class="modal-footer">
          <button class="copy-btn" @click="copyError">复制错误信息</button>
          <button class="confirm-btn" @click="closeModal">确定</button>
        </div>
      </div>
    </div>

    <div v-if="showCopyTip" class="copy-tip">复制成功！</div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { resolve, join } from '@tauri-apps/api/path';

// 弹窗状态
const showModal = ref(false);
const modalTitle = ref('');
const modalContent = ref('');
const showCopyTip = ref(false);

// 关闭弹窗
function closeModal() {
  showModal.value = false;
  modalTitle.value = '';
  modalContent.value = '';
}

// 复制错误信息
async function copyError() {
  try {
    await navigator.clipboard.writeText(modalContent.value);
    showCopyTip.value = true;
    setTimeout(() => showCopyTip.value = false, 1000);
  } catch (err) {
    console.error('复制失败：', err);
  }
}

// ✅ 正确：读取 public/fonttool 文件夹（开发 + 发布通用）
async function runFontConvert() {
  try {
    console.log("开始执行转换...");

    const { resolveResource, resolve, cwd } = await import('@tauri-apps/api/path');
    let jsPath;
    let fontPath;
    let devMode = false;

    try {
      jsPath = await resolveResource('fonttool/sgl_font_conv.js');
      fontPath = 'fonttool/YaHei.ttf';
    } catch (e) {
      devMode = true;
      const currentDir = await cwd();
      jsPath = await resolve(currentDir, 'src-tauri/fonttool/sgl_font_conv.js');
      fontPath = await resolve(currentDir, 'src-tauri/fonttool/YaHei.ttf');
    }

    console.log("JS路径:", jsPath);
    console.log("字体路径:", fontPath);
    console.log("开发模式:", devMode);

    const args = [
      jsPath,
      "--font", fontPath,
      "--size", "24",
      "--bpp", "4",
      "-r", "0x20-0x7F"
    ];
    
    console.log("传递给Rust的参数:", args);

    const result = await invoke("run_font_convert", { args });

    console.log("✅ 成功：", result);
    modalTitle.value = '执行成功';
    modalContent.value = result;
    showModal.value = true;
  } catch (err) {
    console.error("❌ 错误：", err);
    modalTitle.value = '执行失败';
    modalContent.value = String(err);
    showModal.value = true;
  }
}
</script>

<style scoped>
.page-container {
  padding: 30px;
  position: relative;
}

button {
  margin-top: 20px;
  padding: 10px 20px;
  background: #5a86ff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
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

.error-text {
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
  margin: 0;
}
.copy-btn:hover {
  background: #218838;
}

.confirm-btn {
  background: #5a86ff;
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