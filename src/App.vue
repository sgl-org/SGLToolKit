<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

// 本地图标
import iconFont from './icons/font.png'
import iconImage from './icons/image.png'
import iconGif from './icons/gif.png'
import iconAbout from './icons/about.png'

const router = useRouter()
const activeMenu = ref('/font-convert')
const isDark = ref(true)
const shakeIndex = ref(null)

const menus = ref([
  { path: '/font-convert', icon: iconFont, name: '字体转换' },
  { path: '/image-convert', icon: iconImage, name: '图片转换' },
  { path: '/gif-to-image', icon: iconGif, name: 'GIF转换' },
  { path: '/about-info', icon: iconAbout, name: '关于' },
])

// =============================================
// 🔥 核心：打开时自动加载上次保存的主题
// =============================================
onMounted(() => {
  const lastTheme = localStorage.getItem('isDark')
  if (lastTheme !== null) {
    isDark.value = lastTheme === 'true'
  }
  document.documentElement.classList.toggle('dark', isDark.value)
})

// 菜单点击
function switchMenu(path, index) {
  activeMenu.value = path
  router.push(path)
  shakeIndex.value = index
  setTimeout(() => (shakeIndex.value = null), 500)
}

// =============================================
// 🔥 主题切换 + 自动保存到本地（永久记忆）
// =============================================
function toggleTheme() {
  document.documentElement.classList.toggle('dark', isDark.value)
  // 每次切换都保存，下次打开自动用这个值
  localStorage.setItem('isDark', isDark.value)
}
</script>

<template>
  <div class="layout" :class="{ dark: isDark }">
    <div class="sidebar">
      <div class="menu-list">
        <div
          v-for="(item, index) in menus"
          :key="item.path"
          class="menu-btn"
          :class="{ active: activeMenu === item.path, shake: shakeIndex === index }"
          @click="switchMenu(item.path, index)"
        >
          <img class="icon" :src="item.icon" alt="" />
          <div class="text">{{ item.name }}</div>
        </div>
      </div>
      <div class="sidebar-bottom">
        <div class="theme-control">
          <label class="android-switch">
            <input type="checkbox" v-model="isDark" @change="toggleTheme" />
            <span class="track"></span>
            <span class="thumb"></span>
          </label>
        </div>
        <div class="sidebar-copyright">
          <div>Copyright © 2026</div>
          <div>SGL Team</div>
        </div>
      </div>
    </div>

    <div class="content">

      <router-view />
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #f8f9fa;
  transition: background 0.3s ease;
  position: relative;
}
.layout.dark {
  background: #101118;
}

.sidebar {
  width: 130px;
  background: #fff;
  box-shadow: 0 0 18px rgba(0,0,0,0.05);
  padding: 15px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  transition: background 0.3s;
}
.layout.dark .sidebar {
  background: #1a1d2b;
}

.menu-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.menu-btn {
  width: 80px;
  height: 70px;
  border-radius: 10px;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.25s ease;
  color: #222;
  border: 1px solid rgba(0,0,0,0.12);
  padding: 2px;
}
.layout.dark .menu-btn {
  background: #1a1d2b;
  color: #eee;
  border: 1px solid rgba(255,255,255,0.1);
}

.menu-btn.active {
  background: rgba(90, 134, 255, 0.85);
  color: #fff;
  box-shadow: 0 10px 25px rgba(90, 134, 255, 0.35);
  transform: translateY(-4px) scale(1.03);
}
.layout.dark .menu-btn.active {
  background: rgba(102, 153, 255, 0.8);
  color: #ffffff;
  box-shadow: 0 10px 30px rgba(102, 153, 255, 0.4);
  transform: translateY(-4px) scale(1.03);
}

.menu-btn:hover:not(.active) {
  background: #f4f7ff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
.layout.dark .menu-btn:hover:not(.active) {
  background: #252a3a;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

.shake {
  animation: shake 0.5s ease-in-out;
}
@keyframes shake {
  0%  { transform: rotate(0deg); }
  25% { transform: rotate(5deg); }
  50% { transform: rotate(-5deg); }
  75% { transform: rotate(3deg); }
  100%{ transform: rotate(0deg); }
}

.icon {
  width: 34px;
  height: 34px;
  object-fit: contain;
  margin-bottom: 3px;
}
.text {
  font-size: 12.5px;
  font-weight: 500;
}

.content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  transition: all 0.3s ease;
  position: relative;
}
.layout.dark .content {
  background: #101118;
  color: #eee;
}

.sidebar-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.theme-control {
  margin-bottom: 0;
}

.sidebar-copyright {
  font-size: 11px;
  color: #888;
  text-align: center;
  margin-bottom: 0;
  transition: color 0.3s ease;
  line-height: 1.3;
}
.layout.dark .sidebar-copyright {
  color: #666;
}
.android-switch {
  display: inline-block;
  position: relative;
  width: 48px;
  height: 24px;
  cursor: pointer;
  user-select: none;
}
.android-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.track {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  border-radius: 999px;
  transition: background-color 0.3s ease;
}
input:checked + .track {
  background-color: #5a86ff;
}
.thumb {
  position: absolute;
  left: 2px;
  top: 2px;
  width: 20px;
  height: 20px;
  background-color: white;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
input:checked ~ .thumb {
  transform: translateX(24px);
}

:deep(.page-container) {
  background: transparent !important;
  padding: 0 !important;
  box-shadow: none !important;
  margin-top: 40px;
}
</style>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  font-family: "SimHei", sans-serif !important;
}
body {
  margin: 0;
  padding: 0;
  overflow: hidden;
}
</style>