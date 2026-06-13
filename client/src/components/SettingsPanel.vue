<script setup lang="ts">
import { reactive, watch } from 'vue';
import type { AppConfig } from '@shared/contracts';
import { Promotion, RefreshRight } from '@element-plus/icons-vue';
import { ElMessageBox } from 'element-plus';

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
  mapboxToken: props.config.mapboxToken,
  backupBeforeWrite: props.config.backupBeforeWrite,
});

watch(
  () => props.config,
  (config) => {
    settingsModel.port = config.port;
    settingsModel.mapProvider = config.mapProvider;
    settingsModel.amapKey = config.amapKey;
    settingsModel.amapSecurityCode = config.amapSecurityCode;
    settingsModel.mapboxToken = config.mapboxToken;
    settingsModel.backupBeforeWrite = config.backupBeforeWrite;
  },
  { deep: true, immediate: true },
);

async function handleMapProviderChange(newProvider: 'amap' | 'mapbox'): Promise<void> {
  if (newProvider === props.config.mapProvider) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      '切换地图会清空当前固定的照片列表，但已标记的照片经纬度不会丢失。确认切换吗？',
      '切换地图提供商',
      {
        confirmButtonText: '确认切换',
        cancelButtonText: '取消',
        type: 'warning',
      },
    );

    // 用户确认后更新配置
    settingsModel.mapProvider = newProvider;
  } catch {
    // 用户取消，恢复原值
    settingsModel.mapProvider = props.config.mapProvider;
  }
}

function submit(): void {
  emit('save', {
    ...props.config,
    port: settingsModel.port,
    mapProvider: settingsModel.mapProvider,
    amapKey: settingsModel.amapKey.trim(),
    amapSecurityCode: settingsModel.amapSecurityCode.trim(),
    mapboxToken: settingsModel.mapboxToken.trim(),
    backupBeforeWrite: settingsModel.backupBeforeWrite,
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
    <el-form label-position="top" class="settings-form">
      <el-form-item label="端口">
        <el-input-number v-model="settingsModel.port" :min="1" :max="65535" controls-position="right" />
      </el-form-item>

      <el-divider content-position="left">地图设置</el-divider>

      <el-form-item label="地图提供商">
        <el-radio-group v-model="settingsModel.mapProvider" @change="handleMapProviderChange">
          <el-radio value="amap">高德地图</el-radio>
          <el-radio value="mapbox">Mapbox</el-radio>
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
          <el-input v-model="settingsModel.mapboxToken" clearable show-password />
          <div class="settings-help">
            💡 申请地址:
            <a href="https://www.mapbox.com/account/access-tokens" target="_blank" rel="noopener noreferrer">
              https://www.mapbox.com/account/access-tokens
            </a>
          </div>
        </el-form-item>
      </template>

      <el-divider />

      <el-form-item label="写入前备份 XMP">
        <el-switch v-model="settingsModel.backupBeforeWrite" inline-prompt active-text="开" inactive-text="关" />
        <div class="settings-help">开启后，写入经纬度前会保留原 XMP 的备份副本；关闭则直接更新 XMP。</div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button :icon="RefreshRight" @click="emit('close')">收起</el-button>
      <el-button type="primary" :icon="Promotion" :loading="busy" @click="submit">保存</el-button>
    </template>
  </el-drawer>
</template>
