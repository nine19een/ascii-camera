# ASCII Camera Phase 06.3.2 正式 Git 封板记录

日期：2026-11-24（Asia/Shanghai）。正式版本：**v1.0.0**。本记录在正式提交前完成，记录已实际通过的检查、文件范围与执行约定；提交、合并、推送及远程核验的实际 SHA 以 Git 历史、最终交付报告和本地执行回执为准，不预先声称推送成功。

## 1 封板前仓库状态

- 工作目录与 Git 根目录均为 `C:\Documents\GitHub-Projects\ascii-camera`。
- 开发分支为 `feat/phase-1-playable-prototype`，HEAD 为 `37ebf0d00256f207387642275c202684664026eb`，main 同步指向该初始提交。
- origin 为 `https://github.com/nine19een/ascii-camera.git`；本轮 `git fetch --no-tags origin` 成功，远程 main 没有新增提交。
- 初始暂存区为空；已跟踪的 LICENSE、README.md 有修改，另有 111 个未跟踪候选文件。检查覆盖完整工作区，不限于已跟踪 diff。
- `.audit-backup/`、`Claude outputs/`、node_modules、dist 是保留的本地忽略目录。既有备份均保留。

## 2 正式文档与授权确认

项目负责人在 Phase 06.3.2 明确确认：雕塑素材在本项目中的使用、公开再分发及相关展示授权没有问题。现有 Word / PDF 也明确记录本项目非商用使用、公开分发、展示及导出所需授权已经负责人确认。双语 README、演示视频说明、需求基线与历史审计报告的后续状态已同步。

该结论来自项目负责人的明确确认，不是对底层条款的独立认证；本轮没有虚构具体授权条款、许可来源证明或额外使用权。演示视频、海报及包含该素材的截图、GIF、项目介绍图片继续排除在 ASCII Camera 自有代码的 MIT 许可之外。

gifenc 1.0.3 的 MPL-2.0 历史核查记录、准确对应源码、原版权通知、MIT / MPL 文本与生产 Worker 通知全部保留。详情见[授权链核查记录](../licenses/gifenc-1.0.3-provenance.zh-CN.md)。本轮没有替换编码器或修改量化算法。

### 项目介绍核验

负责人交付的最新文件位于 `docs/intro/`；本轮仅核验，没有重新生成或修改 Word / PDF。

| 项目 | 实际结果 |
| --- | --- |
| 版本 | Word 与 PDF 均为 1.0.0；package.json、package-lock.json、README 与需求基线一致 |
| PDF | 11 页，Producer 为 LibreOffice 25.2.3.2；已渲染检查全册页面概览 |
| 正文 | Word 的所有超过 5 个非空白字符的段落均在 PDF 中逐段匹配，忽略 PDF 换行与空白；无缺失段落 |
| 工程事实 | 两者均含 24 项测试通过、Chrome 历史验证、Windows Edge 158 独立验证及 MPL-2.0 说明 |
| 授权 | 两者均含负责人已确认公开分发、展示及导出授权，第三方素材不属 MIT |
| Word SHA-256 | `653a8c84018b824bd07922be5668ebec1624ab5d60ade1eae726727857ad378c` |
| PDF SHA-256 | `eeb88362cad331bbc2eea865b98d28780798c488fa1eb602a6a0b1393c958602` |

尚未部署，没有新增公开访问地址或真实手机验收成绩。历史报告的旧结论保留为时点记录，并在开头注明上述待办已关闭。

## 3 最终提交范围与安全检查

以已认可的 113 项清单为基础，增加本报告、本阶段清单与保护第三方原字节的 `.gitattributes`，共 **116 个文件**；完整逐项路径见 [phase-06.3.2-release-files.txt](phase-06.3.2-release-files.txt)。

| 分类 | 文件数 |
| --- | ---: |
| 产品源码及演示素材 | 52 |
| 根目录工程配置、双语 README 及 LICENSE | 15 |
| 正式图表、截图、GIF 及项目介绍 | 13 |
| 技术文档、授权记录、审计报告及清单 | 10 |
| 静态资源、第三方许可证及对应源码 | 15 |
| 测试、样本及复验 / 制作脚本 | 11 |

相对于已认可的 Phase 06.3.1 备份，既有文件仅有 6 份 Markdown 文档及负责人交付的 Word / PDF 变化；另增本报告、清单与 `.gitattributes`。既有产品源码、工程配置、测试、正式视频、海报、图表、截图、GIF、测试媒体及第三方源码均保持原字节。没有批量重写换行或清理 C2PA 元数据。

