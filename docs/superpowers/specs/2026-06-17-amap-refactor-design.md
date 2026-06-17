# 高德地图代码重构设计（按 amap-jsapi-skill 最佳实践）

- 日期：2026-06-17
- 范围：高德地图相关前端代码（`lib/amap.ts`、`components/AmapPanel.vue` 及其拆分产物）
- 不含：MapboxPanel、后端 `_AMapService` 代理、AMap TS 类型声明

## 1. 背景与现状

项目同时存在两套地图实现：高德（默认 `mapProvider: 'amap'`）与 Mapbox。本次只重构高德侧。

现状：

- `client/src/lib/amap.ts`（85 行）：**手写 `<script src="webapi.amap.com/maps?v=2.0&key=...">`** 注入 AMap，未使用官方 `@amap/amap-jsapi-loader`；插件由 `loadAmapPlugins` 分两步 `AMap.plugin(...)` 加载，附带 `pluginLoaders` 缓存与 `isPluginAvailable` 兜底。
- `client/src/components/AmapPanel.vue`（1539 行）：巨型组件，混合围栏绘制/编辑、媒体标记（普通 + 聚合）、标记拖拽、地址搜索、图层切换、剪贴板复制、生命周期管理。
- `client/src/lib/amapSearch.ts`（55 行）：纯函数，结构干净。
- `client/src/components/MapPanel.vue`（92 行）：provider 切换器，设计合理。
- 配置来源：`amapKey` / `amapSecurityCode` 存于 `data/app.config.json`，经 props 下发至 `AmapPanel`。
- 后端 `server/src` 无 `_AMapService` 代理，安全密钥为前端明文方式（skill 所述开发环境方式）。
- 依赖：未安装 `@amap/amap-jsapi-loader`；Mapbox 侧正常使用 `mapbox-gl` 包。

### 对照 skill 最佳实践的差距

1. 加载方式：skill 推荐 `AMapLoader.load({ version, plugins })` 一次性加载 → 当前手写 script + 分步 plugin。
2. 资源释放：`map.destroy()` 已做 ✓。
3. 安全密钥：`securityJsCode` 明文配置已做 ✓（生产代理方案本轮不做）。
4. 按需加载：plugins 声明 ✓ 基本符合。
5. 实例持有：skill 推荐 `shallowRef`/`let` 避免深层响应式 → 当前 `let map: any` 已符合，保持。

## 2. 目标与非目标

### 目标

- 行为 100% 不变，只动「加载方式」与「代码落点」。
- loader 迁移到官方 `@amap/amap-jsapi-loader`，契合 skill `map-init.md`。
- `AmapPanel.vue` 按功能拆分子组件 + 内部 `xxxModel` 重组，契合项目 `vue-locality-cleanup` 与前端状态组织规范。
- 有状态逻辑留在 `AmapPanel.vue` 内；无状态工具下沉 `lib/`，使其可单测。

### 非目标（YAGNI）

- 不做后端 `_AMapService` 代理。
- 不重写 AMap TS 类型声明（保持 `any`，零行为改动）。
- 不重构 MapboxPanel。
- 不抽 composable 侧文件（状态逻辑留组件内）。
- 不改 `viewMode` 2D→3D（属行为变更）。

## 3. 决策记录

| 决策点 | 选择 | 理由 |
| --- | --- | --- |
| 重构范围 | loader 迁移 + 拆分组件 | 契合 skill 最佳实践与项目规范，中等改动；后端代理范围过大另行评估 |
| 拆分方式 | 子组件 + 内部重组 | 平衡 `vue-locality-cleanup`（勿散落侧文件）与组件瘦身；有状态逻辑留组件内 |
| loader 依赖归属 | devDependencies | vite 打进 `dist/client`；pkg 只 serve 静态资源，不进 exe |
| AMap 句柄 | `let`（非响应式） | 避免深层响应式性能损耗，与现有写法一致 |
| 类型策略 | 保持 `any` | 零行为改动，避免大面积重写 |

## 4. 架构设计

### 4.1 加载层（`lib/amap.ts` 重写）

旧流程：手写 `<script>` 注入 → `loadAmapPlugins` 分步 `AMap.plugin(...)`。
新流程：`applyAmapSecurityCode` → `AMapLoader.load({ key, version:'2.0', plugins })` 一次性加载。

新签名：

```ts
export function loadAmap(key: string, securityCode: string, plugins: string[]): Promise<void>
```

要点：

