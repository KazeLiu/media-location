# GPX 轨迹导入功能设计文档

> 版本：v1.0  
> 日期：2026-06-14  
> 状态：待审阅

## 一、功能概述

在 Media Location 左侧面板新增 **GPX 轨迹匹配** Tab，支持：

- 独立选择照片目录
- 通过文件夹浏览器选择 GPX 轨迹文件
- 管理多条 GPX 轨迹（显示/隐藏/删除）
- 在地图上绘制彩色轨迹线条
- 基于 EXIF 时间匹配照片和轨迹点（线性插值 + 时间窗口）
- 预览匹配结果（完整信息表格）
- 批量写入坐标到 XMP

## 二、用户流程

1. **选择照片目录**：点击"选择目录"，用文件夹浏览器选择包含照片的目录
2. **添加轨迹**：点击"添加轨迹"，用文件夹浏览器选择 `.gpx` 文件
3. **查看轨迹**：地图自动绘制轨迹线条，每条轨迹不同颜色
4. **配置时间窗口**：调整时间匹配容差（默认 ±5 分钟）
5. **匹配照片**：点击"匹配照片"，系统扫描选定目录中的照片
6. **预览结果**：查看匹配详情表格（缩略图、时间、坐标、时间差等）
7. **勾选写入**：取消不需要的匹配，点击"批量写入"保存坐标


## 三、核心算法

### 3.1 时间匹配算法（线性插值 + 时间窗口）

**输入**：
- 照片拍摄时间 `T_photo`（从 EXIF `DateTimeOriginal` 读取）
- GPX 轨迹点列表 `[P1, P2, ..., Pn]`（每个点包含时间、经度、纬度）
- 时间窗口 `W`（默认 ±5 分钟，可配置）

**输出**：
- 匹配的坐标 `(longitude, latitude)` 或 `null`

**算法步骤**：

```
1. 如果照片没有 EXIF 拍摄时间，返回 null（不匹配）

2. 遍历所有 GPX 轨迹：
   a. 对每条轨迹，找到满足条件的相邻点对 (Pi, Pi+1)：
      - Pi.time ≤ T_photo ≤ Pi+1.time
      - 且 (|T_photo - Pi.time| ≤ W) 或 (|T_photo - Pi+1.time| ≤ W)
   
   b. 如果找到多个匹配点对，选择时间差最小的（最接近的那对）
   
   c. 使用线性插值计算精确坐标：
      ratio = (T_photo - Pi.time) / (Pi+1.time - Pi.time)
      longitude = Pi.lng + ratio × (Pi+1.lng - Pi.lng)
      latitude = Pi.lat + ratio × (Pi+1.lat - Pi.lat)
   
   d. 记录匹配结果和时间差

3. 如果没有找到任何匹配点对，返回 null
```

**时间差计算**：
- 取 `min(|T_photo - Pi.time|, |T_photo - Pi+1.time|)` 作为显示的时间差
- 用于排序和用户判断匹配质量


### 3.2 距离计算（Haversine 公式）

用于计算 GPX 轨迹总距离。

```javascript
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // 地球半径（km）
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees) {
  return degrees * Math.PI / 180;
}

// 计算轨迹总距离
function calculateTrackDistance(points) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineDistance(
      points[i].latitude, points[i].longitude,
      points[i + 1].latitude, points[i + 1].longitude
    );
  }
  return total;
}
```


## 四、UI 设计

### 4.1 GPX Tab 布局（分步展开式）

