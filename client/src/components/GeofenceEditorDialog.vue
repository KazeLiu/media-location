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
        <el-button type="primary" @click="handleConfirm">
          {{ geofence ? '保存' : '下一步：绘制区域' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>
