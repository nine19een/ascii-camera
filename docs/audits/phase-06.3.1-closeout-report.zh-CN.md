# ASCII Camera Phase 06.3.1 正式封板收尾报告

后续状态（2026-11-24，Phase 06.3.2）：本报告保留原审计时点的事实与结论。项目负责人已明确确认雕塑素材的使用、公开再分发及相关展示授权；新版 Word / PDF 已同步至 1.0.0，PDF 为 11 页。此前素材及 PDF 待办已关闭，当前正式 Git 封板记录见 [Phase 06.3.2 报告](phase-06.3.2-git-freeze-report.zh-CN.md)。

日期：2026-11-24（Asia/Shanghai）。版本：**v1.0.0**。本轮完成授权链核查、第三方分发材料、版本与 Word 同步、针对性复验和完整本地备份；没有新增产品功能、调整 UI 或重构核心实现。

**建议：工程成果可进入用户授权后的本地 Git 封板；公开发布维持 CONDITIONAL_READY。** gifenc 的 E04 已通过历史证据与对应源码分发措施处理。雕塑素材公开再分发范围仍待确认；项目介绍 PDF 按用户最新指令保留旧件，另行转换验收后替换。本轮没有暂存、提交、推送、合并、创建 Tag 或部署。

## 1 gifenc 授权链结论与证据

锁定的 gifenc 1.0.3 于 2021-03-07 发布，registry gitHead 为 `15e2c3e65ed03c977b42fec48de59b05ee9b9f54`。npm tarball 的 SHA-1、SHA-512 SRI 与锁文件一致；pnnquant2.js 与对应 gitHead 源码逐字一致。

gifenc 于 2021-02-25 引入该量化器，代码头明确标注从 PnnQuant.js 改编。当前上游默认历史中 2023 年加入的 MPL 文本不足以解释早期引用，因此追溯了保留旧历史的分叉，再确认原 mcychan 仓库可以按旧 SHA 读取：

