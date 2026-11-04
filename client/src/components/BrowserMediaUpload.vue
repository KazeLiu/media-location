<script setup lang="ts">
import { reactive, ref } from 'vue';
import { UploadFilled } from '@element-plus/icons-vue';

defineProps<{ busy: boolean; progress: string }>();
const emit = defineEmits<{ files: [files: File[]] }>();
const inputElement = ref<HTMLInputElement | null>(null);
const uploadModel = reactive({ dragActive: false });

function chooseFiles(): void {
  inputElement.value?.click();
}

function handleDragOver(event: DragEvent): void {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  uploadModel.dragActive = true;
}

function handleDragLeave(event: DragEvent): void {
  const target = event.currentTarget;
  if (!(target instanceof Node) || !(event.relatedTarget instanceof Node) || !target.contains(event.relatedTarget)) {
    uploadModel.dragActive = false;
  }
}

function handleDrop(event: DragEvent): void {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  uploadModel.dragActive = false;
  emit('files', Array.from(event.dataTransfer.files));
}

function handleChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  emit('files', Array.from(input.files ?? []));
  input.value = '';
}
</script>

<template>
  <section
    class="browser-upload"
    :class="{ 'is-dragging': uploadModel.dragActive }"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <el-icon :size="20"><UploadFilled /></el-icon>
    <div class="upload-copy">
      <strong>导入本机照片或视频</strong>
      <small>{{ progress || '本地生成 480px 缩略图用于标注，原文件不上传、不修改' }}</small>
    </div>
    <el-button type="primary" size="small" :disabled="busy" @click="chooseFiles">选择媒体</el-button>
    <input
      ref="inputElement"
      class="file-input"
      type="file"
      multiple
      accept=".jpg,.jpeg,.heic,.heif,.tif,.tiff,.png,.mp4,.mov,.m4v,.mts,.m2ts"
      aria-label="选择本机媒体文件"
      tabindex="-1"
      @change="handleChange"
    />
  </section>
</template>

<style scoped lang="scss">
.browser-upload {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px dashed var(--border);
  border-radius: 9px;
  background: var(--surface-strong);
  transition: border-color 160ms ease, background-color 160ms ease;

  &.is-dragging { border-color: var(--accent); background: #eaf7f2; }
  > .el-icon { flex: none; color: var(--accent); }
  > .el-button { flex: none; }
}

.upload-copy {
  display: grid;
  gap: 2px;
  flex: 1 1 auto;
  min-width: 0;

  strong { font-size: 13px; }
  small { overflow: hidden; color: var(--text-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
}

.file-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

@media (prefers-reduced-motion: reduce) {
  .browser-upload { transition: none; }
}
</style>
