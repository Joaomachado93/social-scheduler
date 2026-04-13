import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePlatformsStore } from '../../stores/platforms.js';
import axios from 'axios';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  },
}));

describe('Platforms Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('fetchAccounts populates accounts', async () => {
    const mockAccounts = [
      { id: 1, platform: 'facebook', accountName: 'My Page', accountId: 'fb-123', createdAt: '2026-04-01' },
      { id: 2, platform: 'instagram', accountName: 'My IG', accountId: 'ig-456', createdAt: '2026-04-01' },
    ];
    vi.mocked(axios.get).mockResolvedValueOnce({ data: mockAccounts });

    const store = usePlatformsStore();
    await store.fetchAccounts();

    expect(axios.get).toHaveBeenCalledWith('/api/platforms');
    expect(store.accounts).toHaveLength(2);
    expect(store.accounts[0].platform).toBe('facebook');
  });

  it('sets loading state during fetch', async () => {
    vi.mocked(axios.get).mockImplementation(() => new Promise(resolve => {
      setTimeout(() => resolve({ data: [] }), 10);
    }));

    const store = usePlatformsStore();
    const promise = store.fetchAccounts();

    expect(store.loading).toBe(true);
    await promise;
    expect(store.loading).toBe(false);
  });

  it('getAuthUrl returns URL from API', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { url: 'https://facebook.com/oauth?client_id=123' },
    });

    const store = usePlatformsStore();
    const url = await store.getAuthUrl('facebook');

    expect(axios.get).toHaveBeenCalledWith('/api/platforms/facebook/auth-url');
    expect(url).toBe('https://facebook.com/oauth?client_id=123');
  });

  it('disconnect removes account from local array', async () => {
    vi.mocked(axios.delete).mockResolvedValueOnce({ data: { success: true } });

    const store = usePlatformsStore();
    store.accounts = [
      { id: 1, platform: 'facebook', accountName: 'Keep', accountId: 'fb-1', createdAt: '' },
      { id: 2, platform: 'instagram', accountName: 'Remove', accountId: 'ig-1', createdAt: '' },
    ];

    await store.disconnect(2);

    expect(axios.delete).toHaveBeenCalledWith('/api/platforms/2');
    expect(store.accounts).toHaveLength(1);
    expect(store.accounts[0].id).toBe(1);
  });

  it('getByPlatform filters correctly', () => {
    const store = usePlatformsStore();
    store.accounts = [
      { id: 1, platform: 'facebook', accountName: 'FB 1', accountId: 'fb-1', createdAt: '' },
      { id: 2, platform: 'facebook', accountName: 'FB 2', accountId: 'fb-2', createdAt: '' },
      { id: 3, platform: 'instagram', accountName: 'IG 1', accountId: 'ig-1', createdAt: '' },
    ];

    expect(store.getByPlatform('facebook')).toHaveLength(2);
    expect(store.getByPlatform('instagram')).toHaveLength(1);
    expect(store.getByPlatform('youtube')).toHaveLength(0);
  });
});
