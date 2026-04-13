<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePostsStore } from '../stores/posts.js';
import { usePlatformsStore } from '../stores/platforms.js';
import MediaUploader from '../components/MediaUploader.vue';

const router = useRouter();
const postsStore = usePostsStore();
const platformsStore = usePlatformsStore();

const caption = ref('');
const scheduledDate = ref('');
const scheduledTime = ref('');
const selectedPlatformIds = ref<number[]>([]);
const mediaFiles = ref<any[]>([]);
const submitting = ref(false);
const error = ref('');

onMounted(() => {
  platformsStore.fetchAccounts();
  // Default to tomorrow at 10:00
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  scheduledDate.value = tomorrow.toISOString().split('T')[0];
  scheduledTime.value = '10:00';
});

const canSubmit = computed(() =>
  caption.value.trim() &&
  scheduledDate.value &&
  scheduledTime.value &&
  selectedPlatformIds.value.length > 0
);

async function submit() {
  error.value = '';
  submitting.value = true;

  try {
    const scheduledAt = `${scheduledDate.value}T${scheduledTime.value}:00`;

    await postsStore.createPost({
      caption: caption.value,
      scheduledAt,
      platformAccountIds: selectedPlatformIds.value,
      mediaIds: mediaFiles.value.map(f => f.id),
    });

    router.push('/');
  } catch (e: any) {
    error.value = e.response?.data?.error || 'Erro ao criar post';
  } finally {
    submitting.value = false;
  }
}

function togglePlatform(id: number) {
  const idx = selectedPlatformIds.value.indexOf(id);
  if (idx === -1) {
    selectedPlatformIds.value.push(id);
  } else {
    selectedPlatformIds.value.splice(idx, 1);
  }
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
</script>

<template>
  <div class="max-w-2xl">
    <h2 class="text-2xl font-bold mb-6">Novo Post</h2>

    <form @submit.prevent="submit" class="space-y-6">
      <!-- Caption -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Texto do post</label>
        <textarea
          v-model="caption"
          rows="4"
          class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
          placeholder="Escreve o texto do teu post..."
        />
      </div>

      <!-- Media Upload -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Media</label>
        <MediaUploader v-model="mediaFiles" />
      </div>

      <!-- Platforms -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">Publicar em</label>
        <div v-if="platformsStore.accounts.length === 0" class="text-sm text-gray-400">
          Nenhuma plataforma conectada.
          <router-link to="/platforms" class="text-blue-600 hover:underline">Conectar agora</router-link>
        </div>
        <div v-else class="flex flex-wrap gap-3">
          <button
            v-for="account in platformsStore.accounts"
            :key="account.id"
            type="button"
            @click="togglePlatform(account.id)"
            :class="['flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all',
              selectedPlatformIds.includes(account.id)
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300']"
          >
            <span :class="['w-7 h-7 rounded flex items-center justify-center text-white text-xs font-bold', platformColor[account.platform]]">
              {{ platformIcon[account.platform] }}
            </span>
            <span class="text-sm">{{ account.accountName }}</span>
          </button>
        </div>
      </div>

      <!-- Schedule -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Data</label>
          <input
            v-model="scheduledDate"
            type="date"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Hora</label>
          <input
            v-model="scheduledTime"
            type="time"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="text-red-500 text-sm bg-red-50 p-3 rounded-lg">
        {{ error }}
      </div>

      <!-- Submit -->
      <button
        type="submit"
        :disabled="!canSubmit || submitting"
        class="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {{ submitting ? 'A criar...' : 'Agendar Post' }}
      </button>
    </form>
  </div>
</template>