```
┌─ GPX 轨迹匹配 ──────────────────────────────────┐
│                                                 │
│ ╔═ 第一步：选择照片目录 ═══════════════════╗   │
│ ║                                            ║   │
│ ║ [📁 选择目录]                              ║   │
│ ║                                            ║   │
│ ║ 已选：D:\Photos\2024-06-trip              ║   │
│ ║ 共 156 张照片（含 89 张有 EXIF 时间）      ║   │
│ ║                                            ║   │
│ ╚════════════════════════════════════════════╝   │
│                                                 │
│ ╔═ 第二步：添加 GPX 轨迹 ══════════════════╗   │
│ ║                                            ║   │
│ ║ [+ 添加轨迹]                               ║   │
│ ║                                            ║   │
│ ║ 轨迹列表：                                 ║   │
│ ║ ┌────────────────────────────────────────┐ ║   │
│ ║ │ 🔴 day1.gpx            [👁️] [🗑️]    │ ║   │
│ ║ │ 1,234 点 · 15.8 km                    │ ║   │
│ ║ │ 2024-06-14 08:00:00 - 18:30:00        │ ║   │
│ ║ └────────────────────────────────────────┘ ║   │
│ ║ ┌────────────────────────────────────────┐ ║   │
│ ║ │ 🔵 day2.gpx            [👁️] [🗑️]    │ ║   │
│ ║ │ 987 点 · 12.3 km                      │ ║   │
│ ║ │ 2024-06-15 09:15:00 - 17:45:00        │ ║   │
│ ║ └────────────────────────────────────────┘ ║   │
│ ║                                            ║   │
│ ╚════════════════════════════════════════════╝   │
│                                                 │
│ ╔═ 第三步：匹配配置 ═══════════════════════╗   │
│ ║                                            ║   │
│ ║ 时间窗口: [5] 分钟                         ║   │
│ ║                                            ║   │
│ ║ [🔍 匹配照片]                              ║   │
│ ║                                            ║   │
│ ╚════════════════════════════════════════════╝   │
│                                                 │
│ ╔═ 匹配结果 ═══════════════════════════════╗   │
│ ║                                            ║   │
│ ║ ✅ 找到 42 张可匹配照片                    ║   │
│ ║                                            ║   │
│ ║ [全选] [反选] [只选无GPS的]                ║   │
│ ║                                            ║   │
│ ║ ┌─ 结果表格（滚动）──────────────────────┐ ║   │
│ ║ │                                        │ ║   │
│ ║ │ ☑️ [缩略图] IMG_001.jpg                │ ║   │
│ ║ │    📅 拍摄: 2024-06-14 14:23:45       │ ║   │
│ ║ │    🗺️ 匹配: 116.123456, 40.123456     │ ║   │
│ ║ │    ⏱️ 时间差: +1.2 分                 │ ║   │
│ ║ │    📍 轨迹: 🔴 day1.gpx               │ ║   │
│ ║ │    ⚠️ 原坐标: 无                       │ ║   │
│ ║ │                                        │ ║   │
│ ║ │ ☑️ [缩略图] IMG_002.jpg                │ ║   │
│ ║ │    📅 拍摄: 2024-06-14 15:10:22       │ ║   │
│ ║ │    🗺️ 匹配: 116.234567, 40.234567     │ ║   │
│ ║ │    ⏱️ 时间差: -0.5 分                 │ ║   │
│ ║ │    📍 轨迹: 🔴 day1.gpx               │ ║   │
│ ║ │    ⚠️ 原坐标: 116.111111, 40.111111   │ ║   │
│ ║ │                                        │ ║   │
│ ║ └────────────────────────────────────────┘ ║   │
│ ║                                            ║   │
│ ║ [✅ 批量写入已勾选 (42 张)]               ║   │
│ ║                                            ║   │
│ ╚════════════════════════════════════════════╝   │
│                                                 │
└─────────────────────────────────────────────────┘
```


### 4.2 组件结构

```
LeftPanel.vue
  └─ el-tabs
      ├─ 基本功能 (现有)
      ├─ GPX 轨迹匹配 (新增)
      │   └─ GpxTrackTab.vue
      │       ├─ PhotoDirectorySelector.vue (照片目录选择)
      │       ├─ GpxTrackList.vue (轨迹列表)
      │       │   └─ GpxTrackItem.vue (单条轨迹)
      │       ├─ MatchConfig.vue (匹配配置)
      │       └─ MatchResultTable.vue (匹配结果表格)
      │           └─ MatchResultRow.vue (单条匹配结果)
      ├─ 设置 (现有)
      └─ 用法指南 (现有，需要新增 GPX 章节)
```

### 4.3 交互细节

#### 照片目录选择
- 复用 `FolderPickerDialog` 组件
- 选择后显示目录路径和照片统计（总数、有 EXIF 时间的数量）
- 未选择时，后续步骤置灰禁用

#### 轨迹列表
- 每条轨迹显示：
  - 颜色圆点（与地图线条颜色对应）
  - 文件名（可点击复制完整路径）
  - 点数、距离、时间范围
  - 显示/隐藏按钮（眼睛图标）
  - 删除按钮（垃圾桶图标）
- 颜色自动从预设色板分配：`['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F9CA24', '#6C5CE7']`
- 轨迹为空时显示占位提示

#### 匹配配置
- 时间窗口：数字输入框，范围 1-60 分钟，默认 5
- 匹配按钮：照片目录和轨迹都不为空时才启用

#### 匹配结果表格
- 紧凑卡片式布局，每张照片一个卡片
- 显示缩略图（64x64）
- 勾选框默认全选
- 快捷操作：全选、反选、只选无 GPS 的
- 如果照片已有 GPS，用警告色标识原坐标
- 批量写入按钮显示已勾选数量


## 五、数据模型

### 5.1 TypeScript 类型定义