- [gifenc 1.0.3 对应提交](https://github.com/mattdesl/gifenc/commit/15e2c3e65ed03c977b42fec48de59b05ee9b9f54)。
- [2021-02-25 引入 pnnquant2.js 的提交](https://github.com/mattdesl/gifenc/commit/463e079fe0f64eff2ed8a170b0a932ef3ff4133a)。
- [早于引入的 PnnQuant.js 历史源码](https://github.com/mcychan/PnnQuant.js/blob/0dc2664d2d9582d1b6b492936bdd03687e385275/src/pnnquant.js)与[同版本 MPL-2.0 许可证](https://github.com/mcychan/PnnQuant.js/blob/0dc2664d2d9582d1b6b492936bdd03687e385275/LICENSE)，日期为 2021-02-25T08:22:31Z。
- [2020-02-05 的初始 MPL 记录](https://github.com/DamSenViet/PnnQuant.js/commit/857540477c4d931592e7227e4d21cd90d7663635)，提交者为 Miller Cy Chan；该仓库是原项目的分叉。

**明确结论：不能把派生量化器仅按 gifenc 包级 MIT 声明分发；应保留并履行其历史 MPL-2.0 义务。** 精确导入的上游 commit 未被 gifenc 记录，本轮不虚构逐字引用版本；核查记录区分了已证实的 gifenc 发布源与可核验的预引用历史快照。

本轮已落实：

1. `public/vendor/gifenc-1.0.3/` 包含锁定包的 8 个准确源文件、原 package.json、MIT 许可、历史 MPL 全文、版权及改编说明、SHA-256 清单。
2. Vite 将这些文件原样复制到静态构建。生产 GIF Worker 文件头指向对应源码与完整通知；浏览器 HTTP 检查均返回 200，响应字节与源文件相同。
3. `public/third-party-licenses.txt` 和中英文 README 明确区分 PNN 派生源文件 MPL 与 gifenc 贡献的 MIT 通知；根 LICENSE 与 ASCII Camera 自有独立源码仍为 MIT。
4. 为避免改写第三方原始代码，仅在 lint 中排除 `public/vendor/`；自有代码和测试的检查范围未放宽。

独立诊断构建的 Worker source map 确认实际输入为 `node_modules/gifenc/dist/gifenc.js`，不是猜测其 ESM 入口。该 CJS 文件与 npm 包逐字一致，CJS / ESM 两份发布 map 的 8 个 sourcesContent 都与附带源码一致。诊断 maps 留在忽略目录，正式 dist 不新增 maps。

按 [MPL 2.0 第 3.1 至 3.4 节](https://www.mozilla.org/en-US/MPL/2.0/)与 [Mozilla FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)，源码、通知和独立文件组成较大作品的处理可以保留 ASCII Camera 自有代码的 MIT 许可。没有替换编码器，也没有自行认定获得额外的 MIT 再许可。

完整版本、历史、摘要和措施见[专项记录](../licenses/gifenc-1.0.3-provenance.zh-CN.md)。E04 的工程处置已关闭；这不代替雕塑素材授权确认。

## 2 雕塑素材仍需确认的事项

现有“允许非商用软件使用”的用户确认继续保留，不扩大为公开再分发授权。负责人仍须对照实际条款确认：

- 把 `src/demo/statue-demo.mp4` 和海报加入公开仓库、让浏览器从部署站点下载是否被允许。
- README 截图、动态 GIF、项目介绍中的素材展示及再分发范围。
- 条款是否要求署名、来源链接、授权凭证随附或其他展示条件。

视频、海报、4 张 SVG、6 张截图、README GIF 和现有 PDF 的原字节均保留；没有替换、删除或批量清理元数据。视频及其衍生展示继续明确排除在 ASCII Camera 的 MIT 范围之外。

## 3 v1.0.0 版本与阶段统一

| 文件 / 状态 | 结果 |
| --- | --- |
| package.json | 1.0.0，保留 private:true 和自有代码 MIT 声明 |
| package-lock.json | 顶层与根 package 均为 1.0.0；依赖版本及 gifenc SRI 未改变 |
| 中英文 README | 标记 v1.0.0 封板准备、功能冻结、尚无部署或正式 Tag；披露素材授权及 PDF 交接状态 |
| PROJECT-BRIEF | 更新至 Phase 06.3.1，标记 v1.0.0、真实手机待验收、PDF 交接及素材分发待确认 |
| 项目介绍 Word | 1.0.0、24 项通过、历史 Chrome 与 Windows Edge 158 独立验证、条件就绪结论及第三方许可边界 |
| 项目介绍 PDF | **按用户指令保留原 0.1.0 文件**，待用户另行转换后替换，不声称已同步 |
| 旧 Phase 06.3 报告 / 96 项清单 | 保留为历史快照，原报告增加后续报告链接；不把旧数据伪装为当前状态 |
| 公开 URL / 手机成绩 | 没有新增未经验证的地址或验收结果 |

本轮未找回或重建 Phase 06.1 历史报告。

## 4 Word 与 PDF 交接

原 PDF 元数据为 LibreOffice 24.2，11 页。本机虽可用 Microsoft Word 16 后台只读导出，但**未修改的原 DOCX 就被导出成 15 页**，不满足已有 PDF 的版式要求；该基线只保存在本地忽略目录。

用户已明确指示：更新 Word，暂不重新生成或覆盖正式 PDF；后续由用户把新版 Word 交给 ChatGPT 的 LibreOffice 25.2.3.2 环境单独转换和验收。收到该指令后没有继续导出 PDF。

Word 使用 OOXML 文字替换，共修改 8 处内容，未重建文档：

- ZIP 内只有 `word/document.xml` 内容变化。
- 清空文字节点后，修改前后 document.xml 完全相同。
- styles、字体、run / 段落属性、页面设置、关系、5 个嵌入图片及其他 ZIP 部件逐字相同，CRC 通过。
- 检查新版正文含 1.0.0、24 项通过、Windows Edge 与 MPL-2.0，不再含 0.1.0。
- 正式 PDF SHA-256 与本轮开始前完全相同。

这证明文档结构和排版设置被保留，不代表已完成新文字在 LibreOffice 中的最终分页验收。当前新版 Word 可交接，PDF 转换按用户安排列为后续文档事项，不阻塞其他工程收尾。

## 5 最终构建 测试与针对性回归

Windows 本地环境：Node 22.22.1、npm 10.9.4；锁定版本 Vite 8.3.8、TypeScript 7.0.2、Vitest 5.1.1、Oxlint 1.94.0；Edge 158.0.4370.33。

| 检查 | 实际结果 |
| --- | --- |
| npm ci | 通过，使用工作区忽略目录中的 npm cache，避免写入受限用户缓存 |
| npm test | 2 个测试文件，24 / 24 通过 |
| npm run typecheck | 通过 |
| npm run lint | 通过，自有源码及测试规则保留 |
| npm run build | 通过；主 JS 327.21 KB，gzip 104.66 KB；带通知的 GIF Worker 10.01 KB |
| npm audit | 0 项已知漏洞 |
| verify-third-party.mjs | 通过：8 个源码，2 份发布 map，dist 逐文件散列、通知路径及版本一致 |
| 实际 GIF Worker 回归 | Edge 中录制 / 收尾 / 下载成功，回到空闲，pageerror 为空 |
| 对应源码与许可访问 | pnnquant2.js、MPL 文本、NOTICE、完整通知均 HTTP 200，字节一致 |
| GIF 完整解码 | FFmpeg 8.1.1，640×360、15 帧、1.46 秒，`-xerror` 完整解码无错误 |
| Word 结构 / 原 PDF | 上述结构及字节断言通过 |

新增生产行为只有第三方分发通知和源码随站点提供，算法及录制代码未变；针对 GIF 构建 / 导出和分发材料回归，没有重做整轮工程审计。Phase 06.3 的 MP4 / WebM 测试仍由 24 项单元测试复验。没有虚构真实手机或其他浏览器成绩。

运行证据位于本地 `.audit-backup/phase-06.3.1/`：final-checks、package-verification、worker-input-proof、word-update-verification、gif-smoke-results 及实际 GIF。复验入口已保留在 `tools/audit/README.md`。

## 6 完整本地备份与最终候选文件

完整项目成果备份路径：

`C:\Documents\GitHub-Projects\ascii-camera\.audit-backup\ascii-camera-v1.0.0-phase06.3.1-20261124.zip`

独立校验回执为同路径后缀 `.verification.json`，SHA-256 文本为后缀 `.sha256`。回执记录 ZIP 总大小、SHA-256、归档条目数、CRC 和每个源文件与归档文件的逐项 SHA-256 比对结果；校验不依赖文件扩展名。

备份包含本轮最终候选清单中的全部成果：Phase 06.2 正式展示材料、Phase 06.3 修复 / 测试 / 报告、本轮更新的源码通知、对应第三方源码、Word 与保留的旧 PDF，以及本报告。归档内 `BACKUP-MANIFEST.json` 记录相对路径、长度、SHA-256、版本和只读 Git 基准信息。

排除 `.audit-backup/` 自身、node_modules、dist、旧文案快照、证书 / 私钥、原始 MOV、日志和无关临时文件；不包含 `.git/` 数据库，Git 基准以 manifest 记录。本轮使用新建 ZIP，不覆盖或删除历史备份。

最终候选清单见 [phase-06.3.1-release-files.txt](phase-06.3.1-release-files.txt)。在此前 96 项分类基础上增加第三方分发材料、专项记录、新校验脚本和本轮报告 / 清单。历史 96 项清单保留。没有执行 Git add。

## 7 剩余事项与封板建议

| 事项 | 状态与建议 |
| --- | --- |
| E04 gifenc | 历史 MPL 证据及实际分发源码 / 通知已提供并验证，可关闭本轮工程待办 |
| E05 雕塑素材 | 公开仓库、站点及展示再分发仍需用户依据实际条款确认；**在此之前不建议推送包含素材的公开成果** |
| v1.0.0 | 源码、README、基线、Word 已统一；版本号不等于已经发布 |
| PDF | 按用户安排交接到 LibreOffice 25.2.3.2，验收后替换；当前旧 PDF 不冒称为 1.0.0 |
| iPhone / Android | 完整摄像头及相册验收继续留到正式 HTTPS 环境 |
| Git 操作 | 分支及 HEAD 保持不变，暂存区为空；等待最终 Git 封板指令 |

可以按最终候选清单准备本地封板，公开推送 / 发布应先关闭素材授权及最终 PDF 交接事项。功能冻结继续有效。本轮到此停止，不执行正式 Git 写操作或部署。
