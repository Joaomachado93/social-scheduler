<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { usePostsStore } from '../../stores/posts.js';

const postsStore = usePostsStore();
const loading = ref(true);

onMounted(async () => {
  await postsStore.fetchPosts();
  loading.value = false;
});

const VIDEO_PLATFORMS = ['youtube', 'tiktok'] as const;
type VideoPlatform = typeof VIDEO_PLATFORMS[number];

/**
 * Filter posts to those that have at least one leg on a video platform.
 * Because the list endpoint doesn't include platform data, we show all posts
 * and rely on any embedded `platforms` array when available.
 * Posts without `platforms` data are shown without platform badges (unknown).
 */
const videoPosts = computed(() => {
  return postsStore.posts.filter(post => {
    if (!post.platforms || post.platforms.length === 0) {
      // No platform data embedded — include for display but can't filter
      return true;
    }
    return post.platforms.some((p: any) =>
      VIDEO_PLATFORMS.includes(p.platform as VideoPlatform)
    );
  });
});

const platformLabel: Record<string, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

const platformBadgeColor: Record<string, string> = {
  youtube: 'bg-red-100 text-red-700',
  tiktok: 'bg-gray-900 text-white',
};

const statusLabel: Record<string, string> = {
  scheduled: 'Agendado',
  published: 'Publicado',
  failed: 'Falhado',
  draft: 'Rascunho',
  processing: 'A processar',
  partial: 'Parcial',
  pending: 'Pendente',
};

const statusColor: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  published: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  draft: 'bg-gray-100 text-gray-600',
  processing: 'bg-yellow-100 text-yellow-700',
  partial: 'bg-orange-100 text-orange-700',
  pending: 'bg-gray-100 text-gray-500',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncate(text: string | null, max = 80) {
  if (!text) return '(sem legenda)';
  return text.length > max ? text.slice(0, max) + '…' : text;
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold">Vídeos Agendados</h2>
      <router-link
        to="/video/create"
        class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        + Novo Vídeo
      </router-link>
    </div>

    <div v-if="loading" class="text-gray-400">A carregar...</div>

    <div
      v-else-if="videoPosts.length === 0"
      class="bg-white rounded-xl shadow p-8 text-center text-gray-400"
    >
      Nenhum vídeo agendado.
    </div>

    <div v-else class="bg-white rounded-xl shadow overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-100">
          <tr>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Legenda</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Data</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
            <th class="text-left px-4 py-3 font-medium text-gray-600">Plataformas</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr
            v-for="post in videoPosts"
            :key="post.id"
            class="hover:bg-gray-50 transition-colors"
          >
            <td class="px-4 py-3">
              <router-link
                :to="`/posts/${post.id}`"
                class="text-gray-800 hover:text-blue-600 hover:underline"
              >
                {{ truncate(post.caption) }}
              </router-link>
            </td>
            <td class="px-4 py-3 text-gray-500 whitespace-nowrap">
              {{ formatDate(post.scheduledAt) }}
            </td>
            <td class="px-4 py-3">
              <span
                :class="[
                  'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                  statusColor[post.status] || 'bg-gray-100 text-gray-600',
                ]"
              >
                {{ statusLabel[post.status] || post.status }}
              </span>
            </td>
            <td class="px-4 py-3">
              <div
                v-if="post.platforms && post.platforms.length"
                class="flex flex-wrap gap-1"
              >
                <span
                  v-for="leg in post.platforms"
                  :key="leg.id ?? leg.platform"
                  :class="[
                    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                    platformBadgeColor[leg.platform] || 'bg-gray-100 text-gray-600',
                  ]"
                >
                  {{ platformLabel[leg.platform] || leg.platform }}
                </span>
              </div>
              <span v-else class="text-gray-300 text-xs">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
