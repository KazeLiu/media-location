<script setup lang="ts">
import { Search } from '@element-plus/icons-vue';
import type { AmapSearchSuggestion } from '@/lib/amapSearch';

// 搜索关键字双向绑定（无副作用，父级 mapModel.searchKeyword）
const keyword = defineModel<string>('keyword', { default: '' });

withDefaults(
  defineProps<{
    loading?: boolean;
    // 透传 el-autocomplete 的 fetch-suggestions，autocomplete 实例仍由父级持有
    fetchSuggestions: (keyword: string, callback: (items: AmapSearchSuggestion[]) => void) => void;
  }>(),
  { loading: false },
);

const emit = defineEmits<{
  select: [suggestion: AmapSearchSuggestion];
  search: [];
}>();
</script>

<template>
  <div class="map-search">
    <el-autocomplete
      v-model="keyword"
      placeholder="搜索地址"
      :fetch-suggestions="fetchSuggestions"
      clearable
      value-key="value"
      popper-class="map-search-popper"
      @select="emit('select', $event)"
      @keydown.enter="emit('search')"
    >
      <template #append>
        <el-button :icon="Search" :loading="loading" @click="emit('search')" />
      </template>
    </el-autocomplete>
  </div>
</template>
