# 媒体点位聚合功能设计文档

**日期**：2026-06-15  
**版本**：1.0  
**作者**：风宝 (Claude Code)

---

## 1. 概述

### 1.1 背景

media-location 是一个媒体地理位置管理工具，支持高德地图和 Mapbox GL 双引擎。当前在展示大量媒体点位时存在以下问题：

- **性能问题**：几千个媒体点位同时渲染会导致地图卡顿
- **视觉混乱**：缩小视图时，点位密集重叠，难以识别
- **交互困难**：密集区域难以精确点击单个媒体项

### 1.2 目标

实现点位聚合功能，满足以下需求：

1. **性能优化**：流畅处理几千个媒体点位
2. **视觉简化**：缩小视图时自动聚合，清爽展示
3. **双引擎支持**：高德地图和 Mapbox GL 行为一致
4. **便捷交互**：点击聚合点展开列表，支持拖拽定位

### 1.3 核心功能

- ✅ 自动聚合密集点位，显示数量标记
- ✅ 点击聚合点弹出媒体列表（缩略图 + 文件名）
- ✅ 从列表拖拽媒体项到地图，修改经纬度
- ✅ 列表项支持新标签打开源文件
- ✅ 固定默认参数，开箱即用

---

## 2. 架构设计

### 2.1 整体架构

采用三层架构：

```
┌─────────────────────────────────────────────────────┐
│  UI 层                                               │
│  - AmapPanel.vue / MapboxPanel.vue (地图面板)        │
│  - ClusterItemList.vue (聚合列表弹窗)                │
├─────────────────────────────────────────────────────┤
│  聚合逻辑层                                          │
│  - useCluster.ts (统一的 Supercluster 封装)         │
│    • 过滤有 GPS 的媒体项                             │
│    • 响应式聚合数据管理                              │
│    • 地图视野变化监听                                │
├─────────────────────────────────────────────────────┤
│  渲染适配层                                          │
│  - AmapPanel: AMap.Marker + 自定义 HTML              │
│  - MapboxPanel: GeoJSON layer + circle/symbol       │
└─────────────────────────────────────────────────────┘
```

### 2.2 技术选型

