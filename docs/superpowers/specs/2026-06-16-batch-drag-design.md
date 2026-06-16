# 媒体卡片批量拖拽功能设计文档

**日期**：2026-06-16  
**版本**：1.0  
**作者**：风宝 (Claude Code)

---

## 1. 概述

### 1.1 背景

media-location 当前支持单个媒体拖拽到地图修改位置，但当需要将多个媒体移动到同一区域时，需要逐个拖拽，效率较低。

### 1.2 目标

实现媒体卡片批量拖拽功能，满足以下需求：

1. **批量选择**：通过复选框选择多个媒体
2. **批量拖拽**：拖拽任意选中媒体，所有选中项同时移动
3. **分散放置**：自动分散在目标点 10 米范围内，避免重叠
4. **便捷操作**：提供全选、清除等快捷功能

### 1.3 核心功能

- ✅ 批量操作模式开关（默认隐藏复选框）
- ✅ 媒体复选框选择
- ✅ 全选、清除选择功能
- ✅ 选中数量提示
- ✅ 批量拖拽到地图（显示数量徽章）
- ✅ 10 米范围内随机分布
- ✅ 拖拽完成后自动退出批量模式

---

## 2. 用户交互流程

### 2.1 基本流程

```
1. 用户点击"批量操作"按钮
   ↓
2. 所有媒体卡片左上角显示复选框
   ↓
3. 用户勾选需要移动的媒体（可使用全选）
   ↓
4. 拖拽任意一个选中的媒体到地图
   ↓
5. 拖拽光标显示 "📦 N" 数量徽章
   ↓
6. 在地图目标位置释放
   ↓
7. 所有选中媒体分散到目标点 10 米范围内
   ↓
8. 自动退出批量模式，清空选择
```

### 2.2 交互细节

**批量模式开关**：
- 点击"批量操作"按钮 → 进入批量模式，显示复选框
- 点击"退出批量"按钮 → 退出批量模式，隐藏复选框，清空选择

**媒体选择**：
- 点击复选框 → 切换选中状态
- 点击卡片本身 → 保持原有行为（选择媒体、地图定位）
- 不支持 Shift 连选（未来可扩展）

**批量操作**：
- 点击"全选" → 选中当前显示的所有媒体
- 点击"清除" → 取消所有勾选
- 显示"已选中 N 个"提示（有空间时）

**拖拽行为**：
- 单个拖拽（未选中）→ 保持原有单个拖拽逻辑
- 批量拖拽（选中多个）→ 拖拽时显示数量徽章，所有选中媒体移动

---

## 3. 架构设计

### 3.1 改动范围

**主要改动**：
- `client/src/components/MediaTable.vue`
  - 新增批量操作状态块 `batchOperationModel`
  - 新增批量操作 UI（按钮、操作栏、复选框）
  - 改造拖拽逻辑支持批量场景

**次要改动**：
- `client/src/App.vue`
  - 改造 `handlePlace` 支持批量更新
- `client/src/components/MapboxPanel.vue` / `AmapPanel.vue`
  - 接收批量拖拽数据并正确处理

### 3.2 层次结构

```
App.vue
  └─ MediaTable.vue
       ├─ batchOperationModel（新增状态块）
       │    ├─ enabled: boolean
       │    ├─ selectedPaths: Set<string>
       │    └─ dragElement: HTMLElement | null
       ├─ toolbar 区域
       │    ├─ 搜索框（现有）
       │    └─ 批量操作按钮（新增）
       ├─ 批量操作栏（新增，条件显示）
       │    ├─ 全选按钮
       │    ├─ 清除按钮
       │    └─ 已选中数量提示
       └─ 媒体卡片
            ├─ 复选框（新增，条件显示）
            └─ 缩略图（现有，拖拽起点）
```

### 3.3 状态设计

