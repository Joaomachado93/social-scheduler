<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { useRouter } from 'vue-router';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const sidebarOpen = ref(false);

function logout() {
  auth.logout();
  router.push('/login');
}

function closeSidebar() {
  sidebarOpen.value = false;
}

const navItems = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/posts', label: 'Posts', icon: '📝' },
  { to: '/calendar', label: 'Calendário', icon: '📅' },
  { to: '/posts/create', label: 'Novo Post', icon: '➕' },
  { to: '/platforms', label: 'Plataformas', icon: '🔗' },
  { to: '/settings', label: 'Definições', icon: '⚙️' },
];
</script>

<template>
  <div class="flex h-screen bg-gray-100">
    <!-- Mobile overlay -->
    <div
      v-if="sidebarOpen"
      class="fixed inset-0 bg-black/50 z-30 lg:hidden"
      @click="closeSidebar"
    />

    <!-- Sidebar -->
    <aside
      :class="[
        'fixed lg:static inset-y-0 left-0 z-40 w-64 bg-gray-900 text-white flex flex-col transition-transform duration-200',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      ]"
    >
      <div class="p-6 border-b border-gray-700">
        <h1 class="text-xl font-bold">Social Scheduler</h1>
      </div>

      <nav class="flex-1 p-4 space-y-1">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors"
          :class="route.path === item.to
            ? 'bg-blue-600 text-white'
            : 'text-gray-300 hover:bg-gray-800 hover:text-white'"
          @click="closeSidebar"
        >
          <span>{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="p-4 border-t border-gray-700">
        <p class="text-sm text-gray-400 mb-2 truncate">{{ auth.user?.email }}</p>
        <button
          @click="logout"
          class="w-full px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          Sair
        </button>
      </div>
    </aside>

    <!-- Main content -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Mobile topbar -->
      <header class="lg:hidden flex items-center gap-3 px-4 py-3 bg-white shadow-sm">
        <button @click="sidebarOpen = true" class="p-2 -ml-2 rounded-lg hover:bg-gray-100">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span class="font-bold text-gray-900">Social Scheduler</span>
      </header>

      <main class="flex-1 overflow-auto p-4 md:p-8">
        <RouterView />
      </main>
    </div>
  </div>
</template>