```typescript
// shared/contracts.ts 新增

/** GPX 轨迹点 */
export interface GpxTrackPoint {
  time: Date;           // 时间戳
  latitude: number;     // 纬度 (WGS-84)
  longitude: number;    // 经度 (WGS-84)
  elevation?: number;   // 海拔（米，可选）
}

/** GPX 轨迹 */
export interface GpxTrack {
  id: string;              // 唯一标识（前端生成）
  path: string;            // GPX 文件路径
  name: string;            // 文件名
  color: string;           // 地图线条颜色（前端分配）
  visible: boolean;        // 是否在地图上显示
  points: GpxTrackPoint[]; // 轨迹点列表
  pointCount: number;      // 点数
  distance: number;        // 总距离（km）
  timeRange: {
    start: Date;           // 开始时间
    end: Date;             // 结束时间
  };
}

/** 照片 EXIF 时间信息 */
export interface MediaExifTime {
  path: string;           // 文件路径
  name: string;           // 文件名
  exifTime: string | null; // EXIF 拍摄时间（ISO 8601 格式）
  hasGps: boolean;        // 是否已有 GPS
  latitude?: number;      // 原有纬度
  longitude?: number;     // 原有经度
}

/** 照片匹配结果 */
export interface PhotoMatchResult {
  photo: MediaExifTime;    // 照片信息
  matched: boolean;        // 是否匹配成功
  trackId?: string;        // 匹配的轨迹 ID
  trackName?: string;      // 匹配的轨迹名称
  trackColor?: string;     // 匹配的轨迹颜色
  matchedPoint?: {
    latitude: number;      // 匹配点纬度
    longitude: number;     // 匹配点经度
    elevation?: number;    // 匹配点海拔
  };
  timeDiff?: number;       // 时间差（秒，正数表示照片晚于轨迹点）
  photoTime?: Date;        // 照片拍摄时间
  selected: boolean;       // 是否勾选（前端状态）
}

/** 批量写入请求 */
export interface GpxBatchWriteRequest {
  items: Array<{
    path: string;          // 照片路径
    longitude: number;     // 经度
    latitude: number;      // 纬度
  }>;
}

/** 批量写入响应 */
export interface GpxBatchWriteResponse {
  success: number;         // 成功数量
  failed: number;          // 失败数量
  errors: Array<{          // 失败详情
    path: string;
    error: string;
  }>;
}
```


### 5.2 AppConfig 扩展

```typescript
// shared/contracts.ts 修改

export interface AppConfig {
  // ... 现有字段
  gpxTracks: string[];  // GPX 文件路径列表（持久化）
}
```

### 5.3 前端状态管理

```typescript
// App.vue 或 GpxTrackTab.vue 中的响应式状态

const gpxModel = reactive({
  selectedDirectory: '',           // 选中的照片目录
  photoCount: 0,                   // 照片总数
  photoWithExifCount: 0,           // 有 EXIF 时间的照片数
  tracks: [] as GpxTrack[],        // 轨迹列表
  timeWindow: 5,                   // 时间窗口（分钟）
  matchResults: [] as PhotoMatchResult[], // 匹配结果
  matching: false,                 // 是否正在匹配
  writing: false,                  // 是否正在写入
});
```


## 六、后端实现

### 6.1 新增 API 端点

#### 1. 解析 GPX 文件

**端点**: `GET /api/gpx/parse`

**Query 参数**:
- `path`: GPX 文件路径

**响应**:
```json
{
  "name": "day1.gpx",
  "points": [
    {
      "time": "2024-06-14T08:00:00.000Z",
      "latitude": 40.123456,
      "longitude": 116.123456,
      "elevation": 120.5
    }
  ],
  "pointCount": 1234,
  "distance": 15.8,
  "timeRange": {
    "start": "2024-06-14T08:00:00.000Z",
    "end": "2024-06-14T18:30:00.000Z"
  }
}
```

**实现要点**:
- 使用 `fast-xml-parser` 解析 GPX XML
- 提取 `<trkpt>` 标签的 `lat`、`lon` 属性
- 提取 `<time>` 和 `<ele>` 子标签
- 计算总距离（Haversine 公式）
- 安全检查：路径必须在 `libraryRoots` 范围内

#### 2. 扫描照片 EXIF 时间

**端点**: `POST /api/media/scan-exif-time`

**Body**:
```json
{
  "directory": "D:\Photos\2024-06-trip"
}
```

**响应**:
```json
{
  "items": [
    {
      "path": "D:\Photos\2024-06-trip\IMG_001.jpg",
      "name": "IMG_001.jpg",
      "exifTime": "2024-06-14T14:23:45.000Z",
      "hasGps": false
    },
    {
      "path": "D:\Photos\2024-06-trip\IMG_002.jpg",
      "name": "IMG_002.jpg",
      "exifTime": "2024-06-14T15:10:22.000Z",
      "hasGps": true,
      "latitude": 40.111111,
      "longitude": 116.111111
    }
  ]
}
```

