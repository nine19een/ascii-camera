# ASCII Camera Phase 06.3 独立工程审计报告

后续状态（2026-11-24，Phase 06.3.2）：本报告保留原审计时点的事实与结论。项目负责人已明确确认雕塑素材的使用、公开再分发及相关展示授权；新版 Word / PDF 已同步至 1.0.0，PDF 为 11 页。此前素材及 PDF 待办已关闭，当前正式 Git 封板记录见 [Phase 06.3.2 报告](phase-06.3.2-git-freeze-report.zh-CN.md)。

审计日期：2026-11-24（Asia/Shanghai）。对象为当前完整工作区，基准 HEAD 为 `37ebf0d00256f207387642275c202684664026eb`。审计者：Codex。

后续状态：本报告保留 Phase 06.3 时点的结论和数据；E04、版本统一与 Word / PDF 的后续处置见[Phase 06.3.1 收尾报告](phase-06.3.1-closeout-report.zh-CN.md)。

**最终结论：CONDITIONAL_READY。** 修复后的本地工程检查、24 项容器测试、Windows Edge 生产构建冒烟、实际媒体完整解码和定位均通过，可进入负责人审阅与封板确认。公开分发前仍须解决演示素材再分发范围、gifenc 量化器上游授权链，以及正式版本与项目介绍同步。这个结论不代表已经发布，也不代表真实手机验收完成。

## 1 仓库与完整工作区

| 项目 | 实际状态 |
| --- | --- |
| 工作目录 / Git 根目录 | 均为 `C:\Documents\GitHub-Projects\ascii-camera` |
| 分支 | `feat/phase-1-playable-prototype` |
| HEAD | `37ebf0d00256f207387642275c202684664026eb`，Initial commit |
| 远程 | origin：`https://github.com/nine19een/ascii-camera.git`，fetch / push URL 相同 |
| Git 已跟踪文件 | 只有 `LICENSE`、`README.md`；两者进入本轮时均已有工作区修改 |
| 暂存区 | 空，无新增暂存内容 |
| 源码与交付物 | 绝大多数为未跟踪文件，本轮逐目录检查，未仅依赖 git diff |
| 初始非生成文件清单 | 89 个文件，含本地旧文案快照；保存在本地 `.audit-backup/workspace-inventory-before.json`，附 SHA-256 |
| 初始忽略目录 | `.audit-backup/`、`node_modules/`、`dist/` |
| 最终候选清单 | 96 个路径：2 个已跟踪且已修改文件、94 个未跟踪文件；暂存区仍为空 |
| `.cert/` | 当前不存在；规则已覆盖 |
| 子目录指令 | 项目及其祖先目录未发现适用的 AGENTS.md；未创建子代理 |

本地备份 `.audit-backup/ascii-camera-backup-20261124-pre-phase06.1.zip` 存在，1,184,330 字节，ZIP 87 项，CRC 全部通过。SHA-256：`3c2465e2a0c4bb93f98b66bcc5aa1daaf7408092e4778851ca14398f9388dbb5`。它是 Phase 06.1 前备份，**不能视为包含 Phase 06.2 全部交付物的当前快照**。备份及原有 `probe-chrome-raw-avc1.mp4.bin` 均保留。

指定的 `claude/phase-06.1-audit-report.md` 在工作区及该 ZIP 中均未找到。没有伪造或重建前序报告；前序文档中的测试描述只作为历史线索。

本轮仅执行 Git 只读命令；没有 add、commit、fetch、pull、push、merge、Tag、reset、clean 或 stash。最终 HEAD、分支及暂存区保持原状态。相对审计前清单，没有删除任何原有文件，正式图表、截图、GIF、演示视频、海报及 Word / PDF 的字节均未改变。

## 2 独立工程结论

