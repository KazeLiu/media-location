<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const emit = defineEmits<{
  resize: [width: number];
}>();

const isDragging = ref(false);
const startX = ref(0);
const startWidth = ref(0);
const resizeHandle = ref<HTMLElement | null>(null);

function handleMouseDown(event: MouseEvent): void {
  event.preventDefault();

  isDragging.value = true;
  startX.value = event.clientX;

  // 获取左侧面板的实际宽度
  const leftPanel = document.querySelector('.left-section') as HTMLElement;
  if (leftPanel) {
    startWidth.value = leftPanel.offsetWidth;
  }

  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  // 添加遮罩层防止 iframe 或其他元素干扰拖拽
  const overlay = document.createElement('div');
  overlay.id = 'resize-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9999;
    cursor: col-resize;
  `;
  document.body.appendChild(overlay);

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}

function handleMouseMove(event: MouseEvent): void {
  if (!isDragging.value) return;

  event.preventDefault();

  const delta = event.clientX - startX.value;
  const maxWidth = window.innerWidth * 0.7;
  const newWidth = Math.max(420, Math.min(maxWidth, startWidth.value + delta));

  emit('resize', newWidth);
}

function handleMouseUp(event: MouseEvent): void {
  if (!isDragging.value) return;

  event.preventDefault();

  isDragging.value = false;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';

  // 移除遮罩层
  const overlay = document.getElementById('resize-overlay');
  if (overlay) {
    overlay.remove();
  }

  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
}

onMounted(() => {
  // 初始化完成
});

onUnmounted(() => {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';

  // 清理可能残留的遮罩层
  const overlay = document.getElementById('resize-overlay');
  if (overlay) {
    overlay.remove();
  }
});
</script>

<template>
  <div ref="resizeHandle" class="resize-handle" @mousedown="handleMouseDown">
    <div class="resize-handle-line"></div>
  </div>
</template>

<style scoped lang="scss">
.resize-handle {
  position: relative;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  user-select: none;
  flex-shrink: 0;

  &:hover .resize-handle-line {
    background: var(--accent);
  }
}

.resize-handle-line {
  position: absolute;
  top: 0;
  left: 50%;
  width: 2px;
  height: 100%;
  background: var(--border);
  transform: translateX(-50%);
  transition: background 0.2s ease;
  pointer-events: none;
}
</style>
