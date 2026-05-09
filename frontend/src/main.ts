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

// On 401, the token is stale or rejected (server JWT_SECRET rotated etc).
// Drop the local session and bounce to /login instead of spamming the
// console with retries against an invalid token. The login flow itself
// produces 401 on bad credentials but that path uses the response error
// directly, so we only react to 401s on requests that carried a token.
axios.interceptors.response.use(
  (r) => r,
  (err) => {
    if (
      err?.response?.status === 401 &&
      err.config?.headers?.Authorization?.toString().startsWith('Bearer ')
    ) {
      const hadToken = !!localStorage.getItem('token');
      localStorage.removeItem('token');
      delete axios.defaults.headers.common.Authorization;
      if (hadToken && !location.pathname.endsWith('/login')) {
        const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
        location.href = `${base}/login?stale=1`;
      }
    }
    return Promise.reject(err);
  },
);

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