- **加载前**先 `applyAmapSecurityCode(securityCode)`，设置 `window._AMapSecurityConfig.securityJsCode`（skill 安全铁律 + `security.md`）。
- 单例 `amapPromise` 守卫；失败时置 `null` 允许重试。
- **HMR 守卫**：检测 `window.AMap` 已存在则直接 `resolve`，避免 vite 热更新下官方 loader 重复 `load` 抛「重复加载JSAPI」。
- 删除 `loadAmapPlugins` / `loadAmapPlugin` / `isPluginAvailable` / `pluginLoaders` 整套；plugins 列表前移到单次 `load` 调用。
- `window.AMap` 全局访问模式不变，组件内 `(window as any).AMap.XXX` 零改动。

### 4.2 模块落点地图

| 内容 | 落点 | 状态 |
| --- | --- | --- |
| loader / 安全配置 / 单例 | `lib/amap.ts`（重写，85 → ~60 行） | 改 |
| 剪贴板原语（fallback / execCommand / 日志详情 / 错误格式化） | `lib/clipboard.ts`（新，~110 行） | 新增 |
| marker DOM 构造（媒体元素 / 视频播放链接 / 图片预览链接 / 搜索标记） | `lib/amapMarkerDom.ts`（新） | 新增 |
| 搜索格式化 | `lib/amapSearch.ts` | 不动 |
| marker 媒体策略 | `lib/mapMarkerMedia.ts` | 不动 |
| 搜索框 UI | `AmapSearchBar.vue`（新子组件） | 新增 |
| 图层切换 UI | `AmapLayerSwitch.vue`（新子组件） | 新增 |
| 坐标条 UI | `AmapCoordinateBar.vue`（新子组件） | 新增 |
| 围栏编辑面板 | `GeofenceEditPanel.vue` | 不动 |
| 聚合列表 | `ClusterItemList.vue` | 不动 |
| 有状态逻辑（围栏/聚合/拖拽/搜索/图层/drop/生命周期） | `AmapPanel.vue`（重组，1539 → ~900 行） | 改 |

### 4.3 子组件契约

- `AmapSearchBar.vue`：`v-model:keyword` / `:loading` / `:fetch-suggestions` / `@select` / `@search`。autocomplete 实例留父级，子组件只承载 `el-autocomplete` UI。
- `AmapLayerSwitch.vue`：`v-model:layerMode('standard'|'satellite')` / `v-model:roadNet(boolean)`。
- `AmapCoordinateBar.vue`：`v-model:system('gcj02'|'wgs84')` / `:gcj02Text` / `:wgs84Text`。

### 4.4 AmapPanel 内部分块

AMap 句柄与指令态（非响应式）：

```
let map / autocomplete / placeSearch / standardLayer / satelliteLayer / roadNetLayer
let markers / markerCluster / searchMarker
let mouseTool / polygonEditor / geofencePolygons
let markerDragState / restoreMapDragTimer
```

响应式状态（按业务功能收拢到具名 `xxxModel`）：

- `mapModel`（已有）：hint / searchKeyword / searching / mouseCoord / coordinateSystem / layerMode / satelliteRoadNet / expandedPath / draggingMarkerId / suppressMarkerClickUntil
- `clusterModel`（已有）：listVisible / listItems / listPosition / currentClusterKey / activeClusterElement
- `geofenceModel`（新，收拢现散落 ref）：`{ currentPolygon, updateTrigger }`

函数组（区块注释 + 内聚分组）：

- 生命周期：`ensureMap` / `onMounted` / `onBeforeUnmount`
- 图层：`applyMapLayers` / `ensureMapLayers` / `setRoadNetVisible` / `switchMapLayer` / `toggleSatelliteRoadNet`
- 标记渲染：`renderMarkers` / `renderClusterMarker` / `renderSingleMarker` / `createMarkerContent`（留组件，耦合 emit/mapModel）
- 标记拖拽：`beginMarkerDrag` / `handleMarkerPointerMove` / `handleMarkerPointerUp` / `cancelMarkerDrag` / `cleanupMarkerDragListeners` / `scheduleRestoreMapDrag` / `setMapDragEnabled`
- 搜索：`searchAddress` / `fetchSearchSuggestions` / `handleSuggestionSelect` / `locateKeyword` / `handleAmapSearchError` / `moveToSearchResult` / `showSearchMarker` / `clearSearchMarker`
- 围栏：`renderGeofences` / `startDrawingGeofence` / `startEditingGeofence` / `stopDrawingOrEditing` / `handleConfirmEdit` / `handleCancelEdit` / `currentEditingCoordinates`
- drop：`handleDragOver` / `handleDrop` / `handleBatchDrop` / `generateRandomPositions`
- 剪贴板：`copyLngLat`（留组件，耦合 mapModel/ElMessage/坐标系；底层原语移 `lib/clipboard.ts`）
- watch：geofences / editingGeofenceId+drawingMode / items+...

### 4.5 `lib/clipboard.ts` 导出

