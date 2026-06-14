<script setup lang="ts">
import { reactive, watch } from 'vue';
import type { AppConfig } from '@shared/contracts';
import { Promotion, RefreshRight } from '@element-plus/icons-vue';

const props = defineProps<{
  config: AppConfig;
  busy: boolean;
}>();

const emit = defineEmits<{
  save: [config: AppConfig];
  close: [];
}>();

// Settings block: keeps only runtime options that belong in the floating settings sheet.
const settingsModel = reactive({
  port: props.config.port,
  mapProvider: props.config.mapProvider,
  amapKey: props.config.amapKey,
  amapSecurityCode: props.config.amapSecurityCode,
  mapboxAccessToken: props.config.mapboxAccessToken,
  gpsWriteMode: props.config.gpsWriteMode,
});

watch(
  () => props.config,
  (config) => {
    settingsModel.port = config.port;
    settingsModel.mapProvider = config.mapProvider;
    settingsModel.amapKey = config.amapKey;
    settingsModel.amapSecurityCode = config.amapSecurityCode;
    settingsModel.mapboxAccessToken = config.mapboxAccessToken;
    settingsModel.gpsWriteMode = config.gpsWriteMode;
  },
  { deep: true, immediate: true },
);

function submit(): void {
  emit('save', {
    ...props.config,
    port: settingsModel.port,
    mapProvider: settingsModel.mapProvider,
    amapKey: settingsModel.amapKey.trim(),
    amapSecurityCode: settingsModel.amapSecurityCode.trim(),
    mapboxAccessToken: settingsModel.mapboxAccessToken.trim(),
    gpsWriteMode: settingsModel.gpsWriteMode,
    backupBeforeWrite: false,
  });
}
</script>

<template>
  <el-drawer
    title="设置"
    :model-value="true"
    direction="rtl"
    size="360px"
    append-to-body
    class="settings-panel"
    :show-close="false"
    @close="emit('close')"
  >
    <div class="settings-content">
      <el-form label-position="top" class="settings-form">
        <el-form-item label="端口">
          <el-input-number v-model="settingsModel.port" :min="1" :max="65535" controls-position="right" />
        </el-form-item>

        <el-form-item label="地图引擎">
          <el-select v-model="settingsModel.mapProvider" placeholder="选择地图引擎">
            <el-option label="高德地图" value="amap" />
            <el-option label="Mapbox" value="mapbox" />
          </el-select>
        </el-form-item>

        <template v-if="settingsModel.mapProvider === 'amap'">
          <el-form-item label="高德 Web(JS API) Key">
            <el-input v-model="settingsModel.amapKey" clearable />
          </el-form-item>

          <el-form-item label="高德安全密钥">
            <el-input v-model="settingsModel.amapSecurityCode" clearable show-password />
          </el-form-item>
        </template>

        <template v-if="settingsModel.mapProvider === 'mapbox'">
          <el-form-item label="Mapbox Access Token">
            <el-input v-model="settingsModel.mapboxAccessToken" clearable show-password />
          </el-form-item>
        </template>

        <el-form-item label="GPS 写入方式">
          <el-select v-model="settingsModel.gpsWriteMode" placeholder="选择写入方式">
            <el-option label="XMP 侧车文件（推荐）" value="xmp" />
            <el-option label="直接写入图片 EXIF" value="exif" />
          </el-select>
        </el-form-item>
      </el-form>

      <section class="usage-guide" aria-labelledby="usage-guide-title">
        <h3 id="usage-guide-title">用法指南</h3>
        <ol>
          <li>
            先到
            <a href="https://console.amap.com/dev/key/app" target="_blank" rel="noreferrer">高德开发者中心</a>
            申请 Web端(JS API) Key，拿到 Key 用于加载地图，安全密钥用于地址搜索。
          </li>
          <li>等待地图加载完成后，点击页面左上角的“选择文件夹”，选择照片所在路径；每次选择一个文件夹，可以重复添加。</li>
          <li>
            选择文件夹后，在目录面板进入目标目录，下方会加载当前目录的图片；已有经纬度会直接展示，没有经纬度时可点击“暂无经纬度”填写 WGS-84 坐标，也可以把图片拖到地图上写入位置。
          </li>
          <li>
            点击有经纬度的图片，可以把照片显示在地图上作为参考；例如手机照片已有定位、相机照片没有定位时，可以固定手机照片，辅助对照位置并快速补齐相机照片坐标。
          </li>
        </ol>
        <p>
          Tips：切换目录时，未固定的照片会从地图上移除；需要跨目录对照时，请先固定照片。底部的 GCJ-02 和 WGS-84 切换只影响地图点击后复制到剪切板的坐标格式，写入照片时始终使用 WGS-84。
        </p>
      </section>
    </div>

    <template #footer>
      <el-button :icon="RefreshRight" @click="emit('close')">收起</el-button>
      <el-button type="primary" :icon="Promotion" :loading="busy" @click="submit">保存</el-button>
    </template>
  </el-drawer>
</template>
