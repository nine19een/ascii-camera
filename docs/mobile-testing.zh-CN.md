# 手机实机测试：局域网 HTTPS

手机浏览器只在安全连接（`https://` 或 `localhost`）下允许使用摄像头。用局域网地址 `http://192.168.x.x:5173` 打开时，界面、演示动画、截图、视频和 GIF 都能测，但摄像头会被拒绝（页面提示“当前页面不是安全连接”）。

下面的方案只在你的电脑和手机之间的局域网内通信：证书由你电脑上的 mkcert 生成并只被你自己的设备信任，不经过任何公网服务、不需要隧道，也不需要部署。

## 方案一：mkcert 本地可信证书（推荐，iPhone 与安卓都适用）

### 1. 在电脑上安装 mkcert 并创建本地 CA（只需一次）

Windows（任选一种）：

```powershell
winget install FiloSottile.mkcert
# 或 choco install mkcert / scoop install mkcert
mkcert -install
```

`mkcert -install` 会在本机创建一个只属于你的根证书（CA），并加入 Windows 的信任列表。它的私钥只保存在你的电脑上（`mkcert -CAROOT` 显示所在文件夹），**不要分享这个文件夹里的 `rootCA-key.pem`**。

### 2. 为局域网地址生成证书

先查电脑的局域网 IP（`ipconfig`，看“无线局域网适配器 WLAN”或以太网的 IPv4 地址，例如 `192.168.1.23`），然后在项目根目录执行：

```powershell
mkdir .cert
mkcert -key-file .cert/key.pem -cert-file .cert/cert.pem localhost 127.0.0.1 ::1 192.168.1.23
```

把 `192.168.1.23` 换成你的实际 IP。`.cert/` 已被 `.gitignore` 忽略，不会被提交。电脑的 IP 变了（换了 Wi‑Fi、路由器重新分配）需要重新执行这一步。

### 3. 启动 HTTPS 开发服务器

```powershell
npm run dev:https
```

终端会显示 `Network: https://192.168.1.23:5173/`。第一次运行时 Windows 防火墙如果弹窗，只勾选“专用网络”并允许。

缺少证书时命令会直接报错并提示本文档，不会退回到 HTTP。

### 4. 让手机信任这个本地 CA（每台手机只需一次）

需要传到手机的是 **`rootCA.pem`**（公开证书），不是 `rootCA-key.pem`。用 `mkcert -CAROOT` 找到它。

**iPhone / iPad**

1. 把 `rootCA.pem` 用隔空投送发给手机（或作为邮件附件发给自己，用“邮件”App 打开）。
2. 手机提示“已下载描述文件”后，打开 **设置 → 已下载描述文件 → 安装**。
3. 打开 **设置 → 通用 → 关于本机 → 证书信任设置**，打开 mkcert 那一项的开关（“针对根证书启用完全信任”）。
4. 用 Safari 打开 `https://192.168.1.23:5173/`，地址栏应显示正常的锁，没有安全警告。

**安卓（Chrome）**

1. 把 `rootCA.pem` 复制到手机。
2. **设置 → 安全 → 加密与凭据 → 安装证书 → CA 证书**，选择该文件（不同厂商菜单名称略有差异）。
3. 用 Chrome 打开 `https://192.168.1.23:5173/`。

测试结束后可以在手机上删除这个描述文件 / CA 证书；在电脑上执行 `mkcert -uninstall` 可以撤销本机信任。

## 方案二：安卓 + 数据线（不需要证书）

1. 手机开启 USB 调试并用数据线连接电脑，电脑上照常 `npm run dev`。
2. 电脑 Chrome 打开 `chrome://inspect/#devices` → **Port forwarding**，添加 `5173` → `localhost:5173`，勾选 **Enable port forwarding**。
3. 手机 Chrome 打开 `http://localhost:5173`。手机把 `localhost` 视为安全来源，摄像头可以使用。

iPhone 没有对应的方式，请用方案一。

## 不推荐的做法

- **自签名证书直接点“继续访问”**：iPhone Safari 上体验不稳定，每次都有警告，也容易让人习惯忽略证书警告。
- **公网隧道（ngrok、cloudflared 等）**：会让开发服务器能从互联网访问。本项目约定不在未经负责人确认时开放公网访问。

## 手机上建议重点检查

- 竖屏打开调整抽屉时主画面仍然可见；滑杆上下滑动不误触。
- 横屏布局；全屏按钮（iPhone 为页面内沉浸式预览，返回手势或右上角按钮退出）。
- 录制 MP4 后在相册中打开：完整播放、显示正确时长、能拖动进度条。
