# 地图基础设施改造设计文档

日期: 2026-06-13
作者: Kiro (风宝)

## 项目目标

为媒体经纬度工作台添加 Mapbox 地图支持，并实现地图聚合功能。

## 需求概述

1. 对接 Mapbox 地图，保留高德地图，用户可在设置中切换
2. 用户自己申请并填写 Mapbox Access Token
3. 实现地图标记聚合功能（基于缩放级别）
4. 聚合点点击后显示照片列表弹窗，支持拖拽照片到其他位置
5. 保持现有所有功能（拖拽、搜索、标记、定位等）

## 架构设计

采用地图提供商抽象层架构，三层结构：
- UI层：MapPanel.vue 负责界面和用户交互
- 抽象层：MapProvider 接口定义统一的地图能力
- 实现层：AmapProvider 和 MapboxProvider 具体实现

## 配置管理

AppConfig 新增字段：
- mapProvider: 'amap' | 'mapbox' - 地图提供商选择
- mapboxToken: string - Mapbox Access Token

配置存储位置：data/app.config.json

切换流程：
1. 用户在设置页修改 mapProvider
2. 弹窗确认："切换地图会清空当前固定的照片列表，但已标记的照片经纬度不会丢失。确认切换吗？"
3. 用户确认后保存配置
4. 刷新页面 location.reload()

## MapProvider 接口定义

核心方法：
- init(config) - 初始化地图
- destroy() - 销毁地图
- setCenter(lng, lat, zoom) - 设置地图中心
- setLayerMode(mode) - 切换标准图/卫星图
- renderMarkers(items, selectedId) - 渲染照片标记
- clearMarkers() - 清除所有标记
- enableClustering(enabled) - 启用聚合
- showClusterPopup(items, lng, lat) - 显示聚合弹窗
- hideClusterPopup() - 隐藏聚合弹窗
- search(keyword) - 搜索地址
- showSearchMarker(result) - 显示搜索结果标记
- clearSearchMarker() - 清除搜索标记
- getCoordinateSystemName() - 返回坐标系名称
- formatCoordinate(lng, lat) - 格式化坐标
- handleDrop(event, item) - 处理拖放

## AmapProvider 实现

文件位置：client/src/lib/providers/AmapProvider.ts

职责：
- 加载高德 JS API
- 处理 GCJ-02 和 WGS-84 坐标转换
- 实现标准图/卫星图/路网切换
- 实现高德 POI 搜索
- 实现聚合点逻辑（使用 Supercluster）
- 渲染带缩略图的照片标记

坐标系处理：
- 显示标记时：WGS-84 转 GCJ-02
- 用户操作后：GCJ-02 转 WGS-84
- 复制坐标：支持 GCJ-02 和 WGS-84 切换

## MapboxProvider 实现

文件位置：client/src/lib/providers/MapboxProvider.ts

职责：
- 加载 Mapbox GL JS SDK
- 使用 WGS-84 坐标（无需转换）
- 实现标准图 streets-v12 和卫星图 satellite-streets-v12 切换
- 实现 Mapbox Geocoding API 搜索
- 实现聚合点逻辑（使用 Mapbox 内置 cluster）
- 渲染带缩略图的照片标记

技术选型：
- SDK: mapbox-gl v3.x
- 聚合：Mapbox 内置 GeoJSON cluster
- 标记：自定义 HTML Marker

坐标系处理：
- 直接使用 WGS-84，无需转换
- 复制坐标：只显示 WGS-84

## 依赖安装

新增 npm 依赖：
- mapbox-gl: ^3.1.0
- @types/mapbox-gl: ^3.1.0
- supercluster: 最新版本

## 聚合功能设计

聚合算法：
- AmapProvider：使用 Supercluster 库，聚合半径 50 像素，最小聚合数量 2
- MapboxProvider：使用 Mapbox 内置 cluster，clusterRadius 50，clusterMaxZoom 14

聚合点样式：
- 普通标记：显示照片缩略图，底部显示 XMP 或 GPS 标签
- 聚合点：圆形背景显示数量，颜色分级（蓝色 2-10，橙色 11-50，红色 51+）

