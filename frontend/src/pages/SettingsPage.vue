<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';
import { useToast } from '../composables/useToast.js';

const hasLogo = ref(false);
const logoUrl = ref('');
const uploading = ref(false);
const dragOver = ref(false);
const toast = useToast();

onMounted(async () => {
  await checkLogo();
});

async function checkLogo() {
  const { data } = await axios.get('/api/settings/logo');
  hasLogo.value = data.hasLogo;
  if (data.hasLogo) {
    logoUrl.value = `/api/settings/logo/file?t=${Date.now()}`;
  }
}

async function uploadLogo(files: FileList | null) {
  if (!files?.length) return;
  uploading.value = true;

  const formData = new FormData();
  formData.append('file', files[0]);

  try {
    await axios.post('/api/settings/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    toast.success('Logo atualizado');
  } catch {
    toast.error('Erro ao carregar logo');
  }

  uploading.value = false;
  await checkLogo();
}

function onDrop(e: DragEvent) {
  dragOver.value = false;
  uploadLogo(e.dataTransfer?.files || null);
}

function onFileInput(e: Event) {
  const input = e.target as HTMLInputElement;
  uploadLogo(input.files);
  input.value = '';
}

async function removeLogo() {
  try {
    await axios.delete('/api/settings/logo');
    hasLogo.value = false;
    logoUrl.value = '';
    toast.success('Logo removido');
  } catch {
    toast.error('Erro ao remover logo');
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <h2 class="text-2xl font-bold mb-6">Definições</h2>

    <!-- Watermark Logo -->
    <div class="bg-white rounded-xl shadow p-6">
      <h3 class="text-lg font-semibold mb-4">Logo Watermark</h3>
      <p class="text-sm text-gray-500 mb-4">
        Este logo será aplicado automaticamente como watermark em todas as imagens e vídeos.
        Posição: canto inferior direito, 15% do tamanho, 70% opacidade.
      </p>

      <!-- Current logo preview -->
      <div v-if="hasLogo" class="mb-4">
        <div class="inline-block p-4 bg-gray-100 rounded-lg">
          <img :src="logoUrl" alt="Watermark logo" class="max-w-[200px] max-h-[200px]" />
        </div>
        <div class="mt-3 flex gap-2">
          <label class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">
            Alterar logo
            <input type="file" accept="image/*" class="hidden" @change="onFileInput" />
          </label>
          <button @click="removeLogo" class="px-4 py-2 text-sm bg-red-100 text-red-600 rounded-lg hover:bg-red-200">
            Remover
          </button>
        </div>
      </div>

      <!-- Upload area (no logo yet) -->
      <div v-else>
        <div
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          @drop.prevent="onDrop"
          :class="['border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer',
            dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400']"
          @click="($refs.fileInput as HTMLInputElement).click()"
        >
          <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileInput" />
          <p v-if="uploading" class="text-gray-500">A carregar...</p>
          <p v-else class="text-gray-500">
            Arrasta o logo ou clica para selecionar<br>
            <span class="text-sm text-gray-400">PNG, JPG ou WEBP</span>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