```typescript
// 批量操作状态块
const batchOperationModel = reactive({
  enabled: false,                      // 是否进入批量模式
  selectedPaths: new Set<string>(),    // 选中的媒体路径集合
  dragElement: null as HTMLElement | null, // 自定义拖拽元素
});

// 计算属性
const selectedCount = computed(() => batchOperationModel.selectedPaths.size);
const hasSelection = computed(() => selectedCount.value > 0);
```

**状态管理原则**：
- 使用 `Set` 存储选中路径，查找性能 O(1)
- 响应式状态集中在 `batchOperationModel`，避免分散
- 状态变化驱动 UI 更新

---

## 4. 核心功能设计

### 4.1 批量模式管理

**函数签名**：
```typescript
function toggleBatchMode(): void
function clearBatchSelection(): void
```

**行为**：
- `toggleBatchMode()`：切换批量模式，退出时自动清空选择
- `clearBatchSelection()`：清空选择但不退出批量模式

**触发时机**：
- 用户点击"批量操作"/"退出批量"按钮
- 切换目录时自动退出批量模式
- 批量拖拽完成后自动退出批量模式

### 4.2 媒体选择

**函数签名**：
```typescript
function toggleSelection(path: string, event: MouseEvent): void
function selectAllMedia(): void
function isSelected(path: string): boolean
```

**行为**：
- `toggleSelection()`：切换单个媒体选中状态，阻止事件冒泡
- `selectAllMedia()`：选中当前显示的所有媒体（不含固定区）
- `isSelected()`：检查媒体是否被选中，用于复选框绑定

**注意事项**：
- 全选只选中当前目录区的媒体，不选固定区
- 固定区的媒体也可以单独勾选参与批量操作
- 搜索过滤不影响选中状态

### 4.3 批量拖拽

**拖拽数据结构**：
```typescript
interface BatchDragData {
  type: 'batch';
  paths: string[];  // 选中的媒体路径列表
  count: number;    // 数量，用于显示
}
```

**拖拽流程**：

1. **dragstart 阶段**：
   - 检测当前拖拽的媒体是否在 `selectedPaths` 中
   - 是 → 批量拖拽模式
     - 创建自定义拖拽元素（显示 📦 N）
     - `dataTransfer.setData('application/json', JSON.stringify(batchDragData))`
   - 否 → 单个拖拽模式（保持现有逻辑）

2. **drop 阶段**：
   - 地图解析 `dataTransfer` 数据
   - 检测到 `type: 'batch'` → 批量处理
     - 计算 N 个随机位置（下节详述）
     - 遍历 `paths` 逐个调用 `emit('place', ...)`
   - 否则 → 单个处理（现有逻辑）

3. **dragend 阶段**：
   - 移除自定义拖拽元素
   - 清空选择并退出批量模式

**自定义拖拽元素**：
```html
<div class="batch-drag-ghost">
  📦 {{ count }}
</div>
```

### 4.4 随机位置算法

**目标**：在目标点为圆心、10 米为半径的圆内生成 N 个随机位置。

**算法步骤**：
```typescript
function generateRandomPositions(
  centerLng: number, 
  centerLat: number, 
  count: number
): Array<{ longitude: number; latitude: number }> {
  const positions = [];
  const radiusMeters = 10;
  
  for (let i = 0; i < count; i++) {
    // 随机角度（0 到 2π）
    const angle = Math.random() * 2 * Math.PI;
    
    // 随机半径（0 到 radiusMeters）
    // 使用 sqrt 保证均匀分布
    const radius = Math.sqrt(Math.random()) * radiusMeters;
    
    // 转换为经纬度偏移
    // 1 度纬度 ≈ 111,320 米
    // 1 度经度 ≈ 111,320 * cos(纬度) 米
    const latOffset = (radius * Math.cos(angle)) / 111320;
    const lngOffset = (radius * Math.sin(angle)) / (111320 * Math.cos(centerLat * Math.PI / 180));
    
    positions.push({
      longitude: centerLng + lngOffset,
      latitude: centerLat + latOffset,
    });
  }
  
  return positions;
}
```