**实现要点**:
- 扫描目录中的图片和视频文件
- 使用 `exifreader` 读取 `DateTimeOriginal` 标签
- 同时读取现有 GPS 信息（`GPSLatitude`、`GPSLongitude`）
- 没有 EXIF 时间的照片，`exifTime` 为 `null`
- 安全检查：路径必须在 `libraryRoots` 范围内


#### 3. 批量写入 GPS 坐标

**端点**: `POST /api/media/batch-set-gps`

**Body**:
```json
{
  "items": [
    {
      "path": "D:\Photos\2024-06-trip\IMG_001.jpg",
      "longitude": 116.123456,
      "latitude": 40.123456
    },
    {
      "path": "D:\Photos\2024-06-trip\IMG_002.jpg",
      "longitude": 116.234567,
      "latitude": 40.234567
    }
  ]
}
```

**响应**:
```json
{
  "success": 2,
  "failed": 0,
  "errors": []
}
```

**实现要点**:
- 复用现有的 `setMediaGps` 逻辑（写入 XMP）
- 批量处理，单个失败不影响其他
- 返回成功/失败统计和详细错误信息
- 安全检查：路径必须在 `libraryRoots` 范围内

### 6.2 依赖库

```json
{
  "dependencies": {
    "fast-xml-parser": "^4.3.2",  // GPX XML 解析（需新增）
    "exifreader": "^4.21.1"        // EXIF 读取（已有）
  }
}
```

### 6.3 GPX 解析实现示例

```typescript
// server/src/gpx.ts

import { XMLParser } from 'fast-xml-parser';

interface GpxParseResult {
  name: string;
  points: Array<{
    time: Date;
    latitude: number;
    longitude: number;
    elevation?: number;
  }>;
  pointCount: number;
  distance: number;
  timeRange: {
    start: Date;
    end: Date;
  };
}

export async function parseGpxFile(filePath: string): Promise<GpxParseResult> {
  const content = await fs.readFile(filePath, 'utf-8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });
  
  const gpx = parser.parse(content);
  const tracks = gpx.gpx.trk || [];
  const allPoints: any[] = [];
  
  // 提取所有轨迹段的点
  for (const track of Array.isArray(tracks) ? tracks : [tracks]) {
    const segments = track.trkseg || [];
    for (const segment of Array.isArray(segments) ? segments : [segments]) {
      const points = segment.trkpt || [];
      allPoints.push(...(Array.isArray(points) ? points : [points]));
    }
  }
  
  // 转换为标准格式
  const points = allPoints.map(pt => ({
    time: new Date(pt.time),
    latitude: parseFloat(pt['@_lat']),
    longitude: parseFloat(pt['@_lon']),
    elevation: pt.ele ? parseFloat(pt.ele) : undefined,
  }));
  
  // 计算距离和时间范围
  const distance = calculateTrackDistance(points);
  const times = points.map(p => p.time.getTime());
  
  return {
    name: path.basename(filePath),
    points,
    pointCount: points.length,
    distance,
    timeRange: {
      start: new Date(Math.min(...times)),
      end: new Date(Math.max(...times)),
    },
  };
}

function calculateTrackDistance(points: Array<{latitude: number; longitude: number}>): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineDistance(
      points[i].latitude, points[i].longitude,
      points[i + 1].latitude, points[i + 1].longitude
    );
  }
  return Math.round(total * 10) / 10; // 保留一位小数
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * Math.PI / 180;
}
```


## 七、地图集成

### 7.1 高德地图 (AmapPanel.vue)

```typescript
// 绘制 GPX 轨迹
function drawGpxTrack(track: GpxTrack) {
  if (!mapInstance.value) return;
  
  const path = track.points.map(p => [p.longitude, p.latitude]);
  
  const polyline = new AMap.Polyline({
    path,
    strokeColor: track.color,
    strokeWeight: 4,
    strokeOpacity: 0.8,
    zIndex: 50,
  });
  
  polyline.setMap(mapInstance.value);
  trackPolylines.set(track.id, polyline);
}

// 显示/隐藏轨迹
function toggleTrackVisibility(trackId: string, visible: boolean) {
  const polyline = trackPolylines.get(trackId);
  if (polyline) {
    polyline[visible ? 'show' : 'hide']();
  }
}

// 删除轨迹
function removeTrack(trackId: string) {
  const polyline = trackPolylines.get(trackId);
  if (polyline) {
    polyline.setMap(null);
    trackPolylines.delete(trackId);
  }
}
```

