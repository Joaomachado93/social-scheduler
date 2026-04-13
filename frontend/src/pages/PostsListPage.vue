<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { usePostsStore } from '../stores/posts.js';
import { useToast } from '../composables/useToast.js';
import PostCard from '../components/PostCard.vue';

const postsStore = usePostsStore();
const toast = useToast();
const filter = ref('all');
const loading = ref(true);

onMounted(async () => {
  await postsStore.fetchPosts();
  loading.value = false;
});

async function handleDelete(id: number) {
  try {
    await postsStore.deletePost(id);
    toast.success('Post eliminado');
  } catch {
    toast.error('Erro ao eliminar post');
  }
}

async function handlePublishNow(id: number) {
  try {
    await postsStore.publishNow(id);
    await postsStore.fetchPosts();
    toast.success('Post publicado');
  } catch {
    toast.error('Erro ao publicar post');
  }
}

const filters = [
  { value: 'all', label: 'Todos' },
  { value: 'scheduled', label: 'Agendados' },
  { value: 'published', label: 'Publicados' },
  { value: 'failed', label: 'Falhados' },
  { value: 'draft', label: 'Rascunhos' },
];

async function applyFilter(value: string) {
  filter.value = value;
  loading.value = true;
  await postsStore.fetchPosts(value === 'all' ? undefined : { status: value });
  loading.value = false;
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold">Posts</h2>
      <router-link
        to="/posts/create"
        class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
      >
        + Novo Post
      </router-link>
    </div>

    <!-- Filters -->
    <div class="flex gap-2 mb-6">
      <button
        v-for="f in filters"
        :key="f.value"
        @click="applyFilter(f.value)"
        :class="['px-4 py-2 text-sm rounded-lg transition-colors',
          filter === f.value
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200']"
      >
        {{ f.label }}
      </button>
    </div>

    <div v-if="loading" class="text-gray-400">A carregar...</div>

    <div v-else-if="postsStore.posts.length === 0" class="bg-white rounded-xl shadow p-8 text-center text-gray-400">
      Nenhum post encontrado.
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <PostCard
        v-for="post in postsStore.posts"
        :key="post.id"
        :post="post"
        @delete="handleDelete"
        @publish-now="handlePublishNow"
      />
    </div>
  </div>
</template>
