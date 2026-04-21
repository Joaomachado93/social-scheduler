<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { usePostsStore } from '../stores/posts.js';
import { useToast } from '../composables/useToast.js';
import PostForm from '../components/PostForm.vue';

const router = useRouter();
const route = useRoute();
const postsStore = usePostsStore();
const toast = useToast();

const formRef = ref<InstanceType<typeof PostForm>>();
const initialData = ref<any>(null);
const loading = ref(true);
const loadError = ref('');
const postId = Number(route.params.id);
const currentStatus = ref<string>('');

onMounted(async () => {
  try {
    const post = await postsStore.fetchPost(postId);

    if (!['draft', 'scheduled'].includes(post.status)) {
      loadError.value = 'Só podes editar posts com estado "Rascunho" ou "Agendado".';
      loading.value = false;
      return;
    }

    currentStatus.value = post.status;
    initialData.value = {
      caption: post.caption || '',
      scheduledAt: post.scheduledAt,
      platformAccountIds: post.platforms?.map((p: any) => p.platformAccountId) || [],
      mediaFiles: post.media || [],
    };
  } catch (e: any) {
    loadError.value = e.response?.data?.error || 'Erro ao carregar post';
  } finally {
    loading.value = false;
  }
});

async function handleSubmit(data: { caption: string; scheduledAt: string; platformAccountIds: number[]; mediaIds: number[]; status?: 'scheduled' | 'draft' }) {
  if (formRef.value) formRef.value.submitting = true;

  try {
    await postsStore.updatePost(postId, data);
    const promoted = currentStatus.value === 'draft' && data.status === 'scheduled';
    toast.success(
      data.status === 'draft' ? 'Rascunho guardado' :
      promoted ? 'Rascunho agendado' : 'Post atualizado'
    );
    router.push(`/posts/${postId}`);
  } catch (e: any) {
    const msg = e.response?.data?.error || 'Erro ao atualizar post';
    if (formRef.value) formRef.value.error = msg;
    toast.error(msg);
  } finally {
    if (formRef.value) formRef.value.submitting = false;
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <div class="flex items-center gap-4 mb-6">
      <button @click="router.back()" class="text-gray-400 hover:text-gray-600">
        ← Voltar
      </button>
      <h2 class="text-2xl font-bold">Editar Post</h2>
    </div>

    <div v-if="loading" class="text-gray-400">A carregar...</div>

    <div v-else-if="loadError" class="bg-red-50 text-red-600 p-4 rounded-lg">
      {{ loadError }}
    </div>

    <PostForm
      v-else-if="initialData"
      ref="formRef"
      :initial-data="initialData"
      :submit-label="currentStatus === 'draft' ? 'Agendar Post' : 'Guardar Alterações'"
      submitting-label="A guardar..."
      :allow-draft="currentStatus === 'draft'"
      @submit="handleSubmit"
    />
  </div>
</template>
