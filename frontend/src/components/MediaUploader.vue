<script setup lang="ts">
import { ref } from 'vue';
import axios from 'axios';

interface MediaFile {
  id: number;
  mediaType: string;
  processingStatus: string;
  originalUrl?: string;
}

const props = defineProps<{ modelValue: MediaFile[] }>();
const emit = defineEmits<{ 'update:modelValue': [files: MediaFile[]] }>();

const uploading = ref(false);
const dragOver = ref(false);

async function handleFiles(files: FileList | null) {
  if (!files) return;
  uploading.value = true;

  for (const file of Array.from(files)) {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await axios.post('/api/media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      emit('update:modelValue', [...props.modelValue, { ...data, originalUrl: URL.createObjectURL(file) }]);
    } catch (err: any) {
      console.error('Upload failed:', err);
    }
  }

  uploading.value = false;
}

function onDrop(e: DragEvent) {
  dragOver.value = false;
  handleFiles(e.dataTransfer?.files || null);
}

function onFileInput(e: Event) {
  const input = e.target as HTMLInputElement;
  handleFiles(input.files);
  input.value = '';
}

function removeFile(index: number) {
  const updated = [...props.modelValue];
  const removed = updated.splice(index, 1)[0];
  axios.delete(`/api/media/${removed.id}`).catch(() => {});
  emit('update:modelValue', updated);
}
</script>

<template>
  <div>
    <div
      @dragover.prevent="dragOver = true"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
      :class="['border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer',
        dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400']"
      @click="($refs.fileInput as HTMLInputElement).click()"
    >
      <input
        ref="fileInput"
        type="file"
        multiple
        accept="image/*,video/*"
        class="hidden"
        @change="onFileInput"
      />
      <p v-if="uploading" class="text-gray-500">A carregar...</p>
      <p v-else class="text-gray-500">
        Arrasta ficheiros ou clica para selecionar<br>
        <span class="text-sm text-gray-400">Imagens e vídeos (max 500MB)</span>
      </p>
    </div>

    <div v-if="modelValue.length" class="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
      <div v-for="(file, i) in modelValue" :key="file.id" class="relative group">
        <div class="aspect-square bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
          <img
            v-if="file.mediaType === 'image' && file.originalUrl"
            :src="file.originalUrl"
            class="w-full h-full object-cover"
          />
          <div v-else class="text-center text-gray-400">
            <span class="text-3xl">{{ file.mediaType === 'video' ? '🎬' : '🖼️' }}</span>
            <p class="text-xs mt-1">{{ file.mediaType }}</p>
          </div>
        </div>

        <div
          v-if="file.processingStatus === 'processing'"
          class="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center"
        >
          <span class="text-white text-sm">Watermark...</span>
        </div>

        <button
          @click.stop="removeFile(i)"
          class="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
        >
          X
        </button>
      </div>
    </div>
  </div>
</template>
