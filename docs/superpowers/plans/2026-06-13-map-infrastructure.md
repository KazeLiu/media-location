# 地图基础设施改造实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 添加 Mapbox 地图支持和地图标记聚合功能，支持高德和 Mapbox 地图切换

**Architecture:** 采用地图提供商抽象层架构，创建 MapProvider 接口，实现 AmapProvider 和 MapboxProvider，MapPanel.vue 动态加载对应提供商

**Tech Stack:** Vue 3, TypeScript, Mapbox GL JS v3.x, 高德 JS API v2, Supercluster, Element Plus

---

## 文件结构规划

**新建文件：**
- `client/src/lib/mapProvider.ts` - MapProvider 抽象接口定义
- `client/src/lib/providers/AmapProvider.ts` - 高德地图提供商实现
- `client/src/lib/providers/MapboxProvider.ts` - Mapbox 地图提供商实现
- `client/src/lib/mapbox.ts` - Mapbox SDK 加载工具
- `client/src/lib/mapboxSearch.ts` - Mapbox Geocoding API 封装

**修改文件：**
- `shared/contracts.ts` - 添加地图配置接口
- `server/src/config.ts` - 添加地图提供商配置
- `client/src/App.vue` - 传递地图配置
- `client/src/components/MapPanel.vue` - 重构使用 MapProvider 抽象层
- `client/src/components/SettingsPanel.vue` - 添加地图提供商设置

**新增依赖：**
- `mapbox-gl@^3.1.0`
- `@types/mapbox-gl@^3.1.0`
- `supercluster@^8.0.1`
- `@types/supercluster@^7.1.3`

---

## Task 1: 安装依赖和配置

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 Mapbox 和 Supercluster 依赖**

```bash
npm install mapbox-gl@^3.1.0 supercluster@^8.0.1
npm install -D @types/mapbox-gl@^3.1.0 @types/supercluster@^7.1.3
```

Expected: 依赖安装成功

- [ ] **Step 2: 验证依赖安装**

```bash
npm list mapbox-gl supercluster
```

Expected: 显示已安装的版本

- [ ] **Step 3: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore: 添加 Mapbox 和 Supercluster 依赖"
```

---

## Task 2: 更新配置接口

**Files:**
- Modify: `shared/contracts.ts:1-10`

- [ ] **Step 1: 添加地图配置字段**

在 `AppConfig` 接口中添加：

```typescript
export interface AppConfig {
  appName: string;
  appVersion: string;
  port: number;
  amapKey: string;
  amapSecurityCode: string;
  mapProvider: 'amap' | 'mapbox';  // 新增
  mapboxToken: string;              // 新增
  libraryRoots: string[];
  backupBeforeWrite: boolean;
  largeWorkspace: boolean;
}
```

- [ ] **Step 2: 提交**

```bash
git add shared/contracts.ts
git commit -m "feat: 添加地图提供商配置字段"
```

---

## Task 3: 更新服务端配置

**Files:**
- Modify: `server/src/config.ts:5-14`
- Modify: `server/src/config.ts:47-63`

- [ ] **Step 1: 更新默认配置**

修改 DEFAULT_CONFIG：

```typescript
const DEFAULT_CONFIG: AppConfig = {
  appName: 'Media Location',
  appVersion: '0.1.0',
  port: 6755,
  amapKey: '',
  amapSecurityCode: '',
  mapProvider: 'amap',  // 新增
  mapboxToken: '',      // 新增
  libraryRoots: [],
  backupBeforeWrite: false,
  largeWorkspace: false,
};
```

- [ ] **Step 2: 更新配置规范化函数**

修改 normalizeConfig 函数：

```typescript
function normalizeConfig(input: Partial<AppConfig>): AppConfig {
  const port = Number(input.port ?? DEFAULT_CONFIG.port);
  const libraryRoots = Array.isArray(input.libraryRoots)
    ? input.libraryRoots.map((entry) => path.resolve(String(entry))).filter(Boolean)
    : DEFAULT_CONFIG.libraryRoots;

  return {
    appName: DEFAULT_CONFIG.appName,
    appVersion: DEFAULT_CONFIG.appVersion,
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_CONFIG.port,
    amapKey: String(input.amapKey || '').trim(),
    amapSecurityCode: String(input.amapSecurityCode || '').trim(),
    mapProvider: input.mapProvider === 'mapbox' ? 'mapbox' : 'amap',  // 新增
    mapboxToken: String(input.mapboxToken || '').trim(),              // 新增
    libraryRoots,
    backupBeforeWrite: Boolean(input.backupBeforeWrite ?? DEFAULT_CONFIG.backupBeforeWrite),
    largeWorkspace: Boolean(input.largeWorkspace ?? DEFAULT_CONFIG.largeWorkspace),
  };
}
```

- [ ] **Step 3: 提交**

```bash
git add server/src/config.ts
git commit -m "feat: 添加地图提供商配置处理"
```

---

## Task 4: 创建 MapProvider 抽象接口

**Files:**
- Create: `client/src/lib/mapProvider.ts`

- [ ] **Step 1: 创建 MapProvider 接口文件**

```typescript
import type { MediaItem } from '@shared/contracts';

export interface MapProviderConfig {
  container: HTMLElement;
  onReady?: () => void;
  onError?: (message: string) => void;
  onMarkerClick?: (item: MediaItem) => void;
  onMapClick?: (lng: number, lat: number) => void;
  onMarkerDragEnd?: (item: MediaItem, lng: number, lat: number) => void;
}

export interface SearchResult {
  name: string;
  lng: number;
  lat: number;
}

export interface ClusterItem {
  item: MediaItem;
  lng: number;
  lat: number;
}

export abstract class MapProvider {
  // 生命周期
  abstract init(config: MapProviderConfig): Promise<void>;
  abstract destroy(): void;

  // 地图操作
  abstract setCenter(lng: number, lat: number, zoom?: number): void;
  abstract setLayerMode(mode: 'standard' | 'satellite'): void;
  abstract setSatelliteRoadNet?(enabled: boolean): void;

  // 标记管理
  abstract renderMarkers(items: MediaItem[], selectedId: string): void;
  abstract clearMarkers(): void;

  // 聚合功能
  abstract enableClustering(enabled: boolean): void;
  abstract showClusterPopup(items: ClusterItem[]): void;
  abstract hideClusterPopup(): void;

  // 搜索功能
  abstract search(keyword: string): Promise<SearchResult | null>;
  abstract showSearchMarker(result: SearchResult): void;
  abstract clearSearchMarker(): void;

  // 坐标系统
  abstract getCoordinateSystemName(): string;
  abstract formatCoordinate(lng: number, lat: number): string;
  abstract supportsCoordinateSystemSwitch(): boolean;

  // 拖放支持
  abstract handleDrop(event: DragEvent, items: MediaItem[]): void;
}
```

- [ ] **Step 2: 提交**

```bash
git add client/src/lib/mapProvider.ts
git commit -m "feat: 创建 MapProvider 抽象接口"
```

---

(计划文档太长，需要分多个任务继续编写...)
