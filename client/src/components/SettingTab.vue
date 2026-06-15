<script setup lang="ts">
import { reactive, watch } from 'vue';
import type { AppConfig } from '@shared/contracts';
import { Promotion } from '@element-plus/icons-vue';

const props = defineProps<{
  config: AppConfig;
  busy: boolean;
}>();

const emit = defineEmits<{
  save: [config: AppConfig];
}>();

// Settings block: keeps only runtime options that belong in the settings tab.
const settingsModel = reactive({
  port: props.config.port,
  mapProvider: props.config.mapProvider,
  amapKey: props.config.amapKey,
  amapSecurityCode: props.config.amapSecurityCode,
  mapboxAccessToken: props.config.mapboxAccessToken,
  gpsWriteMode: props.config.gpsWriteMode,
  enableClickToCopy: props.config.enableClickToCopy,
  enableMarkerClustering: props.config.enableMarkerClustering,
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
    settingsModel.enableClickToCopy = config.enableClickToCopy;
    settingsModel.enableMarkerClustering = config.enableMarkerClustering;
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
    enableClickToCopy: settingsModel.enableClickToCopy,
    enableMarkerClustering: settingsModel.enableMarkerClustering,
    backupBeforeWrite: false,
  });
}
</script>

<template>
  <div class="setting-tab-content">
    <el-scrollbar class="setting-scrollbar">
      <el-form label-position="top" class="settings-form">
        <el-form-item label="端口">
          <el-input-number v-model="settingsModel.port" :min="1" :max="65535" controls-position="right" />
        </el-form-item>

        <el-form-item label="地图引擎">
          <el-radio-group v-model="settingsModel.mapProvider" class="button-group">
            <el-radio-button value="amap">高德地图</el-radio-button>
            <el-radio-button value="mapbox">Mapbox</el-radio-button>
          </el-radio-group>
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
          <el-radio-group v-model="settingsModel.gpsWriteMode" class="button-group">
            <el-radio-button value="xmp">XMP 侧车文件（推荐）</el-radio-button>
            <el-radio-button value="exif">直接写入图片 EXIF</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="点击地图复制经纬度">
          <el-switch v-model="settingsModel.enableClickToCopy" />
          <span class="form-tip">开启后点击地图可复制经纬度到剪贴板</span>
        </el-form-item>

        <el-form-item label="启用地图点位聚合">
          <el-switch v-model="settingsModel.enableMarkerClustering" />
          <span class="form-tip">开启后密集点位会自动聚合成圆形气泡</span>
        </el-form-item>
      </el-form>
    </el-scrollbar>

    <footer class="setting-footer">
      <el-button type="primary" :icon="Promotion" :loading="busy" @click="submit">保存设置</el-button>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.setting-tab-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.setting-scrollbar {
  flex: 1;
  min-height: 0;
  padding: 12px;

  :deep(.el-scrollbar__wrap) {
    overflow-x: hidden;
  }
}

.settings-form {
  display: grid;
  gap: 16px;

  .el-form-item {
    margin-bottom: 0;
    padding-right: 1px;
  }

  .el-input-number {
    width: 100%;
  }
}

.button-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;

  :deep(.el-radio-button) {
    flex: 1 1 auto;
    min-width: 0;
  }

  :deep(.el-radio-button__inner) {
    width: 100%;
    padding: 8px 15px;
    border-radius: 4px;
  }

  :deep(.el-radio-button:first-child .el-radio-button__inner) {
    border-left: 1px solid var(--el-border-color);
    border-radius: 4px;
  }

  :deep(.el-radio-button:last-child .el-radio-button__inner) {
    border-radius: 4px;
  }
}

.setting-footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px;
  border-top: 1px solid var(--border);
  background: var(--surface-strong);

  .el-button {
    min-width: 120px;
  }
}

.form-tip {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
