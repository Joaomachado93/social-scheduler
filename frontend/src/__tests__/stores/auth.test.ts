import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../../stores/auth.js';
import axios from 'axios';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    defaults: { headers: { common: {} } },
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('Auth Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorageMock.clear();
    axios.defaults.headers.common = {};
    vi.clearAllMocks();
  });

  it('starts unauthenticated', () => {
    const auth = useAuthStore();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.user).toBeNull();
  });

  it('login sets token and user', async () => {
    const mockResponse = {
      data: { token: 'jwt-token-123', user: { id: 1, email: 'test@test.com' } },
    };
    vi.mocked(axios.post).mockResolvedValueOnce(mockResponse);

    const auth = useAuthStore();
    await auth.login('test@test.com', 'password');

    expect(axios.post).toHaveBeenCalledWith('/api/auth/login', {
      email: 'test@test.com',
      password: 'password',
    });
    expect(auth.token).toBe('jwt-token-123');
    expect(auth.user?.email).toBe('test@test.com');
    expect(auth.isAuthenticated).toBe(true);
    expect(localStorage.getItem('token')).toBe('jwt-token-123');
    expect(axios.defaults.headers.common['Authorization']).toBe('Bearer jwt-token-123');
  });

  it('register sets token and user', async () => {
    const mockResponse = {
      data: { token: 'jwt-new-user', user: { id: 2, email: 'new@test.com' } },
    };
    vi.mocked(axios.post).mockResolvedValueOnce(mockResponse);

    const auth = useAuthStore();
    await auth.register('new@test.com', 'password');

    expect(axios.post).toHaveBeenCalledWith('/api/auth/register', {
      email: 'new@test.com',
      password: 'password',
    });
    expect(auth.isAuthenticated).toBe(true);
    expect(auth.user?.id).toBe(2);
  });

  it('logout clears everything', async () => {
    // First login
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { token: 'jwt-token', user: { id: 1, email: 'test@test.com' } },
    });

    const auth = useAuthStore();
    await auth.login('test@test.com', 'password');
    expect(auth.isAuthenticated).toBe(true);

    // Then logout
    auth.logout();
    expect(auth.token).toBe('');
    expect(auth.user).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
    expect(localStorage.getItem('token')).toBeNull();
    expect(axios.defaults.headers.common['Authorization']).toBeUndefined();
  });
});
