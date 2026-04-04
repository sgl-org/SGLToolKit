## Step
### 生成命令行工具
1. 安装node.js
2. git clone https://github.com/LiShanwenGit/sgl_font_conv.git
3. cd sgl_font_conv
4. npm install pkg --save-dev
5. npm install
6. npx pkg . --targets node14-win-x64 --compress GZip --output sgl_font_conv.exe
7. ./sgl_font_conv.exe --font YaHei.Consolas.1.11b.ttf --range 0x20-0x7F --range 0x5010-0x5010 --range 0x5030-0x5030 --size 24 --bpp 4 --format lvgl --output font_output/sgl_font_test.c

使用node14可达到最小体积
清理: npm cache clean --force