| 模块 | 审查结论与证据 |
| --- | --- |
| ASCII 核心 | `AsciiRenderer` 以实测字宽比计算行数，镜像作用于采样；BT.601 整数近似、直方图 2% / 98% 自动色阶、对比度、亮度的顺序与 README 一致。颜色模式使用文字遮罩和 source-in；调色板在 OKLCH 插值并缓存 256 级 LUT。未改核心算法。 |
| 字符与调色板 | 四套内置字符梯度加自定义；Unicode 方块与 ASCII 的区别有说明。自定义输入过滤控制字符、宽字形等，无效输入保留最后有效梯度。内置调色板修改时复制为自定义，未直接污染默认值。 |
| 摄像头 | 仅 `audio:false`、视频权限；会话编号取消过期异步结果。实际浏览器注入延迟后，Stop 之后才返回的流全部 ended；设备不存在时原流保持 live；模拟 ended 事件后回到演示，原流释放。真实双摄像头驱动的先释放再恢复路径仅完成代码审阅。 |
| FrameSource / DemoSource | 摄像头、演示进入同一主渲染器；演示只有一个 video、一路解码，帧画布共享给主预览和六张卡片。实际 DOM 检查为一个 demo video、六张预设 canvas。视频加载失败后海报仍可渲染、导出 GIF。 |
| React 与循环 | 高频渲染在 React 外，参数经 ref 写入；startMainLoop 启动前停止旧循环。冻结保存源帧，参数可重绘；录制另有固定尺寸画布和独立时序。语言切换不改变输入 / 录制实例。 |
| 导出 | 视频和 GIF 互斥，设备切换锁定；PNG、视频、GIF 都读取最终合成画布。容器边界及 PNG 异步清理问题已小范围修复，详见下文。 |
| 桌面与移动布局 | Edge 1440×1000、1100×800、390×844、844×390 下运行通过；compact / landscape 状态切换正确。模拟不支持元素全屏时，沉浸式预览及返回退出通过。这里没有使用真实 iPhone。 |
| 国际化 | 英文按中文 Messages 类型约束；错误保留类别，界面随语言重新生成文字。实际在录制中中英文互切成功；中英文容器降级提示均存在。 |
| 本地处理 | 源码无 fetch、XHR、WebSocket、sendBeacon、统计 SDK 或上传端点；运行观测均为同源 GET。作者网站只由用户点击链接访问，没有自动请求。 |

## 3 P0 至 P3 问题清单

没有发现修复后仍可复现的 P0 工程故障。以下“公开分发前必须确认”事项不等同于已认定侵权。

