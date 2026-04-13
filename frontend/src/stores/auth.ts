import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import axios from 'axios';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '');
  const user = ref<{ id: number; email: string } | null>(null);

  const isAuthenticated = computed(() => !!token.value);

  function setAuth(t: string, u: { id: number; email: string }) {
    token.value = t;
    user.value = u;
    localStorage.setItem('token', t);
    axios.defaults.headers.common['Authorization'] = `Bearer ${t}`;
  }

  function logout() {
    token.value = '';
    user.value = null;
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
  }

  // Restore token on load
  if (token.value) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token.value}`;
  }

  async function login(email: string, password: string) {
    const { data } = await axios.post('/api/auth/login', { email, password });
    setAuth(data.token, data.user);
  }

  async function register(email: string, password: string) {
    const { data } = await axios.post('/api/auth/register', { email, password });
    setAuth(data.token, data.user);
  }

  return { token, user, isAuthenticated, login, register, logout };
});