### 7.2 Mapbox (MapboxPanel.vue)

```typescript
// 添加 GPX 轨迹图层
function addGpxTrack(track: GpxTrack) {
  if (!mapInstance.value) return;
  
  const sourceId = `gpx-track-${track.id}`;
  const layerId = `gpx-track-layer-${track.id}`;
  
  // 添加数据源
  mapInstance.value.addSource(sourceId, {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: track.points.map(p => [p.longitude, p.latitude]),
      },
      properties: {},
    },
  });
  
  // 添加图层
  mapInstance.value.addLayer({
    id: layerId,
    type: 'line',
    source: sourceId,
    layout: {
      'line-join': 'round',
      'line-cap': 'round',
    },
    paint: {
      'line-color': track.color,
      'line-width': 4,
      'line-opacity': 0.8,
    },
  });
  
  trackLayers.set(track.id, { sourceId, layerId });
}

// 显示/隐藏轨迹
function toggleTrackVisibility(trackId: string, visible: boolean) {
  const layer = trackLayers.get(trackId);
  if (layer && mapInstance.value) {
    mapInstance.value.setLayoutProperty(
      layer.layerId,
      'visibility',
      visible ? 'visible' : 'none'
    );
  }
}

// 删除轨迹
function removeTrack(trackId: string) {
  const layer = trackLayers.get(trackId);
  if (layer && mapInstance.value) {
    mapInstance.value.removeLayer(layer.layerId);
    mapInstance.value.removeSource(layer.sourceId);
    trackLayers.delete(trackId);
  }
}
```


## 八、前端核心逻辑

### 8.1 匹配照片逻辑

```typescript
// GpxTrackTab.vue

async function matchPhotos() {
  if (!gpxModel.selectedDirectory || !gpxModel.tracks.length) {
    return;
  }
  
  gpxModel.matching = true;
  try {
    // 1. 扫描照片 EXIF 时间
    const response = await fetch('/api/media/scan-exif-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory: gpxModel.selectedDirectory }),
    });
    const { items } = await response.json();
    
    // 2. 对每张照片进行时间匹配
    const results: PhotoMatchResult[] = items.map(photo => {
      if (!photo.exifTime) {
        return {
          photo,
          matched: false,
          selected: false,
        };
      }
      
      const photoTime = new Date(photo.exifTime);
      const match = findBestMatch(photoTime, gpxModel.tracks, gpxModel.timeWindow);
      
      if (!match) {
        return {
          photo,
          matched: false,
          photoTime,
          selected: false,
        };
      }
      
      return {
        photo,
        matched: true,
        trackId: match.trackId,
        trackName: match.trackName,
        trackColor: match.trackColor,
        matchedPoint: match.point,
        timeDiff: match.timeDiff,
        photoTime,
        selected: true, // 默认勾选
      };
    });
    
    // 3. 按时间差排序，优先显示匹配度高的
    results.sort((a, b) => {
      if (!a.matched && !b.matched) return 0;
      if (!a.matched) return 1;
      if (!b.matched) return -1;
      return Math.abs(a.timeDiff!) - Math.abs(b.timeDiff!);
    });
    
    gpxModel.matchResults = results;
    
    const matchedCount = results.filter(r => r.matched).length;
    ElMessage.success(`找到 ${matchedCount} 张可匹配照片`);
  } catch (error) {
    ElMessage.error('匹配失败：' + error.message);
  } finally {
    gpxModel.matching = false;
  }
}

function findBestMatch(
  photoTime: Date,
  tracks: GpxTrack[],
  timeWindowMinutes: number
): {
  trackId: string;
  trackName: string;
  trackColor: string;
  point: { latitude: number; longitude: number; elevation?: number };
  timeDiff: number;
} | null {
  const windowMs = timeWindowMinutes * 60 * 1000;
  let bestMatch: any = null;
  let minTimeDiff = Infinity;
  
  for (const track of tracks) {
    for (let i = 0; i < track.points.length - 1; i++) {
      const p1 = track.points[i];
      const p2 = track.points[i + 1];
      
      const t1 = p1.time.getTime();
      const t2 = p2.time.getTime();
      const tPhoto = photoTime.getTime();
      
      // 检查是否在时间段内
      if (t1 <= tPhoto && tPhoto <= t2) {
        // 检查时间窗口
        const diff1 = Math.abs(tPhoto - t1);
        const diff2 = Math.abs(tPhoto - t2);
        
        if (diff1 <= windowMs || diff2 <= windowMs) {
          const currentDiff = Math.min(diff1, diff2);
          
          if (currentDiff < minTimeDiff) {
            // 线性插值
            const ratio = (tPhoto - t1) / (t2 - t1);
            const lng = p1.longitude + ratio * (p2.longitude - p1.longitude);
            const lat = p1.latitude + ratio * (p2.latitude - p1.latitude);
            const ele = p1.elevation && p2.elevation
              ? p1.elevation + ratio * (p2.elevation - p1.elevation)
              : undefined;
            
            minTimeDiff = currentDiff;
            bestMatch = {
              trackId: track.id,
              trackName: track.name,
              trackColor: track.color,
              point: { latitude: lat, longitude: lng, elevation: ele },
              timeDiff: (tPhoto - t1) / 1000, // 转为秒
            };
          }
        }
      }
    }
  }
  
  return bestMatch;
}
```


