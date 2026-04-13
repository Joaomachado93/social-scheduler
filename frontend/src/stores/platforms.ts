import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';

export interface PlatformAccount {
  id: number;
  platform: 'facebook' | 'instagram' | 'youtube';
  accountName: string;
  accountId: string;
  createdAt: string;
}

export const usePlatformsStore = defineStore('platforms', () => {
  const accounts = ref<PlatformAccount[]>([]);
  const loading = ref(false);

  async function fetchAccounts() {
    loading.value = true;
    try {
      const { data } = await axios.get('/api/platforms');
      accounts.value = data;
    } finally {
      loading.value = false;
    }
  }

  async function getAuthUrl(platform: string): Promise<string> {
    const { data } = await axios.get(`/api/platforms/${platform}/auth-url`);
    return data.url;
  }

  async function disconnect(id: number) {
    await axios.delete(`/api/platforms/${id}`);
    accounts.value = accounts.value.filter(a => a.id !== id);
  }

  function getByPlatform(platform: string) {
    return accounts.value.filter(a => a.platform === platform);
  }

  return { accounts, loading, fetchAccounts, getAuthUrl, disconnect, getByPlatform };
});
