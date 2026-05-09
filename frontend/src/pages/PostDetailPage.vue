<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePostsStore } from '../stores/posts.js';
import { useToast } from '../composables/useToast.js';
import StatusBadge from '../components/StatusBadge.vue';
import axios from 'axios';

const route = useRoute();
const router = useRouter();
const postsStore = usePostsStore();
const toast = useToast();

const post = ref<any>(null);
const publishLogs = ref<any[]>([]);
const loading = ref(true);
const error = ref('');
const postId = Number(route.params.id);

if (!Number.isInteger(postId) || postId <= 0) {
  error.value = 'ID de post inválido';
  loading.value = false;
}

const platformIcon: Record<string, string> = {
  facebook: 'f',
  instagram: 'ig',
  youtube: 'YT',
};

const platformColor: Record<string, string> = {
  facebook: 'bg-blue-600',
  instagram: 'bg-gradient-to-br from-purple-600 to-pink-500',
  youtube: 'bg-red-600',
};

async function loadLogs() {
  const { data } = await axios.get(`/api/posts/${postId}/logs`);
  publishLogs.value = data;
}

// Poll the post while any media is still being watermarked.
// Stops when all media reach 'done' or 'failed', or after MAX_POLL_MS.
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 60_000;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollStartedAt = 0;

function isMediaProcessing(): boolean {
  if (!post.value?.media?.length) return false;
  return post.value.media.some((m: any) =>
    m.processingStatus !== 'done' && m.processingStatus !== 'failed'
  );
}

