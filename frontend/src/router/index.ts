import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const router = createRouter({
  history: createWebHistory(),
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
          path: 'posts/create',
          name: 'create-post',
          component: () => import('../pages/CreatePostPage.vue'),
        },
        {
          path: 'platforms',
          name: 'platforms',
          component: () => import('../pages/PlatformsPage.vue'),
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
