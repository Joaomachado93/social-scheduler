<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import { usePlatformsStore } from '../stores/platforms.js';

const platformsStore = usePlatformsStore();
const route = useRoute();
const toast = ref('');
const connecting = ref('');
const ownerMode = ref(false);
const metaConfigured = ref(false);
const googleConfigured = ref(false);
const apiOrigin = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') || 'http://localhost:3001';

onMounted(async () => {
  await platformsStore.fetchAccounts();

  try {
    const { data } = await axios.get('/api/platforms/capabilities');
    ownerMode.value = !!data.ownerMode;
    metaConfigured.value = !!data.meta?.configured;
    googleConfigured.value = !!data.google?.configured;
  } catch {
    // older backends won't have this endpoint — fall back to OAuth-only flow
  }

  // Check for callback params
  if (route.query.connected) {
    toast.value = `${route.query.connected} conectado com sucesso!`;
    setTimeout(() => toast.value = '', 5000);
  }
  if (route.query.error) {
    toast.value = `Erro ao conectar: ${route.query.error}`;
    setTimeout(() => toast.value = '', 5000);
  }
});

function isOauthAvailable(platform: string): boolean {
  if (platform === 'facebook' || platform === 'instagram') return metaConfigured.value;
  if (platform === 'youtube') return googleConfigured.value;
  return false;
}

async function connect(platform: string) {
  connecting.value = platform;
  try {
    const url = await platformsStore.getAuthUrl(platform);
    window.location.href = url;
  } catch (err: any) {
    toast.value = err.response?.data?.error || 'Erro ao obter URL de autorizacao';
    connecting.value = '';
  }
}

async function disconnect(id: number) {
  await platformsStore.disconnect(id);
}

const platforms = [
  {
    key: 'facebook',
    name: 'Facebook',
    description: 'Publica em paginas do Facebook',
    icon: 'f',
    color: 'bg-blue-600',
    btnColor: 'bg-blue-600 hover:bg-blue-700',
  },
  {
    key: 'instagram',
    name: 'Instagram',
    description: 'Publica no Instagram Business',
    icon: 'ig',
    color: 'bg-gradient-to-br from-purple-600 to-pink-500',
    btnColor: 'bg-gradient-to-r from-purple-600 to-pink-500 hover:opacity-90',
  },
  {
    key: 'youtube',
    name: 'YouTube',
    description: 'Upload de videos para o YouTube',
    icon: 'YT',
    color: 'bg-red-600',
    btnColor: 'bg-red-600 hover:bg-red-700',
  },
];
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold mb-6">Plataformas</h2>

    <!-- Toast -->
    <div
      v-if="toast"
      :class="['mb-6 p-4 rounded-lg text-sm',
        toast.includes('Erro') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700']"
    >
      {{ toast }}
    </div>

    <div
      v-if="ownerMode"
      class="mb-6 p-4 rounded-lg bg-blue-50 text-blue-800 text-sm"
    >
      Modo "owner tokens" ativo: o servidor está pré-configurado com tokens
      pessoais e estas plataformas aparecem ligadas automaticamente em todas
      as sessões. Não precisas de fazer OAuth.
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div v-for="p in platforms" :key="p.key" class="bg-white rounded-xl shadow p-6">
        <div class="flex items-center gap-3 mb-4">
          <div :class="['w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold', p.color]">
            {{ p.icon }}
          </div>
          <h3 class="text-lg font-semibold">{{ p.name }}</h3>
        </div>

        <p class="text-sm text-gray-500 mb-4">{{ p.description }}</p>

        <!-- Connected accounts -->
        <div v-for="account in platformsStore.getByPlatform(p.key)" :key="account.id"
          class="flex items-center justify-between bg-green-50 rounded-lg p-3 mb-3"
        >
          <div>
            <p class="text-sm font-medium text-green-800">{{ account.accountName }}</p>
            <p class="text-xs text-green-600">{{ ownerMode ? 'Pré-ligada (owner token)' : 'Conectado' }}</p>
          </div>
          <button
            v-if="!ownerMode"
            @click="disconnect(account.id)"
            class="text-xs text-red-500 hover:text-red-700"
          >
            Desconectar
          </button>
        </div>

        <button
          v-if="!ownerMode && isOauthAvailable(p.key)"
          @click="connect(p.key)"
          :disabled="connecting === p.key"
          :class="['w-full py-2 text-white rounded-lg transition-all', p.btnColor,
            connecting === p.key ? 'opacity-50' : '']"
        >
          {{ connecting === p.key ? 'A redirecionar...' : platformsStore.getByPlatform(p.key).length ? 'Adicionar outra' : 'Conectar' }}
        </button>
        <p
          v-else-if="!ownerMode && !isOauthAvailable(p.key)"
          class="text-xs text-gray-500 italic text-center mt-2"
        >
          OAuth não configurado no servidor
        </p>
      </div>
    </div>

    <!-- Setup Instructions -->
    <div v-if="!ownerMode" class="mt-8 bg-white rounded-xl shadow p-6">
      <h3 class="text-lg font-semibold mb-4">Como configurar</h3>
      <div class="space-y-4 text-sm text-gray-600">
        <p class="text-gray-700">
          Duas opções: <strong>OAuth tradicional</strong> (cada user conecta com a sua conta)
          ou <strong>owner tokens</strong> (o servidor publica nas tuas páginas — útil para uso pessoal).
          Vê <a href="https://github.com/Joaomachado93/social-scheduler/blob/main/OWNER_TOKENS.md" target="_blank" class="text-blue-600 hover:underline">OWNER_TOKENS.md</a> para o caminho recomendado.
        </p>
        <div>
          <h4 class="font-medium text-gray-800">OAuth — Facebook + Instagram</h4>
          <ul class="list-disc list-inside mt-1 space-y-1">
            <li>Vai a <a href="https://developers.facebook.com" target="_blank" class="text-blue-600 hover:underline">developers.facebook.com</a> e cria uma App</li>
            <li>Adiciona o produto "Facebook Login for Business"</li>
            <li>Configura o redirect URI: <code class="bg-gray-100 px-1 rounded">{{ apiOrigin }}/api/platforms/facebook/callback</code></li>
            <li>Define <code class="bg-gray-100 px-1 rounded">META_APP_ID</code>, <code class="bg-gray-100 px-1 rounded">META_APP_SECRET</code> e <code class="bg-gray-100 px-1 rounded">META_REDIRECT_URI</code> nas env vars do servidor</li>
          </ul>
        </div>
        <div>
          <h4 class="font-medium text-gray-800">OAuth — YouTube</h4>
          <ul class="list-disc list-inside mt-1 space-y-1">
            <li>Vai a <a href="https://console.cloud.google.com" target="_blank" class="text-blue-600 hover:underline">Google Cloud Console</a> e cria um projeto</li>
            <li>Ativa a YouTube Data API v3</li>
            <li>Cria credenciais OAuth 2.0 (Web application) com redirect URI <code class="bg-gray-100 px-1 rounded">{{ apiOrigin }}/api/platforms/youtube/callback</code></li>
            <li>Define <code class="bg-gray-100 px-1 rounded">GOOGLE_CLIENT_ID</code>, <code class="bg-gray-100 px-1 rounded">GOOGLE_CLIENT_SECRET</code> e <code class="bg-gray-100 px-1 rounded">GOOGLE_REDIRECT_URI</code> nas env vars do servidor</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
