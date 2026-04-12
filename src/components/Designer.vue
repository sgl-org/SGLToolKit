<template>
  <div class="designer-container">
    <aside class="panel">
      <h2>控件库 (SGL 全量)</h2>
      <input v-model="searchText" class="search" placeholder="搜索控件类型...">
      <div class="palette">
        <div 
          v-for="[type, def] in filteredWidgets" 
          :key="type"
          class="palette-item"
          :title="`${type} / ${def.create}`"
          @click="addWidget(type)"
        >
          {{ def.label }}
        </div>
      </div>
      <div class="status">点击控件添加，拖拽移动，右下角拖拽缩放</div>
    </aside>

    <main class="workspace">
      <div class="stage-head">
        <div>SGL 可视化 UI 编辑器</div>
        <div style="display: flex; gap: 10px; align-items: center;">

          <div>{{ screenInfo }}</div>
        </div>
      </div>

      <div id="stageWrap" class="stage-wrap" ref="stageWrap">
        <div id="stageViewport" class="stage-viewport" ref="stageViewport">
          <div id="stage" class="stage" ref="stage" @mousedown="handleStageClick"></div>
        </div>
      </div>

      <section class="code-box">
        <div class="toolbar" style="padding:8px 10px; border-bottom:1px solid var(--line);">
          <button id="genBtn" class="primary" @click="generateCode">生成 C 代码</button>
          <button id="copyBtn" @click="copyCode">复制代码</button>
          <button id="exportJsonBtn" @click="exportJson">导出 JSON</button>
          <button id="importJsonBtn" @click="importJson">导入 JSON</button>
          <input id="importFile" type="file" accept="application/json" style="display:none;" ref="importFile" @change="handleImportFile">
          <input id="importFontFile" type="file" accept=".c" multiple style="display:none;" ref="importFontFile" @change="handleImportFontFile">
        </div>
        <pre id="codeOut">{{ codeOutput }}</pre>
      </section>
    </main>

    <aside class="panel right">
      <div id="projectPanel">
        <h2>画布/屏幕</h2>
        <div class="field">
          <label>当前画布</label>
          <select v-model="state.currentScreenId" @change="render">
            <option v-for="screen in state.screens" :key="screen.id" :value="screen.id">{{ screen.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>画布名</label>
          <input type="text" v-model="currentScreen.name" @change="render">
        </div>
        <div class="field">
          <label>画布宽</label>
          <input type="number" min="1" max="8192" v-model="currentScreen.width" @change="render">
        </div>
        <div class="field">
          <label>画布高</label>
          <input type="number" min="1" max="8192" v-model="currentScreen.height" @change="render">
        </div>
        <div class="field">
          <label>背景色</label>
          <input type="color" v-model="currentScreen.bgColor" @change="render">
        </div>

        <h2>字体资源</h2>
        <div class="tree" style="max-height: 120px;">
          <div 
            v-for="font in state.fonts" 
            :key="font.id"
            class="tree-item"
          >
            {{ font.displayName }} | SGL: {{ font.sglName || "NULL" }}{{ font.sampleText ? ` | 示例: ${font.sampleText}` : "" }}
          </div>
        </div>

        <div class="field">
          <label>手动SGL字体名</label>
          <input type="text" v-model="manualFontName">
        </div>
        <div class="toolbar">
          <button id="importFontBtn" @click="importFontFile.click()">导入字体C文件</button>
          <button id="addManualFontBtn" @click="addManualFont">添加字体名</button>
        </div>

        <div class="toolbar">
          <button id="addScreenBtn" @click="addScreen">新增画布</button>
          <button id="delScreenBtn" @click="deleteCurrentScreen">删除当前画布</button>
        </div>
      </div>

      <h2>对象列表</h2>
      <div id="tree" class="tree">
        <div 
          v-for="widget in widgetsInCurrent" 
          :key="widget.id"
          class="tree-item"
          :class="{ active: widget.id === state.selectedId }"
          :style="{ paddingLeft: `${6 + getDepth(widget.id) * 16}px` }"
          @click="selectWidget(widget.id)"
        >
          {{ widget.name || widget.type }} ({{ widget.type }})
        </div>
      </div>

      <div class="toolbar">
        <button id="dupBtn" @click="duplicateWidget">复制对象</button>
        <button id="delBtn" @click="deleteWidget">删除对象</button>
        <button id="clearBtn" @click="clearWidgets">清空画布</button>
      </div>

      <h2>属性编辑</h2>
      <div id="props" v-if="selectedWidget">
        <div class="field">
          <label>名称</label>
          <input type="text" v-model="selectedWidget.name" @change="render">
        </div>
        <div class="field">
          <label>x</label>
          <input type="number" min="-8192" max="8192" v-model="selectedWidget.x" @change="render">
        </div>
        <div class="field">
          <label>y</label>
          <input type="number" min="-8192" max="8192" v-model="selectedWidget.y" @change="render">
        </div>
        <div class="field">
          <label>width</label>
          <input type="number" min="1" max="8192" v-model="selectedWidget.w" @change="render">
        </div>
        <div class="field">
          <label>height</label>
          <input type="number" min="1" max="8192" v-model="selectedWidget.h" @change="render">
        </div>

        <div class="field">
          <label>父对象</label>
          <select v-model="parentId" @change="updateParent">
            <option value="">
              [根节点]
            </option>
            <option 
              v-for="widget in widgetsInCurrent.filter(w => w.id !== state.selectedId && !isAncestor(selectedWidget.id, w.id) && PARENT_CAPABLE_TYPES.has(w.type))" 
              :key="widget.id" 
              :value="widget.id"
            >
              {{ widget.name || widget.type }} ({{ widget.type }})
            </option>
          </select>
        </div>

        <div class="field">
          <label>布局模式</label>
          <select v-model="selectedWidget.layout.mode" @change="render">
            <option value="absolute">absolute</option>
            <option value="align_parent">align_parent</option>
          </select>
        </div>

        <div class="field">
          <label>align</label>
          <select v-model="selectedWidget.layout.align" @change="render">
            <option v-for="option in ALIGN_OPTIONS" :key="option" :value="option">{{ option }}</option>
          </select>
        </div>

        <div 
          v-for="field in WIDGET_DEFS[selectedWidget.type].props" 
          :key="field.key"
          class="field"
        >
          <label>{{ propLabelText(field) }}</label>
          <input 
            v-if="field.type !== 'select' && field.type !== 'textarea' && field.type !== 'bool'"
            :type="field.type === 'number' ? 'number' : field.type"
            :min="field.min"
            :max="field.max"
            v-model="selectedWidget.props[field.key]"
            @change="render"
          />
          <textarea 
            v-else-if="field.type === 'textarea'"
            v-model="selectedWidget.props[field.key]"
            @change="render"
          ></textarea>
          <select 
            v-else-if="field.type === 'select'"
            v-model="selectedWidget.props[field.key]"
            @change="render"
          >
            <option 
              v-for="option in field.options" 
              :key="option.value || option"
              :value="option.value || option"
            >
              {{ option.label || option }}
            </option>
          </select>
          <input 
            v-else-if="field.type === 'bool'"
            type="checkbox"
            v-model="selectedWidget.props[field.key]"
            @change="render"
          />

          <div v-if="/fontVar$/i.test(field.key)" class="field">
            <label>{{ field.key }} 字体来源</label>
            <select v-model="selectedWidget.props[`${field.key}Bind`]" @change="updateFontVar(field.key)">
              <option 
                v-for="font in getFontOptions()" 
                :key="font.value"
                :value="font.value"
              >
                {{ font.label }}
              </option>
            </select>
          </div>
        </div>

        <div class="field">
          <label>动画启用</label>
          <input type="checkbox" v-model="selectedWidget.anim.enabled" @change="render">
        </div>
        <div class="field">
          <label>动画目标</label>
          <select v-model="selectedWidget.anim.target" @change="render">
            <option value="x">x</option>
            <option value="y">y</option>
            <option value="width">width</option>
            <option value="height">height</option>
          </select>
        </div>
        <div class="field">
          <label>动画 start</label>
          <input type="number" min="-99999" max="99999" v-model="selectedWidget.anim.start" @change="render">
        </div>
        <div class="field">
          <label>动画 end</label>
          <input type="number" min="-99999" max="99999" v-model="selectedWidget.anim.end" @change="render">
        </div>
        <div class="field">
          <label>动画 delay(ms)</label>
          <input type="number" min="0" max="999999" v-model="selectedWidget.anim.delay" @change="render">
        </div>
        <div class="field">
          <label>动画 duration(ms)</label>
          <input type="number" min="1" max="999999" v-model="selectedWidget.anim.duration" @change="render">
        </div>
        <div class="field">
          <label>动画 repeat (-1循环)</label>
          <input type="number" min="-1" max="999999" v-model="selectedWidget.anim.repeat" @change="render">
        </div>
        <div class="field">
          <label>动画 path</label>
          <select v-model="selectedWidget.anim.path" @change="render">
            <option v-for="path in ANIM_PATHS" :key="path" :value="path">{{ path }}</option>
          </select>
        </div>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';

// 响应式数据
const searchText = ref('');
const codeOutput = ref('// 点击“生成 C 代码”后显示结果');
const manualFontName = ref('');
const stage = ref(null);
const stageWrap = ref(null);
const stageViewport = ref(null);
const importFile = ref(null);
const importFontFile = ref(null);

// 状态管理
const state = ref({
  screens: [{ id: "screen_1", name: "screen_main", width: 1280, height: 720, bgColor: "#0b1220" }],
  currentScreenId: "screen_1",
  widgets: [
    {
      id: "widget_1",
      type: "rectangle",
      screenId: "screen_1",
      name: "矩形 Rectangle_1",
      x: 100,
      y: 100,
      w: 120,
      h: 80,
      parentId: null,
      layout: { mode: "absolute", align: "SGL_ALIGN_CENTER" },
      props: {
        bgColor: "#334155",
        alpha: 255,
        radius: 0,
        borderWidth: 1,
        borderColor: "#94a3b8"
      },
      anim: { enabled: false, target: "x", start: 0, end: 100, delay: 0, duration: 1000, repeat: 0, path: "sgl_anim_path_linear" }
    }
  ],
  fonts: [{ id: "__sys", displayName: "系统默认字体", family: "\"Segoe UI\", \"Microsoft YaHei\", sans-serif", sglName: "NULL", source: "system" }],
  selectedId: "widget_1",
  drag: null,
  seq: 2
});

// 计算属性
const filteredWidgets = computed(() => {
  const search = searchText.value.trim().toLowerCase();
  const result = Object.entries(WIDGET_DEFS).filter(([type, def]) => {
    if (!search) return true;
    const alias = (TYPE_ALIASES[type] || "").toLowerCase();
    const create = (def.create || "").toLowerCase();
    return type.includes(search) || def.label.toLowerCase().includes(search) || alias.includes(search) || create.includes(search);
  });
  console.log('Filtered widgets:', result.length);
  return result;
});

const currentScreen = computed(() => {
  return state.value.screens.find((s) => s.id === state.value.currentScreenId) || state.value.screens[0];
});

const widgetsInCurrent = computed(() => {
  const result = state.value.widgets.filter((w) => w.screenId === state.value.currentScreenId);
  console.log('Filtered widgets:', result);
  return result;
});

const selectedWidget = computed(() => {
  return state.value.widgets.find((w) => w.id === state.value.selectedId) || null;
});

const screenInfo = computed(() => {
  const s = currentScreen.value;
  return `${s.width} x ${s.height}`;
});

const parentId = computed({
  get: () => {
    return selectedWidget.value?.parentId || '';
  },
  set: (value) => {
    if (selectedWidget.value) {
      selectedWidget.value.parentId = value || null;
      render();
    }
  }
});

// 常量定义
const DEFAULT_STAGE = { width: 1280, height: 720 };

const ALIGN_OPTIONS = [
  "SGL_ALIGN_CENTER", "SGL_ALIGN_TOP_MID", "SGL_ALIGN_TOP_LEFT", "SGL_ALIGN_TOP_RIGHT",
  "SGL_ALIGN_BOT_MID", "SGL_ALIGN_BOT_LEFT", "SGL_ALIGN_BOT_RIGHT", "SGL_ALIGN_LEFT_MID", "SGL_ALIGN_RIGHT_MID",
  "SGL_ALIGN_VERT_LEFT", "SGL_ALIGN_VERT_RIGHT", "SGL_ALIGN_VERT_MID", "SGL_ALIGN_HORIZ_TOP", "SGL_ALIGN_HORIZ_BOT", "SGL_ALIGN_HORIZ_MID"
];
const ANIM_PATHS = ["sgl_anim_path_linear", "sgl_anim_path_ease_in_out", "sgl_anim_path_ease_in", "sgl_anim_path_ease_out", "sgl_anim_path_overshoot"];
const PARENT_CAPABLE_TYPES = new Set(["box", "rectangle", "canvas"]);
const TYPE_ALIASES = {
  rectangle: "矩形 rect",
  label: "标签 文本",
  box: "容器",
  win: "窗口",
  button: "按钮",
  textline: "多行文本",
  textbox: "文本框"
};

const PROP_LABEL_CN = {
  name: "名称",
  x: "X 坐标",
  y: "Y 坐标",
  w: "宽度",
  h: "高度",
  parentId: "父对象",
  layoutMode: "布局模式",
  align: "对齐方式",

  text: "文本",
  title: "标题",
  message: "消息内容",
  leftText: "左按钮文本",
  rightText: "右按钮文本",
  symbol: "符号",
  options: "选项",
  selectedIndex: "选中索引",
  value: "数值",
  status: "状态",

  color: "颜色",
  bodyColor: "主体颜色",
  bgColor: "背景色",
  fillColor: "填充色",
  trackColor: "轨道色",
  borderColor: "边框色",
  textColor: "文字颜色",
  titleColor: "标题颜色",
  msgColor: "消息文字颜色",
  leftBtnTextColor: "左按钮文字颜色",
  leftBtnColor: "左按钮颜色",
  rightBtnTextColor: "右按钮文字颜色",
  rightBtnColor: "右按钮颜色",
  titleTextColor: "标题文字颜色",
  titleBgColor: "标题背景色",
  mode: "模式",
  knobColor: "滑块颜色",
  onColor: "亮灯颜色",
  offColor: "灭灯颜色",
  gridColor: "网格颜色",
  scrollbarColor: "滚动条颜色",

  alpha: "透明度",
  fillAlpha: "填充透明度",
  trackAlpha: "轨道透明度",
  bgAlpha: "背景透明度",
  borderWidth: "边框宽度",
  lineWidth: "线宽",
  lineMargin: "行间距",
  edgeMargin: "边距",
  radius: "圆角/半径",
  radiusIn: "内半径",
  radiusOut: "外半径",
  startAngle: "起始角度",
  endAngle: "结束角度",
  innerRadiusRate: "内半径比例",

  direct: "方向",
  orientation: "朝向",
  thickness: "厚度",
  dashed: "虚线",
  dashLength: "虚线长度",
  gapLength: "间隔长度",
  hidden: "隐藏",

  channelCount: "通道数量",
  autoScale: "自动缩放",
  showYLabels: "显示Y轴标签",
  showVScrollbar: "显示竖滚动条",
  showHScrollbar: "显示横滚动条",

  painterCb: "绘制回调",
  imgVar: "图片变量",
  iconVar: "图标变量",
  pixmapVar: "图集变量",
  fontVar: "字体变量",
  textFontVar: "文字字体变量",
  titleFontVar: "标题字体变量",
  readOpsVar: "读操作变量",
  bindVar: "绑定对象变量",
  textareaBuffer: "文本缓冲变量",
  textareaBufferLen: "文本缓冲长度",
  btnPixmapVar: "按钮图变量",
  channelDataBufferVar: "通道数据缓冲",
  channelDataLen: "通道数据长度",
  maxDisplayPoints: "最大显示点数",
  channelWaveColor: "通道波形颜色",
  rangeMin: "范围最小值",
  rangeMax: "范围最大值",
  yLabelFontVar: "Y标签字体变量",
  yLabelColor: "Y标签颜色",
  gridLineStyle: "网格线样式",
  textAlign: "文本对齐",
  titleTextAlign: "标题文本对齐",
  closeBtnColor: "关闭按钮颜色",
  offsetX: "文字偏移X",
  offsetY: "文字偏移Y",
  msgXOffset: "消息X偏移",
  msgYOffset: "消息Y偏移",
  msgLineMargin: "消息行间距",
  textRotation: "文字旋转",
  bgTransparent: "背景透明",
  fillGap: "填充间隙",
  fillRadius: "填充圆角",
  fillWidth: "填充宽度",
  elasticUp: "上弹性",
  elasticDown: "下弹性",
  elasticLeft: "左弹性",
  elasticRight: "右弹性",
  knobRadius: "旋钮圆角",
  knobMargin: "旋钮边距",
  btnAlpha: "按钮透明度",
  btnRadius: "按钮圆角",
  pixmapNum: "图集数量",
  pixmapIndex: "图集索引",
  vertices: "顶点坐标",

  seriesCount: "序列数量",
  seriesData: "序列数据(单组)",
  seriesDataJson: "序列数据JSON(多组)",
  xLabels: "X轴标签",
  seriesLabel: "序列名称",
  seriesMode: "序列模式",
  seriesLineColor: "线颜色",
  seriesLineAlpha: "线透明度",
  seriesLineWidth: "线宽",
  seriesPoints: "显示点",
  seriesPointShape: "点形状",
  seriesPointRadius: "点半径",
  seriesFill: "区域填充",
  seriesFillColor: "填充颜色",
  seriesFillAlpha: "填充透明度",
  seriesColor: "序列颜色",
  seriesAlpha: "序列透明度",

  axisYMin: "Y轴最小值",
  axisYMax: "Y轴最大值",
  axisXMin: "X轴最小值",
  axisXMax: "X轴最大值",
  axisXAuto: "X轴自动范围",
  axisXStep: "X轴刻度步长",
  axisXDivisions: "X轴自动分段",
  axisXGrid: "X轴网格",
  axisXDashed: "X轴虚线网格",
  axisXGridColor: "X轴网格颜色",
  axisXGridAlpha: "X轴网格透明度",
  axisXLabels: "X轴标签",
  axisXLabelColor: "X轴标签颜色",
  axisXLabelAlpha: "X轴标签透明度",
  axisXLabelFontVar: "X轴标签字体变量",
  axisXTicks: "X轴刻度线",
  axisYAuto: "Y轴自动范围",
  axisYStep: "Y轴刻度步长",
  axisYDivisions: "Y轴自动分段",
  axisYGrid: "Y轴网格",
  axisYDashed: "Y轴虚线网格",
  axisYGridColor: "Y轴网格颜色",
  axisYGridAlpha: "Y轴网格透明度",
  axisYLabels: "Y轴标签",
  axisYLabelColor: "Y轴标签颜色",
  axisYLabelAlpha: "Y轴标签透明度",
  axisYLabelFontVar: "Y轴标签字体变量",
  axisYTicks: "Y轴刻度线",

  plotLeft: "绘图区左偏移",
  plotTop: "绘图区上偏移",
  plotWidth: "绘图区宽度",
  plotHeight: "绘图区高度",
  barGap: "柱间距",
  categoryGap: "类目间距",

  slices: "饼图切片(JSON)",
  smooth: "平滑边缘",
  legend: "显示图例",
  legendPos: "图例位置",
  legendDir: "图例排列方向",
  legendAreaSize: "图例区域大小",
  legendTextColor: "图例文字颜色",
  legendAlpha: "图例透明度",
  legendBoxSize: "图例色块大小",
  legendPadding: "图例内边距",
  legendItemGap: "图例项间距",
  legendBg: "图例背景",
  legendBgColor: "图例背景色",
  legendBorderColor: "图例边框色",

  openAnim: "开启动画",
  openAnimDir: "开场动画方向",
  openAnimDuration: "开场动画时长",
  openAnimPath: "开场动画曲线",
  seriesXData: "序列X数据",
  resetPlotArea: "重置绘图区",
  legendFontVar: "图例字体变量",
  layoutPadLeft: "布局左内边距",
  layoutPadTop: "布局上内边距",
  layoutPadRight: "布局右内边距",
  layoutPadBottom: "布局下内边距",
  animEnabled: "动画启用",
  animTarget: "动画目标",
  animStart: "动画起始值",
  animEnd: "动画结束值",
  animDelay: "动画延迟(ms)",
  animDuration: "动画时长(ms)",
  animRepeat: "动画重复次数",
  animPath: "动画曲线",

  extraSetters: "扩展Setter(每行一条)"
};

const WIDGET_DEFS = {
  line: {
    label: "Line", create: "sgl_line_create", preview: "line", defaultSize: [140, 2],
    props: [
      { key: "color", type: "color", default: "#55e6ff", setter: "sgl_line_set_color" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_line_set_alpha" },
      { key: "lineWidth", type: "number", default: 1, min: 1, max: 20, setter: "sgl_line_set_width" },
      { key: "dashed", type: "bool", default: false, setter: "sgl_line_set_dashed" },
      { key: "dashLength", type: "number", default: 8, min: 1, max: 200 },
      { key: "gapLength", type: "number", default: 4, min: 1, max: 200 }
    ]
  },
  rectangle: {
    label: "矩形 Rectangle", create: "sgl_rect_create", preview: "rect", defaultSize: [120, 80],
    props: [
      { key: "bgColor", type: "color", default: "#334155", setter: "sgl_rect_set_color" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_rect_set_alpha" },
      { key: "radius", type: "number", default: 0, min: 0, max: 255, setter: "sgl_rect_set_radius" },
      { key: "borderWidth", type: "number", default: 1, min: 0, max: 50, setter: "sgl_rect_set_border_width" },
      { key: "borderColor", type: "color", default: "#94a3b8", setter: "sgl_rect_set_border_color" }
    ]
  },
  circle: {
    label: "Circle", create: "sgl_circle_create", preview: "circle", defaultSize: [96, 96],
    props: [
      { key: "color", type: "color", default: "#16a34a", setter: "sgl_circle_set_color" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_circle_set_alpha" },
      { key: "radius", type: "number", default: 48, min: 0, max: 800, setter: "sgl_circle_set_radius" },
      { key: "borderWidth", type: "number", default: 1, min: 0, max: 50, setter: "sgl_circle_set_border_width" },
      { key: "borderColor", type: "color", default: "#dcfce7", setter: "sgl_circle_set_border_color" },
      { key: "pixmapVar", type: "text", default: "NULL" }
    ]
  },
  ring: {
    label: "Ring", create: "sgl_ring_create", preview: "ring", defaultSize: [120, 120],
    props: [
      { key: "color", type: "color", default: "#f59e0b", setter: "sgl_ring_set_color" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_ring_set_alpha" },
      { key: "radiusIn", type: "number", default: 30, min: 0, max: 800 },
      { key: "radiusOut", type: "number", default: 55, min: 0, max: 800 }
    ]
  },
  arc: {
    label: "Arc", create: "sgl_arc_create", preview: "arc", defaultSize: [140, 140],
    props: [
      { key: "color", type: "color", default: "#22d3ee", setter: "sgl_arc_set_color" },
      { key: "bgColor", type: "color", default: "#1f2937", setter: "sgl_arc_set_bg_color" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_arc_set_alpha" },
      { key: "radiusIn", type: "number", default: 38, min: 0, max: 800 },
      { key: "radiusOut", type: "number", default: 58, min: 0, max: 800 },
      { key: "mode", type: "number", default: 0, min: 0, max: 10, setter: "sgl_arc_set_mode" },
      { key: "startAngle", type: "number", default: 0, min: -3600, max: 3600, setter: "sgl_arc_set_start_angle" },
      { key: "endAngle", type: "number", default: 270, min: -3600, max: 3600, setter: "sgl_arc_set_end_angle" }
    ]
  },
  button: {
    label: "Button", create: "sgl_button_create", preview: "button", defaultSize: [120, 48],
    props: [
      { key: "text", type: "text", default: "Button", setter: "sgl_button_set_text" },
      { key: "textColor", type: "color", default: "#ffffff", setter: "sgl_button_set_text_color" },
      { key: "textAlign", type: "select", options: ["SGL_ALIGN_CENTER", "SGL_ALIGN_LEFT_MID", "SGL_ALIGN_RIGHT_MID"], default: "SGL_ALIGN_CENTER", setter: "sgl_button_set_text_align" },
      { key: "color", type: "color", default: "#2563eb", setter: "sgl_button_set_color" },
      { key: "borderColor", type: "color", default: "#1e40af", setter: "sgl_button_set_border_color" },
      { key: "borderWidth", type: "number", default: 1, min: 0, max: 50, setter: "sgl_button_set_border_width" },
      { key: "radius", type: "number", default: 10, min: 0, max: 255, setter: "sgl_button_set_radius" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_button_set_alpha" },
      { key: "fontVar", type: "text", default: "NULL" },
      { key: "pixmapVar", type: "text", default: "NULL" }
    ]
  },
  slider: {
    label: "Slider", create: "sgl_slider_create", preview: "slider", defaultSize: [220, 28],
    props: [
      { key: "value", type: "number", default: 35, min: 0, max: 100, setter: "sgl_slider_set_value" },
      { key: "fillColor", type: "color", default: "#22c55e", setter: "sgl_slider_set_fill_color" },
      { key: "trackColor", type: "color", default: "#334155", setter: "sgl_slider_set_track_color" },
      { key: "knobColor", type: "color", default: "#e2e8f0", setter: "sgl_slider_set_knob_color" },
      { key: "direct", type: "select", options: ["horizontal", "vertical"], default: "horizontal" },
      { key: "thickness", type: "number", default: 8, min: 4, max: 80, setter: "sgl_slider_set_thickness" },
      { key: "radius", type: "number", default: 8, min: 0, max: 255, setter: "sgl_slider_set_radius" },
      { key: "borderWidth", type: "number", default: 1, min: 0, max: 50, setter: "sgl_slider_set_border_width" }
    ]
  },
  progress: {
    label: "Progress", create: "sgl_progress_create", preview: "progress", defaultSize: [220, 24],
    props: [
      { key: "value", type: "number", default: 40, min: 0, max: 100, setter: "sgl_progress_set_value" },
      { key: "fillColor", type: "color", default: "#0ea5e9", setter: "sgl_progress_set_fill_color" },
      { key: "trackColor", type: "color", default: "#1e293b", setter: "sgl_progress_set_track_color" },
      { key: "fillAlpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_progress_set_fill_alpha" },
      { key: "trackAlpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_progress_set_track_alpha" },
      { key: "fillGap", type: "number", default: 0, min: 0, max: 255, setter: "sgl_progress_set_fill_gap" },
      { key: "fillRadius", type: "number", default: 0, min: 0, max: 255, setter: "sgl_progress_set_fill_radius" },
      { key: "fillWidth", type: "number", default: 0, min: 0, max: 255, setter: "sgl_progress_set_fill_width" },
      { key: "borderColor", type: "color", default: "#64748b", setter: "sgl_progress_set_border_color" },
      { key: "borderWidth", type: "number", default: 1, min: 0, max: 50, setter: "sgl_progress_set_border_width" },
      { key: "radius", type: "number", default: 8, min: 0, max: 255, setter: "sgl_progress_set_radius" },
      { key: "pixmapVar", type: "text", default: "NULL" }
    ]
  },
  label: {
    label: "标签 Label", create: "sgl_label_create", preview: "label", defaultSize: [140, 40],
    props: [
      { key: "text", type: "text", default: "Label", setter: "sgl_label_set_text" },
      { key: "textColor", type: "color", default: "#f8fafc", setter: "sgl_label_set_text_color" },
      { key: "textAlign", type: "select", options: ["SGL_ALIGN_CENTER", "SGL_ALIGN_LEFT_MID", "SGL_ALIGN_RIGHT_MID", "SGL_ALIGN_TOP_LEFT", "SGL_ALIGN_TOP_RIGHT"], default: "SGL_ALIGN_CENTER", setter: "sgl_label_set_text_align" },
      { key: "bgColor", type: "color", default: "#334155", setter: "sgl_label_set_bg_color" },
      { key: "radius", type: "number", default: 4, min: 0, max: 255, setter: "sgl_label_set_radius" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_label_set_alpha" },
      { key: "offsetX", type: "number", default: 0, min: -127, max: 127 },
      { key: "offsetY", type: "number", default: 0, min: -127, max: 127 },
      { key: "textRotation", type: "number", default: 0, min: -3600, max: 3600 },
      { key: "fontVar", type: "text", default: "NULL" }
    ]
  },
  switch: {
    label: "Switch", create: "sgl_switch_create", preview: "switch", defaultSize: [72, 34],
    props: [
      { key: "status", type: "bool", default: true, setter: "sgl_switch_set_status" },
      { key: "color", type: "color", default: "#22c55e", setter: "sgl_switch_set_color" },
      { key: "bgColor", type: "color", default: "#334155", setter: "sgl_switch_set_bg_color" },
      { key: "knobColor", type: "color", default: "#ffffff", setter: "sgl_switch_set_knob_color" },
      { key: "borderColor", type: "color", default: "#94a3b8", setter: "sgl_switch_set_border_color" },
      { key: "borderWidth", type: "number", default: 1, min: 0, max: 50, setter: "sgl_switch_set_border_width" },
      { key: "radius", type: "number", default: 0, min: 0, max: 255, setter: "sgl_switch_set_radius" },
      { key: "knobRadius", type: "number", default: 0, min: 0, max: 255, setter: "sgl_switch_set_knob_radius" },
      { key: "knobMargin", type: "number", default: 0, min: 0, max: 255, setter: "sgl_switch_set_knob_margin" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_switch_set_alpha" }
    ]
  },
  msgbox: {
    label: "MsgBox", create: "sgl_msgbox_create", preview: "msgbox", defaultSize: [260, 180],
    props: [
      { key: "title", type: "text", default: "Title", setter: "sgl_msgbox_set_title_text" },
      { key: "message", type: "textarea", default: "Message...", setter: "sgl_msgbox_set_msg_text" },
      { key: "leftText", type: "text", default: "OK", setter: "sgl_msgbox_set_left_btn_text" },
      { key: "rightText", type: "text", default: "Cancel", setter: "sgl_msgbox_set_right_btn_text" },
      { key: "color", type: "color", default: "#1e293b", setter: "sgl_msgbox_set_color" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_msgbox_set_alpha" },
      { key: "radius", type: "number", default: 0, min: 0, max: 255, setter: "sgl_msgbox_set_radius" },
      { key: "borderWidth", type: "number", default: 0, min: 0, max: 255, setter: "sgl_msgbox_set_border_width" },
      { key: "borderColor", type: "color", default: "#475569", setter: "sgl_msgbox_set_border_color" },
      { key: "pixmapVar", type: "text", default: "NULL" },
      { key: "fontVar", type: "text", default: "NULL" },
      { key: "titleColor", type: "color", default: "#f8fafc", setter: "sgl_msgbox_set_title_text_color" },
      { key: "msgColor", type: "color", default: "#cbd5e1", setter: "sgl_msgbox_set_msg_text_color" },
      { key: "msgLineMargin", type: "number", default: 0, min: 0, max: 50, setter: "sgl_msgbox_set_msg_line_margin" },
      { key: "leftBtnTextColor", type: "color", default: "#ffffff", setter: "sgl_msgbox_set_left_btn_text_color" },
      { key: "leftBtnColor", type: "color", default: "#2563eb", setter: "sgl_msgbox_set_left_btn_color" },
      { key: "rightBtnTextColor", type: "color", default: "#ffffff", setter: "sgl_msgbox_set_right_btn_text_color" },
      { key: "rightBtnColor", type: "color", default: "#475569", setter: "sgl_msgbox_set_right_btn_color" },
      { key: "titleHeight", type: "number", default: 0, min: 0, max: 255, setter: "sgl_msgbox_set_title_height" },
      { key: "msgXOffset", type: "number", default: 0, min: 0, max: 255, setter: "sgl_msgbox_set_msg_x_offset" },
      { key: "msgYOffset", type: "number", default: 0, min: 0, max: 255, setter: "sgl_msgbox_set_msg_y_offset" },
      { key: "extraSetters", type: "textarea", default: "" }
    ]
  },
  textline: {
    label: "TextLine", create: "sgl_textline_create", preview: "textline", defaultSize: [220, 70],
    props: [
      { key: "text", type: "textarea", default: "line1\nline2", setter: "sgl_textline_set_text" },
      { key: "textColor", type: "color", default: "#e2e8f0", setter: "sgl_textline_set_text_color" },
      { key: "bgColor", type: "color", default: "#1e293b", setter: "sgl_textline_set_bg_color" },
      { key: "bgTransparent", type: "bool", default: false },
      { key: "radius", type: "number", default: 0, min: 0, max: 255, setter: "sgl_textline_set_radius" },
      { key: "lineMargin", type: "number", default: 4, min: 0, max: 50, setter: "sgl_textline_set_line_margin" },
      { key: "edgeMargin", type: "number", default: 5, min: 0, max: 100, setter: "sgl_textline_set_edge_margin" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_textline_set_alpha" },
      { key: "fontVar", type: "text", default: "NULL" },
      { key: "extraSetters", type: "textarea", default: "" }
    ]
  },
  textbox: {
    label: "Textbox", create: "sgl_textbox_create", preview: "textbox", defaultSize: [260, 120],
    props: [
      { key: "text", type: "textarea", default: "textbox content", setter: "sgl_textbox_set_text" },
      { key: "textColor", type: "color", default: "#e2e8f0", setter: "sgl_textbox_set_text_color" },
      { key: "fontVar", type: "text", default: "NULL" },
      { key: "bgColor", type: "color", default: "#0f172a", setter: "sgl_textbox_set_bg_color" },
      { key: "borderColor", type: "color", default: "#475569", setter: "sgl_textbox_set_border_color" },
      { key: "borderWidth", type: "number", default: 1, min: 0, max: 50, setter: "sgl_textbox_set_border_width" },
      { key: "lineMargin", type: "number", default: 4, min: 0, max: 50, setter: "sgl_textbox_set_line_margin" },
      { key: "radius", type: "number", default: 6, min: 0, max: 255, setter: "sgl_textbox_set_radius" },
      { key: "pixmapVar", type: "text", default: "NULL" },
      { key: "extraSetters", type: "textarea", default: "" }
    ]
  },
  checkbox: {
    label: "Checkbox", create: "sgl_checkbox_create", preview: "checkbox", defaultSize: [160, 34],
    props: [
      { key: "text", type: "text", default: "checkbox", setter: "sgl_checkbox_set_text" },
      { key: "status", type: "bool", default: false, setter: "sgl_checkbox_set_status" },
      { key: "color", type: "color", default: "#e2e8f0", setter: "sgl_checkbox_set_color" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_checkbox_set_alpha" },
      { key: "fontVar", type: "text", default: "NULL" },
      { key: "extraSetters", type: "textarea", default: "" }
    ]
  },
  icon: {
    label: "Icon", create: "sgl_icon_create", preview: "icon", defaultSize: [48, 48],
    props: [
      { key: "iconVar", type: "text", default: "NULL" },
      { key: "align", type: "select", options: ["SGL_ALIGN_CENTER", "SGL_ALIGN_TOP_LEFT", "SGL_ALIGN_TOP_RIGHT", "SGL_ALIGN_BOT_LEFT", "SGL_ALIGN_BOT_RIGHT"], default: "SGL_ALIGN_CENTER", setter: "sgl_icon_set_align" },
      { key: "color", type: "color", default: "#38bdf8", setter: "sgl_icon_set_color" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_icon_set_alpha" },
      { key: "extraSetters", type: "textarea", default: "" }
    ]
  },
  numberkbd: {
    label: "NumberKbd", create: "sgl_numberkbd_create", preview: "keyboard", defaultSize: [220, 260],
    props: [
      { key: "textColor", type: "color", default: "#e2e8f0", setter: "sgl_numberkbd_set_text_color" },
      { key: "textFontVar", type: "text", default: "NULL" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_numberkbd_set_alpha" },
      { key: "radius", type: "number", default: 0, min: 0, max: 255, setter: "sgl_numberkbd_set_radius" },
      { key: "borderColor", type: "color", default: "#475569", setter: "sgl_numberkbd_set_border_color" },
      { key: "borderWidth", type: "number", default: 0, min: 0, max: 255, setter: "sgl_numberkbd_set_border_width" },
      { key: "pixmapVar", type: "text", default: "NULL" },
      { key: "btnColor", type: "color", default: "#1e293b", setter: "sgl_numberkbd_set_btn_color" },
      { key: "btnBorderColor", type: "color", default: "#475569", setter: "sgl_numberkbd_set_btn_border_color" },
      { key: "btnBorderWidth", type: "number", default: 1, min: 0, max: 255, setter: "sgl_numberkbd_set_btn_border_width" },
      { key: "btnMargin", type: "number", default: 4, min: 0, max: 255, setter: "sgl_numberkbd_set_btn_margin" },
      { key: "btnRadius", type: "number", default: 0, min: 0, max: 255, setter: "sgl_numberkbd_set_btn_radius" },
      { key: "btnPixmapVar", type: "text", default: "NULL" },
      { key: "extraSetters", type: "textarea", default: "" }
    ]
  },
  keyboard: {
    label: "Keyboard", create: "sgl_keyboard_create", preview: "keyboard", defaultSize: [420, 220],
    props: [
      { key: "textColor", type: "color", default: "#e2e8f0", setter: "sgl_keyboard_set_text_color" },
      { key: "textFontVar", type: "text", default: "NULL" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_keyboard_set_alpha" },
      { key: "color", type: "color", default: "#0f172a", setter: "sgl_keyboard_set_color" },
      { key: "borderColor", type: "color", default: "#475569", setter: "sgl_keyboard_set_border_color" },
      { key: "borderWidth", type: "number", default: 0, min: 0, max: 255, setter: "sgl_keyboard_set_border_width" },
      { key: "pixmapVar", type: "text", default: "NULL" },
      { key: "btnColor", type: "color", default: "#1e293b", setter: "sgl_keyboard_set_btn_color" },
      { key: "btnBorderColor", type: "color", default: "#475569", setter: "sgl_keyboard_set_btn_border_color" },
      { key: "btnBorderWidth", type: "number", default: 1, min: 0, max: 255, setter: "sgl_keyboard_set_btn_border_width" },
      { key: "radius", type: "number", default: 8, min: 0, max: 255, setter: "sgl_keyboard_set_radius" },
      { key: "btnAlpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_keyboard_set_btn_alpha" },
      { key: "btnRadius", type: "number", default: 0, min: 0, max: 255, setter: "sgl_keyboard_set_btn_radius" },
      { key: "btnPixmapVar", type: "text", default: "NULL" },
      { key: "textareaBuffer", type: "text", default: "NULL" },
      { key: "textareaBufferLen", type: "number", default: 0, min: 0, max: 4096 },
      { key: "extraSetters", type: "textarea", default: "" }
    ]
  },
  unzip_image: {
    label: "UnzipImage", create: "sgl_unzip_img_create", preview: "image", defaultSize: [120, 90],
    props: [
      { key: "imgVar", type: "text", default: "NULL" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_unzip_img_set_alpha" },
      { key: "color", type: "color", default: "#ffffff", setter: "sgl_unzip_img_set_color" },
      { key: "align", type: "select", options: ["SGL_ALIGN_CENTER", "SGL_ALIGN_TOP_LEFT", "SGL_ALIGN_TOP_RIGHT", "SGL_ALIGN_BOT_LEFT", "SGL_ALIGN_BOT_RIGHT"], default: "SGL_ALIGN_CENTER" },
      { key: "extraSetters", type: "textarea", default: "" }
    ]
  },
  led: {
    label: "LED", create: "sgl_led_create", preview: "led", defaultSize: [36, 36],
    props: [
      { key: "status", type: "bool", default: true, setter: "sgl_led_set_status" },
      { key: "onColor", type: "color", default: "#22c55e", setter: "sgl_led_set_on_color" },
      { key: "offColor", type: "color", default: "#475569", setter: "sgl_led_set_off_color" },
      { key: "bgColor", type: "color", default: "#0f172a", setter: "sgl_led_set_bg_color" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_led_set_alpha" },
      { key: "radius", type: "number", default: 18, min: 0, max: 255, setter: "sgl_led_set_radius" },
      { key: "extraSetters", type: "textarea", default: "" }
    ]
  },
  "2dball": {
    label: "2DBall", create: "sgl_2dball_create", preview: "ball", defaultSize: [80, 80],
    props: [
      { key: "color", type: "color", default: "#0ea5e9", setter: "sgl_2dball_set_color" },
      { key: "bgColor", type: "color", default: "#1e293b", setter: "sgl_2dball_set_bg_color" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_2dball_set_alpha" },
      { key: "radius", type: "number", default: 40, min: 0, max: 1000, setter: "sgl_2dball_set_radius" },
      { key: "extraSetters", type: "textarea", default: "" }
    ]
  },
  scroll: {
    label: "Scroll", create: "sgl_scroll_create", preview: "scroll", defaultSize: [200, 18],
    props: [
      { key: "value", type: "number", default: 30, min: 0, max: 100, setter: "sgl_scroll_set_value" },
      { key: "bindVar", type: "text", default: "NULL" },
      { key: "radius", type: "number", default: 0, min: 0, max: 255, setter: "sgl_scroll_set_radius" },
      { key: "borderColor", type: "color", default: "#475569", setter: "sgl_scroll_set_border_color" },
      { key: "borderWidth", type: "number", default: 0, min: 0, max: 50, setter: "sgl_scroll_set_border_width" },
      { key: "widthBar", type: "number", default: 8, min: 1, max: 80, setter: "sgl_scroll_set_width" },
      { key: "color", type: "color", default: "#22d3ee", setter: "sgl_scroll_set_color" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_scroll_set_alpha" },
      { key: "direct", type: "select", options: ["horizontal", "vertical"], default: "horizontal" },
      { key: "hidden", type: "bool", default: false, setter: "sgl_scroll_set_hidden" },
      { key: "extraSetters", type: "textarea", default: "" }
    ]
  },
  dropdown: {
    label: "Dropdown", create: "sgl_dropdown_create", preview: "dropdown", defaultSize: [180, 40],
    props: [
      { key: "options", type: "text", default: "A,B,C" },
      { key: "selectedIndex", type: "number", default: 0, min: 0, max: 99, setter: "sgl_dropdown_set_selected_index" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_dropdown_set_alpha" },
      { key: "textColor", type: "color", default: "#e2e8f0", setter: "sgl_dropdown_set_text_color" },
      { key: "textFontVar", type: "text", default: "NULL" },
      { key: "color", type: "color", default: "#1e293b", setter: "sgl_dropdown_set_color" },
      { key: "borderColor", type: "color", default: "#475569", setter: "sgl_dropdown_set_border_color" },
      { key: "borderWidth", type: "number", default: 1, min: 0, max: 50, setter: "sgl_dropdown_set_border_width" },
      { key: "radius", type: "number", default: 6, min: 0, max: 255, setter: "sgl_dropdown_set_radius" },
      { key: "pixmapVar", type: "text", default: "NULL" },
      { key: "extraSetters", type: "textarea", default: "" }
    ]
  },
  scope: {
    label: "Scope", create: "sgl_scope_create", preview: "chart", defaultSize: [320, 180],
    props: [
      { key: "channelCount", type: "number", default: 1, min: 1, max: 4, setter: "sgl_scope_set_channel_count" },
      { key: "channelDataBufferVar", type: "text", default: "NULL" },
      { key: "channelDataLen", type: "number", default: 0, min: 0, max: 65535 },
      { key: "maxDisplayPoints", type: "number", default: 0, min: 0, max: 255 },
      { key: "channelWaveColor", type: "color", default: "#22d3ee" },
      { key: "rangeMin", type: "number", default: 0, min: 0, max: 65535 },
      { key: "rangeMax", type: "number", default: 100, min: 0, max: 65535 },
      { key: "bgColor", type: "color", default: "#0f172a", setter: "sgl_scope_set_bg_color" },
      { key: "gridColor", type: "color", default: "#334155", setter: "sgl_scope_set_grid_color" },
      { key: "borderColor", type: "color", default: "#64748b", setter: "sgl_scope_set_border_color" },
      { key: "lineWidth", type: "number", default: 1, min: 1, max: 20, setter: "sgl_scope_set_line_width" },
      { key: "autoScale", type: "bool", default: true, setter: "sgl_scope_enable_auto_scale" },
      { key: "showYLabels", type: "bool", default: false, setter: "sgl_scope_show_y_labels" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_scope_set_alpha" },
      { key: "yLabelFontVar", type: "text", default: "NULL" },
      { key: "yLabelColor", type: "color", default: "#e2e8f0", setter: "sgl_scope_set_y_label_color" },
      { key: "gridLineStyle", type: "number", default: 0, min: 0, max: 10, setter: "sgl_scope_set_grid_line" },
      { key: "borderWidth", type: "number", default: 1, min: 0, max: 255, setter: "sgl_scope_set_border_width" },
      { key: "extraSetters", type: "textarea", default: "" }
    ]
  },
  ext_img: {
    label: "ExtImg", create: "sgl_ext_img_create", preview: "image", defaultSize: [120, 90],
    props: [
      { key: "pixmapVar", type: "text", default: "NULL" },
      { key: "readOpsVar", type: "text", default: "NULL" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_ext_img_set_alpha" },
      { key: "pixmapNum", type: "number", default: 1, min: 1, max: 255 },
      { key: "pixmapIndex", type: "number", default: 0, min: 0, max: 254 },
      { key: "extraSetters", type: "textarea", default: "" }
    ]
  },
  polygon: {
    label: "Polygon", create: "sgl_polygon_create", preview: "polygon", defaultSize: [120, 100],
    props: [
      { key: "vertices", type: "textarea", default: "0,0;100,0;60,80;0,60" },
      { key: "fillColor", type: "color", default: "#22c55e", setter: "sgl_polygon_set_fill_color" },
      { key: "borderColor", type: "color", default: "#166534", setter: "sgl_polygon_set_border_color" },
      { key: "borderWidth", type: "number", default: 1, min: 0, max: 50, setter: "sgl_polygon_set_border_width" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_polygon_set_alpha" }
    ]
  },
  box: {
    label: "Box", create: "sgl_box_create", preview: "box", defaultSize: [200, 140],
    props: [
      { key: "bgColor", type: "color", default: "#1e293b", setter: "sgl_box_set_color" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_box_set_alpha" },
      { key: "radius", type: "number", default: 0, min: 0, max: 255, setter: "sgl_box_set_radius" },
      { key: "borderWidth", type: "number", default: 0, min: 0, max: 50, setter: "sgl_box_set_border_width" },
      { key: "borderColor", type: "color", default: "#475569", setter: "sgl_box_set_border_color" }
    ]
  },
  win: {
    label: "Win", create: "sgl_win_create", preview: "win", defaultSize: [300, 200],
    props: [
      { key: "title", type: "text", default: "Window", setter: "sgl_win_set_title" },
      { key: "color", type: "color", default: "#1e293b", setter: "sgl_win_set_color" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_win_set_alpha" },
      { key: "radius", type: "number", default: 6, min: 0, max: 255, setter: "sgl_win_set_radius" },
      { key: "borderWidth", type: "number", default: 1, min: 0, max: 50, setter: "sgl_win_set_border_width" },
      { key: "borderColor", type: "color", default: "#64748b", setter: "sgl_win_set_border_color" },
      { key: "titleColor", type: "color", default: "#f8fafc", setter: "sgl_win_set_title_color" },
      { key: "titleBgColor", type: "color", default: "#334155", setter: "sgl_win_set_title_bg_color" },
      { key: "closeBtnColor", type: "color", default: "#ef4444", setter: "sgl_win_set_close_btn_color" },
      { key: "fontVar", type: "text", default: "NULL" }
    ]
  },
  canvas: {
    label: "Canvas", create: "sgl_canvas_create", preview: "canvas", defaultSize: [220, 160],
    props: [
      { key: "bgColor", type: "color", default: "#1e293b", setter: "sgl_canvas_set_bg_color" },
      { key: "painterCb", type: "text", default: "NULL" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_canvas_set_alpha" },
      { key: "borderWidth", type: "number", default: 1, min: 0, max: 50, setter: "sgl_canvas_set_border_width" },
      { key: "borderColor", type: "color", default: "#64748b", setter: "sgl_canvas_set_border_color" },
      { key: "extraSetters", type: "textarea", default: "" }
    ]
  },
  linechart: {
    label: "LineChart", create: "sgl_linechart_create", preview: "chart", defaultSize: [360, 200],
    props: [
      { key: "seriesCount", type: "number", default: 1, min: 1, max: 10, setter: "sgl_linechart_set_series_count" },
      { key: "seriesData", type: "text", default: "1,4,2,8,5,7", setter: "sgl_linechart_set_series_data" },
      { key: "seriesDataJson", type: "textarea", default: "[[1,4,2,8,5,7],[3,6,9,2,4,7]]" },
      { key: "xLabels", type: "text", default: "A,B,C,D,E,F", setter: "sgl_linechart_set_x_labels" },
      { key: "seriesLabel", type: "text", default: "Line 1", setter: "sgl_linechart_set_series_label" },
      { key: "seriesMode", type: "number", default: 0, min: 0, max: 2, setter: "sgl_linechart_set_series_mode" },
      { key: "seriesLineColor", type: "color", default: "#38bdf8", setter: "sgl_linechart_set_series_line_color" },
      { key: "seriesLineAlpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_linechart_set_series_line_alpha" },
      { key: "seriesLineWidth", type: "number", default: 2, min: 1, max: 10, setter: "sgl_linechart_set_series_line_width" },
      { key: "seriesPoints", type: "bool", default: true, setter: "sgl_linechart_set_series_points" },
      { key: "seriesPointShape", type: "number", default: 0, min: 0, max: 5, setter: "sgl_linechart_set_series_point_shape" },
      { key: "seriesPointRadius", type: "number", default: 4, min: 1, max: 10, setter: "sgl_linechart_set_series_point_radius" },
      { key: "seriesFill", type: "bool", default: false, setter: "sgl_linechart_set_series_fill" },
      { key: "seriesFillColor", type: "color", default: "#38bdf8", setter: "sgl_linechart_set_series_fill_color" },
      { key: "seriesFillAlpha", type: "number", default: 128, min: 0, max: 255, setter: "sgl_linechart_set_series_fill_alpha" },
      { key: "axisYMin", type: "number", default: 0, min: -99999, max: 99999, setter: "sgl_linechart_set_axis_y_min" },
      { key: "axisYMax", type: "number", default: 10, min: -99999, max: 99999, setter: "sgl_linechart_set_axis_y_max" },
      { key: "axisXMin", type: "number", default: 0, min: -99999, max: 99999, setter: "sgl_linechart_set_axis_x_min" },
      { key: "axisXMax", type: "number", default: 0, min: -99999, max: 99999, setter: "sgl_linechart_set_axis_x_max" },
      { key: "axisXAuto", type: "bool", default: true, setter: "sgl_linechart_set_axis_x_auto" },
      { key: "axisXStep", type: "number", default: 1, min: 1, max: 100, setter: "sgl_linechart_set_axis_x_step" },
      { key: "axisXDivisions", type: "number", default: 0, min: 0, max: 50, setter: "sgl_linechart_set_axis_x_divisions" },
      { key: "axisXGrid", type: "bool", default: true, setter: "sgl_linechart_set_axis_x_grid" },
      { key: "axisXDashed", type: "bool", default: false, setter: "sgl_linechart_set_axis_x_dashed" },
      { key: "axisXGridColor", type: "color", default: "#334155", setter: "sgl_linechart_set_axis_x_grid_color" },
      { key: "axisXGridAlpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_linechart_set_axis_x_grid_alpha" },
      { key: "axisXLabels", type: "bool", default: true, setter: "sgl_linechart_set_axis_x_labels" },
      { key: "axisXLabelColor", type: "color", default: "#e2e8f0", setter: "sgl_linechart_set_axis_x_label_color" },
      { key: "axisXLabelAlpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_linechart_set_axis_x_label_alpha" },
      { key: "axisXLabelFontVar", type: "text", default: "NULL" },
      { key: "axisXTicks", type: "bool", default: true, setter: "sgl_linechart_set_axis_x_ticks" },
      { key: "axisYAuto", type: "bool", default: true, setter: "sgl_linechart_set_axis_y_auto" },
      { key: "axisYStep", type: "number", default: 0, min: 0, max: 100, setter: "sgl_linechart_set_axis_y_step" },
      { key: "axisYDivisions", type: "number", default: 5, min: 1, max: 50, setter: "sgl_linechart_set_axis_y_divisions" },
      { key: "axisYGrid", type: "bool", default: true, setter: "sgl_linechart_set_axis_y_grid" },
      { key: "axisYDashed", type: "bool", default: false, setter: "sgl_linechart_set_axis_y_dashed" },
      { key: "axisYGridColor", type: "color", default: "#334155", setter: "sgl_linechart_set_axis_y_grid_color" },
      { key: "axisYGridAlpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_linechart_set_axis_y_grid_alpha" },
      { key: "axisYLabels", type: "bool", default: true, setter: "sgl_linechart_set_axis_y_labels" },
      { key: "axisYLabelColor", type: "color", default: "#e2e8f0", setter: "sgl_linechart_set_axis_y_label_color" },
      { key: "axisYLabelAlpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_linechart_set_axis_y_label_alpha" },
      { key: "axisYLabelFontVar", type: "text", default: "NULL" },
      { key: "axisYTicks", type: "bool", default: true, setter: "sgl_linechart_set_axis_y_ticks" },
      { key: "plotLeft", type: "number", default: 50, min: 0, max: 200, setter: "sgl_linechart_set_plot_left" },
      { key: "plotTop", type: "number", default: 20, min: 0, max: 200, setter: "sgl_linechart_set_plot_top" },
      { key: "plotWidth", type: "number", default: 0, min: 0, max: 8192, setter: "sgl_linechart_set_plot_width" },
      { key: "plotHeight", type: "number", default: 0, min: 0, max: 8192, setter: "sgl_linechart_set_plot_height" },
      { key: "bgColor", type: "color", default: "#0f172a", setter: "sgl_linechart_set_bg_color" },
      { key: "borderColor", type: "color", default: "#64748b", setter: "sgl_linechart_set_border_color" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_linechart_set_alpha" },
      { key: "openAnim", type: "bool", default: true, setter: "sgl_linechart_set_open_anim" },
      { key: "openAnimDir", type: "select", options: ["SGL_LINECHART_OPEN_ANIM_FROM_LEFT", "SGL_LINECHART_OPEN_ANIM_FROM_TOP"], default: "SGL_LINECHART_OPEN_ANIM_FROM_LEFT", setter: "sgl_linechart_set_open_anim_dir" },
      { key: "openAnimDuration", type: "number", default: 500, min: 10, max: 99999, setter: "sgl_linechart_set_open_anim_duration" },
      { key: "openAnimPath", type: "select", options: ["sgl_anim_path_linear", "sgl_anim_path_ease_in_out", "sgl_anim_path_ease_in", "sgl_anim_path_ease_out", "sgl_anim_path_overshoot"], default: "sgl_anim_path_ease_in_out", setter: "sgl_linechart_set_open_anim_path" },
      { key: "seriesXData", type: "text", default: "" },
      { key: "resetPlotArea", type: "bool", default: false },
      { key: "extraSetters", type: "textarea", default: "" }
    ]
  },
  barchart: {
    label: "BarChart", create: "sgl_barchart_create", preview: "chart", defaultSize: [360, 200],
    props: [
      { key: "seriesCount", type: "number", default: 1, min: 1, max: 10, setter: "sgl_barchart_set_series_count" },
      { key: "seriesData", type: "text", default: "1,4,2,8,5,7", setter: "sgl_barchart_set_series_data" },
      { key: "seriesDataJson", type: "textarea", default: "[[1,4,2,8,5,7],[3,6,9,2,4,7]]" },
      { key: "xLabels", type: "text", default: "A,B,C,D,E,F", setter: "sgl_barchart_set_x_labels" },
      { key: "seriesLabel", type: "text", default: "Bar 1", setter: "sgl_barchart_set_series_label" },
      { key: "seriesColor", type: "color", default: "#f59e0b", setter: "sgl_barchart_set_series_color" },
      { key: "seriesAlpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_barchart_set_series_alpha" },
      { key: "axisYMin", type: "number", default: 0, min: -99999, max: 99999, setter: "sgl_barchart_set_axis_y_min" },
      { key: "axisYMax", type: "number", default: 10, min: -99999, max: 99999, setter: "sgl_barchart_set_axis_y_max" },
      { key: "axisYAuto", type: "bool", default: true, setter: "sgl_barchart_set_axis_y_auto" },
      { key: "axisYStep", type: "number", default: 0, min: 0, max: 100, setter: "sgl_barchart_set_axis_y_step" },
      { key: "axisYDivisions", type: "number", default: 5, min: 1, max: 50, setter: "sgl_barchart_set_axis_y_divisions" },
      { key: "axisYGrid", type: "bool", default: true, setter: "sgl_barchart_set_axis_y_grid" },
      { key: "axisYDashed", type: "bool", default: false, setter: "sgl_barchart_set_axis_y_dashed" },
      { key: "axisYGridColor", type: "color", default: "#334155", setter: "sgl_barchart_set_axis_y_grid_color" },
      { key: "axisYGridAlpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_barchart_set_axis_y_grid_alpha" },
      { key: "axisYLabels", type: "bool", default: true, setter: "sgl_barchart_set_axis_y_labels" },
      { key: "axisYLabelColor", type: "color", default: "#e2e8f0", setter: "sgl_barchart_set_axis_y_label_color" },
      { key: "axisYLabelAlpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_barchart_set_axis_y_label_alpha" },
      { key: "axisYLabelFontVar", type: "text", default: "NULL" },
      { key: "axisYTicks", type: "bool", default: true, setter: "sgl_barchart_set_axis_y_ticks" },
      { key: "barGap", type: "number", default: 4, min: 0, max: 50, setter: "sgl_barchart_set_bar_gap" },
      { key: "categoryGap", type: "number", default: 10, min: 0, max: 100, setter: "sgl_barchart_set_category_gap" },
      { key: "plotLeft", type: "number", default: 50, min: 0, max: 200, setter: "sgl_barchart_set_plot_left" },
      { key: "plotTop", type: "number", default: 20, min: 0, max: 200, setter: "sgl_barchart_set_plot_top" },
      { key: "plotWidth", type: "number", default: 0, min: 0, max: 8192, setter: "sgl_barchart_set_plot_width" },
      { key: "plotHeight", type: "number", default: 0, min: 0, max: 8192, setter: "sgl_barchart_set_plot_height" },
      { key: "bgColor", type: "color", default: "#0f172a", setter: "sgl_barchart_set_bg_color" },
      { key: "borderColor", type: "color", default: "#64748b", setter: "sgl_barchart_set_border_color" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_barchart_set_alpha" },
      { key: "openAnim", type: "bool", default: true, setter: "sgl_barchart_set_open_anim" },
      { key: "openAnimDir", type: "select", options: ["SGL_BARCHART_OPEN_ANIM_FROM_BOTTOM", "SGL_BARCHART_OPEN_ANIM_FROM_LEFT"], default: "SGL_BARCHART_OPEN_ANIM_FROM_BOTTOM", setter: "sgl_barchart_set_open_anim_dir" },
      { key: "openAnimDuration", type: "number", default: 500, min: 10, max: 99999, setter: "sgl_barchart_set_open_anim_duration" },
      { key: "openAnimPath", type: "select", options: ["sgl_anim_path_linear", "sgl_anim_path_ease_in_out", "sgl_anim_path_ease_in", "sgl_anim_path_ease_out", "sgl_anim_path_overshoot"], default: "sgl_anim_path_ease_in_out", setter: "sgl_barchart_set_open_anim_path" },
      { key: "extraSetters", type: "textarea", default: "" }
    ]
  },
  piechart: {
    label: "PieChart", create: "sgl_piechart_create", preview: "chart", defaultSize: [240, 200],
    props: [
      { key: "slices", type: "textarea", default: "[{\"value\":30,\"color\":\"#38bdf8\"},{\"value\":25,\"color\":\"#f59e0b\"},{\"value\":20,\"color\":\"#22c55e\"},{\"value\":15,\"color\":\"#ef4444\"},{\"value\":10,\"color\":\"#a855f7\"}]", setter: "sgl_piechart_set_slices" },
      { key: "smooth", type: "bool", default: true, setter: "sgl_piechart_set_smooth" },
      { key: "innerRadiusRate", type: "number", default: 0, min: 0, max: 99, setter: "sgl_piechart_set_inner_radius_rate" },
      { key: "legend", type: "bool", default: true, setter: "sgl_piechart_set_legend" },
      { key: "legendPos", type: "number", default: 0, min: 0, max: 3, setter: "sgl_piechart_set_legend_pos" },
      { key: "legendDir", type: "number", default: 0, min: 0, max: 1, setter: "sgl_piechart_set_legend_dir" },
      { key: "legendAreaSize", type: "number", default: 80, min: 10, max: 200, setter: "sgl_piechart_set_legend_area_size" },
      { key: "legendTextColor", type: "color", default: "#e2e8f0", setter: "sgl_piechart_set_legend_text_color" },
      { key: "legendAlpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_piechart_set_legend_alpha" },
      { key: "legendBoxSize", type: "number", default: 12, min: 4, max: 30, setter: "sgl_piechart_set_legend_box_size" },
      { key: "legendPadding", type: "number", default: 8, min: 0, max: 50, setter: "sgl_piechart_set_legend_padding" },
      { key: "legendItemGap", type: "number", default: 6, min: 0, max: 50, setter: "sgl_piechart_set_legend_item_gap" },
      { key: "legendBg", type: "bool", default: false, setter: "sgl_piechart_set_legend_bg" },
      { key: "legendBgColor", type: "color", default: "#1e293b", setter: "sgl_piechart_set_legend_bg_color" },
      { key: "legendBorderColor", type: "color", default: "#475569", setter: "sgl_piechart_set_legend_border_color" },
      { key: "legendFontVar", type: "text", default: "NULL" },
      { key: "plotLeft", type: "number", default: 20, min: 0, max: 200, setter: "sgl_piechart_set_plot_left" },
      { key: "plotTop", type: "number", default: 20, min: 0, max: 200, setter: "sgl_piechart_set_plot_top" },
      { key: "plotWidth", type: "number", default: 0, min: 0, max: 8192, setter: "sgl_piechart_set_plot_width" },
      { key: "plotHeight", type: "number", default: 0, min: 0, max: 8192, setter: "sgl_piechart_set_plot_height" },
      { key: "bgColor", type: "color", default: "#0f172a", setter: "sgl_piechart_set_bg_color" },
      { key: "borderColor", type: "color", default: "#64748b", setter: "sgl_piechart_set_border_color" },
      { key: "alpha", type: "number", default: 255, min: 0, max: 255, setter: "sgl_piechart_set_alpha" },
      { key: "openAnim", type: "bool", default: true, setter: "sgl_piechart_set_open_anim" },
      { key: "openAnimDuration", type: "number", default: 800, min: 10, max: 99999, setter: "sgl_piechart_set_open_anim_duration" },
      { key: "openAnimPath", type: "select", options: ["sgl_anim_path_linear", "sgl_anim_path_ease_in_out", "sgl_anim_path_ease_in", "sgl_anim_path_ease_out", "sgl_anim_path_overshoot"], default: "sgl_anim_path_ease_out", setter: "sgl_piechart_set_open_anim_path" },
      { key: "extraSetters", type: "textarea", default: "" }
    ]
  }
};

// 辅助函数
const toSglColor = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `0x${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`;
};

const getFontOptions = () => {
  return [
    { value: "", label: "请选择字体" },
    ...state.value.fonts.map((f) => ({
      value: f.id,
      label: `${f.displayName} (${f.sglName || "NULL"})`
    }))
  ];
};

const getDepth = (widgetId) => {
  let depth = 0;
  let current = state.value.widgets.find((w) => w.id === widgetId);
  while (current?.parentId) {
    depth++;
    current = state.value.widgets.find((w) => w.id === current.parentId);
  }
  return depth;
};

const isAncestor = (ancestorId, descendantId) => {
  let current = state.value.widgets.find((w) => w.id === descendantId);
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = state.value.widgets.find((w) => w.id === current.parentId);
  }
  return false;
};

const propLabelText = (field) => {
  return PROP_LABEL_CN[field.key] || field.key;
};

// 字体相关方法
const addManualFont = () => {
  const name = manualFontName.value.trim();
  if (!name) return;
  const id = `font_${Date.now()}`;
  state.value.fonts.push({
    id,
    displayName: name,
    family: name,
    sglName: name,
    source: "manual"
  });
  manualFontName.value = "";
};

const handleImportFontFile = (e) => {
  const files = e.target.files;
  for (const file of files) {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target.result;
      const match = content.match(/\s*SGL_FONT\s+([a-zA-Z0-9_]+)\s*=/);
      const sglName = match ? match[1] : null;
      if (sglName) {
        const id = `font_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        state.value.fonts.push({
          id,
          displayName: file.name.replace(/\.c$/, ""),
          family: "monospace",
          sglName,
          source: "imported"
        });
      }
    };
    reader.readAsText(file);
  }
  e.target.value = "";
};

// 核心方法
const addWidget = (type) => {
  const def = WIDGET_DEFS[type];
  if (!def) return;
  const id = `widget_${state.value.seq++}`;
  const widget = {
    id,
    type,
    screenId: state.value.currentScreenId,
    name: `${def.label}_${state.value.seq - 1}`,
    x: 100,
    y: 100,
    w: def.defaultSize?.[0] || 100,
    h: def.defaultSize?.[1] || 100,
    parentId: null,
    layout: { mode: "absolute", align: "SGL_ALIGN_CENTER" },
    props: {},
    anim: { enabled: false, target: "x", start: 0, end: 100, delay: 0, duration: 1000, repeat: 0, path: "sgl_anim_path_linear" }
  };
  def.props?.forEach((p) => {
    widget.props[p.key] = p.default;
  });
  state.value.widgets.push(widget);
  state.value.selectedId = id;
  render();
};

const selectWidget = (id) => {
  state.value.selectedId = id;
  render();
};

const deleteWidget = () => {
  if (!state.value.selectedId) return;
  const toDelete = new Set([state.value.selectedId]);
  const collectChildren = (id) => {
    state.value.widgets.forEach((w) => {
      if (w.parentId === id) {
        toDelete.add(w.id);
        collectChildren(w.id);
      }
    });
  };
  collectChildren(state.value.selectedId);
  state.value.widgets = state.value.widgets.filter((w) => !toDelete.has(w.id));
  state.value.selectedId = null;
  render();
};

const duplicateWidget = () => {
  if (!state.value.selectedId) return;
  const original = state.value.widgets.find((w) => w.id === state.value.selectedId);
  if (!original) return;
  const id = `widget_${state.value.seq++}`;
  const copy = JSON.parse(JSON.stringify(original));
  copy.id = id;
  copy.name = `${copy.name}_copy`;
  copy.x += 20;
  copy.y += 20;
  state.value.widgets.push(copy);
  state.value.selectedId = id;
  render();
};

const clearWidgets = () => {
  if (!confirm("确定清空当前画布所有对象？")) return;
  state.value.widgets = state.value.widgets.filter((w) => w.screenId !== state.value.currentScreenId);
  state.value.selectedId = null;
  render();
};

const updateParent = () => {
  render();
};

const updateFontVar = (fieldKey) => {
  if (!selectedWidget.value) return;
  const bindValue = selectedWidget.value.props[`${fieldKey}Bind`];
  const font = state.value.fonts.find((f) => f.id === bindValue);
  if (font) {
    selectedWidget.value.props[fieldKey] = font.sglName || "NULL";
  }
  render();
};

const addScreen = () => {
  const id = `screen_${Date.now()}`;
  state.value.screens.push({
    id,
    name: `screen_${state.value.screens.length + 1}`,
    width: DEFAULT_STAGE.width,
    height: DEFAULT_STAGE.height,
    bgColor: "#0b1220"
  });
  state.value.currentScreenId = id;
  render();
};

const deleteCurrentScreen = () => {
  if (state.value.screens.length <= 1) {
    alert("至少保留一个画布");
    return;
  }
  state.value.widgets = state.value.widgets.filter((w) => w.screenId !== state.value.currentScreenId);
  state.value.screens = state.value.screens.filter((s) => s.id !== state.value.currentScreenId);
  state.value.currentScreenId = state.value.screens[0].id;
  state.value.selectedId = null;
  render();
};

// 画布缩放
let zoom = 1;
let isDraggingViewport = false;
let lastMousePos = { x: 0, y: 0 };

const setZoom = (z) => {
  zoom = Math.max(0.1, Math.min(3, z));
  render();
};

// 渲染
const render = () => {
  console.log('Render function called');
  if (!stage.value) {
    console.log('Stage element not found');
    return;
  }
  console.log('Stage element found:', stage.value);
  const s = currentScreen.value;
  stage.value.style.width = `${s.width}px`;
  stage.value.style.height = `${s.height}px`;
  stage.value.style.backgroundColor = s.bgColor;
  stage.value.innerHTML = "";
  console.log('Current screen:', s);
  console.log('Widgets in current screen:', widgetsInCurrent.value);
  console.log('Number of widgets:', widgetsInCurrent.value.length);
  widgetsInCurrent.value.forEach((w, index) => {
    console.log(`Rendering widget ${index}:`, w);
    const el = document.createElement("div");
    el.className = `obj ${w.type} ${w.id === state.value.selectedId ? 'selected' : ''}`;
    el.style.position = "absolute";
    el.style.left = `${w.x}px`;
    el.style.top = `${w.y}px`;
    el.style.width = `${w.w}px`;
    el.style.height = `${w.h}px`;
    el.setAttribute("data-id", w.id);
    
    // 根据控件类型渲染不同的图像
    let widgetContent = '';
    const def = WIDGET_DEFS[w.type];
    if (def) {
      switch (def.preview) {
        case 'line':
          widgetContent = `
            <div style="width: 100%; height: 2px; background-color: ${w.props.color || '#55e6ff'}; margin-top: 50%;"></div>
            <div class="widget-label">${w.name || w.type}</div>
          `;
          break;
        case 'rect':
          widgetContent = `
            <div style="width: 100%; height: 100%; background-color: ${w.props.bgColor || '#334155'}; border: ${w.props.borderWidth || 1}px solid ${w.props.borderColor || '#94a3b8'}; border-radius: ${w.props.radius || 0}px;"></div>
            <div class="widget-label">${w.name || w.type}</div>
          `;
          break;
        case 'circle':
          widgetContent = `
            <div style="width: 100%; height: 100%; border-radius: 50%; background-color: ${w.props.color || '#16a34a'}; border: ${w.props.borderWidth || 1}px solid ${w.props.borderColor || '#dcfce7'};"></div>
            <div class="widget-label">${w.name || w.type}</div>
          `;
          break;
        case 'ring':
          widgetContent = `
            <div style="width: 100%; height: 100%; border-radius: 50%; border: ${Math.min(w.props.radiusOut - w.props.radiusIn || 25, Math.min(w.w, w.h) / 3)}px solid ${w.props.color || '#f59e0b'};"></div>
            <div class="widget-label">${w.name || w.type}</div>
          `;
          break;
        case 'arc':
          widgetContent = `
            <div style="width: 100%; height: 100%; border-radius: 50%; border: ${Math.min(w.props.radiusOut - w.props.radiusIn || 20, Math.min(w.w, w.h) / 3)}px solid ${w.props.bgColor || '#1f2937'}; border-top-color: ${w.props.color || '#22d3ee'};"></div>
            <div class="widget-label">${w.name || w.type}</div>
          `;
          break;
        case 'button':
          widgetContent = `
            <div style="width: 100%; height: 100%; background-color: ${w.props.bgColor || '#3b82f6'}; border-radius: 8px; display: flex; justify-content: center; align-items: center; color: ${w.props.textColor || '#ffffff'}; font-size: 12px;">${w.props.text || 'Button'}</div>
            <div class="widget-label">${w.name || w.type}</div>
          `;
          break;
        case 'slider':
          widgetContent = `
            <div style="width: 100%; height: 4px; background-color: ${w.props.bgColor || '#374151'}; border-radius: 2px; margin-top: 50%; position: relative;">
              <div style="width: ${w.props.value || 35}%; height: 100%; background-color: ${w.props.color || '#3b82f6'}; border-radius: 2px;"></div>
              <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${w.props.color || '#3b82f6'}; position: absolute; left: ${w.props.value || 35}%; top: 50%; transform: translate(-50%, -50%);"></div>
            </div>
            <div class="widget-label">${w.name || w.type}</div>
          `;
          break;
        case 'progress':
          widgetContent = `
            <div style="width: 100%; height: 8px; background-color: ${w.props.bgColor || '#374151'}; border-radius: 4px; margin-top: 50%;">
              <div style="width: ${w.props.value || 40}%; height: 100%; background-color: ${w.props.color || '#10b981'}; border-radius: 4px;"></div>
            </div>
            <div class="widget-label">${w.name || w.type}</div>
          `;
          break;
        case 'label':
          widgetContent = `
            <div style="width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; color: ${w.props.textColor || '#e5e7eb'}; font-size: 12px;">${w.props.text || 'Label'}</div>
            <div class="widget-label">${w.name || w.type}</div>
          `;
          break;
        case 'switch':
          widgetContent = `
            <div style="width: 100%; height: 100%; background-color: ${w.props.status ? '#10b981' : '#374151'}; border-radius: ${Math.min(w.w, w.h) / 2}px; position: relative;">
              <div style="width: ${Math.min(w.w, w.h) * 0.7}px; height: ${Math.min(w.w, w.h) * 0.7}px; border-radius: 50%; background-color: #ffffff; position: absolute; left: ${w.props.status ? '60%' : '10%'}; top: 50%; transform: translateY(-50%); transition: left 0.3s;"></div>
            </div>
            <div class="widget-label">${w.name || w.type}</div>
          `;
          break;
        case 'msgbox':
          widgetContent = `
            <div style="width: 100%; height: 100%; background-color: ${w.props.bgColor || '#1f2937'}; border-radius: 8px; padding: 10px; display: flex; flex-direction: column;">
              <div style="font-size: 14px; font-weight: bold; color: ${w.props.titleColor || '#e5e7eb'}; margin-bottom: 10px;">${w.props.title || 'Title'}</div>
              <div style="flex: 1; font-size: 12px; color: ${w.props.textColor || '#9ca3af'}; margin-bottom: 10px;">${w.props.text || 'Message'}</div>
              <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <div style="padding: 4px 12px; background-color: ${w.props.btnColor || '#374151'}; border-radius: 4px; font-size: 12px; color: ${w.props.btnTextColor || '#e5e7eb'};">Cancel</div>
                <div style="padding: 4px 12px; background-color: ${w.props.btnColor || '#3b82f6'}; border-radius: 4px; font-size: 12px; color: ${w.props.btnTextColor || '#ffffff'};">OK</div>
              </div>
            </div>
            <div class="widget-label">${w.name || w.type}</div>
          `;
          break;
        case 'textline':
          widgetContent = `
            <div style="width: 100%; height: 100%; background-color: ${w.props.bgColor || '#1f2937'}; border: 1px solid ${w.props.borderColor || '#374151'}; border-radius: 4px; padding: 8px; font-size: 12px; color: ${w.props.textColor || '#e5e7eb'}; white-space: pre-wrap;">${w.props.text || 'line1\nline2'}</div>
            <div class="widget-label">${w.name || w.type}</div>
          `;
          break;
        case 'textbox':
          widgetContent = `
            <div style="width: 100%; height: 100%; background-color: ${w.props.bgColor || '#1f2937'}; border: 1px solid ${w.props.borderColor || '#374151'}; border-radius: 4px; padding: 8px; font-size: 12px; color: ${w.props.textColor || '#e5e7eb'}; white-space: pre-wrap;">${w.props.text || 'textbox content'}</div>
            <div class="widget-label">${w.name || w.type}</div>
          `;
          break;
        case 'checkbox':
          widgetContent = `
            <div style="width: 100%; height: 100%; display: flex; align-items: center; gap: 8px;">
              <div style="width: 16px; height: 16px; border: 2px solid ${w.props.status ? '#3b82f6' : '#6b7280'}; border-radius: 4px; display: flex; justify-content: center; align-items: center; background-color: ${w.props.status ? '#3b82f6' : 'transparent'};">
                ${w.props.status ? '<div style="width: 8px; height: 8px; background-color: #ffffff;"></div>' : ''}
              </div>
              <div style="font-size: 12px; color: ${w.props.textColor || '#e5e7eb'};">${w.props.text || 'checkbox'}</div>
            </div>
            <div class="widget-label">${w.name || w.type}</div>
          `;
          break;
        case 'icon':
          widgetContent = `
            <div style="width: 100%; height: 100%; background-color: ${w.props.color || '#3b82f6'}; border-radius: 8px; display: flex; justify-content: center; align-items: center; color: ${w.props.textColor || '#ffffff'}; font-size: ${Math.min(w.w, w.h) * 0.6}px;">i</div>
            <div class="widget-label">${w.name || w.type}</div>
          `;
          break;
        case 'keyboard':
          widgetContent = `
            <div style="width: 100%; height: 100%; background-color: ${w.props.bgColor || '#1f2937'}; border-radius: 8px; padding: 8px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px;">
              ${['1', '2', '3', 'Del', '4', '5', '6', 'Enter', '7', '8', '9', '-', '0', '.', 'Back', ' '].map(key => `
                <div style="background-color: ${w.props.keyColor || '#374151'}; border-radius: 4px; display: flex; justify-content: center; align-items: center; font-size: 12px; color: ${w.props.textColor || '#e5e7eb'}">${key}</div>
              `).join('')}
            </div>
            <div class="widget-label">${w.name || w.type}</div>
          `;
          break;
        default:
          widgetContent = `
            <div class="widget-label">${w.name || w.type}</div>
          `;
          break;
      }
    } else {
      widgetContent = `
        <div class="widget-label">${w.name || w.type}</div>
      `;
    }
    
    el.innerHTML = `
      ${widgetContent}
      <div class="handle"></div>
    `;
    el.addEventListener("mousedown", (e) => handleWidgetMouseDown(e, w));
    // 为调整大小的元素添加事件监听器
    const resizeHandle = el.querySelector(".handle");
    if (resizeHandle) {
      resizeHandle.addEventListener("mousedown", (e) => handleResizeMouseDown(e, w));
    }
    stage.value.appendChild(el);
    console.log('Widget appended to stage');
  });
  console.log('Render function completed');
};

// 事件处理
const handleStageClick = (e) => {
  if (!e.target.closest(".obj")) {
    state.value.selectedId = null;
    render();
  }
};

const handleWidgetMouseDown = (e, widget) => {
  e.stopPropagation();
  state.value.selectedId = widget.id;
  render(); // 立即渲染，显示虚线框
  
  // 开始拖拽
  state.value.drag = {
    widgetId: widget.id,
    startX: e.clientX,
    startY: e.clientY,
    startWidgetX: widget.x,
    startWidgetY: widget.y
  };
  
  // 添加全局鼠标事件监听器
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
};

const handleMouseMove = (e) => {
  if (!state.value.drag) return;
  
  const { widgetId, startX, startY, startWidgetX, startWidgetY } = state.value.drag;
  const widget = state.value.widgets.find(w => w.id === widgetId);
  
  if (widget) {
    widget.x = startWidgetX + (e.clientX - startX);
    widget.y = startWidgetY + (e.clientY - startY);
    render();
  }
};

const handleMouseUp = () => {
  // 结束拖拽或调整大小
  state.value.drag = null;
  
  // 移除全局鼠标事件监听器
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
};

// 处理调整大小
const handleResizeMouseDown = (e, widget) => {
  e.stopPropagation();
  state.value.selectedId = widget.id;
  
  // 开始调整大小
  state.value.drag = {
    widgetId: widget.id,
    type: 'resize',
    startX: e.clientX,
    startY: e.clientY,
    startWidgetW: widget.w,
    startWidgetH: widget.h
  };
  
  // 添加全局鼠标事件监听器
  document.addEventListener('mousemove', handleResizeMouseMove);
  document.addEventListener('mouseup', handleResizeMouseUp);
};

const handleResizeMouseMove = (e) => {
  if (!state.value.drag || state.value.drag.type !== 'resize') return;
  
  const { widgetId, startX, startY, startWidgetW, startWidgetH } = state.value.drag;
  const widget = state.value.widgets.find(w => w.id === widgetId);
  
  if (widget) {
    widget.w = Math.max(10, startWidgetW + (e.clientX - startX));
    widget.h = Math.max(10, startWidgetH + (e.clientY - startY));
    render();
  }
};

const handleResizeMouseUp = () => {
  // 结束调整大小
  state.value.drag = null;
  
  // 移除全局鼠标事件监听器
  document.removeEventListener('mousemove', handleResizeMouseMove);
  document.removeEventListener('mouseup', handleResizeMouseUp);
};

// 生成代码
const generateCode = () => {
  const s = currentScreen.value;
  let code = `// SGL UI Code Generated by Designer

`;
  code += `// Screen: ${s.name} (${s.width}x${s.height})
`;
  widgetsInCurrent.value.forEach((w) => {
    const def = WIDGET_DEFS[w.type];
    if (!def) return;
    code += `
// ${w.name} (${w.type})
`;
    code += `SGL_Widget *${w.name} = ${def.create}(${w.x}, ${w.y}, ${w.w}, ${w.h});
`;
    def.props?.forEach((p) => {
      if (p.setter && w.props[p.key] !== undefined) {
        let value = w.props[p.key];
        if (p.type === "color") {
          value = toSglColor(value);
        } else if (p.type === "bool") {
          value = value ? "SGL_TRUE" : "SGL_FALSE";
        } else if (p.type === "text" || p.type === "textarea") {
          value = `"${value.replace(/"/g, '\\"')}"`;
        }
        code += `${p.setter}(${w.name}, ${value});
`;
      }
    });
  });
  codeOutput.value = code;
};

const copyCode = () => {
  navigator.clipboard.writeText(codeOutput.value).then(() => {
    alert("代码已复制到剪贴板");
  });
};

const exportJson = () => {
  const data = {
    screens: state.value.screens,
    widgets: state.value.widgets,
    fonts: state.value.fonts
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sgl-ui-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

const importJson = () => {
  importFile.value.click();
};

const handleImportFile = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      if (data.screens) state.value.screens = data.screens;
      if (data.widgets) state.value.widgets = data.widgets;
      if (data.fonts) state.value.fonts = data.fonts;
      if (state.value.screens.length > 0) {
        state.value.currentScreenId = state.value.screens[0].id;
      }
      state.value.selectedId = null;
      render();
      alert("导入成功");
    } catch (err) {
      alert("导入失败: " + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = "";
};

// 生命周期钩子
onMounted(() => {
  // 确保DOM元素已完全渲染
  setTimeout(() => {
    console.log('Stage element:', stage.value);
    console.log('Widgets in current screen:', widgetsInCurrent.value);
    render();
  }, 100);
});

onUnmounted(() => {
  // 清理事件监听器
});


</script>

<style>
* { box-sizing: border-box; }

.designer-container {
  display: grid;
  grid-template-columns: 300px 1fr 360px;
  height: 100vh;
  background: radial-gradient(circle at 20% 10%, color-mix(in srgb, var(--panel) 50%, var(--bg)) 0%, var(--bg) 48%);
  color: var(--text);
  overflow: hidden;
}

.panel {
  background: color-mix(in srgb, var(--panel) 88%, var(--bg));
  border-right: 1px solid var(--line);
  overflow: auto;
  padding: 14px;
}

.panel.right {
  border-right: none;
  border-left: 1px solid var(--line);
}

h2 {
  margin: 6px 0 12px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.search {
  width: 100%;
  margin-bottom: 10px;
  padding: 8px;
  background: var(--panel-soft);
  border: 1px solid #64748b;
  border-radius: 8px;
  color: var(--text);
  transition: border-color 0.3s ease;
}

.search:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

.palette {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.palette-item {
  padding: 8px;
  border: 1px solid #64748b;
  border-radius: 8px;
  background: var(--panel-soft);
  cursor: pointer;
  font-size: 12px;
  text-align: center;
  transition: border-color 0.3s ease;
}

.palette-item:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

.workspace {
  display: grid;
  grid-template-rows: auto 1fr auto;
  overflow: hidden;
}

.stage-head {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: color-mix(in srgb, var(--panel) 70%, var(--bg));
  font-size: 12px;
  color: var(--muted);
}

.stage-wrap {
  overflow: auto;
  padding: 16px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.stage-viewport {
  position: relative;
  min-width: 1px;
  min-height: 1px;
}

.stage {
  width: 1280px;
  height: 720px;
  background:
    linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px) 0 0/20px 20px,
    linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px) 0 0/20px 20px,
    var(--panel-soft);
  border: 1px solid var(--line);
  border-radius: 12px;
  position: relative;
  box-shadow: inset 0 0 0 1px rgba(148,163,184,0.05);
  transform-origin: top left;
}

:root.light .stage {
  box-shadow: inset 0 0 0 1px rgba(148,163,184,0.1);
}

.obj {
  position: absolute;
  border: none;
  user-select: none;
  color: var(--text);
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 12px;
  overflow: hidden;
  background: transparent;
}

.obj.selected {
  border: 1px dashed var(--accent);
  box-shadow: 0 0 0 1px rgba(14, 165, 233, 0.5);
}

.handle {
  position: absolute;
  right: -5px;
  bottom: -5px;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: var(--accent);
  cursor: nwse-resize;
  display: none;
}

.widget-label {
  position: absolute;
  bottom: -20px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  color: var(--muted);
  white-space: nowrap;
  pointer-events: none;
}

.obj.selected .handle {
  display: block;
}

.code-box {
  border-top: 1px solid var(--line);
  background: var(--panel-soft);
  max-height: 40vh;
  display: grid;
  grid-template-rows: auto 1fr;
}

.code-box pre {
  margin: 0;
  overflow: auto;
  padding: 10px;
  color: var(--text);
  font-size: 12px;
  line-height: 1.45;
}

.toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.toolbar.code-toolbar {
  padding: 8px 10px;
  border-bottom: 1px solid var(--line);
}

button {
  border: 1px solid #64748b;
  background: var(--panel-soft);
  color: var(--text);
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s ease;
}

button:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

button[title="切换主题"] {
  font-size: 16px;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
}

button.primary {
  border: 1px solid #64748b;
  background: var(--panel-soft);
  color: var(--text);
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s ease;
  font-weight: 700;
}

button.primary:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

:root.light button.primary {
  border: 1px solid #94a3b8;
  background: var(--panel-soft);
  color: var(--text);
  font-weight: 700;
}

:root.light button.primary:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

:root.light button {
  border: 1px solid #94a3b8;
  background: var(--panel-soft);
  color: var(--text);
}

:root.light button:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

.tree {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px;
  background: var(--panel-soft);
  max-height: 180px;
  overflow: auto;
  margin-bottom: 12px;
}

.tree-item {
  font-size: 12px;
  padding: 5px 6px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--muted);
}

.tree-item.active {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--text);
}

.field {
  display: grid;
  gap: 4px;
  margin-bottom: 10px;
}

.field label {
  font-size: 12px;
  color: var(--muted);
}

.field input,
.field select,
.field textarea {
  width: 100%;
  border: 1px solid #64748b;
  background: var(--panel-soft);
  color: var(--text);
  border-radius: 7px;
  padding: 7px;
  font-size: 12px;
  transition: border-color 0.3s ease;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

.field textarea {
  min-height: 68px;
  resize: vertical;
}

.status {
  margin-top: 10px;
  font-size: 12px;
  color: var(--ok);
}

#projectPanel {
  margin-bottom: 16px;
}
</style>

<style>
/* 全局主题样式，确保主题切换时能正确更新 */
html.light .designer-container {
  background: radial-gradient(circle at 20% 10%, color-mix(in srgb, var(--panel) 50%, var(--bg)) 0%, var(--bg) 48%);
  color: var(--text);
}

html.light .panel {
  background: color-mix(in srgb, var(--panel) 88%, var(--bg));
  border-right: 1px solid var(--line);
}

html.light .panel.right {
  border-left: 1px solid var(--line);
}

html.light .search {
  background: var(--panel-soft);
  border: 1px solid #94a3b8;
  color: var(--text);
}

html.light .search:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

html.light .palette-item {
  background: var(--panel-soft);
  border: 1px solid #94a3b8;
  color: var(--text);
}

html.light .palette-item:hover {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

html.light .stage-head {
  background: color-mix(in srgb, var(--panel) 70%, var(--bg));
  border-bottom: 1px solid var(--line);
  color: var(--muted);
}

html.light .stage {
  background:
    linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px) 0 0/20px 20px,
    linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px) 0 0/20px 20px,
    var(--panel-soft);
  border: 1px solid var(--line);
  box-shadow: inset 0 0 0 1px rgba(148,163,184,0.1);
}

html.light .code-box {
  background: var(--panel-soft);
  border-top: 1px solid var(--line);
}

html.light .code-box pre {
  color: var(--text);
}

html.light .tree {
  background: var(--panel-soft);
  border: 1px solid var(--line);
}

html.light .tree-item {
  color: var(--muted);
}

html.light .tree-item.active {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--text);
}

html.light .field label {
  color: var(--muted);
}

html.light .field input,
html.light .field select,
html.light .field textarea {
  background: var(--panel-soft);
  border: 1px solid #94a3b8;
  color: var(--text);
}

html.light .field input:focus,
html.light .field select:focus,
html.light .field textarea:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
}

html.light button {
  background: var(--panel-soft);
  border: 1px solid var(--line);
  color: var(--text);
}

html.light button.primary {
  background: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 70%, white);
  color: #04131d;
}
</style>