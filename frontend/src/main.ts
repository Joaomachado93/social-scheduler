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

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
