import { defineStore } from 'pinia';
import { ref } from 'vue';
import axios from 'axios';

export interface Post {
  id: number;
  userId: number;
  caption: string | null;
  scheduledAt: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  platforms?: any[];
  media?: any[];
}

export interface DashboardStats {
  total: number;
  scheduled: number;
  published: number;
  failed: number;
  partial: number;
  draft: number;
  processing: number;
}

export const usePostsStore = defineStore('posts', () => {
  const posts = ref<Post[]>([]);
  const stats = ref<DashboardStats>({ total: 0, scheduled: 0, published: 0, failed: 0, partial: 0, draft: 0, processing: 0 });
  const upcoming = ref<Post[]>([]);
  const recent = ref<Post[]>([]);
  const loading = ref(false);

  async function fetchPosts(query?: { status?: string; from?: string; to?: string }) {
    const { data } = await axios.get('/api/posts', { params: query });
    posts.value = data;
  }

  async function fetchPost(id: number): Promise<Post> {
    const { data } = await axios.get(`/api/posts/${id}`);
    return data;
  }

  async function createPost(body: { caption: string; scheduledAt: string; platformAccountIds: number[]; mediaIds: number[] }) {
    const { data } = await axios.post('/api/posts', body);
    return data;
  }

  async function updatePost(id: number, body: any) {
    const { data } = await axios.put(`/api/posts/${id}`, body);
    return data;
  }

  async function deletePost(id: number) {
    await axios.delete(`/api/posts/${id}`);
    posts.value = posts.value.filter(p => p.id !== id);
  }

  async function publishNow(id: number) {
    const { data } = await axios.post(`/api/posts/${id}/publish-now`);
    return data;
  }

  async function fetchStats() {
    const { data } = await axios.get('/api/dashboard/stats');
    stats.value = data;
  }

  async function fetchUpcoming() {
    const { data } = await axios.get('/api/dashboard/upcoming');
    upcoming.value = data;
  }

  async function fetchRecent() {
    const { data } = await axios.get('/api/dashboard/recent');
    recent.value = data;
  }

  async function fetchCalendar(year: number, month: number) {
    const { data } = await axios.get('/api/calendar', { params: { year, month } });
    return data as Post[];
  }

  return {
    posts, stats, upcoming, recent, loading,
    fetchPosts, fetchPost, createPost, updatePost, deletePost, publishNow,
    fetchStats, fetchUpcoming, fetchRecent, fetchCalendar,
  };
});
