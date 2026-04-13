<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ status: string }>();

const config = computed(() => {
  const map: Record<string, { label: string; classes: string }> = {
    draft: { label: 'Rascunho', classes: 'bg-gray-100 text-gray-700' },
    scheduled: { label: 'Agendado', classes: 'bg-blue-100 text-blue-700' },
    processing: { label: 'A processar', classes: 'bg-yellow-100 text-yellow-700' },
    published: { label: 'Publicado', classes: 'bg-green-100 text-green-700' },
    partial: { label: 'Parcial', classes: 'bg-orange-100 text-orange-700' },
    failed: { label: 'Falhado', classes: 'bg-red-100 text-red-700' },
    pending: { label: 'Pendente', classes: 'bg-gray-100 text-gray-600' },
    publishing: { label: 'A publicar', classes: 'bg-yellow-100 text-yellow-700' },
  };
  return map[props.status] || { label: props.status, classes: 'bg-gray-100 text-gray-700' };
});
</script>

<template>
  <span :class="['px-2.5 py-1 rounded-full text-xs font-medium', config.classes]">
    {{ config.label }}
  </span>
</template>
