# Media Location

本地媒体经纬度工作台。后端读取本机目录，前端用 Vue 展示目录、媒体列表和高德地图；填写、保存和写入 XMP 都使用 WGS-84，同目录同名 `.xmp` 会保存最终坐标。地图点击复制经纬度时可按当前按钮模式复制 GCJ-02 或 WGS-84。

## 功能

- 后端目录选择器：只浏览设置里的库根目录。
- 高德 JS API v2：支持填写 Web端 Key。
- 图片/视频扫描：识别常见图片和视频扩展名。
- XMP 侧车匹配：优先精确匹配 `photo.jpg.xmp`、`clip.mov.xmp`；如果媒体名在最终扩展名前有点号后缀，会逐级剥离后缀查找，例如 `VID.foo.bar.mp4` 会继续尝试 `VID.foo.mp4.xmp`、`VID.mp4.xmp`。
- GPS 读取：优先读图片内嵌 GPS；无内嵌 GPS 时读取同名 XMP。
- GPS 保存：只创建或更新同名 XMP，不直接改原始照片/视频。
- 坐标规则：填写、保存、接口和 XMP 写入都使用 WGS-84；地图点击复制可选择 GCJ-02 或 WGS-84。
- 大目录浏览：媒体列表支持文件名过滤和分页加载，视频在工作台内只显示轻量缩略图；需要播放时会在新标签页打开原视频。
- 后台日志：本地后台页 `/console` 可查看、刷新和复制最近日志，也可关闭后台程序。

## 开发启动

```bash
npm install
npm run dev
```

前端默认打开 `http://127.0.0.1:6754`，后端默认运行在 `http://127.0.0.1:6755`。

## 生产构建

```bash
npm run build
```

构建产物在 `dist/client` 和 `dist/server/index.cjs`。

## 打包 Windows exe

```bash
npm run package:win
```

生成文件：`dist/media-location.exe`。

Windows 包会在打包后改为 GUI 子系统，双击默认打开本地后台页，不再显示 cmd 命令行窗口；网页工作台仍是 `/`，从后台页打开时会使用新标签页。

如果打包器无法下载预编译 Node runtime，会回退到本机源码构建；此时 Windows 环境需要可用的 `patch` 命令。推荐先确保 GitHub 下载可用，或安装 Git/MSYS2 提供 `patch`。

## 配置

运行时配置保存到：

```text
data/app.config.json
```

可以通过环境变量覆盖配置路径：

```bash
MEDIA_LOCATION_CONFIG_PATH=D:/media-location/config.json npm run dev:server
```

日志默认写入当前工作目录的 `logs/`，也可以通过环境变量覆盖：

```bash
MEDIA_LOCATION_LOG_DIR=D:/media-location/logs npm run dev:server
```

库根目录示例：

```json
{
  "libraryRoots": [
    "D:/Photos",
    "E:/Media"
  ]
}
```

## 安全边界

- 后端会拒绝访问库根目录之外的路径。
- 外网访问前建议只配置必要目录，并使用内网穿透鉴权或 VPN。
- 保存 GPS 时只创建或更新同名 XMP，不会自动生成 `.xmp.bak`。
