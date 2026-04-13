import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const base = import.meta.env.BASE_URL;

const router = createRouter({
  history: createWebHistory(base),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../pages/LoginPage.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('../layouts/MainLayout.vue'),
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('../pages/DashboardPage.vue'),
        },
        {
          path: 'calendar',
          name: 'calendar',
          component: () => import('../pages/CalendarPage.vue'),
        },
        {
          path: 'posts',
          name: 'posts',
          component: () => import('../pages/PostsListPage.vue'),
        },
        {
          path: 'posts/create',
          name: 'create-post',
          component: () => import('../pages/CreatePostPage.vue'),
        },
        {
          path: 'posts/:id/edit',
          name: 'edit-post',
          component: () => import('../pages/EditPostPage.vue'),
        },
        {
          path: 'posts/:id',
          name: 'post-detail',
          component: () => import('../pages/PostDetailPage.vue'),
        },
        {
          path: 'platforms',
          name: 'platforms',
          component: () => import('../pages/PlatformsPage.vue'),
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('../pages/SettingsPage.vue'),
        },
      ],
    },
  ],
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login' };
  }
});

export default router;
