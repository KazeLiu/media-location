<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { FolderOpened } from '@element-plus/icons-vue';
import { browseFolders } from '@/api';

type FolderTreeNode = {
  label: string;
  path: string;
  hasChildren: boolean;
  children?: FolderTreeNode[];
};

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [path: string];
}>();

// Picker block: keeps the selected folder tree node and lazy tree loading state.
const pickerModel = reactive({
  selectedPath: '',
});

const treeRef = ref();
const dialogKey = ref(0);
const treeProps = {
  label: 'label',
  isLeaf: (data: FolderTreeNode) => !data.hasChildren,
};

const selectedLabel = computed(() => pickerModel.selectedPath || '请选择一个目录');

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      dialogKey.value += 1;
      pickerModel.selectedPath = '';
    }
  },
);

function close(): void {
  emit('update:modelValue', false);
}

function confirm(): void {
  if (!pickerModel.selectedPath) {
    ElMessage.warning('请先在树里选一个目录');
    return;
  }

  emit('confirm', pickerModel.selectedPath);
  close();
}

function buildNodes(paths: Awaited<ReturnType<typeof browseFolders>>['entries']): FolderTreeNode[] {
  return paths.map((entry) => ({
    label: entry.name,
    path: entry.path,
    hasChildren: entry.hasChildren,
  }));
}

async function loadNode(node: any, resolve: (data: FolderTreeNode[]) => void): Promise<void> {
  try {
    const response = await browseFolders(node.level === 0 ? undefined : node.data.path);
    const children = buildNodes(response.entries);
    resolve(children);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '目录加载失败');
    resolve([]);
  }
}

function handleSelect(node: FolderTreeNode): void {
  pickerModel.selectedPath = node.path;
}
</script>

<template>
  <el-dialog
    :key="dialogKey"
    :model-value="modelValue"
    title="选择文件夹"
    width="640px"
    class="folder-picker-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="folder-picker">
      <div class="picker-toolbar">
        <el-icon><FolderOpened /></el-icon>
        <el-text truncated>{{ selectedLabel }}</el-text>
      </div>

      <el-scrollbar class="picker-scrollbar">
        <el-tree
          ref="treeRef"
          :load="loadNode"
          lazy
          node-key="path"
          :props="treeProps"
          highlight-current
          @node-click="handleSelect"
        />
      </el-scrollbar>
    </div>

    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :disabled="!pickerModel.selectedPath" @click="confirm">确定</el-button>
    </template>
  </el-dialog>
</template>
