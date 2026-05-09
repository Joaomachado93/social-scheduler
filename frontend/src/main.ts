import { createApp } from 'vue';
import { createPinia } from 'pinia';
import axios from 'axios';
import router from './router/index.js';
import App from './App.vue';
import './assets/main.css';

// Set API base URL for production (when not using Vite proxy)
if (import.meta.env.VITE_API_URL) {
  axios.defaults.baseURL = import.meta.env.VITE_API_URL;
}

// DEBUG (temporary, see #7-#10 401 reports). Logs every outgoing request and
// what Authorization header it sends. Remove once the live 401 issue is solved.
(window as any).axios = axios;
console.log('[DEBUG] startup token in localStorage:', localStorage.getItem('token')?.slice(0, 30) + '...');
console.log('[DEBUG] startup axios.defaults.headers.common:', JSON.stringify(axios.defaults.headers.common));
axios.interceptors.request.use((cfg) => {
  const auth = (cfg.headers as any)?.Authorization
    ?? (cfg.headers as any)?.authorization
    ?? axios.defaults.headers.common.Authorization;
  console.log(
    `[DEBUG] ${cfg.method?.toUpperCase()} ${cfg.url}`,
    'auth:', typeof auth === 'string' ? auth.slice(0, 25) + '...' : auth,
    'localStorage.token:', localStorage.getItem('token')?.slice(0, 25) + '...',
  );
  return cfg;
});
axios.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      console.warn(
        `[DEBUG] 401 on ${err.config?.method?.toUpperCase()} ${err.config?.url}`,
        'sent auth:', err.config?.headers?.Authorization?.slice?.(0, 25),
        'response body:', err.response?.data,
      );
    }
    return Promise.reject(err);
  },
);

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
