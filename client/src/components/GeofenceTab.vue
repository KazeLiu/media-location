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
  editingGeofenceId: string;
  drawingMode: boolean;
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

function handleEditArea(geofence?: Geofence): void {
  const targetGeofence = geofence || editingGeofence.value;
  if (targetGeofence) {
    emit('editArea', targetGeofence);
    editorDialogVisible.value = false;
  }
}
</script>

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
              编辑信息
            </el-button>
            <el-button
              :icon="Edit"
              size="small"
              @click.stop="handleEditArea(geofence)"
            >
              编辑区域
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
  align-items: center;
  justify-content: space-between;
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
