import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePostsStore } from '../../stores/posts.js';
import axios from 'axios';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  },
}));

describe('Posts Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('fetchPosts populates posts array', async () => {
    const mockPosts = [
      { id: 1, caption: 'Post 1', status: 'scheduled', scheduledAt: '2026-04-15T10:00:00' },
      { id: 2, caption: 'Post 2', status: 'published', scheduledAt: '2026-04-14T10:00:00' },
    ];
    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockPosts });

    const store = usePostsStore();
    await store.fetchPosts();

    expect(axios.get).toHaveBeenCalledWith('/api/posts', { params: undefined });
    expect(store.posts).toHaveLength(2);
    expect(store.posts[0].caption).toBe('Post 1');
  });

  it('fetchPosts with status filter', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: [] });

    const store = usePostsStore();
    await store.fetchPosts({ status: 'scheduled' });

    expect(axios.get).toHaveBeenCalledWith('/api/posts', { params: { status: 'scheduled' } });
  });

  it('fetchPost returns single post', async () => {
    const mockPost = { id: 1, caption: 'Single Post', platforms: [], media: [] };
    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockPost });

    const store = usePostsStore();
    const post = await store.fetchPost(1);

    expect(axios.get).toHaveBeenCalledWith('/api/posts/1');
    expect(post.caption).toBe('Single Post');
  });

  it('createPost sends correct data', async () => {
    const body = {
      caption: 'New post',
      scheduledAt: '2026-04-15T10:00:00',
      platformAccountIds: [1, 2],
      mediaIds: [5],
    };
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { id: 3, ...body } });

    const store = usePostsStore();
    const result = await store.createPost(body);

    expect(axios.post).toHaveBeenCalledWith('/api/posts', body);
    expect(result.id).toBe(3);
  });

  it('updatePost sends PUT request', async () => {
    vi.mocked(axios.put).mockResolvedValueOnce({ data: { id: 1, caption: 'Updated' } });

    const store = usePostsStore();
    const result = await store.updatePost(1, { caption: 'Updated' });

    expect(axios.put).toHaveBeenCalledWith('/api/posts/1', { caption: 'Updated' });
    expect(result.caption).toBe('Updated');
  });

  it('deletePost removes from local array', async () => {
    vi.mocked(axios.delete).mockResolvedValueOnce({ data: { success: true } });

    const store = usePostsStore();
    store.posts = [
      { id: 1, userId: 1, caption: 'Keep', scheduledAt: '', status: 'scheduled', createdAt: '', updatedAt: '' },
      { id: 2, userId: 1, caption: 'Delete', scheduledAt: '', status: 'draft', createdAt: '', updatedAt: '' },
    ];

    await store.deletePost(2);

    expect(axios.delete).toHaveBeenCalledWith('/api/posts/2');
    expect(store.posts).toHaveLength(1);
    expect(store.posts[0].id).toBe(1);
  });

  it('publishNow sends POST request', async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { id: 1, status: 'published' } });

    const store = usePostsStore();
    const result = await store.publishNow(1);

    expect(axios.post).toHaveBeenCalledWith('/api/posts/1/publish-now');
    expect(result.status).toBe('published');
  });

  it('fetchStats populates stats', async () => {
    const mockStats = { total: 10, scheduled: 3, published: 5, failed: 1, partial: 0, draft: 1, processing: 0 };
    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockStats });

    const store = usePostsStore();
    await store.fetchStats();

    expect(axios.get).toHaveBeenCalledWith('/api/dashboard/stats');
    expect(store.stats.total).toBe(10);
    expect(store.stats.scheduled).toBe(3);
  });

  it('fetchCalendar returns posts for month', async () => {
    const mockPosts = [{ id: 1, caption: 'April post', scheduledAt: '2026-04-15T10:00:00' }];
    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockPosts });

    const store = usePostsStore();
    const result = await store.fetchCalendar(2026, 4);

    expect(axios.get).toHaveBeenCalledWith('/api/calendar', { params: { year: 2026, month: 4 } });
    expect(result).toHaveLength(1);
  });
});
