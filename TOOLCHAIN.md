# SGLToolKit 标准工具链（2026-08-03 交接）

本项目必须使用 **MSVC 工具链**构建，产物为可直接分发的单 exe。不要改回 MinGW/GNU 构建——GNU 构建会动态依赖 `WebView2Loader.dll`，无法单文件发布。

## 标准工具链

| 组件 | 位置/版本 | 说明 |
|---|---|---|
| rustup / cargo | `D:\rustup` / `D:\cargo` | 已从 `C:\Users\chenj\.rustup/.cargo` 迁移 |
| 默认工具链 | `stable-x86_64-pc-windows-msvc`（rustc 1.97.1, 8bab26f4f） | MSVC 目标 |
| VS Build Tools | `C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools`（18.3，工具集 14.50.35717） | C 盘原样保留 |
| Windows SDK | `D:\Windows Kits\10`（10.0.26100.8876，仅 DesktopCPPx64） | 注册表 `KitsRoot10` 已指向 D 盘 |
| 链接器 | MSVC link.exe 14.50 | 产物特征：无 WebView2Loader.dll 依赖 |

## 环境变量（用户级，新终端生效）

- `RUSTUP_HOME=D:\rustup`
- `CARGO_HOME=D:\cargo`
- 用户 `PATH` 以 `D:\cargo\bin` 开头（已移除旧的 `C:\Users\chenj\.cargo\bin`）
- 旧终端需重开，或手动 `$env:RUSTUP_HOME='D:\rustup'; $env:CARGO_HOME='D:\cargo'; $env:PATH='D:\cargo\bin;'+$env:PATH`

## 构建命令

```powershell
npm run build                          # 前端 -> dist/
cd src-tauri
cargo build --release                  # MSVC 单 exe
```

产物：`src-tauri\target\release\sgltoolkit.exe`（约 12.1MB）。
发布：复制到 `publish\sgltoolkit.exe`（`target/`、`publish/` 均已 gitignore，不入库）。

## 验证标准

- PE 导入表**不得**包含 `WebView2Loader.dll`；链接器版本应为 14.50。
- 空目录中单独运行 exe，进程应稳定存活（WebView2 Runtime 由系统提供）。

## 注意事项

- `.cargo/config.toml` 已删除（原指向 MinGW 的硬编码链接器），不要重新添加。
- 当前分支 `codex/restore-msvc-single-exe`，提交 `4a44a12`。
- 本环境删除文件请用 .NET API（`[System.IO.File]::Delete` / `[System.IO.Directory]::Delete`），`Remove-Item` 会被执行策略拦截。
- SDK 安装器与日志在 `D:\sdk_setup\`（winsdksetup.exe、install2.log、kits_backup.reg 注册表备份）。
- `src-tauri\target\release\WebView2Loader.dll` 是 8/1 GNU 构建的残留文件，不影响 MSVC 产物，可删除。
- C 盘 `C:\Program Files (x86)\Windows Kits\10\` 仅有 5MB UCRT 分发残留，可保留。
- 如后续需增补 SDK 组件：`winsdksetup.exe /features <OptionId> /installpath "D:\Windows Kits\10" /quiet /norestart`（需 UAC 提权）。