**注意事项**：
- 使用 `sqrt(random())` 保证圆内均匀分布（否则中心密度过高）
- 经度偏移需要考虑纬度修正
- 不做碰撞检测，保持算法简单

---

## 5. UI 设计

### 5.1 布局结构

```
┌─────────────────────────────────────────────────────┐
│ [▼ 媒体] [已加载] [无经纬度] [固定]         ← header
├─────────────────────────────────────────────────────┤
│ [🔍 按文件名过滤] [批量操作]              ← toolbar
├─────────────────────────────────────────────────────┤
│ [全选] [清除] 已选中 3 个         ← 批量操作栏（条件显示）
├─────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐
│ │ ☑         │ │ ☐         │  ← 复选框（批量模式显示）
│ │ 缩略图    │ │ 缩略图    │
│ │ 文件名    │ │ 文件名    │
│ └──────────┘ └──────────┘
└─────────────────────────────────────────────────────┘
```

### 5.2 样式要点

**批量操作按钮**：
- 默认状态：default 类型
- 激活状态：primary 类型
- 文本："批量操作" / "退出批量"

**批量操作栏**：
- 背景色：浅灰色（与 toolbar 区分）
- 内边距：8px 12px
- 显示条件：`v-if="batchOperationModel.enabled"`

**复选框**：
- 位置：绝对定位于卡片左上角
- 背景：半透明白色（rgba(255, 255, 255, 0.9)）
- 圆角：4px
- z-index：高于缩略图

**选中卡片高亮**：
- 添加蓝色边框：`border: 2px solid #409eff`
- 阴影加强：`box-shadow: 0 4px 12px rgba(64, 158, 255, 0.3)`

**拖拽元素**：
- 样式：白色背景，圆角，阴影
- 内容：📦 图标 + 数量
- 字体：14px，加粗

---

## 6. 错误处理

### 6.1 批量更新失败

**场景**：批量更新时部分媒体失败（文件不存在、权限不足等）

**策略**：
- 统计成功/失败数量
- 成功 > 0 → 提示 "已更新 X/N 个媒体，Y 个失败"
- 全部失败 → 提示 "批量更新失败"，保持批量模式和选择状态

**实现**：
```typescript
async function handleBatchPlace(positions) {
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < paths.length; i++) {
    try {
      await handlePlace({ path: paths[i], ...positions[i] });
      successCount++;
    } catch (error) {
      failCount++;
    }
  }
  
  if (successCount > 0) {
    if (failCount > 0) {
      ElMessage.warning(`已更新 ${successCount}/${paths.length} 个媒体，${failCount} 个失败`);
    } else {
      ElMessage.success(`已更新 ${successCount} 个媒体`);
    }
    exitBatchModeAndClearSelection();
  } else {
    ElMessage.error('批量更新失败');
  }
}
```

### 6.2 边界情况

**未选中任何媒体时拖拽**：
- 按单个拖拽处理（现有逻辑）

**拖拽未选中的媒体**：
- 按单个拖拽处理（现有逻辑）

**批量模式下点击卡片**：
- 保持原有行为（选择媒体、地图定位）
- 不触发勾选

**切换目录**：
- 自动退出批量模式
- 清空选择

---

## 7. 兼容性考虑

### 7.1 与现有功能的交互

**固定媒体**：
- 固定区的媒体也可以参与批量操作
- 全选只选中当前目录区，不选固定区

**搜索过滤**：
- 搜索过滤不影响选中状态
- 被过滤隐藏的媒体仍保持选中，拖拽时会一起移动

**加载更多**：
- 加载更多后，新加载的媒体默认未选中
- 已选中的媒体保持选中状态

**聚合点**：
- 批量拖拽只在媒体列表中触发
- 不影响地图聚合点的拖拽逻辑

### 7.2 地图引擎兼容

**高德地图**：
- 接收批量拖拽数据，遍历调用 `handlePlace`

**Mapbox GL**：
- 接收批量拖拽数据，遍历调用 `handlePlace`