### 8.2 批量写入逻辑

```typescript
async function batchWrite() {
  const selected = gpxModel.matchResults.filter(r => r.matched && r.selected);
  
  if (!selected.length) {
    ElMessage.warning('请至少勾选一张照片');
    return;
  }
  
  gpxModel.writing = true;
  try {
    const items = selected.map(r => ({
      path: r.photo.path,
      longitude: r.matchedPoint!.longitude,
      latitude: r.matchedPoint!.latitude,
    }));
    
    const response = await fetch('/api/media/batch-set-gps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    
    const result = await response.json();
    
    if (result.success > 0) {
      ElMessage.success(`成功写入 ${result.success} 张照片`);
    }
    
    if (result.failed > 0) {
      ElMessage.error(`失败 ${result.failed} 张照片`);
      console.error('写入失败详情:', result.errors);
    }
    
    // 清空匹配结果
    gpxModel.matchResults = [];
  } catch (error) {
    ElMessage.error('批量写入失败：' + error.message);
  } finally {
    gpxModel.writing = false;
  }
}
```

### 8.3 快捷操作

```typescript
// 全选
function selectAll() {
  gpxModel.matchResults.forEach(r => {
    if (r.matched) r.selected = true;
  });
}

// 反选
function invertSelection() {
  gpxModel.matchResults.forEach(r => {
    if (r.matched) r.selected = !r.selected;
  });
}

// 只选无 GPS 的
function selectOnlyNoGps() {
  gpxModel.matchResults.forEach(r => {
    if (r.matched) {
      r.selected = !r.photo.hasGps;
    }
  });
}
```


## 九、样式规范

### 9.1 颜色预设

```scss
// styles.scss

$gpx-track-colors: (
  '#FF6B6B',  // 红色
  '#4ECDC4',  // 青色
  '#45B7D1',  // 蓝色
  '#FFA07A',  // 橙色
  '#98D8C8',  // 薄荷绿
  '#F9CA24',  // 黄色
  '#6C5CE7',  // 紫色
);

.gpx-track-item {
  .color-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: inline-block;
  }
}
```

### 9.2 匹配结果卡片样式

```scss
.match-result-card {
  display: grid;
  grid-template-columns: 48px auto;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  
  &.has-original-gps {
    border-color: rgba(255, 193, 7, 0.6);
    background: rgba(255, 193, 7, 0.05);
  }
  
  .thumbnail {
    width: 48px;
    height: 48px;
    border-radius: 4px;
    object-fit: cover;
    background: #edf2f6;
  }
  
  .info {
    display: grid;
    gap: 4px;
    font-size: 12px;
    
    .filename {
      font-weight: 600;
      color: #263849;
    }
    
    .meta {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--text-muted);
      
      .track-indicator {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
    }
  }
}
```


## 十、用法指南更新

### 10.1 在 GuideTab.vue 中新增章节

```markdown
### GPX 轨迹匹配

通过 GPX 轨迹文件为照片自动标注位置。

#### 使用步骤

1. **选择照片目录**：点击"选择目录"，选择包含照片的文件夹
2. **添加 GPX 轨迹**：点击"添加轨迹"，选择 GPX 文件（可添加多条）
3. **配置时间窗口**：调整时间匹配容差（默认 ±5 分钟）
4. **匹配照片**：点击"匹配照片"，系统自动匹配
5. **预览结果**：查看匹配详情，取消不需要的匹配
6. **批量写入**：点击"批量写入"保存坐标到 XMP

#### 匹配原理

- **时间来源**：只使用照片 EXIF 中的拍摄时间（`DateTimeOriginal`）
- **时间窗口**：照片时间必须在轨迹点时间的 ±X 分钟内才匹配
- **坐标计算**：使用线性插值在两个轨迹点之间计算精确位置
- **多轨迹**：自动选择时间差最小的匹配点

#### 时间窗口建议

- **徒步/骑行**：±2-3 分钟（轨迹点密集）
- **自驾游**：±5-10 分钟（速度快，轨迹点稀疏）
- **相机时钟误差大**：适当增加到 ±15-30 分钟

#### 注意事项

- 没有 EXIF 拍摄时间的照片无法匹配
- 如果照片已有 GPS 坐标，会在预览中标出，可选择是否覆盖
- GPX 文件路径会保存到配置，重启后自动加载
- 所有坐标使用 WGS-84 标准
```


