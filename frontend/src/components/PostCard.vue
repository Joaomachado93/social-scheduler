<script setup lang="ts">
import { computed } from 'vue';
import StatusBadge from './StatusBadge.vue';
import type { Post } from '../stores/posts.js';

const props = defineProps<{ post: Post }>();
const emit = defineEmits<{
  delete: [id: number];
  publishNow: [id: number];
}>();

const formattedDate = computed(() => {
  const d = new Date(props.post.scheduledAt);
  return d.toLocaleString('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
});

const truncatedCaption = computed(() => {
  const cap = props.post.caption || '';
  return cap.length > 100 ? cap.slice(0, 100) + '...' : cap;
});
</script>

<template>
  <div class="bg-white rounded-xl shadow p-5 flex flex-col gap-3">
    <div class="flex items-start justify-between">
      <div class="flex-1">
        <p class="text-sm text-gray-500">{{ formattedDate }}</p>
        <p class="mt-1 text-gray-800">{{ truncatedCaption || '(sem texto)' }}</p>
      </div>
      <StatusBadge :status="post.status" />
    </div>

    <div class="flex gap-2 mt-auto">
      <button
        v-if="post.status === 'scheduled' || post.status === 'failed'"
        @click="emit('publishNow', post.id)"
        class="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
      >
        Publicar agora
      </button>
      <button
        v-if="post.status === 'scheduled' || post.status === 'draft'"
        @click="emit('delete', post.id)"
        class="px-3 py-1.5 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
      >
        Eliminar
      </button>
    </div>
  </div>
</template>