**实现策略**：
- 批量逻辑在 `MediaTable.vue` 处理
- 地图只接收标准的 `place` 事件
- 不需要改动地图组件的拖拽逻辑

---

## 8. 测试策略

### 8.1 单元测试

**测试文件**：`client/src/components/__tests__/MediaTable.batch.test.ts`

**测试用例**：
- ✅ 批量模式开关正确切换状态
- ✅ 复选框正确切换选中状态
- ✅ 全选正确选中所有当前目录媒体
- ✅ 清除正确清空所有选择
- ✅ 点击复选框阻止事件冒泡
- ✅ 切换目录自动退出批量模式
- ✅ 随机位置算法生成正确数量的位置
- ✅ 随机位置在 10 米范围内

### 8.2 集成测试

**测试场景**：
- ✅ 批量拖拽正确更新所有选中媒体的坐标
- ✅ 批量更新部分失败时正确提示
- ✅ 拖拽完成后自动退出批量模式
- ✅ 批量模式不影响单个拖拽

### 8.3 手动测试

**测试清单**：
- [ ] 批量操作按钮显示和隐藏复选框
- [ ] 复选框正确勾选和取消勾选
- [ ] 全选和清除按钮功能正常
- [ ] 拖拽时显示数量徽章
- [ ] 批量拖拽后媒体分散在 10 米范围内
- [ ] 拖拽完成后自动退出批量模式
- [ ] 固定区媒体可以参与批量操作
- [ ] 搜索过滤不影响批量操作
- [ ] 切换目录自动退出批量模式

---

## 9. 实现优先级

### 9.1 核心功能（P0）

1. ✅ 批量操作状态管理（`batchOperationModel`）
2. ✅ 批量操作 UI（按钮、操作栏、复选框）
3. ✅ 媒体选择逻辑（勾选、全选、清除）
4. ✅ 批量拖拽逻辑（检测、数据传递、随机位置）
5. ✅ 地图批量处理（遍历更新坐标）
6. ✅ 自动退出批量模式

### 9.2 增强功能（P1）

1. ✅ 选中数量提示
2. ✅ 选中卡片高亮样式
3. ✅ 错误处理和提示

### 9.3 未来扩展（P2）

1. ⏸ Shift 连选
2. ⏸ 批量删除坐标
3. ⏸ 批量固定/取消固定
4. ⏸ 拖拽预览（地图上显示目标圆圈）

---

## 10. 风险与权衡

### 10.1 性能风险

**风险**：选中大量媒体（如 1000+）时，批量更新可能耗时较长。

**缓解措施**：
- 限制批量数量上限（如 500 个），超过时提示用户分批操作
- 使用后台任务处理，显示进度条
- 当前阶段：不设限制，依赖实际使用反馈

### 10.2 用户体验权衡

**权衡点**：拖拽完成后自动退出批量模式 vs 保持批量模式

**选择**：自动退出

**理由**：
- 批量拖拽是一次性操作，完成后通常不需要继续批量操作
- 自动退出避免用户忘记退出，误触复选框
- 如果需要连续批量操作，可以快速再次进入批量模式

### 10.3 随机分布算法

**权衡点**：完全随机 vs 尝试避免重叠

**选择**：完全随机

**理由**：
- 实现简单，性能稳定
- 10 米范围对于少量媒体足够分散
- 如果后续发现重叠问题，可以升级算法

---

## 11. 总结

本设计方案实现了媒体卡片的批量拖拽功能，核心特点：

1. **状态内聚**：批量操作状态集中在 `batchOperationModel`，逻辑清晰
2. **交互直观**：按需显示复选框，拖拽后自动退出，流程简洁
3. **实现简单**：复用现有拖拽逻辑，地图组件无需改动
4. **易于扩展**：预留了批量删除、批量固定等扩展接口

预计改动代码行数：
- `MediaTable.vue`：+150 行
- `App.vue`：+20 行
- 样式文件：+30 行

预计开发时间：2-3 小时

---

**设计文档完成**  
下一步：进入实现阶段，调用 writing-plans skill 生成实施计划。
