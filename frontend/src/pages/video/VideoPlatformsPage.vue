<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useVideoPlatformsStore } from '../../stores/videoPlatforms.js';

const videoPlatformsStore = useVideoPlatformsStore();
const route = useRoute();
const toast = ref('');
const connecting = ref('');
const apiOrigin = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') || 'http://localhost:3001';

onMounted(async () => {
  await videoPlatformsStore.fetchAccounts();

  try {
    await videoPlatformsStore.fetchCapabilities();
  } catch (err) {
    // If /capabilities fails, leave optimistic defaults (buttons still visible).
    // The auth-url request returns 503 if creds are missing — that becomes a toast.
    console.warn('[video-platforms] /capabilities failed, falling back to optimistic defaults:', err);
  }

  if (route.query.connected) {
    toast.value = `${route.query.connected} conectado com sucesso!`;
    setTimeout(() => (toast.value = ''), 5000);
  }
  if (route.query.error) {
    toast.value = `Erro ao conectar: ${route.query.error}`;
    setTimeout(() => (toast.value = ''), 5000);
  }
});

function isConfigured(platform: 'youtube' | 'tiktok'): boolean {
  return videoPlatformsStore.capabilities[platform]?.configured !== false;
}

function getAccountsFor(platform: string) {
  return videoPlatformsStore.accounts.filter((a) => a.platform === platform);
}

async function connect(platform: 'youtube' | 'tiktok') {
  connecting.value = platform;
  try {
    const url = await videoPlatformsStore.getAuthUrl(platform);
    window.location.href = url;
  } catch (err: any) {
    toast.value = err.response?.data?.error || 'Erro ao obter URL de autorização';
    connecting.value = '';
  }
}

async function disconnect(id: number) {
  await videoPlatformsStore.disconnect(id);
}

const platforms = [
  {
    key: 'youtube' as const,
    name: 'YouTube',
    description: 'Publica em YouTube como vídeo público',
    icon: '▶',
    color: 'bg-red-600',
    btnColor: 'bg-red-600 hover:bg-red-700',
  },
  {
    key: 'tiktok' as const,
    name: 'TikTok',
    description: 'Publica em TikTok (sandbox → private até audit aprovado)',
    icon: '🎵',
    color: 'bg-black',
    btnColor: 'bg-black hover:bg-gray-800',
  },
] as const;
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold mb-6">Plataformas de Vídeo</h2>

    <!-- Toast -->
    <div
      v-if="toast"
      :class="[
        'mb-6 p-4 rounded-lg text-sm',
        toast.includes('Erro') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700',
      ]"
    >
      {{ toast }}
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div v-for="p in platforms" :key="p.key" class="bg-white rounded-xl shadow p-6">
        <div class="flex items-center gap-3 mb-4">
          <div
            :class="[
              'w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold',
              p.color,
            ]"
          >
            {{ p.icon }}
          </div>
          <h3 class="text-lg font-semibold">{{ p.name }}</h3>
        </div>

        <p class="text-sm text-gray-500 mb-4">{{ p.description }}</p>

        <!-- Connected accounts -->
        <div
          v-for="account in getAccountsFor(p.key)"
          :key="account.id"
          class="flex items-center justify-between bg-green-50 rounded-lg p-3 mb-3"
        >
          <div>
            <p class="text-sm font-medium text-green-800">
              {{ account.accountName || account.accountId }}
            </p>
            <p class="text-xs text-green-600">Conectado</p>
          </div>
          <button
            @click="disconnect(account.id)"
            class="text-xs text-red-500 hover:text-red-700"
          >
            Desconectar
          </button>
        </div>

        <!-- Connect button -->
        <button
          v-if="isConfigured(p.key)"
          @click="connect(p.key)"
          :disabled="connecting === p.key"
          :class="[
            'w-full py-2 text-white rounded-lg transition-all',
            p.btnColor,
            connecting === p.key ? 'opacity-50 cursor-not-allowed' : '',
          ]"
        >
          {{
            connecting === p.key
              ? 'A redirecionar...'
              : getAccountsFor(p.key).length
              ? 'Adicionar outra conta'
              : 'Conectar'
          }}
        </button>
        <p
          v-else
          class="text-xs text-gray-500 italic text-center mt-2"
        >
          OAuth não configurado no servidor
        </p>
      </div>
    </div>

    <!-- Setup instructions -->
    <div class="mt-8 bg-white rounded-xl shadow p-6">
      <h3 class="text-lg font-semibold mb-4">Como configurar</h3>
      <div class="space-y-4 text-sm text-gray-600">
        <div>
          <h4 class="font-medium text-gray-800">OAuth — YouTube</h4>
          <ul class="list-disc list-inside mt-1 space-y-1">
            <li>
              Vai a
              <a
                href="https://console.cloud.google.com"
                target="_blank"
                class="text-blue-600 hover:underline"
                >Google Cloud Console</a
              >
              e cria um projeto
            </li>
            <li>Ativa a YouTube Data API v3</li>
            <li>
              Cria credenciais OAuth 2.0 (Web application) com redirect URI
              <code class="bg-gray-100 px-1 rounded"
                >{{ apiOrigin }}/api/video/youtube/callback</code
              >
            </li>
            <li>
              Define
              <code class="bg-gray-100 px-1 rounded">YOUTUBE_CLIENT_ID</code>,
              <code class="bg-gray-100 px-1 rounded">YOUTUBE_CLIENT_SECRET</code> e
              <code class="bg-gray-100 px-1 rounded">YOUTUBE_REDIRECT_URI</code> nas env vars do
              servidor
            </li>
          </ul>
        </div>
        <div>
          <h4 class="font-medium text-gray-800">OAuth — TikTok</h4>
          <ul class="list-disc list-inside mt-1 space-y-1">
            <li>
              Vai a
              <a
                href="https://developers.tiktok.com"
                target="_blank"
                class="text-blue-600 hover:underline"
                >TikTok for Developers</a
              >
              e cria uma app
            </li>
            <li>Ativa o produto "Login Kit" e adiciona o scope <code class="bg-gray-100 px-1 rounded">video.upload</code></li>
            <li>
              Configura o redirect URI:
              <code class="bg-gray-100 px-1 rounded"
                >{{ apiOrigin }}/api/video/tiktok/callback</code
              >
            </li>
            <li>
              Define
              <code class="bg-gray-100 px-1 rounded">TIKTOK_CLIENT_KEY</code>,
              <code class="bg-gray-100 px-1 rounded">TIKTOK_CLIENT_SECRET</code> e
              <code class="bg-gray-100 px-1 rounded">TIKTOK_REDIRECT_URI</code> nas env vars do
              servidor
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
