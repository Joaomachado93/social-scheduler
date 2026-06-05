<script setup lang="ts">
import { onMounted } from 'vue';
import { useVideoPlatformsStore } from '../../stores/videoPlatforms.js';

const videoPlatformsStore = useVideoPlatformsStore();

onMounted(async () => {
  await videoPlatformsStore.fetchAccounts();
});

const platformLabel: Record<string, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
};
</script>

<template>
  <div class="max-w-3xl space-y-8">
    <h1 class="text-2xl font-bold">Video Scheduler</h1>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Plataformas conectadas -->
      <div class="bg-white rounded-xl shadow p-6">
        <h2 class="text-lg font-semibold mb-4">Plataformas conectadas</h2>
        <div v-if="videoPlatformsStore.accounts.length === 0" class="text-sm text-gray-400">
          Nenhuma plataforma conectada.
        </div>
        <ul v-else class="space-y-2">
          <li
            v-for="account in videoPlatformsStore.accounts"
            :key="account.id"
            class="flex items-center gap-3 text-sm text-gray-700"
          >
            <span class="font-medium">{{ account.accountName || account.accountId }}</span>
            <span class="text-gray-400">·</span>
            <span class="text-gray-500">{{ platformLabel[account.platform] || account.platform }}</span>
          </li>
        </ul>
        <router-link
          to="/video/platforms"
          class="mt-4 inline-block text-sm text-blue-600 hover:underline"
        >
          Gerir plataformas →
        </router-link>
      </div>

      <!-- Próximas ações -->
      <div class="bg-white rounded-xl shadow p-6">
        <h2 class="text-lg font-semibold mb-4">Próximas ações</h2>
        <div class="space-y-3">
          <router-link
            to="/video/create"
            class="flex items-center gap-2 w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <span class="text-lg">＋</span>
            <span>Novo vídeo</span>
          </router-link>
          <router-link
            to="/video/posts"
            class="flex items-center gap-2 w-full px-4 py-3 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            <span class="text-lg">📋</span>
            <span>Ver agendados</span>
          </router-link>
          <router-link
            to="/video/platforms"
            class="flex items-center gap-2 w-full px-4 py-3 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            <span class="text-lg">⚙️</span>
            <span>Gerir plataformas</span>
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>
