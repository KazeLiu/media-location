# Media Location

本地媒体经纬度工作台。后端读取本机目录，前端用 Vue 展示目录、媒体列表和高德地图；拖拽或选中媒体后在地图上落点，会把高德 GCJ-02 坐标转换为 WGS84，并写入同目录同名 `.xmp`。

## 功能

- 后端目录选择器：只浏览设置里的库根目录。
- 高德 JS API v2：支持填写 Web端 Key。
- 图片/视频扫描：识别常见图片和视频扩展名。
- XMP 侧车匹配：`photo.jpg` 匹配 `photo.xmp`，`clip.mov` 匹配 `clip.xmp`。
- GPS 读取：优先读图片内嵌 GPS；无内嵌 GPS 时读取同名 XMP。
- GPS 保存：只创建或更新同名 XMP，不直接改原始照片/视频。
- 坐标转换：地图端使用 GCJ-02，XMP 写入 WGS84。

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
- 默认写入前会把已有 XMP 复制为 `.xmp.bak`。
