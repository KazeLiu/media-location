<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { FolderOpened } from '@element-plus/icons-vue';
import { browseFolders, getFolderPickerShortcuts } from '@/api';

type FolderTreeNode = {
  label: string;
  path: string;
  hasChildren: boolean;
  children?: FolderTreeNode[];
  loaded?: boolean;
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
  pathInput: '',
  rootNodes: [] as FolderTreeNode[],
  expandedKeys: [] as string[],
  loadingDesktop: false,
  loadingPath: false,
});

const treeRef = ref();
const dialogKey = ref(0);
const treeProps = {
  label: 'label',
  isLeaf: (data: FolderTreeNode) => !data.hasChildren,
};

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      dialogKey.value += 1;
      pickerModel.selectedPath = '';
      pickerModel.pathInput = '';
      pickerModel.rootNodes = [];
      pickerModel.expandedKeys = [];
      void loadRootNodes();
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
    loaded: false,
  }));
}

async function loadRootNodes(): Promise<void> {
  try {
    const response = await browseFolders();
    pickerModel.rootNodes = buildNodes(response.entries);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '目录加载失败');
    pickerModel.rootNodes = [];
  }
}

async function loadNode(node: any, resolve: (data: FolderTreeNode[]) => void): Promise<void> {
  if (node.level === 0) {
    resolve(pickerModel.rootNodes);
    return;
  }

  try {
    const response = await browseFolders(node.data.path);
    const children = buildNodes(response.entries);
    node.data.children = children;
    node.data.loaded = true;
    resolve(children);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '目录加载失败');
    node.data.children = [];
    node.data.loaded = true;
    resolve([]);
  }
}

function handleSelect(node: FolderTreeNode): void {
  pickerModel.selectedPath = node.path;
  pickerModel.pathInput = node.path;
}

async function handleExpand(node: FolderTreeNode): Promise<void> {
  await loadChildren(node);
}

async function loadChildren(node: FolderTreeNode): Promise<void> {
  if (!node.hasChildren || node.loaded) {
    return;
  }

  try {
    const response = await browseFolders(node.path);
    node.children = buildNodes(response.entries);
    node.loaded = true;
    treeRef.value?.updateKeyChildren?.(node.path, node.children);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '目录加载失败');
    node.children = [];
    node.loaded = true;
    treeRef.value?.updateKeyChildren?.(node.path, []);
  }
}

async function openDesktopShortcut(): Promise<void> {
  pickerModel.loadingDesktop = true;
  try {
    const shortcuts = await getFolderPickerShortcuts();
    const desktop = shortcuts.desktop;

    if (!desktop) {
      ElMessage.warning('没有找到桌面目录');
      return;
    }

    if (!pickerModel.rootNodes.length) {
      await loadRootNodes();
    }

    for (const path of desktop.ancestorPaths) {
      const node = findTreeNode(path, pickerModel.rootNodes);
      if (!node) {
        continue;
      }

      if (!pickerModel.expandedKeys.includes(path)) {
        pickerModel.expandedKeys.push(path);
      }
      await loadChildren(node);
      await expandTreeNode(path);
    }

    await selectAndRevealPath(desktop.entry.path);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '桌面目录加载失败');
  } finally {
    pickerModel.loadingDesktop = false;
  }
}

async function confirmPathInput(): Promise<void> {
  const typedPath = pickerModel.pathInput.trim();
  if (!typedPath) {
    ElMessage.warning('请输入目录路径');
    return;
  }

  pickerModel.loadingPath = true;
  try {
    const response = await browseFolders(typedPath);
    await revealPath(response.currentPath);
    await selectAndRevealPath(response.currentPath);
  } catch {
    ElMessage.error('无此路径');
  } finally {
    pickerModel.loadingPath = false;
  }
}

async function selectAndRevealPath(path: string): Promise<void> {
  pickerModel.selectedPath = path;
  pickerModel.pathInput = path;
  await revealPath(path);
  await nextTick();
  treeRef.value?.setCurrentKey?.(path);
}

async function revealPath(targetPath: string): Promise<void> {
  if (!pickerModel.rootNodes.length) {
    await loadRootNodes();
  }

  for (const path of getAncestorPaths(targetPath)) {
    const node = findTreeNode(path, pickerModel.rootNodes);
    if (!node) {
      continue;
    }

    if (!pickerModel.expandedKeys.includes(path)) {
      pickerModel.expandedKeys.push(path);
    }
    await loadChildren(node);
    await expandTreeNode(path);
  }
}

async function expandTreeNode(path: string): Promise<void> {
  await nextTick();
  const treeNode = treeRef.value?.getNode?.(path);
  treeNode?.expand?.();
}

function findTreeNode(path: string, nodes: FolderTreeNode[]): FolderTreeNode | null {
  for (const node of nodes) {
    if (node.path === path) {
      return node;
    }

    const match = node.children ? findTreeNode(path, node.children) : null;
    if (match) {
      return match;
    }
  }

  return null;
}

function getAncestorPaths(targetPath: string): string[] {
  const normalizedPath = targetPath.replaceAll('\\', '/').replace(/\/+$/, '');
  const parts = normalizedPath.split('/').filter(Boolean);
  const rootMatch = normalizedPath.match(/^[A-Za-z]:/);

  if (!rootMatch) {
    return [`/${parts.join('/')}`];
  }

  const paths = [`${rootMatch[0]}\\`];
  let currentPath = paths[0];
  parts.slice(1).forEach((part) => {
    currentPath = currentPath.endsWith('\\') ? `${currentPath}${part}` : `${currentPath}\\${part}`;
    paths.push(currentPath);
  });

  return paths;
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
        <el-input
          v-model="pickerModel.pathInput"
          clearable
          placeholder="输入目录路径"
          @keyup.enter="confirmPathInput"
        />
        <el-button type="primary" :loading="pickerModel.loadingPath" @click="confirmPathInput">
          确认
        </el-button>
      </div>

      <el-scrollbar class="picker-scrollbar">
        <el-tree
          ref="treeRef"
          :data="pickerModel.rootNodes"
          lazy
          :load="loadNode"
          node-key="path"
          :props="treeProps"
          :default-expanded-keys="pickerModel.expandedKeys"
          highlight-current
          @node-click="handleSelect"
          @node-expand="handleExpand"
        />
      </el-scrollbar>
    </div>

    <template #footer>
      <div class="folder-picker-footer">
        <el-button :icon="FolderOpened" :loading="pickerModel.loadingDesktop" @click="openDesktopShortcut">
          桌面
        </el-button>
        <div class="folder-picker-actions">
          <el-button @click="close">取消</el-button>
          <el-button type="primary" :disabled="!pickerModel.selectedPath" @click="confirm">确定</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>
