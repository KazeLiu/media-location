# 电子围栏功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在媒体经纬度工作台中添加电子围栏管理功能，支持多边形围栏创建、编辑、删除，以及拖拽照片到围栏快速设置随机坐标

**Architecture:** 前端新增 GeofenceTab/GeofenceFloatingList 组件，后端新增 geofenceStore 模块和 /api/geofences 接口。高德使用 AMap.PolygonEditor，Mapbox 使用 mapbox-gl-draw，通过适配层统一接口。围栏数据持久化到 data/geofences.json，坐标统一存储为 WGS-84。

**Tech Stack:** Vue 3, Element Plus, TypeScript, 高德地图 JS API (AMap.PolygonEditor), Mapbox GL Draw, Express, Earcut (三角剖分)

---

## 文件结构规划

### 新增文件

**前端组件**
- `client/src/components/GeofenceTab.vue` - 围栏管理标签页
- `client/src/components/GeofenceFloatingList.vue` - 悬浮围栏列表
- `client/src/components/GeofenceEditorDialog.vue` - 围栏编辑对话框

**前端工具库**
- `client/src/lib/geofenceUtils.ts` - 围栏工具函数（随机坐标生成、面积计算）
- `client/src/lib/geofenceEditor.ts` - 围栏编辑器适配层

**后端模块**
- `server/src/geofenceStore.ts` - 围栏数据存储

**类型定义**
- `shared/contracts.ts` - 扩展类型定义（Geofence, GeofenceConfig）

**测试文件**
- `tests/geofenceStore.test.ts` - 后端存储测试
- `tests/geofenceUtils.test.ts` - 前端工具函数测试

### 修改文件

- `client/src/App.vue` - 新增 geofenceModel 状态管理
- `client/src/components/LeftPanel.vue` - 新增电子围栏标签页
- `client/src/components/MapPanel.vue` - 扩展围栏相关 props 和事件
- `client/src/components/AmapPanel.vue` - 集成 AMap.PolygonEditor
- `client/src/components/MapboxPanel.vue` - 集成 mapbox-gl-draw
- `client/src/api.ts` - 新增围栏 API 调用函数
- `server/src/routes.ts` - 新增围栏路由
- `package.json` - 新增依赖

---

## Task 1: 安装依赖和扩展类型定义

**Files:**
- Modify: `package.json`
- Modify: `shared/contracts.ts`

- [ ] **Step 1: 安装前端依赖**

```bash
npm install --save-dev earcut @mapbox/mapbox-gl-draw
npm install --save-dev @types/mapbox__mapbox-gl-draw
```

运行命令并确认安装成功，检查 `package.json` 的 `devDependencies` 包含这些依赖。

- [ ] **Step 2: 扩展 shared/contracts.ts 类型定义**

在 `shared/contracts.ts` 文件末尾添加围栏相关类型：

```typescript
export interface GeofenceCoordinate {
  longitude: number;
  latitude: number;
}

export interface Geofence {
  id: string;
  name: string;
  color: string;
  coordinates: GeofenceCoordinate[];
  createdAt: string;
  updatedAt: string;
}

export interface GeofenceConfig {
  enabled: boolean;
  geofences: Geofence[];
}
```

- [ ] **Step 3: 验证类型编译**

```bash
npx vue-tsc --noEmit --skipLibCheck
```

预期输出：无类型错误

- [ ] **Step 4: 提交**

```bash
git add package.json package-lock.json shared/contracts.ts
git commit -m "feat: 添加围栏依赖和类型定义"
```

---

## Task 2: 后端围栏存储模块

**Files:**
- Create: `server/src/geofenceStore.ts`
- Create: `tests/geofenceStore.test.ts`

- [ ] **Step 1: 编写测试 - 读取空配置**

创建 `tests/geofenceStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadGeofenceConfig, saveGeofenceConfig } from '../server/src/geofenceStore';

const TEST_DATA_DIR = path.join(__dirname, '__test_data__');
const TEST_CONFIG_PATH = path.join(TEST_DATA_DIR, 'geofences.json');

describe('geofenceStore', () => {
  beforeEach(async () => {
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  });

  it('should return default config when file does not exist', async () => {
    const config = await loadGeofenceConfig(TEST_CONFIG_PATH);
    expect(config).toEqual({
      enabled: false,
      geofences: [],
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -- geofenceStore.test.ts
```

预期输出：FAIL - 模块不存在

- [ ] **Step 3: 实现 loadGeofenceConfig**

创建 `server/src/geofenceStore.ts`:

```typescript
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { GeofenceConfig } from '../../shared/contracts';

const DEFAULT_CONFIG: GeofenceConfig = {
  enabled: false,
  geofences: [],
};

export async function loadGeofenceConfig(configPath: string): Promise<GeofenceConfig> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as GeofenceConfig;
    return config;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return DEFAULT_CONFIG;
    }
    throw error;
  }
}

export async function saveGeofenceConfig(configPath: string, config: GeofenceConfig): Promise<GeofenceConfig> {
  const dir = path.dirname(configPath);
  await fs.mkdir(dir, { recursive: true });
  
  const tempPath = `${configPath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(config, null, 2), 'utf-8');
  await fs.rename(tempPath, configPath);
  
  return config;
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test -- geofenceStore.test.ts
```

预期输出：PASS

- [ ] **Step 5: 添加保存配置测试**

在 `tests/geofenceStore.test.ts` 中添加：

```typescript
  it('should save and load config', async () => {
    const config: GeofenceConfig = {
      enabled: true,
      geofences: [
        {
          id: 'test-id',
          name: '测试围栏',
          color: '#FF5733',
          coordinates: [
            { longitude: 116.397428, latitude: 39.90923 },
            { longitude: 116.398428, latitude: 39.90923 },
            { longitude: 116.398428, latitude: 39.91023 },
          ],
          createdAt: '2026-06-14T10:00:00.000Z',
          updatedAt: '2026-06-14T10:00:00.000Z',
        },
      ],
    };

    await saveGeofenceConfig(TEST_CONFIG_PATH, config);
    const loaded = await loadGeofenceConfig(TEST_CONFIG_PATH);
    
    expect(loaded).toEqual(config);
  });
