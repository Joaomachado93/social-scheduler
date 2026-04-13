<script setup lang="ts">
import { onMounted } from 'vue';
import { usePostsStore } from '../stores/posts.js';
import PostCard from '../components/PostCard.vue';
import StatusBadge from '../components/StatusBadge.vue';

const store = usePostsStore();

onMounted(async () => {
  await Promise.all([store.fetchStats(), store.fetchUpcoming(), store.fetchRecent()]);
});

async function handleDelete(id: number) {
  await store.deletePost(id);
  await Promise.all([store.fetchStats(), store.fetchUpcoming(), store.fetchRecent()]);
}

async function handlePublishNow(id: number) {
  await store.publishNow(id);
  await Promise.all([store.fetchStats(), store.fetchUpcoming(), store.fetchRecent()]);
}
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold mb-6">Dashboard</h2>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div class="bg-white rounded-xl shadow p-5">
        <p class="text-sm text-gray-500">Total</p>
        <p class="text-3xl font-bold">{{ store.stats.total }}</p>
      </div>
      <div class="bg-white rounded-xl shadow p-5">
        <p class="text-sm text-gray-500">Agendados</p>
        <p class="text-3xl font-bold text-blue-600">{{ store.stats.scheduled }}</p>
      </div>
      <div class="bg-white rounded-xl shadow p-5">
        <p class="text-sm text-gray-500">Publicados</p>
        <p class="text-3xl font-bold text-green-600">{{ store.stats.published }}</p>
      </div>
      <div class="bg-white rounded-xl shadow p-5">
        <p class="text-sm text-gray-500">Falhados</p>
        <p class="text-3xl font-bold text-red-600">{{ store.stats.failed }}</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div>
        <h3 class="text-lg font-semibold mb-4">Agendados</h3>
        <div v-if="store.upcoming.length" class="space-y-3">
          <PostCard
            v-for="post in store.upcoming"
            :key="post.id"
            :post="post"
            @delete="handleDelete"
            @publish-now="handlePublishNow"
          />
        </div>
        <div v-else class="bg-white rounded-xl shadow p-6 text-gray-400">
          Nenhum post agendado
        </div>
      </div>

      <div>
        <h3 class="text-lg font-semibold mb-4">Recentes</h3>
        <div v-if="store.recent.length" class="space-y-3">
          <PostCard
            v-for="post in store.recent"
            :key="post.id"
            :post="post"
            @delete="handleDelete"
            @publish-now="handlePublishNow"
          />
        </div>
        <div v-else class="bg-white rounded-xl shadow p-6 text-gray-400">
          Nenhum post ainda. Cria o teu primeiro!
        </div>
      </div>
    </div>
  </div>
</template>
