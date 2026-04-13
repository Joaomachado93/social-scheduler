<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const auth = useAuthStore();
const router = useRouter();

const email = ref('');
const password = ref('');
const isRegister = ref(false);
const error = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    if (isRegister.value) {
      await auth.register(email.value, password.value);
    } else {
      await auth.login(email.value, password.value);
    }
    router.push('/');
  } catch (e: any) {
    error.value = e.response?.data?.error || 'Erro ao autenticar';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-900">
    <div class="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
      <h1 class="text-2xl font-bold text-center mb-2">Social Scheduler</h1>
      <p class="text-gray-500 text-center mb-8">
        {{ isRegister ? 'Criar conta' : 'Entrar na conta' }}
      </p>

      <form @submit.prevent="submit" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            v-model="email"
            type="email"
            required
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="email@exemplo.com"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            v-model="password"
            type="password"
            required
            minlength="6"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="Min. 6 caracteres"
          />
        </div>

        <div v-if="error" class="text-red-500 text-sm bg-red-50 p-3 rounded-lg">
          {{ error }}
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {{ loading ? 'A processar...' : isRegister ? 'Criar conta' : 'Entrar' }}
        </button>
      </form>

      <p class="mt-6 text-center text-sm text-gray-500">
        {{ isRegister ? 'Já tens conta?' : 'Não tens conta?' }}
        <button
          @click="isRegister = !isRegister; error = ''"
          class="text-blue-600 hover:underline font-medium"
        >
          {{ isRegister ? 'Entrar' : 'Criar conta' }}
        </button>
      </p>
    </div>
  </div>
</template>
