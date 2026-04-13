<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { usePlatformsStore } from '../stores/platforms.js';

const platformsStore = usePlatformsStore();
const route = useRoute();
const toast = ref('');
const connecting = ref('');

onMounted(async () => {
  await platformsStore.fetchAccounts();

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
            <p class="text-xs text-green-600">Conectado</p>
          </div>
          <button
            @click="disconnect(account.id)"
            class="text-xs text-red-500 hover:text-red-700"
          >
            Desconectar
          </button>
        </div>

        <button
          @click="connect(p.key)"
          :disabled="connecting === p.key"
          :class="['w-full py-2 text-white rounded-lg transition-all', p.btnColor,
            connecting === p.key ? 'opacity-50' : '']"
        >
          {{ connecting === p.key ? 'A redirecionar...' : platformsStore.getByPlatform(p.key).length ? 'Adicionar outra' : 'Conectar' }}
        </button>
      </div>
    </div>

    <!-- Setup Instructions -->
    <div class="mt-8 bg-white rounded-xl shadow p-6">
      <h3 class="text-lg font-semibold mb-4">Como configurar</h3>
      <div class="space-y-4 text-sm text-gray-600">
        <div>
          <h4 class="font-medium text-gray-800">1. Facebook + Instagram</h4>
          <ul class="list-disc list-inside mt-1 space-y-1">
            <li>Vai a <a href="https://developers.facebook.com" target="_blank" class="text-blue-600 hover:underline">developers.facebook.com</a> e cria uma App</li>
            <li>Adiciona o produto "Facebook Login for Business"</li>
            <li>Configura o redirect URI: <code class="bg-gray-100 px-1 rounded">http://localhost:3001/api/platforms/facebook/callback</code></li>
            <li>Copia o App ID e App Secret para o ficheiro <code class="bg-gray-100 px-1 rounded">.env</code></li>
            <li>Para Instagram, a tua conta precisa de ser Business/Creator ligada a uma Facebook Page</li>
          </ul>
        </div>
        <div>
          <h4 class="font-medium text-gray-800">2. YouTube</h4>
          <ul class="list-disc list-inside mt-1 space-y-1">
            <li>Vai a <a href="https://console.cloud.google.com" target="_blank" class="text-blue-600 hover:underline">Google Cloud Console</a> e cria um projeto</li>
            <li>Ativa a YouTube Data API v3</li>
            <li>Cria credenciais OAuth 2.0 (Web application)</li>
            <li>Configura o redirect URI: <code class="bg-gray-100 px-1 rounded">http://localhost:3001/api/platforms/youtube/callback</code></li>
            <li>Copia o Client ID e Client Secret para o ficheiro <code class="bg-gray-100 px-1 rounded">.env</code></li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