## 十一、测试要点

### 11.1 单元测试

#### GPX 解析测试
```typescript
// server/test/gpx.test.ts

test('解析标准 GPX 文件', async () => {
  const result = await parseGpxFile('test/fixtures/track.gpx');
  expect(result.pointCount).toBeGreaterThan(0);
  expect(result.distance).toBeGreaterThan(0);
  expect(result.timeRange.start).toBeInstanceOf(Date);
});

test('处理多个轨迹段', async () => {
  const result = await parseGpxFile('test/fixtures/multi-segment.gpx');
  expect(result.points.length).toBe(/* 所有段的点数总和 */);
});

test('处理缺少海拔的轨迹点', async () => {
  const result = await parseGpxFile('test/fixtures/no-elevation.gpx');
  expect(result.points[0].elevation).toBeUndefined();
});
```

#### 时间匹配测试
```typescript
// client/test/gpx-match.test.ts

test('精确匹配轨迹点', () => {
  const photoTime = new Date('2024-06-14T14:30:00Z');
  const tracks = [createMockTrack()];
  const result = findBestMatch(photoTime, tracks, 5);
  expect(result).not.toBeNull();
  expect(result!.timeDiff).toBeLessThan(60); // 小于 60 秒
});

test('超出时间窗口不匹配', () => {
  const photoTime = new Date('2024-06-14T20:00:00Z'); // 远离轨迹时间
  const tracks = [createMockTrack()];
  const result = findBestMatch(photoTime, tracks, 5);
  expect(result).toBeNull();
});

test('线性插值计算坐标', () => {
  const photoTime = new Date('2024-06-14T14:15:00Z');
  const tracks = [{
    points: [
      { time: new Date('2024-06-14T14:10:00Z'), latitude: 40.0, longitude: 116.0 },
      { time: new Date('2024-06-14T14:20:00Z'), latitude: 40.1, longitude: 116.1 },
    ],
  }];
  const result = findBestMatch(photoTime, tracks, 10);
  expect(result!.point.latitude).toBeCloseTo(40.05, 2);
  expect(result!.point.longitude).toBeCloseTo(116.05, 2);
});
```


### 11.2 集成测试

#### 端到端流程测试
```typescript
test('完整 GPX 匹配流程', async () => {
  // 1. 选择照片目录
  await selectPhotoDirectory('test/fixtures/photos');
  
  // 2. 添加 GPX 轨迹
  await addGpxTrack('test/fixtures/track.gpx');
  
  // 3. 匹配照片
  const results = await matchPhotos();
  expect(results.filter(r => r.matched).length).toBeGreaterThan(0);
  
  // 4. 批量写入
  const selected = results.filter(r => r.matched && r.selected);
  const response = await batchWrite(selected);
  expect(response.success).toBe(selected.length);
});
```

### 11.3 手动测试清单

- [ ] 选择照片目录，显示正确的照片统计
- [ ] 添加 GPX 轨迹，地图绘制线条
- [ ] 轨迹列表显示完整信息（点数、距离、时间）
- [ ] 显示/隐藏轨迹，地图同步更新
- [ ] 删除轨迹，地图移除线条
- [ ] 调整时间窗口，重新匹配结果变化
- [ ] 匹配结果表格显示完整信息
- [ ] 快捷操作（全选、反选、只选无GPS）正常工作
- [ ] 批量写入成功，XMP 文件包含正确坐标
- [ ] 刷新页面，GPX 轨迹路径自动加载
- [ ] 高德地图和 Mapbox 都能正确绘制轨迹


## 十二、实现步骤建议

### 阶段 1：后端基础（1-2 天）

1. 安装依赖 `fast-xml-parser`
2. 实现 `server/src/gpx.ts`（GPX 解析）
3. 实现 `GET /api/gpx/parse` 端点
4. 实现 `POST /api/media/scan-exif-time` 端点
5. 实现 `POST /api/media/batch-set-gps` 端点
6. 扩展 `AppConfig` 添加 `gpxTracks` 字段
7. 编写后端单元测试

### 阶段 2：前端组件（2-3 天）

1. 创建 `GpxTrackTab.vue` 组件框架
2. 实现照片目录选择（复用 `FolderPickerDialog`）
3. 实现 GPX 文件选择（复用 `FolderPickerDialog`，过滤 `.gpx`）
4. 实现轨迹列表 `GpxTrackList.vue`
5. 实现匹配配置 `MatchConfig.vue`
6. 实现匹配结果表格 `MatchResultTable.vue`
7. 实现时间匹配算法（前端）
8. 实现批量写入逻辑

