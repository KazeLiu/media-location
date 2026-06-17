<script setup lang="ts">
// 用法指南标签页
</script>

<template>
  <div class="guide-tab-content">
    <el-scrollbar class="guide-scrollbar">
      <section class="usage-guide" aria-labelledby="usage-guide-title">
        <h3 id="usage-guide-title">用法指南 ✨</h3>
        <ol>
          <li>
            先到
            <a href="https://console.amap.com/dev/key/app" target="_blank" rel="noreferrer">高德开发者中心</a>
            申请 Web端(JS API) Key，拿到 Key 用于加载地图，安全密钥用于地址搜索。
          </li>
          <li>等待地图加载完成后，点击"基本功能"标签的"选择文件夹"，选择照片所在路径；每次选择一个文件夹，可以重复添加。</li>
          <li>
            选择文件夹后，在目录面板进入目标目录，下方会加载当前目录的图片；已有经纬度会直接展示，没有经纬度时可点击"暂无经纬度"填写 WGS-84 坐标，也可以把图片拖到地图上写入位置。
          </li>
          <li>
            点击有经纬度的图片，可以把照片显示在地图上作为参考；例如手机照片已有定位、相机照片没有定位时，可以固定手机照片，辅助对照位置并快速补齐相机照片坐标。
          </li>
        </ol>

        <h4>电子围栏 🗺️</h4>
        <ul>
          <li>在"电子围栏"标签中，可以创建和管理地理围栏，用于标记和筛选特定区域的照片。</li>
          <li>创建围栏后，在"基本功能"页面会显示围栏列表，点击围栏名称可以快速筛选该区域内的照片。</li>
          <li>把照片拖拽到围栏列表中可以快捷把照片经纬度锁定到围栏中</li>
        </ul>

        <h4>小贴士 💡</h4>
        <ul>
          <li>切换目录时，未固定的照片会从地图上移除；需要跨目录对照时，请先固定照片。</li>
          <li>底部的 GCJ-02 和 WGS-84 切换只影响地图点击后复制到剪切板的坐标格式，写入照片时始终使用 WGS-84。</li>
          <li>拖拽中间的分隔条可以调整左侧面板和地图的大小。</li>
          <li>在设置标签中选择 XMP 侧车文件写入方式更安全，不会修改原始图片。</li>
        </ul>
      </section>
    </el-scrollbar>
  </div>
</template>

<style scoped lang="scss">
.guide-tab-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.guide-scrollbar {
  flex: 1;
  min-height: 0;
  padding: 16px;

  :deep(.el-scrollbar__wrap) {
    overflow-x: hidden;
  }
}

.usage-guide {
  color: #263849;

  h3 {
    margin: 0 0 16px;
    color: #10212f;
    font-size: 16px;
    font-weight: 700;
  }

  h4 {
    margin: 24px 0 12px;
    color: #10212f;
    font-size: 14px;
    font-weight: 700;
  }

  ol, ul {
    display: grid;
    gap: 12px;
    margin: 0;
    padding-left: 24px;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.7;
  }

  ul {
    list-style-type: disc;
  }

  a {
    color: var(--accent);
    font-weight: 600;
    text-decoration: none;

    &:hover,
    &:focus-visible {
      text-decoration: underline;
    }
  }

  li {
    padding-left: 4px;
  }
}
</style>