| 编号 | 等级 | 证据与影响 | 状态 |
| --- | --- | --- | --- |
| E01 | P1 | MP4 原先只检查样本不越过文件尾，没有要求位于 mdat。把首个 trun data_offset 改为 `-moof.start`，指向 ftyp，改写仍返回 fallback=false，能交付错误媒体字节。 | **已修复**：要求每个样本位于实际 mdat 数据区；相同探针现在 fallback=true 且保留原 Blob。 |
| E02 | P1 | MP4 固定字段 / 计数缺少完整盒内校验；损坏 count 可能驱动过量循环，version 0 时长可截断为 32 位。 | **已修复**：校验载荷、版本、精确整数、样本计数及描述索引；限制无效尺寸 / 时长，溢出时降级。未新增通用解复用能力。 |
| E03 | P1 | WebM 对已知 Segment / Cluster 长度使用 Math.min，声明长度超出输入仍可能被截短后当成改写成功；非有限录制时长可写入无效 Duration。 | **已修复**：拒绝越界已知长度、无效时长、非精确时间戳及无效 TimecodeScale；新增回归。 |
| E04 | P1 | gifenc 1.0.3 的包与 LICENSE 声明 MIT，但其 `src/pnnquant2.js:1` 标注 Modified from PnnQuant.js，保留另两组版权。上游当前 LICENSE 是 MPL-2.0。包元数据不能独立证明所有改编代码的再许可范围。 | **待确认，公开分发门槛**：查明 gifenc 所采用版本的授权依据，或落实相应源码 / 通知义务；不自行把整个项目改成 MPL，也不替换编码器。 |
| E05 | P1 | 雕塑素材仅记录“允许在非商用软件使用”，未附可核对的公开再分发条款；视频、海报、截图、GIF、介绍图片均涉及该素材。 | **待确认，公开分发门槛**：由负责人对照实际条款确认仓库、部署和展示材料的分发范围。已保留素材并明确 MIT 排除范围。 |
| E06 | P2 | 用延迟 toBlob 回调复现：pagehide 清理之后回调仍能新建一个 Blob URL 并触发下载。 | **已修复**：generation 标记使离页 / 卸载后的回调失效，并在发起截图时保存正确尺寸。浏览器探针 URL 数从 1 变为 0。 |
| E07 | P2 | `Claude outputs/` 旧文案快照原本会进入未跟踪待提交清单。 | **已修复**：加入根目录忽略规则；本地文件保留。另补 pfx / cer / der 证书规则。 |
| E08 | P2 | 生产 JS 未携带完整依赖许可文本，README 的 MIT 表格不能替代分发时的版权通知。 | **已补充** `public/third-party-licenses.txt`，构建复制到 dist，含 React / React DOM / Scheduler、gifenc、Vite 生成 helper 的通知；这项补充不解决 E04。 |
| E09 | P2 | 需求基线仍写后续阶段未开始；演示制作说明的精确字节数与当前视频 / 海报不符。 | **已修复**：更新到 Phase 06.3；当前 998,824 / 31,527 字节。原 PSNR 等历史制作数据明确未在本轮重测。 |
| E10 | P2 | Word / PDF 第 10 页仍写 18 项测试，第 11 页仍说 Edge 未覆盖；现为 24 项及 Edge 独立验证。 | **待同步**：与 v1.0.0 一次性更新文字并重导 PDF。本轮保留获认可的二进制交付物；本机 bundled LibreOffice 缺失，不能完成 Word 重新排版验证。 |
| E11 | P2 | 首次 MP4 压力冒烟最大 PTS 间隔约 198 ms；最终复验为 203.6 ms。全屏 / 布局 / 编码初始化等主线程负载下并非严格恒定 30 FPS。 | **保留限制**：视频持续、可完整解码和定位；不改录制架构，不宣称消除所有卡顿。 |
| E12 | P2 | 原 Phase 06.1 报告及其浏览器脚本未保存在当前仓库；历史断言无法完整重现。现有 fixture 只覆盖单轨 Chrome H.264 / VP9，未独立覆盖全部 ctts、co64 和 Safari 输出分支。 | **已补本轮复验脚本**；其余覆盖缺口如实保留，不将代码审阅写成实测。 |
| E13 | P3 | 可后续按实际兼容目标加入 Firefox / Safari 生成的 fixture 和自动化环境。 | 可选；本轮不新增产品功能或依赖。 |