### 阶段 3：地图集成（1 天）

1. 扩展 `AmapPanel.vue`，添加轨迹绘制
2. 扩展 `MapboxPanel.vue`，添加轨迹绘制
3. 实现显示/隐藏/删除轨迹功能
4. 测试两种地图的轨迹渲染

### 阶段 4：样式和交互（1 天）

1. 实现 GPX Tab 样式（`styles.scss`）
2. 实现轨迹列表样式
3. 实现匹配结果卡片样式
4. 优化交互反馈（loading、toast）

### 阶段 5：用法指南和测试（1 天）

1. 更新 `GuideTab.vue`，添加 GPX 章节
2. 编写前端单元测试
3. 端到端测试
4. 手动测试完整流程
5. 修复发现的问题

**总计：约 5-7 天**


## 十三、注意事项和风险

### 13.1 性能考虑

**大文件处理**：
- GPX 文件可能包含数万个轨迹点
- 建议前端限制单个 GPX 文件大小（如 10MB）
- 匹配算法的时间复杂度：O(n × m)，n = 照片数，m = 轨迹点数
- 对于大量照片（>1000张），考虑显示进度条

**优化策略**：
- 使用 Web Worker 处理匹配计算
- 轨迹点按时间排序，使用二分查找优化
- 匹配结果表格虚拟滚动

### 13.2 时间相关问题

**时区处理**：
- GPX 时间通常是 UTC（ISO 8601 格式）
- EXIF 时间可能是本地时间或 UTC
- 需要明确处理时区转换，避免匹配偏差

**时钟误差**：
- 相机/手机时钟可能不准确
- GPS 设备时钟通常很准确
- 用户需要根据实际情况调整时间窗口

### 13.3 边界情况

**空数据处理**：
- GPX 文件没有轨迹点
- 照片目录为空
- 所有照片都没有 EXIF 时间
- 时间窗口过小导致没有匹配

**路径安全**：
- 所有文件路径必须在 `libraryRoots` 范围内
- 防止路径遍历攻击
- GPX 文件和照片目录都需要安全检查

### 13.4 兼容性

**GPX 格式变种**：
- 标准 GPX 1.0 和 1.1
- 可能包含多个 `<trk>` 或 `<rte>`
- 可能缺少 `<time>` 或 `<ele>` 标签
- 需要容错处理

**EXIF 读取**：
- 部分相机/手机的 EXIF 格式不标准
- 视频的 EXIF 读取可能失败
- 需要优雅降级


## 十四、未来扩展可能性

### 14.1 功能增强

- **手动调整匹配点**：在地图上手动微调匹配的位置
- **轨迹编辑**：删除轨迹中的错误点
- **轨迹合并**：将多条轨迹合并为一条
- **轨迹分段**：按时间或距离分割轨迹
- **海拔信息写入**：如果 GPX 包含海拔，也写入 XMP

### 14.2 用户体验优化

- **拖拽导入**：直接拖拽 GPX 文件到界面
- **批量导入**：一次选择多个 GPX 文件
- **轨迹预览**：悬停轨迹列表时，地图高亮对应线条
- **时间线可视化**：显示轨迹和照片的时间分布
- **匹配质量评分**：给每个匹配结果打分（时间差、距离等）

### 14.3 高级功能

- **轨迹统计**：速度、爬升、时长等统计信息
- **照片聚类**：按轨迹段自动分组照片
- **导出报告**：生成 HTML/PDF 匹配报告
- **GPX 导出**：将照片位置导出为新的 GPX 文件

---

## 附录：参考资料

### GPX 格式规范
- [GPX 1.1 Schema](https://www.topografix.com/GPX/1/1/)
- [GPX Wikipedia](https://en.wikipedia.org/wiki/GPS_Exchange_Format)

### EXIF 标准
- [EXIF 2.3 Specification](https://www.cipa.jp/std/documents/e/DC-008-2012_E.pdf)
- [EXIF DateTimeOriginal Tag](https://exiftool.org/TagNames/EXIF.html)

### 坐标系统
- [WGS-84 (World Geodetic System)](https://en.wikipedia.org/wiki/World_Geodetic_System)
- [Haversine Formula](https://en.wikipedia.org/wiki/Haversine_formula)

---

**文档版本历史**：
- v1.0 (2026-06-14) - 初始版本，完整设计方案

**待审阅事项**：
- [ ] 时间窗口默认值（5 分钟）是否合理
- [ ] 匹配结果表格信息是否足够
- [ ] UI 布局是否符合预期
- [ ] 是否需要调整实现优先级

