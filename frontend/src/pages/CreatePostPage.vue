<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { usePostsStore } from '../stores/posts.js';
import { useToast } from '../composables/useToast.js';
import PostForm from '../components/PostForm.vue';

const router = useRouter();
const postsStore = usePostsStore();
const toast = useToast();
const formRef = ref<InstanceType<typeof PostForm>>();

async function handleSubmit(data: { caption: string; scheduledAt: string; platformAccountIds: number[]; mediaIds: number[] }) {
  if (formRef.value) formRef.value.submitting = true;

  try {
    await postsStore.createPost(data);
    toast.success('Post agendado com sucesso');
    router.push('/');
  } catch (e: any) {
    const msg = e.response?.data?.error || 'Erro ao criar post';
    if (formRef.value) formRef.value.error = msg;
    toast.error(msg);
  } finally {
    if (formRef.value) formRef.value.submitting = false;
  }
}
</script>

<template>
  <div class="max-w-2xl">
    <h2 class="text-2xl font-bold mb-6">Novo Post</h2>
    <PostForm
      ref="formRef"
      submit-label="Agendar Post"
      submitting-label="A criar..."
      @submit="handleSubmit"
    />
  </div>
</template>