聚合弹窗设计：
- 地图上的悬浮弹窗（类似 InfoWindow）
- 显示标题："此位置有 N 张照片"
- 列表显示照片缩略图和文件名
- 每个照片项可拖拽到地图其他位置
- 点击照片项选中该照片
- 最大显示 20 个照片，超过显示滚动条

## 搜索功能设计

搜索接口适配：
- AmapProvider：使用高德 AutoComplete + PlaceSearch，返回 GCJ-02 坐标
- MapboxProvider：使用 Mapbox Geocoding API，返回 WGS-84 坐标

搜索 UI：
- 保持现有 el-autocomplete 组件
- 输入时触发 Provider 的 search() 方法
- 搜索结果显示蓝色定位图标

Mapbox Geocoding API：
- 端点：https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json
- 参数：access_token, limit=1, language=zh
- 前端直接调用（和高德保持一致）

## 设置界面设计

设置页新增区域：
- 地图提供商选择：单选框（高德地图/Mapbox）
- 高德配置区域：当选中高德时显示（Key 和安全密钥）
- Mapbox 配置区域：当选中 Mapbox 时显示（Access Token）
- 申请提示：提供 mapbox.com/account 链接

配置验证：
- 选择高德必须填写 amapKey
- 选择 Mapbox 必须填写 mapboxToken
- 否则阻止保存并提示

首次使用引导：
- mapProvider 未设置默认为 amap
- 对应 Key/Token 为空时自动跳转设置页

## MapPanel.vue 重构

组件结构：
- 根据 mapProvider 配置动态创建 Provider 实例
- 所有地图操作通过 Provider 接口调用
- Vue 组件只负责状态管理和事件传递
- 地图 SDK 实现完全封装在 Provider 内部

状态同步：
- items 变化时调用 provider.renderMarkers()
- selectedId 变化时重新渲染标记
- 搜索成功后调用 provider.showSearchMarker()

## 错误处理

地图加载失败：
- AmapProvider：Key 无效、安全密钥错误、网络错误
- MapboxProvider：Token 无效、网络错误、配额超限
- 错误处理：触发 onError 回调，显示提示，跳转设置页

网络离线处理：
- 严格要求网络连接
- 离线时显示："地图需要网络连接才能使用，请检查网络后刷新页面"
- 阻止所有地图操作
- 提供刷新页面按钮
- 监听网络状态变化并提示

切换地图时的清理：
- 销毁当前 Provider 实例
- 清除所有地图相关 DOM 元素
- 清除所有事件监听器
- 重置地图状态

边界情况：
- 没有 GPS 信息的照片不显示标记
- 相同经纬度的照片通过聚合点处理
- 大量照片通过聚合优化性能

用户体验优化：
- 地图初始化时显示 loading 遮罩
- 搜索时显示 loading 图标
- 拖拽时实时显示坐标预览
- 保存成功显示确认消息

## 实施步骤

1. 创建 MapProvider 抽象接口
2. 将现有高德逻辑封装成 AmapProvider
3. 实现 MapboxProvider
4. 实现聚合功能（Supercluster + Mapbox cluster）
5. 实现聚合弹窗 UI
6. 重构 MapPanel.vue 使用抽象层
7. 更新设置界面
8. 添加错误处理和网络检测
9. 测试切换流程和所有功能
10. 文档更新

## 技术栈总结

- Vue 3 + TypeScript
- Mapbox GL JS v3.x
- 高德 JS API v2
- Supercluster（聚合算法）
- Element Plus（UI 组件）

## 验收标准

1. 用户可以在设置中切换高德地图和 Mapbox
2. 切换时显示确认对话框并刷新页面
3. Mapbox 支持标准图和卫星图切换
4. 搜索功能根据地图类型自动切换 API
5. 地图标记聚合功能正常工作
6. 点击聚合点显示照片列表弹窗
7. 弹窗中的照片可以拖拽到地图其他位置
8. 所有现有功能在两种地图上都正常工作
9. 网络离线时阻止地图使用并提示
10. 错误处理完善，用户体验流畅