E04 的直接依据：[gifenc 包的许可证](https://github.com/mattdesl/gifenc/blob/master/LICENSE.md)、[PnnQuant.js 当前许可证](https://raw.githubusercontent.com/mcychan/PnnQuant.js/master/LICENSE)。当前上游许可证不直接证明历史改编版本的法律状态，因此这里记录的是授权链未闭合。

## 4 MP4 容器专项

入口为 `src/export/canvasRecorder.ts`，收尾为 `src/export/mp4Finalize.ts`。录制固定偶数尺寸，最多 1920×1080；30 FPS 为目标时间轴，优先 captureStream(0) + requestFrame，不支持时用 captureStream(fps)。构造编码器时会在同一封装的 MIME 候选间重试，运行时编码错误会回调 UI 并释放采集轨道。

改写路径保留 stsd / 编码配置，汇总 trun 样本信息，输出 `ftyp | moov | mdat`；生成 stts、stsz、stsc、stco / co64，按需生成 stss / ctts。媒体字节通过原 Blob 的 slice 组合，没有重新编码。tfdt 差异用于修正片段间时序；代码针对应用自己的单视频轨输出，不是任意 MP4 文件转换工具。

新增边界校验位于 `mp4Finalize.ts` 的 requirePayload、parseFragment 和 remuxFragmentedMp4：

- 盒长及偏移必须为精确整数，盒子必须落在父边界内。
- tkhd / mdhd / trex / tfhd / tfdt / trun 的固定字段与表长度先校验再读取。
- 拒绝损坏计数、非 1 样本描述索引、空样本和非正样本时长。
- 每段样本必须完整位于某个真实 mdat 的数据范围内，不能指向文件头或 moof。
- 最后一帧原时长为 0 时仍沿用前一帧；超出当前 version 0 时长字段范围则保留原文件，不静默截断。

无法识别的受支持格式异常由 finalizeMp4 标记 fallback；其他读取错误由 CanvasRecorder 的最终兜底交付原始 Blob。普通 MP4 不必改写时原样返回。双语提示分别在 `src/i18n/en.ts:80`、`src/i18n/zh-CN.ts:90`，说明部分播放器可能无法显示时长或拖动。原始数据本身损坏时，降级保留数据不等于能修好录像。

fixture 独立解析验证输出只含 ftyp / moov / mdat、样本大小及位置、时长表、同步样本索引。FFprobe 读取到 64 个 H.264 包，改写前后逐包 SHA-256 完全一致，64 帧全部解码，时长 2.203233 秒；50% / 90% seek 后都实际解出一帧。

关于分片、样本数据和寻址的交叉核对采用 [W3C ISO BMFF 字节流说明](https://w3c.github.io/mse-byte-stream-format-isobmff/)。这不是对所有 ISO BMFF 变体的合规认证。

## 5 WebM 与 GIF 专项

`webmFinalize.ts` 按 EBML 元素遍历，不在编码块内搜索 Cluster 标记；未知长度 Cluster 遇到下一个 Segment 一级元素结束。输出已知长度 Segment / Cluster、Duration、SeekHead 和 Cues，原 Cluster 载荷保持不变。每个以关键帧开头的 Cluster 生成 Cue，位置相对 Segment 数据起点；fixture 的独立解析器验证 Cue 时间、指向及父子边界。

新校验不再截短超出文件的已知容器长度。超过 8 字节的时间戳仍拒绝；本轮再补精确整数及有效比例检查。失败返回原 Blob 并提示。长期 WebM 的整文件内存问题按本轮约定保留；如果标签页直接被系统终止，异常兜底无法保证把原文件交付给用户。

VP9 fixture 原始文件无 Duration，改写后为 2.200000 秒，65 个编码包逐包 SHA-256 相同，全部 65 帧解码，50% / 90% 定位通过。[Matroska 官方布局说明](https://www.matroska.org/technical/diagram.html)与 [RFC 9559](https://www.rfc-editor.org/rfc/rfc9559.html)用于核对 Cluster / SeekHead / Cues 的关系。

GIF 由 `gifRecorder.ts` 每 100 ms 采样，以 Transferable 传入 `gif.worker.ts`，逐帧量化 256 色；主线程仅保留一个等待计算 delay 的帧。取消、完成、异常及离页会终止 Worker。这里没有 worker 背压，低性能设备上的消息队列不等同于只有一个未压缩帧；10 秒上限限制了累计规模。本轮不改编码架构。

实际 GIF 完整解码通过；短 GIF 为 17 帧 / 1.62 秒 / 640×360，自动上限测试为 100 帧 / 10.00 秒 / 374×210。取消后恢复空闲，页面无运行时异常。

## 6 测试与生产构建实际结果

环境：Windows PowerShell，Node 22.22.1，npm 10.9.4；锁定版本 Vite 8.3.8、TypeScript 7.0.2、Vitest 5.1.1、Oxlint 1.94.0。浏览器为 Microsoft Edge 158.0.4370.33，headless；FFmpeg / ffprobe 8.1.1。

| 检查 | 结果 |
| --- | --- |
| npm ci | 成功，按 lockfile 安装，未修改 package / lock 版本 |
| 审计前 npm test | 2 个测试文件，18 / 18 通过 |
| 修复后 npm test | 2 个测试文件，24 / 24 通过；没有删除测试或放宽已有断言 |
| npm run typecheck | 通过，项目 references 含源码、配置及测试 |
| npm run lint | 通过 |
| npm run build | 通过；主 JS 327.21 KB，gzip 104.66 KB，Worker 9.83 KB |
| npm audit --json | 0 项已知漏洞，含开发依赖；这是本次 registry 查询结果，不是零风险保证 |
| git diff --check | 已跟踪文件通过；未跟踪源码另由 typecheck / lint 及完整文件清单覆盖 |
| 生产预览 | 仅绑定 `127.0.0.1:4173`，无部署 |

新增 6 项容器回归：MP4 的非 mdat 偏移 / 跨界、异常计数、零尺寸或时长溢出、不精确 64 位盒长；WebM 的已知长度越界及无效录制时长。原测试确有独立解析器、真实 MediaRecorder fixture 和编码字节比对；随机损坏测试只是有限样本，不构成任意坏输入安全性的数学证明。

生产构建通过 UI 导出 PNG、两段连续 MP4、WebM、GIF，录制期间切换预设、Blocks / Binary、密度、语言、比较、冻结、全屏、面板、摄像头开关及窗口尺寸。录制时封装选择被锁定，结束后可切换。结果无 fallback 提示，未发现损坏或中断成多段文件。

| 最终实际文件 | 尺寸 | 时长 | 完整解码 | 50% / 90% seek |
| --- | --- | --- | --- | --- |
| smoke-png.png | 1184×666 | 单帧 | 1 帧 | 不适用 |
| smoke-mp4.mp4 | 1184×666 | 2.448067 s | 67 帧 | 均通过 |
| smoke-mp4-repeat.mp4 | 1184×666 | 1.332767 s | 40 帧 | 均通过 |
| smoke-webm.webm | 1184×666 | 3.947099 s | 119 帧 | 均通过 |
| smoke-gif.gif | 640×360 | 1.62 s | 17 帧 | 不适用 |
| auto-limit.gif | 374×210 | 10.00 s | 100 帧 | 不适用 |

初次 FFmpeg 默认 null 输出出现一条 DTS 诊断。核对输入 packet 后，DTS 严格递增；诊断来自可变采样间隔被输出的 1/30 时间基取整。最终按 `-fps_mode passthrough -enc_time_base demux` 保留输入时间基完整解码，stderr 为空。没有丢弃输入错误、删除失败测试或靠扩展名认定成功。

独立资源检查：打开页面未调用 getUserMedia；只请求视频；停止后 liveTracks=0；pagehide 后 Object URL 数从 1 降到 0。额外覆盖了权限迟到、权限拒绝、模拟设备不可用、轨道结束、PNG 迟到回调、演示视频加载失败及沉浸式历史返回。

未实测：真实双摄像头驱动竞争、真实浏览器关闭 / BFCache 全流程、Firefox / Safari、真实 iPhone Safari / Android Chrome 的摄像头与相册。真实手机完整验收按约定留在正式 HTTPS 环境，不填写通过。

复验入口见 `tools/audit/README.md`。本地证据保留在忽略目录：`browser-results.json`、`lifecycle-results.json`、`media-results.json`、导出文件和首帧图；测试仅使用演示素材及虚拟摄像头。

## 7 安全 隐私与依赖

对待发布文件执行了文件类型清点、文本密钥模式搜索、网络调用搜索、依赖树许可证及 npm audit 检查，并检查忽略目录中的备份 / 测试产物。没有发现待提交的证书、私钥、CA、令牌、`.env`、私人摄像头作品、原始 MOV、raw、日志或大体积中间视频。单纯模式搜索不代替全部秘密检测。

所有产品素材来自本地 src / public，字体为系统字体；没有远程字体、分析或上传请求。浏览器观测为页面、JS、CSS、favicon、视频和 Worker 的同源 GET。四个 localStorage 键仅保存语言、面板、采集格式和视频封装。

React 19.3.1、React DOM 19.3.1、Scheduler 0.28.0、gifenc 1.0.3 均在包元数据声明 MIT。完整锁文件还含 Apache-2.0、MPL-2.0（lightningcss 构建依赖）、ISC、BSD-3-Clause、0BSD；不能把全部传递依赖概括成 MIT。已补运行时通知文件；gifenc 上游问题见 E04。

`npm ci` 和 audit 的 registry 访问属于本地工程工具，不属于产品运行时上传。未安装新产品依赖、未升级 lockfile，未调用远程安全扫描服务。

## 8 展示材料完整性与事实核查

| 交付物 | 结果 |
| --- | --- |
| README.md / README.zh-CN.md | 齐全；技术参数、预设表、处理链、导出限制和隐私表述相符。相对文件 / 图片链接均存在，快速开始锚点与标题对应。补了本轮 Edge 验证和文档图片授权范围。 |
| architecture.en.svg / architecture.zh-CN.svg | 2 张齐全，XML 有效；统一源、单主循环、共享预览、录制分支与代码一致。 |
| workflow.en.svg / workflow.zh-CN.svg | 2 张齐全，XML 有效；输入 / 冻结 / 采样 / 色阶 / 绘制及导出流程一致。 |
| 六张截图 | desktop、adjust 两语言各 1920×1200；mobile 两语言各 1835×1266。都能解码。人物内容为指定雕塑，没有私人摄像头图像。 |
| README GIF | 640×360，159 帧，可解码；未重新制作。 |
| 中文 Word / PDF | 齐全，DOCX ZIP 结构可读、5 个内嵌图，PDF 11 页。全部有实质文字的 Word 段落归一化空白后都能在 PDF 找到。11 页 PDF 均渲染并目视检查，无明显缺字、裁切或重叠。 |

Word 原生重新渲染尝试失败：bundled 环境没有 soffice.exe，未改用用户桌面 LibreOffice。因而本轮确认了内容一致及现有 PDF 的排版，**没有声称已独立验证 Word 在当前 Office 环境中的重新分页**。两份既有二进制文件均未修改。

主要技术事实 1280×720 / 30 FPS / 10 秒 / 300 帧 / H.264 High@4.0 / BT.709(tv) 已由本地 ffprobe 核对。制作说明中的 PSNR、遮罩统计、循环差异和前序 mkvinfo / MP4Box 成绩缺少本轮原始材料，不重新背书。当前未安装 / 使用 mkvinfo 或 MP4Box；结构检查由独立单元测试及 FFmpeg 交叉验证完成。

现有 Word / PDF 的 18 项测试与浏览器范围属于旧快照，应在正式版本时同步。没有虚构正式访问地址；文档均明确尚未公开部署。没有重设计图表、改截图或增加英文项目介绍。

## 9 本轮已完成的小范围修复

1. `src/export/mp4Finalize.ts`：盒内字段与样本计数校验、mdat 区间校验、精确整数及 version 0 时长保护。
2. `src/export/webmFinalize.ts`：拒绝越界的已知长度、无效 Duration / 时间戳 / TimecodeScale。
3. `src/hooks/useExports.ts`：阻断页面离开后的 PNG 异步回调，并保存发起时尺寸。
4. `tests/mp4Finalize.test.ts`、`tests/webmFinalize.test.ts`：新增 6 项回归，18 → 24。
5. `.gitignore`：忽略旧文案快照及更多证书格式，保留全部本地文件。
6. `README.md`、`README.zh-CN.md`、`docs/PROJECT-BRIEF.zh-CN.md`、`docs/demo-video.zh-CN.md`：修正阶段、验证范围、精确素材尺寸和授权边界。
7. `public/third-party-licenses.txt`：补分发版权通知；`tools/audit/`：保留本轮可复验脚本和环境说明。

没有改 ASCII 算法、录制架构、产品功能、UI 设计或正式素材，也没有改动用户原有 LICENSE 修改。

## 10 文件保留 忽略与清理建议

完整候选提交路径见同目录 `phase-06.3-release-files.txt`；这是供负责人审阅的清单，没有执行暂存。

| 分类 | 路径 / 内容 | 建议 |
| --- | --- | --- |
| 建议提交 | `.gitignore`、`.nvmrc`、`.oxlintrc.json`、package / lock、全部 tsconfig、vite.config、index.html、LICENSE、两个 README | 构建、许可与入口基线 |
| 建议提交 | `src/`、`public/` | 产品实现；雕塑视频 / 海报的公开分发仍受 E05 条件约束 |
| 建议提交 | `tests/`、`tools/demo-video/`、`tools/audit/` | 回归、制作与独立审计复验价值；fixture 首帧是人工色块 / frame 0 测试图 |
| 建议提交 | `docs/` 全部正式文档、资源和本轮审计 | 含 Word / PDF、SVG、6 张 WebP、GIF；素材展示的公开分发仍受 E05 约束 |
| 本地保留且忽略 | `.audit-backup/` | 原 ZIP 与全部审计证据 / 测试下载 / PDF 渲染图；不要提交，不在本轮删除 |
| 本地保留且忽略 | `Claude outputs/` | 旧文案快照；可供回溯，不提交 |
| 已忽略 | `node_modules/`、`dist/`、`.cert/`、`.env*`、证书 / 私钥扩展、MOV / raw、常见测试输出 | 不提交；当前 `.cert/`、MOV 等不存在 |
| 可在确认后清理 | `.audit-backup/` 内重复探针、重复首帧、过期 smoke 文件、docx-render 空目录，以及可重建 dist | 先保留；原备份 ZIP 不列入自动删除范围 |
| 需找回或记录缺失 | `claude/phase-06.1-audit-report.md` | 不把缺失报告当作已验收证据；如找回，可分类保留 |

已用 git check-ignore 验证 `.audit-backup/`、`.cert/key.pem`、node_modules、dist、旧快照、MOV、rootCA-key.pem 命中规则。正式素材最大文件是 README GIF，约 2.93 MB；没有必须移除的大体积原片。C2PA 按要求保留，不批量清元数据。

## 11 版本号及阶段统一方案

当前 `package.json`、`package-lock.json` 顶层及根 package 都是 **0.1.0**；Word / PDF 封面同为 0.1.0，尚无数值冲突。README 目前没有单独版本号；PROJECT-BRIEF 已更新为计划 v1.0.0、当前审计准备状态。

本轮保持版本不变，先由负责人确认以下一次性封板方案：

1. 发布条件关闭后，同步 package 与 lockfile 两处版本为 1.0.0。
2. Word 封面改 1.0.0，同时更新第 10 / 11 页的 24 项测试、Edge 结果和授权确认结论，再导出 PDF，保持已有版式并重新检查全部页面。
3. README 与 PROJECT-BRIEF 的发布状态同步；公开 HTTPS 地址只有实际可访问时再填入，手机验收结果只有实际完成后再填写。
4. 对最终字节运行测试 / 构建 / 容器与浏览器复验，再由负责人授权正式 Git 提交和后续 Tag。未授权前不创建 `v1.0.0`。

private:true 用于防止误发布 npm 包，与静态站点发布不冲突，无需为 v1.0.0 擅自移除。

## 12 正式封板前的剩余事项

- **确认 gifenc 量化器授权链**，形成可核验的版本与许可记录；如需增加源码或通知，在明确范围后补齐。
- **核对雕塑素材实际再分发条款**，覆盖代码仓库附件、网页视频、海报、截图、GIF、项目介绍；不自行扩大非商用使用授权。
- **批准并执行 v1.0.0 同步方案**，包括 Word / PDF 的旧测试数据；当前 Word 重渲染环境缺口需在这一步解决。
- **确认候选文件清单**，并在提交前补一份包含 Phase 06.2 / 06.3 的完整本地备份；现有 ZIP 的时点不足以覆盖最新成果。
- 真实 iPhone Safari / Android Chrome 完整摄像头及相册验收继续保留到正式 HTTPS 环境；Firefox / Safari 等兼容性保持未验证表述。

本轮工程审计已完成，停止于 **CONDITIONAL_READY**。等待负责人确认正式封板；没有提交、推送、部署、创建正式版本 Tag、修改个人网站或制作社交平台内容。
