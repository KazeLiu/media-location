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
  amapKey: props.config.amapKey,
  amapSecurityCode: props.config.amapSecurityCode,
  backupBeforeWrite: props.config.backupBeforeWrite,
});

watch(
  () => props.config,
  (config) => {
    settingsModel.port = config.port;
    settingsModel.amapKey = config.amapKey;
    settingsModel.amapSecurityCode = config.amapSecurityCode;
    settingsModel.backupBeforeWrite = config.backupBeforeWrite;
  },
  { deep: true, immediate: true },
);

function submit(): void {
  emit('save', {
    ...props.config,
    port: settingsModel.port,
    amapKey: settingsModel.amapKey.trim(),
    amapSecurityCode: settingsModel.amapSecurityCode.trim(),
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

      <el-form-item label="高德 Web(JS API) Key">
        <el-input v-model="settingsModel.amapKey" clearable />
      </el-form-item>

      <el-form-item label="高德安全密钥">
        <el-input v-model="settingsModel.amapSecurityCode" clearable show-password />
      </el-form-item>

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