```

- [ ] **Step 6: 运行测试确认通过**

```bash
npm test -- geofenceStore.test.ts
```

预期输出：PASS (2 tests)

- [ ] **Step 7: 提交**

```bash
git add server/src/geofenceStore.ts tests/geofenceStore.test.ts
git commit -m "feat: 实现围栏存储模块"
```

---

## Task 3: 后端 API 路由

**Files:**
- Modify: `server/src/routes.ts`

- [ ] **Step 1: 导入围栏存储模块**

在 `server/src/routes.ts` 顶部添加导入：

```typescript
import { loadGeofenceConfig, saveGeofenceConfig } from './geofenceStore';
```

- [ ] **Step 2: 添加获取围栏配置路由**

在 `createApiRouter` 函数中，`/health` 路由之后添加：

```typescript
  router.get('/geofences', async (_req, res, next) => {
    const startedAt = Date.now();
    try {
      const config = await loadConfig();
      const geofencePath = path.join(path.dirname(config._configPath || 'data/app.config.json'), 'geofences.json');
      const geofenceConfig = await loadGeofenceConfig(geofencePath);
      
      await writeOperationLog({
        level: 'info',
        action: 'geofences:get',
        status: 'ok',
        durationMs: Date.now() - startedAt,
      });
      
      res.json(geofenceConfig);
    } catch (error) {
      await writeOperationLog({
        level: 'error',
        action: 'geofences:get',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startedAt,
      });
      next(error);
    }
  });
```

- [ ] **Step 3: 添加保存围栏配置路由**

继续在 `createApiRouter` 中添加：

```typescript
  router.post('/geofences', async (req, res, next) => {
    const startedAt = Date.now();
    try {
      const config = await loadConfig();
      const geofencePath = path.join(path.dirname(config._configPath || 'data/app.config.json'), 'geofences.json');
      
      const geofenceConfig = req.body;
      if (!geofenceConfig || typeof geofenceConfig.enabled !== 'boolean' || !Array.isArray(geofenceConfig.geofences)) {
        res.status(400).json({ error: 'Invalid geofence config format' });
        return;
      }
      
      const saved = await saveGeofenceConfig(geofencePath, geofenceConfig);
      
      await writeOperationLog({
        level: 'info',
        action: 'geofences:save',
        status: 'ok',
        details: { count: saved.geofences.length },
        durationMs: Date.now() - startedAt,
      });
      
      res.json(saved);
    } catch (error) {
      await writeOperationLog({
        level: 'error',
        action: 'geofences:save',
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startedAt,
      });
      next(error);
    }
  });
```

- [ ] **Step 4: 验证编译**

```bash
npx tsx --no-cache server/src/index.ts
```

启动服务器，确认无编译错误，然后 Ctrl+C 停止。

- [ ] **Step 5: 手动测试 API**

启动开发服务器：

```bash
npm run dev:server
```

在另一个终端测试：

```bash
curl http://127.0.0.1:6755/api/geofences
```

预期输出：`{"enabled":false,"geofences":[]}`

- [ ] **Step 6: 提交**

```bash
git add server/src/routes.ts
git commit -m "feat: 添加围栏 API 路由"
```

---

## Task 4: 前端 API 调用函数

**Files:**
- Modify: `client/src/api.ts`

- [ ] **Step 1: 添加围栏 API 函数**

在 `client/src/api.ts` 末尾添加：

```typescript
export async function getGeofenceConfig(): Promise<GeofenceConfig> {
  const response = await fetch('/api/geofences');
  if (!response.ok) {
    throw new Error(`Failed to load geofence config: ${response.statusText}`);
  }
  return response.json();
}

export async function saveGeofenceConfig(config: GeofenceConfig): Promise<GeofenceConfig> {
  const response = await fetch('/api/geofences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    throw new Error(`Failed to save geofence config: ${response.statusText}`);
  }
  return response.json();
}
```

- [ ] **Step 2: 确保顶部导入了 GeofenceConfig 类型**

在 `client/src/api.ts` 顶部确认导入：

```typescript
import type { GeofenceConfig } from '@shared/contracts';
```

- [ ] **Step 3: 验证编译**

```bash
npx vue-tsc --noEmit --skipLibCheck
```

预期输出：无类型错误

- [ ] **Step 4: 提交**

```bash
git add client/src/api.ts
git commit -m "feat: 添加围栏 API 调用函数"
```

---

## Task 5: 随机坐标生成工具函数

**Files:**
- Create: `client/src/lib/geofenceUtils.ts`
- Create: `tests/geofenceUtils.test.ts`

- [ ] **Step 1: 编写测试 - 三角形内随机点**

创建 `tests/geofenceUtils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getRandomPointInPolygon } from '../client/src/lib/geofenceUtils';
import type { GeofenceCoordinate } from '../shared/contracts';

