# gifenc 1.0.3 授权链与对应源码记录

核查日期：2026-11-24。适用于 ASCII Camera v1.0.0 当前锁文件与生产 GIF Worker。

**结论：保留 gifenc 1.0.3；对其 PNN 派生量化器履行 MPL-2.0 源码与通知义务，gifenc 的其余 MIT 通知同时保留，ASCII Camera 自有独立源码继续使用 MIT。** 已找到早于 gifenc 引用时间的 PnnQuant.js 历史 MPL 许可证，不再仅依据当前上游许可证推断历史。没有证据支持把所有量化器代码仅按 MIT 分发。

## 1 固定包与实际输入

| 项目 | 可核验记录 |
| --- | --- |
| npm 版本 | gifenc 1.0.3，2021-03-07T11:09:20.659Z 发布 |
| npm tarball | [gifenc-1.0.3.tgz](https://registry.npmjs.org/gifenc/-/gifenc-1.0.3.tgz)，43,036 字节 |
| tarball SHA-1 | `3a1a97fa5ab70ebefd000350b9aac8313b30b3aa` |
| lockfile SRI | `sha512-xdr6AdrfGBcfzncONUOlXMBuc5wJDtOueE3c5rdG0oNgtINLD+f2iFZltrBRZYzACRbKr+mSVU/x98zv2u3jmw==` |
| registry gitHead | [`15e2c3e65ed03c977b42fec48de59b05ee9b9f54`](https://github.com/mattdesl/gifenc/commit/15e2c3e65ed03c977b42fec48de59b05ee9b9f54)，2021-03-07T11:09:18Z |
| 包声明 | MIT，Copyright (c) 2017 Matt DesLauriers；[该提交的 LICENSE](https://github.com/mattdesl/gifenc/blob/15e2c3e65ed03c977b42fec48de59b05ee9b9f54/LICENSE.md) |
| 量化器文件 | [`src/pnnquant2.js`](https://github.com/mattdesl/gifenc/blob/15e2c3e65ed03c977b42fec48de59b05ee9b9f54/src/pnnquant2.js)，7,761 字节 |
| 量化器 SHA-256 | `267a6034fee19ccf783a6ca6dc32bdb2ffea637e633abb6fd9929f8692ec932a` |

registry 数据通过 `npm view gifenc@1.0.3` 取得，tarball 通过带 `--ignore-scripts` 的 npm pack 取得并核验摘要；未执行第三方安装脚本。

本项目 `src/export/gif.worker.ts` 调用 gifenc 的 quantize、applyPalette 和 GIFEncoder。Vite 生产 Worker 的诊断 source map 确认实际采用包的 browser / CJS 入口 `dist/gifenc.js`；该包另有 ESM 入口。CJS 与 ESM 的 source map 都含相同的 8 个原始源文件，包括 pnnquant2.js，其 sourcesContent 与 npm `src/`、本次附带的对应源码逐文件 SHA-256 一致。量化器不是未使用的开发依赖，实际进入浏览器 Worker。诊断 source map 仅保存在本地忽略目录，不进入正式 dist。

## 2 引用时间与历史许可证

1. gifenc 于 **2021-02-25T13:24:30Z** 在[提交 463e079](https://github.com/mattdesl/gifenc/commit/463e079fe0f64eff2ed8a170b0a932ef3ff4133a)新增 pnnquant2.js。文件头明确写 Modified from PnnQuant.js 的 src/pnnquant.js；README 同时说明 built-in quantizer 基于该移植。
2. gifenc 后续有[2021-03-04 的参数修复](https://github.com/mattdesl/gifenc/commit/c97d3cc2b6a00a5b992dcab094a0f180ef534bcc)及[2021-03-07 的优化](https://github.com/mattdesl/gifenc/commit/c15b81c6167b51bc4dbfa47624b0bbfbc5341b72)，再发布 1.0.3。2024 年 master 的格式化提交不属于本项目锁定的代码。
3. 当前 PnnQuant.js 默认历史中的 LICENSE 于[2023-07-14 的 d4074e6](https://github.com/mcychan/PnnQuant.js/commit/d4074e61aff887c5abb37a039e1051a12ecba2da)加入。**单独看这个记录，不能证明 2021 年采用的许可。**
4. 通过保留旧历史的 takase1121 分叉找到 **2021-02-25T08:22:31Z** 的 [`0dc2664d2d9582d1b6b492936bdd03687e385275`](https://github.com/takase1121/PnnQuant.js/commit/0dc2664d2d9582d1b6b492936bdd03687e385275)。原 mcychan 仓库也可按该完整 SHA 读取[历史源码](https://github.com/mcychan/PnnQuant.js/blob/0dc2664d2d9582d1b6b492936bdd03687e385275/src/pnnquant.js)和[同版本 LICENSE](https://github.com/mcychan/PnnQuant.js/blob/0dc2664d2d9582d1b6b492936bdd03687e385275/LICENSE)。该许可证已经是 **MPL-2.0**。
5. 许可证可追溯至 Miller Cy Chan 于 **2020-02-05** 的[初始提交 8575404](https://github.com/DamSenViet/PnnQuant.js/commit/857540477c4d931592e7227e4d21cd90d7663635)，其中同时提交了源码和 MPL-2.0 文本。DamSenViet 仓库的 API 元数据确认其 parent / source 为 mcychan/PnnQuant.js。

2021 历史 LICENSE 的 Git blob SHA 为 `a612ad9813b006ce81d1ee438dd784da99a54007`；同版本 pnnquant.js 的 Git blob SHA 为 `d402c2d4a8cd10f20c10da1c4e9bbd5f6ed5a788`。Git blob SHA 包含 Git 对象头，不等同于裸文件 SHA-1。

gifenc 没有记录精确导入的上游 commit，所以这里**不把 0dc2664 当成已证明的逐字导入版本**。它是同日、早于导入、作者版权年份相同且核心实现可交叉比对的历史快照。对比发现两者保留相同的 bin 链表、最近邻误差计算、堆合并与 palette 填充结构；gifenc 改为 ES 模块并增加选项 / packing 辅助及后续优化。这些证据支持按 MPL 处理其派生源文件，但不支持自行补出一个不存在的 MIT 再许可授权。

## 3 生产分发义务与分发材料

[MPL-2.0 第 3.1、3.2、3.3、3.4 节](https://www.mozilla.org/en-US/MPL/2.0/)要求保留相应源码许可及通知、告知接收者如何取得对应源码，并允许不同许可的独立文件组成较大作品。[Mozilla 官方 FAQ 的 Q8 至 Q11](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)解释了这类库与独立代码组合的情形。

项目采用以下分发措施：

- 在 `public/vendor/gifenc-1.0.3/src/` 提供 **8 个准确的首选源文件**，逐字来自锁定 npm 包，不以压缩 JS 代替源代码；同时提供原 package.json、原 MIT 许可、历史 MPL-2.0 全文和 NOTICE。
- NOTICE 明确 pnnquant2.js 的 PNN 派生部分按 MPL-2.0 提供；保留 gifenc 自身贡献的 MIT 通知及全部已有版权头，不把第三方源文件冒称为 ASCII Camera 原创。
- Vite 生产输出会把这些文件逐字复制到 `dist/vendor/gifenc-1.0.3/`。GIF Worker 的发行文件头指向相邻的对应源码与完整通知，接收者无需申请账号或付费即可获取。
- `public/third-party-licenses.txt`、中英文 README 和本记录均说明许可边界；根 LICENSE 和 package.json 的 MIT 继续用于 ASCII Camera 自有独立代码，未把整个应用改为 MPL。
- `source-manifest.json` 固定源码散列；`tools/audit/verify-third-party.mjs` 检查 npm 源码、发布 source map、随站点提供的源码、Worker 通知链接及 v1.0.0 版本一致性。

gifenc 的包级 MIT 声明与 PNN 历史 MPL 记录均保留，不擅自改第三方 package.json 的历史声明。此处理落实本项目对所分发派生文件的源码及通知义务；不宣称获得额外的上游 MIT 授权，也不承诺追溯所有更早作者的独立授权文件。

历史 MPL 证据、所分发对应源码与通知均保留在仓库中。雕塑素材适用独立授权，不由软件许可证解决，详见[演示素材授权记录](demo-material.zh-CN.md)。