候选路径中没有依赖、构建目录、备份、旧文案快照、证书 / 私钥、原始 MOV、私人录制文件或临时日志；文本敏感信息规则扫描未发现私钥、常见服务令牌或凭证赋值。Word / PDF 已提取正文核查，媒体与上一轮认可文件逐字比对一致。最大文件为 README 演示 GIF，2,932,676 字节，没有超大中间素材。

Git 的系统配置为 `core.autocrlf=true`。本轮以 `git checkout-index` 实际复现：未保护时，pnnquant2.js 的 304 个 LF 被检出为 CRLF，SHA-256 从 `267a6034…` 变为 `45c724e4…`，破坏对应源码散列复验。因此新增仅针对 `public/vendor/gifenc-1.0.3/**` 的 `-text` 属性，保留第三方源码与许可的准确原字节；其中项目自有、按 JSON 解析的 source-manifest.json 元数据仍按正常文本规则处理。不改变其他文件的换行策略，也不改写任何源文件。正式暂存后检查 staged diff、路径、文件类型、大小、敏感信息，并重新检出验证第三方文件散列。

原始 `git diff --cached --check` 报告 6 处已有格式提示：第三方 MIT 文本末尾空行、PNN 源码两处空白行，以及 3 个既有复验脚本的末尾空行。已确认它们与上轮认可文件一致，作为非阻塞格式记录保留，不改写第三方源码，也不通过关闭检查隐藏提示。

## 4 本地复验

环境：Windows，Node 22.22.1、npm 10.9.4。依赖安装缓存位于本地忽略目录。

| 命令 / 检查 | 结果 |
| --- | --- |
| npm ci | 通过，安装 49 个包，审计 50 个包 |
| npm test | 2 个测试文件，24 / 24 通过 |
| npm run typecheck | 通过 |
| npm run lint | 通过 |
| npm run build | 通过，Vite 8.3.8；主 JS 327.21 KB，gzip 104.66 KB；GIF Worker 10.01 KB |
| npm audit | 0 项已知漏洞 |
| node tools/audit/verify-third-party.mjs | 通过：8 个源码、两份发布 source map、dist 源码及许可散列一致，Worker 通知路径有效 |
| 双语 README | 38 个相对资源 / 文件 / 锚点链接全部有效；正式展示资源齐全 |

本轮仅同步文档与封板状态，不重复全面工程审计。24 项 MP4 / WebM 容器测试继续验证输出结构、原编码数据保留、时间与索引以及异常输入降级。合并 main 后须再次执行测试与生产构建，并复核第三方分发材料。

## 5 最终备份与执行回执

新封板备份预定路径：

`C:\Documents\GitHub-Projects\ascii-camera\.audit-backup\ascii-camera-v1.0.0-phase06.3.2-20261124-final.zip`

在本报告定稿后，以 116 项清单创建新归档；加入内部 `BACKUP-MANIFEST.json`，记录每个文件路径、大小、SHA-256 和只读 Git 基线。正式提交前必须完成全部条目 CRC、逐文件 SHA-256 与归档 SHA-256 核验。归档摘要与实际结果保存在同路径 `.sha256`、`.verification.json`，避免把归档自身摘要写入其内部造成自引用。旧备份不覆盖、不删除；本轮添加 Git 属性前已验证的 115 文件归档也保留。

本轮命令输出、文档核验、与已认可备份的差异、完整 staged diff，以及最终 Git 执行回执保存在本地忽略目录 `.audit-backup/phase-06.3.2/`。这些回执不进入候选提交。

## 6 Git 执行约定及下一阶段

负责人已授权以下流程：按清单精确暂存；审查完整 staged 内容；在原开发分支提交 `feat: complete ASCII Camera v1.0.0`；切换 main，以 `--no-ff` 合并保留开发提交；复验 main；确认远程没有非预期更新后推送 origin/main；核对 GitHub main SHA 与本地一致；检查工作区与分支保留情况。若发现非预期远程更新或冲突，停止并报告，不覆盖。

不使用破坏性 reset / clean、强制推送或删除原开发分支。本轮不创建 Tag、GitHub Release 或部署。

此前 Git 封板阻塞的素材授权与项目介绍同步事项已关闭。后续 Phase 06.4 再处理部署、正式 HTTPS 下 iPhone Safari / Android Chrome 摄像头及相册验收、公开访问链接更新；Tag 与 Release 留待这些事项完成后统一处理。本轮完成 Git 推送及远程核验后停止。
