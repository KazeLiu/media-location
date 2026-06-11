<script setup lang="ts">
import { computed } from 'vue';
import { ElMessage } from 'element-plus';
import { ArrowDown, ArrowRight, Delete, FolderAdd, Refresh } from '@element-plus/icons-vue';
import type { FolderPickerEntry } from '@shared/contracts';
import { browseLibraryDirectories } from '@/api';

type DirectoryTreeNode = {
  label: string;
  path: string;
  root: boolean;
  hasChildren: boolean;
};

const props = defineProps<{
  currentDir: string;
  roots: string[];
  loading: boolean;
  collapsed: boolean;
}>();

const emit = defineEmits<{
  addRoot: [];
  openDir: [path: string];
  removeRoot: [path: string];
  refresh: [];
  toggle: [];
}>();

const treeProps = {
  label: 'label',
  isLeaf: (data: DirectoryTreeNode) => !data.hasChildren,
};

const rootNodes = computed<DirectoryTreeNode[]>(() =>
  props.roots.map((root) => ({
    label: root,
    path: root,
    root: true,
    hasChildren: true,
  })),
);

async function loadNode(node: any, resolve: (data: DirectoryTreeNode[]) => void): Promise<void> {
  if (node.level === 0) {
    resolve(rootNodes.value);
    return;
  }

  try {
    const children = await browseLibraryDirectories(node.data.path);
    resolve(children.map(toDirectoryTreeNode));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '目录加载失败');
    resolve([]);
  }
}

function toDirectoryTreeNode(entry: FolderPickerEntry): DirectoryTreeNode {
  return {
    label: entry.name,
    path: entry.path,
    root: false,
    hasChildren: entry.hasChildren,
  };
}

function handleNodeClick(node: DirectoryTreeNode): void {
  emit('openDir', node.path);
}

function handleRemoveRoot(path: string, event: MouseEvent): void {
  event.stopPropagation();
  emit('removeRoot', path);
}
</script>

<template>
  <section class="panel browser-panel">
    <header class="panel-header">
      <el-button
        link
        :icon="collapsed ? ArrowRight : ArrowDown"
        class="panel-title-button"
        @click="emit('toggle')"
      >
        目录
      </el-button>
      <el-space>
        <el-button :icon="FolderAdd" size="small" type="primary" @click="emit('addRoot')">选择文件夹</el-button>
        <el-button :icon="Refresh" size="small" :loading="loading" @click="emit('refresh')" />
      </el-space>
    </header>

    <template v-if="!collapsed">
      <el-scrollbar class="folder-scrollbar" v-loading="loading">
        <el-empty v-if="!roots.length" :image-size="52" description="还没有目录" />
        <el-tree
          v-else
          :data="rootNodes"
          :load="loadNode"
          :props="treeProps"
          lazy
          node-key="path"
          highlight-current
          :current-node-key="currentDir"
          class="directory-tree"
          @node-click="handleNodeClick"
        >
          <template #default="{ data }">
            <div class="directory-tree-node">
              <span class="directory-tree-label">{{ data.label }}</span>
              <el-tooltip v-if="data.root" content="从目录列表移除这个固定目录" placement="top">
                <el-button
                  class="directory-remove-button"
                  :icon="Delete"
                  link
                  type="danger"
                  aria-label="移除固定目录"
                  @click="handleRemoveRoot(data.path, $event)"
                />
              </el-tooltip>
            </div>
          </template>
        </el-tree>
      </el-scrollbar>
    </template>
  </section>
</template>