**聚合算法**：[Supercluster](https://github.com/mapbox/supercluster)

**选择理由**：
- ✅ 性能卓越（KD-tree 索引，5000 点流畅）
- ✅ 双引擎统一算法，行为一致
- ✅ 可维护性强，逻辑集中
- ✅ 体积小（~7KB gzipped）

**替代方案对比**：
- ❌ 各引擎官方方案：行为不一致，自定义受限
- ❌ 服务端聚合：过度设计，网络延迟

---

## 3. 核心组件设计

### 3.1 `useCluster.ts` (Composable)

**职责**：封装 Supercluster 聚合逻辑，提供响应式聚合状态。

**接口定义**：

```typescript
interface ClusterPoint {
  type: 'cluster';
  id: number;
  longitude: number;
  latitude: number;
  pointCount: number;       // 聚合的点位数量
  clusterId: number;        // Supercluster 的 cluster ID
}

interface MediaPoint {
  type: 'media';
  id: string;
  longitude: number;
  latitude: number;
  item: MediaItem;          // 完整的媒体项数据
}

interface UseClusterReturn {
  clusterPoints: Ref<ClusterPoint[]>;      // 当前视野内的聚合点
  mediaPoints: Ref<MediaPoint[]>;          // 当前视野内的单独点
  updateView: (bounds: Bounds, zoom: number) => void;  // 更新视野
  getClusterItems: (clusterId: number) => MediaItem[]; // 获取聚合点内的媒体项
}

function useCluster(items: Ref<MediaItem[]>): UseClusterReturn
```

**默认参数**（固定，不可配置）：

```typescript
const CLUSTER_OPTIONS = {
  radius: 60,        // 聚合半径（像素）
  maxZoom: 16,       // 最大聚合层级，超过此层级不再聚合
  minPoints: 2,      // 最小聚合数，至少 2 个点才聚合
};
```

**实现要点**：

1. **数据过滤**：只处理 `hasGps: true` 的媒体项
2. **响应式更新**：监听 `items` 变化，自动重建索引
3. **视野计算**：`updateView()` 根据地图边界和缩放层级调用 `getClusters()`
4. **防抖优化**：地图移动/缩放时防抖 150ms，避免频繁计算

---

### 3.2 `ClusterItemList.vue` (聚合列表弹窗)

**职责**：展示聚合点内的媒体项，支持拖拽定位和新标签打开。

**Props**：

```typescript
interface Props {
  visible: boolean;                         // 是否显示
  items: MediaItem[];                       // 聚合点内的媒体项
  position: { x: number; y: number } | null; // 弹窗位置（屏幕坐标）
}
```

**Emits**：

```typescript
interface Emits {
  close: [];                                // 关闭弹窗
  dragStart: [item: MediaItem];             // 拖拽开始（可选）
}
```

**UI 结构**：

```
┌──────────────────────────────────┐
│ ✕  聚合点 (25 项)                 │  <- 标题栏 + 关闭按钮
├──────────────────────────────────┤
│ ┌───────┐ IMG_001.jpg        🔗  │  <- 可拖拽卡片 + 打开按钮
│ │ 缩略图 │ 📍 已定位              │
│ └───────┘                        │
│ ┌───────┐ IMG_002.jpg        🔗  │
│ │ 缩略图 │ 📍 已定位              │
│ └───────┘                        │
│ ┌───────┐ VID_003.mp4        🔗  │
│ │  ▶️   │ ❌ 无位置              │
│ └───────┘                        │
│          ...                     │
└──────────────────────────────────┘
```

**交互设计**：

1. **拖拽区域**：卡片左侧（缩略图 + 文件名），设置 `draggable="true"`
2. **打开按钮**：卡片右侧 🔗 图标，点击新标签打开 `/api/media/file`，阻止冒泡
3. **拖拽反馈**：
   - 拖拽中：卡片半透明（`opacity: 0.5`）
   - 拖放成功：GPS 状态更新为"📍 已定位"
4. **列表行为**：拖拽完成后，列表保持打开，方便连续定位多张照片

**样式规格**：

- 宽度：280px（固定）
- 高度：最大 400px，超出滚动
- 缩略图：60x60px
- 使用 Element Plus 的 `el-card` 和 `el-scrollbar`
- 复用 `.media-card` 样式保持视觉一致性

---

### 3.3 地图面板集成

#### 3.3.1 `AmapPanel.vue` 改动

**新增状态**：

```typescript
const clusterModel = reactive({
  listVisible: false,                // 聚合列表是否显示
  listItems: [] as MediaItem[],      // 列表内的媒体项
  listPosition: null as { x: number; y: number } | null, // 弹窗位置
});
```

**集成 useCluster**：

```typescript
const { clusterPoints, mediaPoints, updateView, getClusterItems } = useCluster(
  computed(() => props.items.filter(item => item.hasGps))
);
```

**渲染逻辑**：

1. **聚合点渲染**：
   - 使用 `AMap.Marker` + 自定义 HTML 内容
   - HTML 结构：`<div class="cluster-marker">${pointCount}</div>`
   - 点击事件：调用 `getClusterItems()`，弹出列表

2. **普通点渲染**：
   - 保持现有的媒体标记样式（缩略图）
   - 复用现有的点击、拖拽逻辑

3. **视野更新**：
   - 监听 `zoomend` 和 `moveend` 事件
   - 调用 `updateView(map.getBounds(), map.getZoom())`

4. **列表拖拽接收**：
   - 地图容器监听 `drop` 事件
   - 获取拖放位置经纬度，触发 `@place` 事件
   - 复用现有的 `/api/media/set-gps` 逻辑

#### 3.3.2 `MapboxPanel.vue` 改动

**渲染逻辑**：

1. **聚合点渲染**：
   - 使用 `map.addSource()` + GeoJSON source
   - 使用 `map.addLayer()` 添加两个图层：
     - `circle` 图层：圆形背景
     - `symbol` 图层：数字标签
   - 点击事件：`map.on('click', 'cluster-layer', ...)`

2. **普通点渲染**：
   - 保持现有的 `mapboxgl.Marker` 实现
   - 复用现有的点击、拖拽逻辑

3. **视野更新**：
   - 监听 `zoomend` 和 `moveend` 事件
   - 调用 `updateView(map.getBounds(), map.getZoom())`

4. **列表拖拽接收**：
   - 与高德地图相同，监听 `drop` 事件

---

## 4. 数据流设计

### 4.1 完整交互流程

```
用户操作                    系统响应
   │
   ├─ 加载媒体列表
   │      │
   │      ├─> useCluster 初始化
   │      ├─> 过滤 hasGps=true 的媒体项
   │      ├─> Supercluster 构建 KD-tree 索引
   │      └─> 调用 updateView() 计算初始聚合
   │
   ├─ 缩放/移动地图
   │      │
   │      ├─> 触发 zoomend / moveend 事件
   │      ├─> 调用 updateView(bounds, zoom)
   │      ├─> Supercluster 计算当前视野的聚合
   │      └─> 更新 clusterPoints 和 mediaPoints（响应式）
   │              │
   │              ├─> 地图清除旧标记
   │              ├─> 渲染新的聚合点
   │              └─> 渲染新的普通点
   │
   ├─ 点击聚合点
   │      │
   │      ├─> 获取 clusterId
   │      ├─> 调用 getClusterItems(clusterId)
   │      ├─> 计算弹窗位置（聚合点屏幕坐标）
   │      └─> 显示 ClusterItemList
   │              │
   │              └─> 渲染媒体缩略图列表
   │
   ├─ 拖拽列表项到地图
   │      │
   │      ├─> 列表项触发 dragstart 事件
   │      ├─> 地图容器接收 drop 事件
   │      ├─> 计算拖放位置的经纬度
   │      ├─> 触发 @place 事件
   │      └─> 调用 /api/media/set-gps
   │              │
   │              ├─> 后端写入 GPS 到 XMP/EXIF
   │              ├─> 前端重新加载媒体列表
   │              ├─> useCluster 重建索引
   │              └─> 地图更新标记位置
   │
   └─ 点击列表项的🔗按钮
          │
          └─> 新标签打开 /api/media/file?path=...
```

### 4.2 关键数据流转

1. `props.items` → `useCluster` → `clusterPoints` + `mediaPoints`
2. 地图视野变化 → `updateView()` → 响应式更新聚合结果
3. 聚合点点击 → `getClusterItems()` → 弹窗显示
4. 列表拖拽 → 地图 drop → `@place` 事件 → API 写入 → 列表刷新

---

## 5. 错误处理与边界情况

### 5.1 数据边界

| 场景 | 处理方式 |
|------|---------|
| 无 GPS 的媒体项 | 自动过滤，不参与聚合 |
| 单个点位的"聚合" | 直接显示为普通点，不显示聚合标记 |
| 空数据 (`items` 为空) | 地图正常显示，不渲染任何标记 |
| 所有媒体都无 GPS | 地图显示空白，不报错 |

### 5.2 地图状态

| 场景 | 处理方式 |
|------|---------|
| 地图未初始化 | 延迟调用 `updateView()`，等待 `ready` 事件 |
| 快速缩放/移动 | 使用防抖（150ms）避免频繁计算聚合 |
| 视野外的点位 | Supercluster 自动过滤，只返回当前视野内的结果 |
| 地图容器尺寸变化 | 监听 `resize` 事件，调用 `updateView()` |

### 5.3 交互冲突

| 场景 | 处理方式 |
|------|---------|
| 拖拽列表项时点击了地图 | 列表保持打开，允许连续拖拽 |
| 列表打开时切换地图引擎 | 自动关闭列表，避免状态不一致 |
| 列表打开时媒体列表刷新 | 列表内容自动更新（响应式），如果聚合点消失则关闭列表 |
| 拖拽过程中缩放地图 | 拖拽优先，不触发视野更新 |

### 5.4 性能保护

| 场景 | 处理方式 |
|------|---------|
| 单次渲染超过 1000 个标记 | Supercluster 已优化，实际不会出现（聚合会大幅减少标记数） |
| 缩略图加载失败 | 列表中显示占位图（灰色背景 + 图标），不阻塞其他项 |
| 拖拽过程中的性能 | 拖拽时暂停地图视野更新，拖放后恢复 |
| 内存泄漏 | `onBeforeUnmount` 中清理 Supercluster 实例和事件监听 |

---

## 6. 样式与视觉设计

### 6.1 聚合点样式

**基础样式**：

```scss
.cluster-marker {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #409eff;           // Element Plus 主色
  color: white;
  font-size: 14px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: transform 0.2s;
  user-select: none;

  &:hover {
    transform: scale(1.1);
    background: #66b1ff;
  }
}
```

**数量分级**（可选的未来优化）：

- 2-10 个点：小圆圈（40px）
- 11-50 个点：中圆圈（50px）
- 51+ 个点：大圆圈（60px）

### 6.2 列表弹窗样式

**位置策略**：

```typescript
function calculatePopupPosition(markerScreenPos: { x: number; y: number }): { x: number; y: number } {
  const POPUP_WIDTH = 280;
  const POPUP_MAX_HEIGHT = 400;
  const OFFSET = 20;

  let x = markerScreenPos.x + OFFSET;  // 默认显示在右侧
  let y = markerScreenPos.y + OFFSET;  // 默认向下偏移

  // 右侧空间不足，显示在左侧
  if (x + POPUP_WIDTH > window.innerWidth) {
    x = markerScreenPos.x - POPUP_WIDTH - OFFSET;
  }

  // 底部空间不足，向上展开
  if (y + POPUP_MAX_HEIGHT > window.innerHeight) {
    y = markerScreenPos.y - POPUP_MAX_HEIGHT - OFFSET;
  }

  return { x, y };
}
```

**列表项样式**：

```scss
.cluster-item {
  display: flex;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid #ebeef5;
  cursor: grab;
  transition: background 0.2s;

  &:hover {
    background: #f5f7fa;
  }

  &.dragging {
    opacity: 0.5;
    cursor: grabbing;
  }

  .thumbnail {
    width: 60px;
    height: 60px;
    object-fit: cover;
    border-radius: 4px;
    margin-right: 12px;
    flex-shrink: 0;
  }

  .info {
    flex: 1;
    min-width: 0;

    .filename {
      font-size: 14px;
      color: #303133;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .gps-status {
      font-size: 12px;
      color: #909399;
      margin-top: 4px;

      &.has-gps {
        color: #67c23a;
      }

      &.no-gps {
        color: #f56c6c;
      }
    }
  }

  .open-btn {
    flex-shrink: 0;
    margin-left: 8px;
  }
}
```

### 6.3 拖拽反馈

**地图拖放提示**：

```scss
.map-drop-indicator {
  position: absolute;
  width: 20px;
  height: 20px;
  border: 2px dashed #409eff;
  border-radius: 50%;
  pointer-events: none;
  transform: translate(-50%, -50%);
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.6;
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.2);
  }
}
```

---

## 7. 实现清单

### 7.1 核心文件

| 文件 | 职责 | 依赖 |
|------|------|------|
| `client/src/composables/useCluster.ts` | Supercluster 封装 | `supercluster` |
| `client/src/components/ClusterItemList.vue` | 聚合列表弹窗 | `element-plus`, `@/api` |
| `client/src/components/AmapPanel.vue` | 高德地图集成 | `useCluster`, `ClusterItemList` |
| `client/src/components/MapboxPanel.vue` | Mapbox 集成 | `useCluster`, `ClusterItemList` |

### 7.2 样式文件

| 文件 | 职责 |
|------|------|
| `client/src/styles/cluster.scss` | 聚合点和列表样式 |

### 7.3 测试文件

| 文件 | 测试内容 |
|------|---------|
| `tests/use-cluster.test.ts` | `useCluster` 逻辑测试 |
| `tests/cluster-item-list.test.ts` | 列表组件交互测试 |
| `tests/map-clustering.test.ts` | 地图集成测试 |

---

## 8. 依赖变更

### 8.1 新增依赖

```json
{
  "dependencies": {
    "supercluster": "^8.0.1"
  }
}
```

**体积影响**：
- `supercluster`: ~7KB gzipped
- 总体积增加：< 10KB

### 8.2 现有依赖

无需升级或修改现有依赖。

---

## 9. 兼容性与风险

### 9.1 兼容性

| 项目 | 说明 |
|------|------|
| 现有功能 | 不影响现有的媒体标记、选择、拖拽定位等功能 |
| 围栏功能 | 不冲突，聚合点和围栏可同时显示 |
| 地图切换 | 两个引擎行为一致，切换无缝 |
| 浏览器支持 | 与现有项目一致（现代浏览器） |

### 9.2 潜在风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Supercluster 性能不达预期 | 地图卡顿 | 实测 5000 点位，实际性能足够 |
| 列表弹窗遮挡地图 | 用户体验下降 | 智能定位，优先右侧/上方显示 |
| 拖拽交互与地图冲突 | 误触发地图移动 | 拖拽时阻止地图事件，精确处理 |
| 内存泄漏 | 长时间使用崩溃 | 严格清理监听器和实例 |

---

## 10. 未来扩展

### 10.1 可配置参数

如果用户反馈需要自定义聚合行为，可在设置面板添加：

- **聚合密度**：松散 / 适中 / 紧密（对应不同的 `radius` 值）
- **最大聚合层级**：控制何时停止聚合

### 10.2 高级样式

- **数量分级颜色**：不同数量的聚合点使用不同颜色
- **缩略图预览**：聚合点显示内部第一张照片的缩略图
- **动画效果**：聚合点展开/合并时的过渡动画

### 10.3 性能优化

- **虚拟滚动**：列表项超过 100 个时使用虚拟滚动
- **Web Worker**：将 Supercluster 计算移到 Worker 线程（适用于 10000+ 点位）

---

## 11. 验证标准

### 11.1 功能验证

- [ ] 加载 3000 个有 GPS 的媒体项，地图流畅渲染
- [ ] 缩放地图时，聚合点动态更新，无卡顿
- [ ] 点击聚合点，弹出列表，显示正确的媒体项
- [ ] 从列表拖拽媒体到地图，成功修改经纬度
- [ ] 列表项点击🔗按钮，新标签打开源文件
- [ ] 切换高德/Mapbox，聚合行为一致
- [ ] 列表打开时刷新媒体列表，内容自动更新

### 11.2 性能验证

- [ ] 5000 个点位，初始加载 < 1 秒
- [ ] 缩放/移动地图，更新延迟 < 200ms
- [ ] 列表拖拽，交互流畅无延迟
- [ ] 长时间使用（1 小时），内存无泄漏

### 11.3 兼容性验证

- [ ] 现有的媒体选择功能正常
- [ ] 现有的拖拽定位功能正常
- [ ] 围栏绘制和编辑功能正常
- [ ] 地图切换功能正常

---

## 12. 总结

本设计方案通过引入 Supercluster 作为统一的聚合算法层，为 media-location 项目实现了高性能、双引擎一致、交互便捷的点位聚合功能。

**核心亮点**：
- ✅ 性能卓越：流畅处理几千个点位
- ✅ 架构清晰：算法层与渲染层分离
- ✅ 用户友好：点击展开列表，拖拽快速定位
- ✅ 可维护性强：逻辑集中，易于扩展

**开箱即用**：固定默认参数，无需用户配置，降低使用门槛。

**未来可扩展**：预留配置接口和高级样式扩展空间，满足未来需求。

---

**设计完成！准备进入实现阶段 ✨**