function startPollingIfNeeded() {
  if (pollTimer || !isMediaProcessing()) return;
  pollStartedAt = Date.now();
  pollTimer = setInterval(async () => {
    if (Date.now() - pollStartedAt > MAX_POLL_MS) {
      stopPolling();
      return;
    }
    try {
      post.value = await postsStore.fetchPost(postId);
      if (!isMediaProcessing()) stopPolling();
    } catch {
      stopPolling();
    }
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

onUnmounted(stopPolling);

onMounted(async () => {
  if (error.value) return;
  try {
    post.value = await postsStore.fetchPost(postId);
    await loadLogs();
    startPollingIfNeeded();
  } catch (e: any) {
    error.value = e.response?.data?.error || 'Erro ao carregar post';
  } finally {
    loading.value = false;
  }
});

function mediaSrc(file: any): string {
  const type = file.processingStatus === 'done' ? 'watermarked' : 'original';
  return `/api/media/${file.id}/file/${type}`;
}

const formattedDate = computed(() => {
  if (!post.value) return '';
  return new Date(post.value.scheduledAt).toLocaleString('pt-PT', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
});

const isEditable = computed(() =>
  post.value && ['draft', 'scheduled'].includes(post.value.status)
);

async function handleDelete() {
  if (!confirm('Tens a certeza que queres eliminar este post?')) return;
  try {
    await postsStore.deletePost(postId);
    toast.success('Post eliminado');
    router.push('/');
  } catch {
    toast.error('Erro ao eliminar post');
  }
}

async function handlePublishNow() {
  try {
    await postsStore.publishNow(postId);
    toast.success('Post publicado');
    post.value = await postsStore.fetchPost(postId);
    await loadLogs();
  } catch (e: any) {
    const msg = e.response?.data?.error || 'Erro ao publicar';
    error.value = msg;
    toast.error(msg);
  }
}

async function handleDuplicate() {
  try {
    const clone = await postsStore.duplicatePost(postId);
    toast.success('Post duplicado como rascunho');
    router.push(`/posts/${clone.id}/edit`);
  } catch {
    toast.error('Erro ao duplicar post');
  }
}
</script>

<template>
  <div class="max-w-3xl">
    <div class="flex items-center gap-4 mb-6">
      <button @click="router.back()" class="text-gray-400 hover:text-gray-600">
        ← Voltar
      </button>
      <h2 class="text-2xl font-bold">Detalhe do Post</h2>
    </div>

    <div v-if="loading" class="text-gray-400">A carregar...</div>

    <div v-else-if="error" class="bg-red-50 text-red-600 p-4 rounded-lg">
      {{ error }}
    </div>

    <template v-else-if="post">
      <!-- Post info -->
      <div class="bg-white rounded-xl shadow p-6 mb-6">
        <div class="flex items-start justify-between mb-4">
          <div>
            <p class="text-sm text-gray-500">{{ formattedDate }}</p>
            <StatusBadge :status="post.status" class="mt-2" />
          </div>
          <div class="flex gap-2">
            <router-link
              v-if="isEditable"
              :to="`/posts/${postId}/edit`"
              class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Editar
            </router-link>
            <button
              v-if="post.status === 'scheduled' || post.status === 'failed'"
              @click="handlePublishNow"
              class="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Publicar agora
            </button>
            <button
              @click="handleDuplicate"
              class="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Duplicar
            </button>
            <button
              v-if="isEditable"
              @click="handleDelete"
              class="px-4 py-2 text-sm bg-red-100 text-red-600 rounded-lg hover:bg-red-200"
            >
              Eliminar
            </button>
          </div>
        </div>

        <div class="prose max-w-none">
          <p class="text-gray-800 whitespace-pre-wrap">{{ post.caption || '(sem texto)' }}</p>
        </div>
      </div>

      <!-- Media -->
      <div v-if="post.media?.length" class="bg-white rounded-xl shadow p-6 mb-6">
        <h3 class="text-lg font-semibold mb-4">Media</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div
            v-for="file in post.media"
            :key="file.id"
            class="relative aspect-square bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center"
          >
            <img
              v-if="file.mediaType === 'image'"
              :src="mediaSrc(file)"
              class="w-full h-full object-cover"
            />
            <video
              v-else-if="file.mediaType === 'video'"
              :src="mediaSrc(file)"
              class="w-full h-full object-cover"
              controls
              preload="metadata"
            />
            <div
              v-if="file.processingStatus !== 'done' && file.processingStatus !== 'failed'"
              class="absolute inset-x-0 bottom-0 bg-black/60 text-white text-xs py-1 text-center"
            >
              A processar marca de água…
            </div>
            <div
              v-else-if="file.processingStatus === 'failed'"
              class="absolute inset-x-0 bottom-0 bg-red-600/80 text-white text-xs py-1 text-center"
            >
              Marca de água falhou — usando original
            </div>
          </div>
        </div>
      </div>

      <!-- Platforms -->
      <div v-if="post.platforms?.length" class="bg-white rounded-xl shadow p-6 mb-6">
        <h3 class="text-lg font-semibold mb-4">Plataformas</h3>
        <div class="flex flex-wrap gap-3">
          <div
            v-for="pp in post.platforms"
            :key="pp.id"
            class="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200"
          >
            <span :class="['w-7 h-7 rounded flex items-center justify-center text-white text-xs font-bold', platformColor[pp.platform] || 'bg-gray-500']">
              {{ platformIcon[pp.platform] || '?' }}
            </span>
            <span class="text-sm">{{ pp.accountName || pp.platform }}</span>
            <StatusBadge :status="pp.status || 'pending'" />
          </div>
        </div>
      </div>

      <!-- Publish Logs -->
      <div v-if="publishLogs.length" class="bg-white rounded-xl shadow p-6">
        <h3 class="text-lg font-semibold mb-4">Histórico de Publicação</h3>
        <div class="space-y-3">
          <div
            v-for="log in publishLogs"
            :key="log.id"
            :class="['p-3 rounded-lg text-sm',
              log.level === 'error' ? 'bg-red-50' :
              log.level === 'warn' ? 'bg-yellow-50' : 'bg-green-50']"
          >
            <div class="flex items-center justify-between">
              <span class="font-medium" :class="
                log.level === 'error' ? 'text-red-700' :
                log.level === 'warn' ? 'text-yellow-700' : 'text-green-700'">
                {{ log.platform || 'sistema' }} — {{ log.message }}
              </span>
              <span class="text-xs text-gray-400">
                {{ new Date(log.createdAt).toLocaleString('pt-PT') }}
              </span>
            </div>
            <p v-if="log.details" class="mt-1 text-gray-500 text-xs">{{ log.details }}</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