- `copyTextWithFallback(text): Promise<{ method: 'clipboard'|'fallback'; clipboardError?: unknown }>`
- `copyTextWithTextarea(text): boolean`
- `buildClipboardFailureMessage(clipboardError, fallbackError): string`
- `createClipboardLogDetails(error): Record<string, unknown>`
- `errorToPlainObject` / `errorToMessage`（内部或导出）

`AmapPanel.copyLngLat` 调用上述原语，保留 ElMessage 成功/失败提示与 `/api/client-log` 上报行为不变。

### 4.6 `lib/amapMarkerDom.ts` 导出

- `createMarkerContent(item, expanded, callbacks)`：返回容器 HTMLElement（含 pointer/click/keydown 事件，回调由调用方传入以保留 emit 耦合）。
- `createMarkerMediaElement(item): HTMLElement`
- `createMarkerVideoPlayLink(item): HTMLElement`
- `createMarkerImagePreviewLink(item): HTMLElement`
- `createSearchMarkerContent(label): HTMLElement`

事件回调签名通过参数注入，避免 DOM 层反向依赖组件 emit。

## 5. 生命周期与错误处理

| 阶段 | 行为 |
| --- | --- |
| 挂载 | `onMounted(ensureMap)` + watch immediate（不变） |
| 加载失败 | `mapModel.hint = message` + `emit('error', message)`；loader `.catch` 映射同样消息（「高德地图加载失败」/「Failed to load AMap script」语义保留） |
| 卸载 | markers.remove / cluster.setMap(null) / 监听解绑 / `map.destroy()`（不变，按区块归组） |
| 搜索 `INVALID_USER_SCODE` | 现有 `handleAmapSearchError` 提示「POI 搜索需要填写高德安全密钥」保留 |

不新增 `_AMapService` 代理。

## 6. 测试策略（Level 1 回归）

| 测试 | 内容 | 状态 |
| --- | --- | --- |
| `tests/amap-search.test.ts` | `formatAmapSuggestions` / `normalizeAmapLngLat` | 已有，`amapSearch.ts` 不动 → 保持绿 |
| `tests/map-marker-media.test.ts` | marker 媒体策略 | 已有，`mapMarkerMedia.ts` 不动 → 保持绿 |
| `tests/map-marker-layout.test.ts` | marker 布局 | 已有 → 保持绿 |
| `tests/clipboard.test.ts`（新） | `copyTextWithFallback` secure/fallback/execCommand=false 三分支 + 错误消息拼接 | 新增 |
| `tests/amap-marker-dom.test.ts`（新） | marker 容器/媒体元素/视频链接/图片预览链接/搜索标记 DOM 结构与事件 stopPropagation | 新增（jsdom 断言 class/aria） |

DOM 构造逻辑从组件抽到 `lib/amapMarkerDom.ts` 后才可单测——拆分的额外收益。

### 验证门禁（完成前必跑）

```bash
npm test -- amap-search.test.ts map-marker-media.test.ts map-marker-layout.test.ts clipboard.test.ts amap-marker-dom.test.ts
npx vue-tsc --noEmit --skipLibCheck --noImplicitAny false
npm run build
```

手动验证：地图加载、地址搜索、围栏绘制/编辑、单标记拖拽、聚合点击列表、图层切换、坐标复制。

## 7. 风险与回滚

| 风险 | 缓解 |
| --- | --- |
| 官方 loader 与手写 script 行为差异（plugin 挂载时机） | 插件列表 1:1 平移；迁移后手动跑全功能 |
| HMR 重复加载报错 | 加 `window.AMap` 存在即 resolve 守卫 |
| `@amap/amap-jsapi-loader` 打包体积 | 进 devDeps，vite 打进 `dist/client`；pkg 只 serve 静态资源，不进 exe |
| 子组件 emit/props 拆错丢事件 | 父级保留全部 emit 转发，子组件仅 UI；逐个迁移后手动验证 |
| 回滚 | 整体按功能块分批 commit（loader / lib 工具 / 子组件 / 重组）；出问题 revert 对应 commit |

## 8. 实施顺序（提交分批）

1. 引入 `@amap/amap-jsapi-loader` 依赖 + 重写 `lib/amap.ts`（loader 迁移，行为等价）。
2. 抽 `lib/clipboard.ts` + `tests/clipboard.test.ts`，`AmapPanel.copyLngLat` 改为调用原语。
3. 抽 `lib/amapMarkerDom.ts` + `tests/amap-marker-dom.test.ts`，`AmapPanel` 标记 DOM 构造改为调用。
4. 新增 `AmapSearchBar.vue` / `AmapLayerSwitch.vue` / `AmapCoordinateBar.vue`，`AmapPanel` 模板替换为子组件。
5. `AmapPanel.vue` 内部按 `xxxModel` 分块重组 + 区块注释。
6. 跑验证门禁 + 手动验证全功能。