describe('geofenceUtils', () => {
  it('should generate random point inside triangle', () => {
    const triangle: GeofenceCoordinate[] = [
      { longitude: 0, latitude: 0 },
      { longitude: 1, latitude: 0 },
      { longitude: 0.5, latitude: 1 },
    ];

    const point = getRandomPointInPolygon(triangle);
    
    expect(point.longitude).toBeGreaterThanOrEqual(0);
    expect(point.longitude).toBeLessThanOrEqual(1);
    expect(point.latitude).toBeGreaterThanOrEqual(0);
    expect(point.latitude).toBeLessThanOrEqual(1);
  });

  it('should generate random point inside rectangle', () => {
    const rectangle: GeofenceCoordinate[] = [
      { longitude: 116.397428, latitude: 39.90923 },
      { longitude: 116.398428, latitude: 39.90923 },
      { longitude: 116.398428, latitude: 39.91023 },
      { longitude: 116.397428, latitude: 39.91023 },
    ];

    const point = getRandomPointInPolygon(rectangle);
    
    expect(point.longitude).toBeGreaterThanOrEqual(116.397428);
    expect(point.longitude).toBeLessThanOrEqual(116.398428);
    expect(point.latitude).toBeGreaterThanOrEqual(39.90923);
    expect(point.latitude).toBeLessThanOrEqual(39.91023);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npm test -- geofenceUtils.test.ts
```

预期输出：FAIL - 模块不存在

- [ ] **Step 3: 实现随机坐标生成函数**

创建 `client/src/lib/geofenceUtils.ts`:

```typescript
import earcut from 'earcut';
import type { GeofenceCoordinate } from '@shared/contracts';

export function getRandomPointInPolygon(coordinates: GeofenceCoordinate[]): GeofenceCoordinate {
  if (coordinates.length < 3) {
    throw new Error('Polygon must have at least 3 vertices');
  }

  const flatCoords: number[] = [];
  for (const coord of coordinates) {
    flatCoords.push(coord.longitude, coord.latitude);
  }

  const triangles = earcut(flatCoords);
  
  const triangleAreas: number[] = [];
  let totalArea = 0;
  
  for (let i = 0; i < triangles.length; i += 3) {
    const i0 = triangles[i] * 2;
    const i1 = triangles[i + 1] * 2;
    const i2 = triangles[i + 2] * 2;
    
    const x0 = flatCoords[i0];
    const y0 = flatCoords[i0 + 1];
    const x1 = flatCoords[i1];
    const y1 = flatCoords[i1 + 1];
    const x2 = flatCoords[i2];
    const y2 = flatCoords[i2 + 1];
    
    const area = Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)) / 2;
    triangleAreas.push(area);
    totalArea += area;
  }

  let random = Math.random() * totalArea;
  let selectedTriangleIndex = 0;
  
  for (let i = 0; i < triangleAreas.length; i++) {
    random -= triangleAreas[i];
    if (random <= 0) {
      selectedTriangleIndex = i;
      break;
    }
  }

  const i0 = triangles[selectedTriangleIndex * 3] * 2;
  const i1 = triangles[selectedTriangleIndex * 3 + 1] * 2;
  const i2 = triangles[selectedTriangleIndex * 3 + 2] * 2;
  
  const x0 = flatCoords[i0];
  const y0 = flatCoords[i0 + 1];
  const x1 = flatCoords[i1];
  const y1 = flatCoords[i1 + 1];
  const x2 = flatCoords[i2];
  const y2 = flatCoords[i2 + 1];

  const r1 = Math.random();
  const r2 = Math.random();
  const sqrtR1 = Math.sqrt(r1);
  
  const longitude = (1 - sqrtR1) * x0 + sqrtR1 * (1 - r2) * x1 + sqrtR1 * r2 * x2;
  const latitude = (1 - sqrtR1) * y0 + sqrtR1 * (1 - r2) * y1 + sqrtR1 * r2 * y2;

  return { longitude, latitude };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npm test -- geofenceUtils.test.ts
```

预期输出：PASS (2 tests)

- [ ] **Step 5: 提交**

```bash
git add client/src/lib/geofenceUtils.ts tests/geofenceUtils.test.ts
git commit -m "feat: 实现围栏随机坐标生成"
```

---

## Task 6: App.vue 围栏状态管理

**Files:**
- Modify: `client/src/App.vue:1-100`

- [ ] **Step 1: 添加 geofenceModel 状态**

在 `App.vue` 的 `<script setup>` 中，`layoutModel` 之后添加：

```typescript
// Geofence block: owns围栏配置和编辑状态
const geofenceModel = reactive({
  busy: false,
  enabled: false,
  geofences: [] as Geofence[],
  editingGeofenceId: '',
  drawingMode: false,
});
```

在文件顶部的导入中添加：

```typescript
import type { Geofence, GeofenceConfig } from '@shared/contracts';
import { getGeofenceConfig, saveGeofenceConfig } from './api';
import { getRandomPointInPolygon } from './lib/geofenceUtils';
```

- [ ] **Step 2: 添加加载围栏配置函数**

在 `loadInitial` 函数中，`applyConfig` 之后添加：

```typescript
    const geofenceConfig = await getGeofenceConfig();
    applyGeofenceConfig(geofenceConfig);
```

在脚本中添加 `applyGeofenceConfig` 函数：

```typescript
function applyGeofenceConfig(config: GeofenceConfig): void {
  geofenceModel.enabled = config.enabled;
  geofenceModel.geofences = config.geofences;
}
```

- [ ] **Step 3: 添加保存围栏配置函数**

在脚本中添加：

```typescript
async function saveGeofences(config: GeofenceConfig): Promise<void> {
  geofenceModel.busy = true;
  try {
    const saved = await saveGeofenceConfig(config);
    applyGeofenceConfig(saved);
    ElMessage.success('围栏配置已保存');
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存失败';
    ElMessage.error(message);
  } finally {
    geofenceModel.busy = false;
  }
}
```

- [ ] **Step 4: 验证编译**

```bash
npx vue-tsc --noEmit --skipLibCheck
```

预期输出：无类型错误

- [ ] **Step 5: 提交**

```bash
git add client/src/App.vue
git commit -m "feat: App.vue 添加围栏状态管理"
```

---

## Task 7: 围栏编辑对话框组件

**Files:**
- Create: `client/src/components/GeofenceEditorDialog.vue`

- [ ] **Step 1: 创建组件骨架**

创建 `client/src/components/GeofenceEditorDialog.vue`:

```vue
<script setup lang="ts">
import { reactive, watch } from 'vue';
import type { Geofence } from '@shared/contracts';

const props = defineProps<{
  modelValue: boolean;
  geofence?: Geofence | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [data: { name: string; color: string }];
  editArea: [];
}>();

const formModel = reactive({
  name: '',
  color: '#FF5733',
});

watch(() => props.geofence, (geofence) => {
  if (geofence) {
    formModel.name = geofence.name;
    formModel.color = geofence.color;
  } else {
    formModel.name = '';
    formModel.color = '#FF5733';
  }
}, { immediate: true });

function handleClose(): void {
  emit('update:modelValue', false);
}

function handleConfirm(): void {
  if (!formModel.name.trim()) {
    return;
  }
  emit('confirm', {
    name: formModel.name.trim(),
    color: formModel.color,
  });
  handleClose();
}

function handleEditArea(): void {
  emit('editArea');
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="geofence ? '编辑围栏' : '新建围栏'"
    width="400px"
    @close="handleClose"
  >
    <el-form label-width="80px">
      <el-form-item label="围栏名称">
        <el-input
          v-model="formModel.name"
          placeholder="请输入围栏名称"
          maxlength="50"
          show-word-limit
        />
      </el-form-item>
      
      <el-form-item label="颜色">
        <el-color-picker v-model="formModel.color" />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button v-if="geofence" @click="handleEditArea">编辑区域</el-button>
        <el-button type="primary" @click="handleConfirm">
          {{ geofence ? '保存' : '下一步：绘制区域' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>
```

- [ ] **Step 2: 验证编译**

```bash
npx vue-tsc --noEmit --skipLibCheck
```

预期输出：无类型错误

- [ ] **Step 3: 提交**

```bash
git add client/src/components/GeofenceEditorDialog.vue
git commit -m "feat: 添加围栏编辑对话框组件"
```

---

## Task 8: 围栏管理标签页组件

**Files:**
- Create: `client/src/components/GeofenceTab.vue`

- [ ] **Step 1: 创建组件（第一部分 - script）**

创建 `client/src/components/GeofenceTab.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import { Delete, Edit, Location } from '@element-plus/icons-vue';
import type { Geofence, GeofenceConfig } from '@shared/contracts';
import GeofenceEditorDialog from './GeofenceEditorDialog.vue';

const props = defineProps<{
  enabled: boolean;
  geofences: Geofence[];
  busy: boolean;
}>();

const emit = defineEmits<{
  save: [config: GeofenceConfig];
  create: [data: { name: string; color: string }];
  update: [id: string, data: { name: string; color: string }];
  delete: [id: string];
  view: [geofence: Geofence];
  editArea: [geofence: Geofence];
}>();

const editorDialogVisible = ref(false);
const editingGeofence = ref<Geofence | null>(null);

function handleEnabledChange(value: boolean): void {
  emit('save', {
    enabled: value,
    geofences: props.geofences,
  });
}

function handleCreateClick(): void {
  editingGeofence.value = null;
  editorDialogVisible.value = true;
}

function handleEditClick(geofence: Geofence): void {
  editingGeofence.value = geofence;
  editorDialogVisible.value = true;
}

async function handleDeleteClick(geofence: Geofence): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除围栏"${geofence.name}"吗？`, '确认删除', {
      type: 'warning',
    });
    emit('delete', geofence.id);
  } catch {
    // User cancelled
  }
}

function handleViewClick(geofence: Geofence): void {
  emit('view', geofence);
}

function handleEditorConfirm(data: { name: string; color: string }): void {
  if (editingGeofence.value) {
    emit('update', editingGeofence.value.id, data);
  } else {
    emit('create', data);
  }
}

function handleEditArea(): void {
  if (editingGeofence.value) {
    emit('editArea', editingGeofence.value);
    editorDialogVisible.value = false;
  }
}
</script>
```

- [ ] **Step 2: 创建组件（第二部分 - template）**

继续在同一文件中添加：

```vue
<template>
  <div class="geofence-tab">
    <div class="geofence-header">
      <el-switch
        :model-value="enabled"
        :disabled="busy"
        active-text="在基本功能显示围栏列表"
        @change="handleEnabledChange"
      />
    </div>

    <div class="geofence-actions">
      <el-button type="primary" :disabled="busy" @click="handleCreateClick">
        新建围栏
      </el-button>
    </div>

    <div class="geofence-list">
      <el-empty v-if="!geofences.length" description="暂无围栏" />
      
      <el-card
        v-for="geofence in geofences"
        :key="geofence.id"
        class="geofence-card"
        shadow="hover"
        @click="handleViewClick(geofence)"
      >
        <div class="geofence-card-content">
          <div class="geofence-info">
            <div
              class="geofence-color"
              :style="{ backgroundColor: geofence.color }"
            />
            <span class="geofence-name">{{ geofence.name }}</span>
          </div>
          
          <div class="geofence-actions-row">
            <el-button
              :icon="Location"
              size="small"
              @click.stop="handleViewClick(geofence)"
            >
              查看
            </el-button>
            <el-button
              :icon="Edit"
              size="small"
              @click.stop="handleEditClick(geofence)"
            >
              编辑
            </el-button>
            <el-button
              :icon="Delete"
              size="small"
              type="danger"
              @click.stop="handleDeleteClick(geofence)"
            >
              删除
            </el-button>
          </div>
        </div>
      </el-card>
    </div>

    <GeofenceEditorDialog
      v-model="editorDialogVisible"
      :geofence="editingGeofence"
      @confirm="handleEditorConfirm"
      @edit-area="handleEditArea"
    />
  </div>
</template>
```

- [ ] **Step 3: 创建组件（第三部分 - style）**

继续在同一文件中添加：

```vue
<style scoped lang="scss">
.geofence-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  gap: 16px;
}

.geofence-header {
  display: flex;
  align-items: center;
}

.geofence-actions {
  display: flex;
  gap: 8px;
}

.geofence-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.geofence-card {
  cursor: pointer;
  
  &:hover {
    border-color: var(--el-color-primary);
  }
}

.geofence-card-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.geofence-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.geofence-color {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid var(--el-border-color);
}

.geofence-name {
  flex: 1;
  font-weight: 500;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.geofence-actions-row {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
```

- [ ] **Step 4: 验证编译**

```bash
npx vue-tsc --noEmit --skipLibCheck
```

预期输出：无类型错误

- [ ] **Step 5: 提交**

```bash
git add client/src/components/GeofenceTab.vue
git commit -m "feat: 添加围栏管理标签页组件"
```

---

## Task 9: LeftPanel 集成围栏标签页

**Files:**
- Modify: `client/src/components/LeftPanel.vue`

- [ ] **Step 1: 导入 GeofenceTab 组件**

在 `LeftPanel.vue` 的 `<script setup>` 中添加导入：

```typescript
import GeofenceTab from './GeofenceTab.vue';
import type { Geofence, GeofenceConfig } from '@shared/contracts';
```

- [ ] **Step 2: 添加 props 和 emits**

扩展 `props` 定义，在 `settingsBusy` 之后添加：

```typescript
  // Geofence props
  geofenceEnabled: boolean;
  geofences: Geofence[];
  geofenceBusy: boolean;
```

扩展 `emit` 定义，在 `saveSettings` 之后添加：

```typescript
  // Geofence events
  saveGeofences: [config: GeofenceConfig];
  createGeofence: [data: { name: string; color: string }];
  updateGeofence: [id: string, data: { name: string; color: string }];
  deleteGeofence: [id: string];
  viewGeofence: [geofence: Geofence];
  editGeofenceArea: [geofence: Geofence];
```

- [ ] **Step 3: 添加围栏标签页**

在 `<template>` 中，`<el-tab-pane label="用法指南">` 之后添加：

```vue
      <el-tab-pane label="电子围栏">
        <GeofenceTab
          :enabled="geofenceEnabled"
          :geofences="geofences"
          :busy="geofenceBusy"
          @save="emit('saveGeofences', $event)"
          @create="emit('createGeofence', $event)"
          @update="emit('updateGeofence', $event.id, $event.data)"
          @delete="emit('deleteGeofence', $event)"
          @view="emit('viewGeofence', $event)"
          @edit-area="emit('editGeofenceArea', $event)"
        />
      </el-tab-pane>
```

- [ ] **Step 4: 验证编译**

```bash
npx vue-tsc --noEmit --skipLibCheck
```

预期输出：无类型错误

- [ ] **Step 5: 提交**

```bash
git add client/src/components/LeftPanel.vue
git commit -m "feat: LeftPanel 集成围栏标签页"
```

---

## Task 10: App.vue 围栏业务逻辑（创建、更新、删除）

**Files:**
- Modify: `client/src/App.vue`

- [ ] **Step 1: 添加围栏 CRUD 函数**

在 `App.vue` 的脚本中添加以下函数（在 `saveGeofences` 之后）：

```typescript
function handleCreateGeofence(data: { name: string; color: string }): void {
  const newGeofence: Geofence = {
    id: crypto.randomUUID(),
    name: data.name,
    color: data.color,
    coordinates: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  geofenceModel.editingGeofenceId = newGeofence.id;
  geofenceModel.drawingMode = true;
  geofenceModel.geofences.push(newGeofence);
  
  ElMessage.info('请在地图上点击绘制围栏区域');
}

function handleUpdateGeofence(id: string, data: { name: string; color: string }): void {
  const index = geofenceModel.geofences.findIndex(g => g.id === id);
  if (index === -1) return;
  
  geofenceModel.geofences[index] = {
    ...geofenceModel.geofences[index],
    name: data.name,
    color: data.color,
    updatedAt: new Date().toISOString(),
  };
  
  void saveGeofences({
    enabled: geofenceModel.enabled,
    geofences: geofenceModel.geofences,
  });
}

async function handleDeleteGeofence(id: string): Promise<void> {
  geofenceModel.geofences = geofenceModel.geofences.filter(g => g.id !== id);
  await saveGeofences({
    enabled: geofenceModel.enabled,
    geofences: geofenceModel.geofences,
  });
}

function handleViewGeofence(geofence: Geofence): void {
  geofenceModel.editingGeofenceId = geofence.id;
  geofenceModel.drawingMode = false;
  // 地图组件会根据 editingGeofenceId 自动显示和缩放
}

function handleEditGeofenceArea(geofence: Geofence): void {
  geofenceModel.editingGeofenceId = geofence.id;
  geofenceModel.drawingMode = true;
  ElMessage.info('请在地图上编辑围栏区域');
}
```

- [ ] **Step 2: 在模板中传递围栏 props 到 LeftPanel**

在 `<template>` 的 `<LeftPanel>` 组件中，添加围栏相关 props（在 `:settings-busy` 之后）：

```vue
          :geofence-enabled="geofenceModel.enabled"
          :geofences="geofenceModel.geofences"
          :geofence-busy="geofenceModel.busy"
          @save-geofences="saveGeofences"
          @create-geofence="handleCreateGeofence"
          @update-geofence="handleUpdateGeofence"
          @delete-geofence="handleDeleteGeofence"
          @view-geofence="handleViewGeofence"
          @edit-geofence-area="handleEditGeofenceArea"
```

- [ ] **Step 3: 验证编译**

```bash
npx vue-tsc --noEmit --skipLibCheck
```

预期输出：无类型错误

- [ ] **Step 4: 提交**

```bash
git add client/src/App.vue
git commit -m "feat: App.vue 添加围栏CRUD业务逻辑"
```

---

## Task 11: 高德地图围栏绘制和编辑（第一部分 - AmapPanel 扩展）

**Files:**
- Modify: `client/src/components/AmapPanel.vue`

- [ ] **Step 1: 扩展 props 定义**

在 `AmapPanel.vue` 的 props 中添加围栏相关属性（在 `selectedPath` 之后）：

```typescript
    geofences: Geofence[];
    editingGeofenceId: string;
    drawingMode: boolean;
```

在顶部导入中添加：

```typescript
import type { Geofence } from '@shared/contracts';
import { wgs84ToGcj02, gcj02ToWgs84 } from '@shared/gps';
```

- [ ] **Step 2: 扩展 emit 定义**

在 emit 定义中添加（在 `error` 之后）：

```typescript
  geofenceDrawn: [id: string, coordinates: Array<{ longitude: number; latitude: number }>];
  geofenceEdited: [id: string, coordinates: Array<{ longitude: number; latitude: number }>];
```

- [ ] **Step 3: 添加围栏状态变量**

在脚本中，`markerDragState` 之后添加：

```typescript
let geofencePolygons: Map<string, any> = new Map();
let polygonEditor: any = null;
let currentEditingPolygon: any = null;
```

- [ ] **Step 4: 添加围栏渲染函数**

在脚本中添加以下函数（在 `ensureMap` 之后）：

```typescript
function renderGeofences(): void {
  if (!map) return;
  
  clearGeofencePolygons();
  
  for (const geofence of props.geofences) {
    if (geofence.coordinates.length < 3) continue;
    
    const gcj02Path = geofence.coordinates.map(coord => {
      const gcj = wgs84ToGcj02(coord.longitude, coord.latitude);
      return [gcj.lng, gcj.lat];
    });
    
    const polygon = new (window as any).AMap.Polygon({
      path: gcj02Path,
      fillColor: geofence.color,
      fillOpacity: 0.3,
      strokeColor: geofence.color,
      strokeWeight: 2,
      strokeOpacity: 0.8,
      bubble: true,
    });
    
    polygon.setMap(map);
    geofencePolygons.set(geofence.id, polygon);
    
    polygon.on('click', () => {
      if (!props.drawingMode && props.editingGeofenceId !== geofence.id) {
        fitGeofenceBounds(geofence);
      }
    });
  }
}

function clearGeofencePolygons(): void {
  geofencePolygons.forEach(polygon => {
    polygon.setMap(null);
  });
  geofencePolygons.clear();
}

function fitGeofenceBounds(geofence: Geofence): void {
  if (!map || geofence.coordinates.length === 0) return;
  
  const gcj02Bounds = geofence.coordinates.map(coord => {
    const gcj = wgs84ToGcj02(coord.longitude, coord.latitude);
    return [gcj.lng, gcj.lat];
  });
  
  map.setFitView([geofencePolygons.get(geofence.id)]);
}
```

- [ ] **Step 5: 验证编译**

```bash
npx vue-tsc --noEmit --skipLibCheck
```

预期输出：无类型错误

- [ ] **Step 6: 提交**

```bash
git add client/src/components/AmapPanel.vue
git commit -m "feat: AmapPanel 添加围栏渲染基础"
```

---

## Task 12: 高德地图围栏绘制和编辑（第二部分 - 绘制和编辑逻辑）

**Files:**
- Modify: `client/src/components/AmapPanel.vue`

- [ ] **Step 1: 添加绘制和编辑模式处理函数**

在 `AmapPanel.vue` 脚本中添加：

```typescript
function startDrawingGeofence(geofenceId: string): void {
  if (!map) return;
  
  const AMap = (window as any).AMap;
  
  if (!polygonEditor) {
    polygonEditor = new AMap.PolygonEditor(map);
    
    polygonEditor.on('end', (event: any) => {
      const path = event.target.getPath();
      if (path.length < 3) {
        ElMessage.error('多边形至少需要3个顶点');
        return;
      }
      
      const wgs84Coords = path.map((lngLat: any) => {
        const wgs = gcj02ToWgs84(lngLat.lng, lngLat.lat);
        return { longitude: wgs.lng, latitude: wgs.lat };
      });
      
      emit('geofenceDrawn', geofenceId, wgs84Coords);
      stopDrawingOrEditing();
    });
  }
  
  const polygon = new AMap.Polygon({
    fillColor: props.geofences.find(g => g.id === geofenceId)?.color || '#FF5733',
    fillOpacity: 0.3,
    strokeColor: props.geofences.find(g => g.id === geofenceId)?.color || '#FF5733',
    strokeWeight: 2,
  });
  
  currentEditingPolygon = polygon;
  polygonEditor.setTarget(polygon);
  polygonEditor.open();
}

function startEditingGeofence(geofenceId: string): void {
  if (!map) return;
  
  const geofence = props.geofences.find(g => g.id === geofenceId);
  if (!geofence || geofence.coordinates.length < 3) return;
  
  const AMap = (window as any).AMap;
  
  const gcj02Path = geofence.coordinates.map(coord => {
    const gcj = wgs84ToGcj02(coord.longitude, coord.latitude);
    return new AMap.LngLat(gcj.lng, gcj.lat);
  });
  
  if (!polygonEditor) {
    polygonEditor = new AMap.PolygonEditor(map);
    
    polygonEditor.on('end', () => {
      const path = polygonEditor.getTarget().getPath();
      if (path.length < 3) {
        ElMessage.error('多边形至少需要3个顶点');
        return;
      }
      
      const wgs84Coords = path.map((lngLat: any) => {
        const wgs = gcj02ToWgs84(lngLat.lng, lngLat.lat);
        return { longitude: wgs.lng, latitude: wgs.lat };
      });
      
      emit('geofenceEdited', geofenceId, wgs84Coords);
      stopDrawingOrEditing();
    });
  }
  
  const existingPolygon = geofencePolygons.get(geofenceId);
  if (existingPolygon) {
    existingPolygon.setMap(null);
  }
  
  const polygon = new AMap.Polygon({
    path: gcj02Path,
    fillColor: geofence.color,
    fillOpacity: 0.3,
    strokeColor: geofence.color,
    strokeWeight: 2,
  });
  
  currentEditingPolygon = polygon;
  polygonEditor.setTarget(polygon);
  polygonEditor.open();
}

function stopDrawingOrEditing(): void {
  if (polygonEditor) {
    polygonEditor.close();
  }
  
  if (currentEditingPolygon) {
    currentEditingPolygon.setMap(null);
    currentEditingPolygon = null;
  }
  
  renderGeofences();
}
```

- [ ] **Step 2: 添加 watch 监听围栏状态变化**

在脚本中添加：

```typescript
watch(() => props.geofences, () => {
  renderGeofences();
}, { deep: true });

watch(() => [props.editingGeofenceId, props.drawingMode] as const, ([id, drawing]) => {
  if (!id) {
    stopDrawingOrEditing();
    return;
  }
  
  const geofence = props.geofences.find(g => g.id === id);
  if (!geofence) return;
  
  if (drawing) {
    if (geofence.coordinates.length === 0) {
      startDrawingGeofence(id);
    } else {
      startEditingGeofence(id);
    }
  } else {
    stopDrawingOrEditing();
    fitGeofenceBounds(geofence);
  }
});
```

- [ ] **Step 3: 在 ensureMap 成功后渲染围栏**

在 `ensureMap` 函数中，地图创建成功后（`map.on('complete')` 内），添加：

```typescript
      renderGeofences();
```

- [ ] **Step 4: 验证编译**

```bash
npx vue-tsc --noEmit --skipLibCheck
```

预期输出：无类型错误

- [ ] **Step 5: 提交**

```bash
git add client/src/components/AmapPanel.vue
git commit -m "feat: AmapPanel 实现围栏绘制和编辑"
```

---

## Task 13: MapPanel 和 App.vue 围栏事件传递

**Files:**
- Modify: `client/src/components/MapPanel.vue`
- Modify: `client/src/App.vue`

- [ ] **Step 1: 扩展 MapPanel props**

在 `MapPanel.vue` 的 props 中添加（在 `selectedPath` 之后）：

```typescript
    geofences: Geofence[];
    editingGeofenceId: string;
    drawingMode: boolean;
```

在顶部导入中添加：

```typescript
import type { Geofence, GeofenceCoordinate } from '@shared/contracts';
```

- [ ] **Step 2: 扩展 MapPanel emit**

在 emit 定义中添加（在 `error` 之后）：

```typescript
  geofenceDrawn: [id: string, coordinates: GeofenceCoordinate[]];
  geofenceEdited: [id: string, coordinates: GeofenceCoordinate[]];
```

- [ ] **Step 3: 传递围栏 props 到 AmapPanel 和 MapboxPanel**

在 `<template>` 中，更新 `<component>` 的 props（在 `:selected-path` 之后）：

```vue
    :geofences="geofences"
    :editing-geofence-id="editingGeofenceId"
    :drawing-mode="drawingMode"
    @geofence-drawn="$emit('geofenceDrawn', $event)"
    @geofence-edited="$emit('geofenceEdited', $event)"
```

- [ ] **Step 4: App.vue 处理围栏绘制和编辑事件**

在 `App.vue` 脚本中添加处理函数：

```typescript
function handleGeofenceDrawn(id: string, coordinates: GeofenceCoordinate[]): void {
  const index = geofenceModel.geofences.findIndex(g => g.id === id);
  if (index === -1) return;
  
  geofenceModel.geofences[index].coordinates = coordinates;
  geofenceModel.geofences[index].updatedAt = new Date().toISOString();
  
  geofenceModel.editingGeofenceId = '';
  geofenceModel.drawingMode = false;
  
  void saveGeofences({
    enabled: geofenceModel.enabled,
    geofences: geofenceModel.geofences,
  });
  
  ElMessage.success('围栏绘制完成');
}

function handleGeofenceEdited(id: string, coordinates: GeofenceCoordinate[]): void {
  const index = geofenceModel.geofences.findIndex(g => g.id === id);
  if (index === -1) return;
  
  geofenceModel.geofences[index].coordinates = coordinates;
  geofenceModel.geofences[index].updatedAt = new Date().toISOString();
  
  geofenceModel.editingGeofenceId = '';
  geofenceModel.drawingMode = false;
  
  void saveGeofences({
    enabled: geofenceModel.enabled,
    geofences: geofenceModel.geofences,
  });
  
  ElMessage.success('围栏编辑完成');
}
```

- [ ] **Step 5: App.vue 模板传递围栏 props 到 MapPanel**

在 `<template>` 的 `<MapPanel>` 中，添加围栏 props（在 `:selected-path` 之后）：

```vue
          :geofences="geofenceModel.geofences"
          :editing-geofence-id="geofenceModel.editingGeofenceId"
          :drawing-mode="geofenceModel.drawingMode"
          @geofence-drawn="handleGeofenceDrawn"
          @geofence-edited="handleGeofenceEdited"
```

- [ ] **Step 6: 验证编译**

```bash
npx vue-tsc --noEmit --skipLibCheck
```

预期输出：无类型错误

- [ ] **Step 7: 提交**

```bash
git add client/src/components/MapPanel.vue client/src/App.vue
git commit -m "feat: 完成高德围栏绘制编辑事件传递"
```

---

## Task 14: 悬浮围栏列表组件

**Files:**
- Create: `client/src/components/GeofenceFloatingList.vue`

- [ ] **Step 1: 创建组件（script + template）**

创建 `client/src/components/GeofenceFloatingList.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue';
import type { Geofence } from '@shared/contracts';

const props = defineProps<{
  geofences: Geofence[];
}>();

const emit = defineEmits<{
  drop: [geofence: Geofence, mediaPath: string];
}>();

const hoveredId = ref('');

function handleDragOver(event: DragEvent, geofence: Geofence): void {
  event.preventDefault();
  hoveredId.value = geofence.id;
}

function handleDragLeave(): void {
  hoveredId.value = '';
}

function handleDrop(event: DragEvent, geofence: Geofence): void {
  event.preventDefault();
  const mediaPath = event.dataTransfer?.getData('text/plain');
  if (mediaPath) {
    emit('drop', geofence, mediaPath);
  }
  hoveredId.value = '';
}
</script>

<template>
  <div v-if="geofences.length" class="geofence-floating-list">
    <div class="floating-header">电子围栏</div>
    
    <div class="floating-content">
      <div
        v-for="geofence in geofences"
        :key="geofence.id"
        class="floating-item"
        :class="{ 'is-hovered': hoveredId === geofence.id }"
        @dragover="handleDragOver($event, geofence)"
        @dragleave="handleDragLeave"
        @drop="handleDrop($event, geofence)"
      >
        <div
          class="item-color"
          :style="{ backgroundColor: geofence.color }"
        />
        <span class="item-name">{{ geofence.name }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.geofence-floating-list {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 200px;
  max-height: 400px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 100;
}

.floating-header {
  padding: 12px 16px;
  font-weight: 600;
  font-size: 14px;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--el-color-primary-light-9);
}

.floating-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.floating-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 4px;

  &:hover {
    background: var(--el-color-primary-light-9);
  }

  &.is-hovered {
    background: var(--el-color-primary-light-8);
    border: 2px dashed var(--el-color-primary);
  }
}

.item-color {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  flex-shrink: 0;
}

.item-name {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
```

- [ ] **Step 2: 验证编译**

```bash
npx vue-tsc --noEmit --skipLibCheck
```

预期输出：无类型错误

- [ ] **Step 3: 提交**

```bash
git add client/src/components/GeofenceFloatingList.vue
git commit -m "feat: 添加悬浮围栏列表组件"
```

---

## Task 15: App.vue 集成悬浮列表和拖拽定位

**Files:**
- Modify: `client/src/App.vue`

- [ ] **Step 1: 导入 GeofenceFloatingList 组件**

在 `App.vue` 的 `<script setup>` 顶部添加：

```typescript
import GeofenceFloatingList from './components/GeofenceFloatingList.vue';
```

- [ ] **Step 2: 添加拖拽到围栏处理函数**

在脚本中添加：

```typescript
async function handleDropToGeofence(geofence: Geofence, mediaPath: string): Promise<void> {
  try {
    if (geofence.coordinates.length < 3) {
      ElMessage.warning('该围栏还未绘制区域');
      return;
    }
    
    const randomCoord = getRandomPointInPolygon(geofence.coordinates);
    
    await placeMedia({
      path: mediaPath,
      longitude: randomCoord.longitude,
      latitude: randomCoord.latitude,
    });
    
    selectionModel.selectedPath = mediaPath;
    
    ElMessage.success(`已设置到围栏"${geofence.name}"内的随机位置`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '设置失败';
    ElMessage.error(message);
  }
}
```

- [ ] **Step 3: 在模板中添加悬浮列表**

在 `<template>` 中，`<MapPanel>` 内部添加悬浮列表（在 `class="map-layer"` 的 MapPanel 内部）：

```vue
        <GeofenceFloatingList
          v-if="geofenceModel.enabled"
          :geofences="geofenceModel.geofences"
          @drop="handleDropToGeofence"
        />
```

注意：悬浮列表应该放在 `<MapPanel class="map-layer">` 标签内部，成为地图的子元素。

- [ ] **Step 4: 验证编译**

```bash
npx vue-tsc --noEmit --skipLibCheck
```

预期输出：无类型错误

- [ ] **Step 5: 提交**

```bash
git add client/src/App.vue
git commit -m "feat: 集成悬浮列表和拖拽定位功能"
```

---

## Task 16: Mapbox 围栏支持（可选，基础实现）

**Files:**
- Modify: `client/src/components/MapboxPanel.vue`

- [ ] **Step 1: 安装并导入 mapbox-gl-draw**

在 `MapboxPanel.vue` 顶部添加导入：

```typescript
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import type { Geofence, GeofenceCoordinate } from '@shared/contracts';
```

- [ ] **Step 2: 扩展 props 和 emit（与 AmapPanel 一致）**

在 props 中添加：

```typescript
    geofences: Geofence[];
    editingGeofenceId: string;
    drawingMode: boolean;
```

在 emit 中添加：

```typescript
  geofenceDrawn: [id: string, coordinates: GeofenceCoordinate[]];
  geofenceEdited: [id: string, coordinates: GeofenceCoordinate[]];
```

- [ ] **Step 3: 添加 MapboxDraw 实例变量**

在脚本中声明：

```typescript
let draw: MapboxDraw | null = null;
```

- [ ] **Step 4: 初始化 MapboxDraw**

在地图初始化成功后（`map.on('load')` 内），添加：

```typescript
      draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {},
      });
      
      map.addControl(draw as any);
```

- [ ] **Step 5: 添加围栏渲染逻辑（简化版）**

在脚本中添加：

```typescript
function renderGeofences(): void {
  if (!map || !draw) return;
  
  draw.deleteAll();
  
  for (const geofence of props.geofences) {
    if (geofence.coordinates.length < 3) continue;
    
    const coordinates = geofence.coordinates.map(c => [c.longitude, c.latitude]);
    coordinates.push(coordinates[0]); // 闭合多边形
    
    draw.add({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [coordinates],
      },
      properties: {
        geofenceId: geofence.id,
      },
    });
  }
}

watch(() => props.geofences, () => {
  renderGeofences();
}, { deep: true });
```

注意：Mapbox 实现为简化版本，仅支持基础显示。完整的编辑功能需要更复杂的实现，可在后续迭代中完善。

- [ ] **Step 6: 验证编译**

```bash
npx vue-tsc --noEmit --skipLibCheck
```

预期输出：无类型错误

- [ ] **Step 7: 提交**

```bash
git add client/src/components/MapboxPanel.vue
git commit -m "feat: Mapbox 添加围栏基础显示（简化版）"
```

---

## Task 17: 端到端测试和验证

**Files:**
- No new files

- [ ] **Step 1: 启动开发服务器**

```bash
npm run dev
```

打开浏览器访问 `http://127.0.0.1:6754`

- [ ] **Step 2: 测试围栏管理功能**

1. 切换到"电子围栏"标签页
2. 点击"新建围栏"按钮
3. 输入名称"测试围栏"，选择颜色
4. 点击"下一步：绘制区域"
5. 在地图上点击至少3个点形成多边形
6. 双击完成绘制
7. 验证围栏出现在列表中

- [ ] **Step 3: 测试围栏编辑**

1. 点击刚创建的围栏卡片的"编辑"按钮
2. 修改名称为"测试围栏-修改"
3. 点击"保存"
4. 验证列表中名称已更新

- [ ] **Step 4: 测试围栏区域编辑**

1. 点击围栏卡片的"编辑"按钮
2. 点击"编辑区域"按钮
3. 在地图上拖动顶点调整形状
4. 点击完成
5. 验证围栏区域已更新

- [ ] **Step 5: 测试围栏查看和缩放**

1. 点击围栏卡片（非按钮区域）
2. 验证地图自动缩放并居中显示该围栏

- [ ] **Step 6: 测试悬浮列表和拖拽定位**

1. 在"电子围栏"标签页，打开"在基本功能显示围栏列表"开关
2. 切换到"基本功能"标签页
3. 验证地图左侧显示悬浮围栏列表
4. 从媒体列表拖拽一张照片到悬浮列表的围栏项上
5. 验证照片被设置到围栏内随机位置
6. 验证地图跳转到该位置并显示标记
7. 验证提示消息显示"已设置到围栏 XXX 内的随机位置"

- [ ] **Step 7: 测试围栏删除**

1. 切换回"电子围栏"标签页
2. 点击围栏卡片的"删除"按钮
3. 确认删除
4. 验证围栏从列表中消失

- [ ] **Step 8: 测试数据持久化**

1. 创建一个新围栏
2. 刷新浏览器页面
3. 验证围栏数据仍然存在
4. 检查 `data/geofences.json` 文件是否正确保存

- [ ] **Step 9: 测试地图切换（如果配置了 Mapbox）**

1. 切换到"设置"标签页
2. 切换地图提供商为 Mapbox
3. 返回"电子围栏"标签页
4. 验证围栏在 Mapbox 地图上正确显示

---

## Task 18: 样式优化和细节调整

**Files:**
- Modify: `client/src/components/GeofenceTab.vue`
- Modify: `client/src/components/GeofenceFloatingList.vue`

- [ ] **Step 1: 优化围栏卡片响应式布局**

在 `GeofenceTab.vue` 的样式中，调整 `.geofence-actions-row` 在小屏幕上的显示：

```scss
.geofence-actions-row {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}
```

- [ ] **Step 2: 添加空状态提示**

在 `GeofenceTab.vue` 的 `<el-empty>` 组件中，添加更友好的提示：

```vue
      <el-empty v-if="!geofences.length" description="暂无围栏，点击"新建围栏"开始创建" />
```

- [ ] **Step 3: 优化悬浮列表滚动条样式**

在 `GeofenceFloatingList.vue` 的样式中，添加滚动条美化：

```scss
.floating-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }
}
```

- [ ] **Step 4: 验证编译和视觉效果**

```bash
npx vue-tsc --noEmit --skipLibCheck
npm run dev
```

在浏览器中检查样式调整效果。

- [ ] **Step 5: 提交**

```bash
git add client/src/components/GeofenceTab.vue client/src/components/GeofenceFloatingList.vue
git commit -m "style: 优化围栏组件样式和用户体验"
```

---

## Task 19: 文档更新

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: 更新 README.md**

在 `README.md` 的"功能"部分，添加电子围栏功能描述：

```markdown
- 电子围栏：支持多边形围栏创建、编辑、删除，拖拽照片到围栏快速设置随机坐标；开关控制悬浮列表显示。
```

- [ ] **Step 2: 更新 AGENTS.md**

在 `AGENTS.md` 的"稳定版经验"部分末尾，添加电子围栏相关经验：

```markdown
### 电子围栏坐标转换

- 触发信号：围栏在地图上位置偏移，或拖拽照片到围栏后坐标不准确。
- 根因 / 约束：高德地图使用 GCJ-02 坐标系显示，但围栏顶点和照片坐标统一存储为 WGS-84；如果转换方向错误或遗漏转换，会导致围栏显示偏移约几百米。
- 正确做法：围栏顶点存储统一使用 WGS-84；高德地图绘制前使用 `wgs84ToGcj02` 转换显示坐标，绘制完成后使用 `gcj02ToWgs84` 转换回存储坐标；Mapbox 直接使用 WGS-84 无需转换；随机坐标生成基于 WGS-84 顶点，生成结果直接用于写入 XMP。
- 验证方式：运行 `npm test -- geofenceUtils.test.ts` 确认随机坐标生成正确；手动在高德地图创建围栏，切换到 Mapbox 验证位置一致；拖拽照片到围栏后，在地图标记上验证坐标与围栏区域吻合。
- 适用范围：`AmapPanel.vue` 围栏绘制编辑、`geofenceUtils.ts` 随机坐标生成、`App.vue` 拖拽定位逻辑。
```

- [ ] **Step 3: 提交**

```bash
git add README.md AGENTS.md
git commit -m "docs: 更新围栏功能文档"
```

---

## Task 20: 最终构建验证

**Files:**
- No new files

- [ ] **Step 1: 运行所有测试**

```bash
npm test
```

预期输出：所有测试通过

- [ ] **Step 2: TypeScript 类型检查**

```bash
npx vue-tsc --noEmit --skipLibCheck
```

预期输出：无类型错误

- [ ] **Step 3: 构建生产版本**

```bash
npm run build
```

预期输出：构建成功，无错误和警告

- [ ] **Step 4: 验证生产构建**

启动生产服务器：

```bash
node dist/server/index.cjs
```

访问 `http://127.0.0.1:6755/` 测试围栏功能是否正常。

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "feat: 电子围栏功能完成"
git push
```

---

## 自审清单

完成所有任务后，检查以下项目：

### 功能完整性
- [ ] 围栏列表增删改查功能正常
- [ ] 高德地图围栏绘制和编辑正常
- [ ] 围栏数据持久化到 data/geofences.json
- [ ] 悬浮列表在基本功能页面正确显示
- [ ] 拖拽照片到围栏列表生成随机坐标
- [ ] 地图自动跳转到随机坐标位置
- [ ] 坐标系转换正确（WGS-84 存储，GCJ-02 显示）

### 代码质量
- [ ] 无 TypeScript 类型错误
- [ ] 所有测试通过
- [ ] 代码符合项目现有风格
- [ ] 注释清晰，变量命名语义化

### 用户体验
- [ ] 操作流程顺畅，无明显卡顿
- [ ] 错误提示友好明确
- [ ] 成功提示及时反馈
- [ ] UI 布局合理，样式统一

### 边界情况
- [ ] 围栏数量为 0 时正常显示
- [ ] 围栏名称过长时正确截断
- [ ] 围栏顶点少于 3 个时正确提示
- [ ] 随机坐标生成失败时有降级处理

---

## 执行选项

实施计划已完成并保存到 `docs/superpowers/plans/2026-06-14-geofence-implementation.md`。

**两种执行方式：**

1. **Subagent-Driven（推荐）** - 我派发新的子代理执行每个任务，任务间审查，快速迭代

2. **Inline Execution** - 在当前会话中使用 executing-plans 技能批量执行，设置检查点审查

**您选择哪种执行方式？**
