<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import MediaUploader from '../../components/MediaUploader.vue';
import { usePostsStore } from '../../stores/posts.js';
import { useVideoPlatformsStore } from '../../stores/videoPlatforms.js';
import { validateForTikTok } from '../../composables/useTikTokConstraints.js';
import { useToast } from '../../composables/useToast.js';

interface MediaFile {
  id: number;
  mediaType: string;
  processingStatus: string;
  originalUrl?: string;
}

const router = useRouter();
const postsStore = usePostsStore();
const videoPlatformsStore = useVideoPlatformsStore();
const toast = useToast();

const caption = ref('');
const mediaFiles = ref<MediaFile[]>([]);
const selectedAccountIds = ref<number[]>([]);
const submitting = ref(false);
const submitError = ref('');
const constraintErrors = ref<string[]>([]);

// Default scheduledAt = now + 1 hour
const defaultScheduledAt = () => {
  const d = new Date();
  d.setHours(d.getHours() + 1);
  // Format to datetime-local (YYYY-MM-DDTHH:mm)
  return d.toISOString().slice(0, 16);
};
const scheduledAt = ref(defaultScheduledAt());

onMounted(async () => {
  await videoPlatformsStore.fetchAccounts();
  // Default: select all accounts
  selectedAccountIds.value = videoPlatformsStore.accounts.map(a => a.id);
});

const constraintErrorMessages: Record<string, string> = {
  container: 'Formato de vídeo inválido. Usa MP4, MOV ou WebM.',
  size: 'O ficheiro excede o tamanho máximo de 4 GB.',
};

function onMediaUpdate(files: MediaFile[]) {
  mediaFiles.value = files;
}

function onConstraintErrors(errors: string[]) {
  constraintErrors.value = errors;
}

function toggleAccount(id: number) {
  const idx = selectedAccountIds.value.indexOf(id);
  if (idx === -1) {
    selectedAccountIds.value.push(id);
  } else {
    selectedAccountIds.value.splice(idx, 1);
  }
}

const hasMedia = computed(() => mediaFiles.value.length > 0);
const hasConstraintErrors = computed(() => constraintErrors.value.length > 0);
const hasPlatforms = computed(() => selectedAccountIds.value.length > 0);

const canSubmit = computed(() =>
  hasMedia.value && hasPlatforms.value && !hasConstraintErrors.value && !submitting.value
);

const platformIcon: Record<string, string> = {
  youtube: 'YT',
  tiktok: 'TT',
};

const platformColor: Record<string, string> = {
  youtube: 'bg-red-600',
  tiktok: 'bg-black',
};

async function handleSubmit() {
  if (!canSubmit.value) return;
  submitError.value = '';
  submitting.value = true;

  try {
    const iso = new Date(scheduledAt.value).toISOString();
    await postsStore.createPost({
      caption: caption.value,
      scheduledAt: iso,
      platformAccountIds: selectedAccountIds.value,
      mediaIds: mediaFiles.value.map(f => f.id),
      status: 'scheduled',
    });
    toast.success('Vídeo agendado com sucesso');
    router.push('/video/posts');
  } catch (e: any) {
    submitError.value = e.response?.data?.error || 'Erro ao agendar vídeo';
    toast.error(submitError.value);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <h2 class="text-2xl font-bold mb-6">Novo Vídeo</h2>

    <form @submit.prevent="handleSubmit" class="space-y-6">
      <!-- Video Upload -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Vídeo</label>
        <MediaUploader
          v-model="mediaFiles"
          accept="video/*"
          :validate="(f) => validateForTikTok(f).errors"
          @update:modelValue="onMediaUpdate"
          @update:errors="onConstraintErrors"
        />

        <!-- Constraint errors shown immediately on file selection -->
        <div v-if="constraintErrors.length" class="mt-2 space-y-1">
          <p
            v-for="err in constraintErrors"
            :key="err"
            class="text-sm text-red-600"
          >
            {{ constraintErrorMessages[err] || err }}
          </p>
        </div>
        <p v-if="!hasMedia" class="mt-1 text-xs text-gray-400">
          Seleciona um ficheiro de vídeo para continuar.
        </p>
      </div>

      <!-- Caption -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Legenda</label>
        <textarea
          v-model="caption"
          rows="4"
          class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
          placeholder="Escreve a legenda do vídeo..."
        />
      </div>

      <!-- Schedule datetime -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Data e hora de publicação</label>
        <input
          v-model="scheduledAt"
          type="datetime-local"
          class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
      </div>

      <!-- Platform checkboxes -->
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-2">Publicar em</label>
        <div v-if="videoPlatformsStore.accounts.length === 0" class="text-sm text-gray-400">
          Nenhuma plataforma de vídeo conectada.
          <router-link to="/video/platforms" class="text-blue-600 hover:underline">
            Conectar agora
          </router-link>
        </div>
        <div v-else class="flex flex-wrap gap-3">
          <button
            v-for="account in videoPlatformsStore.accounts"
            :key="account.id"
            type="button"
            @click="toggleAccount(account.id)"
            :class="[
              'flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all',
              selectedAccountIds.includes(account.id)
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300',
            ]"
          >
            <span
              :class="[
                'w-7 h-7 rounded flex items-center justify-center text-white text-xs font-bold',
                platformColor[account.platform] || 'bg-gray-500',
              ]"
            >
              {{ platformIcon[account.platform] || account.platform.slice(0, 2).toUpperCase() }}
            </span>
            <span class="text-sm">{{ account.accountName || account.accountId }}</span>
          </button>
        </div>
        <p v-if="!hasPlatforms && videoPlatformsStore.accounts.length > 0" class="mt-1 text-xs text-amber-600">
          Seleciona pelo menos uma plataforma.
        </p>
      </div>

      <!-- Error -->
      <div
        v-if="submitError"
        role="alert"
        class="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded-lg"
      >
        {{ submitError }}
      </div>

      <!-- Submit -->
      <button
        type="submit"
        data-test="submit"
        :disabled="!canSubmit"
        class="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {{ submitting ? 'A agendar...' : 'Agendar Vídeo' }}
      </button>
    </form>
  </div>
</template>
