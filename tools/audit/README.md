# Phase 06.3 本地复验

在项目根目录运行。脚本只测试本地生产构建，生成文件放在 Git 已忽略的 `.audit-backup/`。使用虚拟摄像头，不采集个人摄像头画面，不执行 Git 写操作。

先执行项目常规检查：

```powershell
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
```

保留 preview 终端，在另一个终端运行以下脚本。浏览器脚本需要可用的 Playwright 模块及本地 Edge；它们没有被加入产品依赖。模块可通过环境变量指定，留空则按正常 Node 模块解析查找 `playwright`。`ASCII_AUDIT_BROWSER` 可指定本地 Playwright 浏览器通道，默认 `msedge`。

```powershell
# 按本机实际位置填写；已能解析 playwright 时无需设置。
$env:ASCII_AUDIT_PLAYWRIGHT = 'C:/path/to/node_modules/playwright'
node tools/audit/browser-smoke.cjs
node tools/audit/lifecycle-smoke.cjs
```

`browser-smoke.cjs` 通过界面导出 PNG、两段连续 MP4、WebM 和 GIF；检查录制中切换预设、字符集、密度、语言、全屏、面板、摄像头开关，移动布局、轨道与 URL 清理，并断言请求来自本地同源。输出 `browser-results.json`。

`lifecycle-smoke.cjs` 检查迟到的权限结果、失败的设备切换、轨道结束、页面离开后的 PNG 回调、视频失败后的海报、权限拒绝、模拟不支持元素全屏时的沉浸式返回，以及 GIF 10 秒自动停止。输出 `lifecycle-results.json`。模拟环境不等于 iPhone / Android 实机验收。

使用 Node 22.22.1 生成 fixture 的最终容器，再使用本地 Python 3、FFmpeg / ffprobe 校验完整解码与定位：

```powershell
node --experimental-strip-types tools/audit/finalize-fixtures.mjs
# ffmpeg.exe / ffprobe.exe 已在 PATH 时可以省略此变量。
$env:ASCII_AUDIT_FFMPEG_BIN = 'C:/path/to/ffmpeg/bin'
python tools/audit/verify-media.py
```

FFmpeg 脚本使用 `-xerror`、`-fps_mode passthrough -enc_time_base demux` 保留输入时间基，检查完整解码、50% / 90% seek 后实际出帧，并逐包比较 fixture 改写前后的编码数据 SHA-256。输出 `media-results.json` 及本地首帧图。这里使用 FFmpeg 8.1.1；较旧版本可能不支持相同参数。

脚本不会安装浏览器或依赖；缺少环境时应如实记录，不能把跳过记为通过。完整结论与限制见[审计报告](../../docs/audits/phase-06.3-audit-report.zh-CN.md)。

Phase 06.3.1 增加第三方源码分发校验，生产构建后运行：

```powershell
node tools/audit/verify-third-party.mjs
```

校验 v1.0.0 版本一致、gifenc 1.0.3 的 CJS / ESM source map 与原始源码一致、dist 中的对应源码与许可文本散列一致，以及 GIF Worker 中的源码 / 通知链接有效。`public/vendor/` 是逐字保留的第三方对应源码，不按自有代码风格重新 lint 或改写。
