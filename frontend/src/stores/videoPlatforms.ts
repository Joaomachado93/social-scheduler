import { defineStore } from 'pinia';
import axios from 'axios';

type Account = { id: number; platform: 'youtube' | 'tiktok'; accountName: string | null; accountId: string; createdAt: string };

export const useVideoPlatformsStore = defineStore('videoPlatforms', {
  state: () => ({
    accounts: [] as Account[],
    capabilities: { youtube: { configured: false }, tiktok: { configured: false } },
  }),
  actions: {
    async fetchAccounts() {
      const { data } = await axios.get<Account[]>('/api/video/platforms');
      this.accounts = data;
    },
    async fetchCapabilities() {
      const { data } = await axios.get('/api/video/capabilities');
      this.capabilities = data;
    },
    async getAuthUrl(platform: 'youtube' | 'tiktok') {
      const { data } = await axios.get<{ url: string }>(`/api/video/${platform}/auth-url`);
      return data.url;
    },
    async disconnect(id: number) {
      await axios.delete(`/api/video/platforms/${id}`);
      this.accounts = this.accounts.filter(a => a.id !== id);
    },
  },
});
