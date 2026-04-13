import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import PostCard from '../../components/PostCard.vue';
import type { Post } from '../../stores/posts.js';

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/posts/:id', component: { template: '<div />' } },
    { path: '/posts/:id/edit', component: { template: '<div />' } },
  ],
});

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 1,
    userId: 1,
    caption: 'Test post caption for testing purposes',
    scheduledAt: '2026-04-15T10:00:00',
    status: 'scheduled',
    createdAt: '2026-04-13T08:00:00',
    updatedAt: '2026-04-13T08:00:00',
    ...overrides,
  };
}

function mountCard(post: Post) {
  return mount(PostCard, {
    props: { post },
    global: { plugins: [router] },
  });
}

describe('PostCard', () => {
  it('renders post caption', () => {
    const wrapper = mountCard(makePost());
    expect(wrapper.text()).toContain('Test post caption');
  });

  it('truncates long captions', () => {
    const longCaption = 'A'.repeat(150);
    const wrapper = mountCard(makePost({ caption: longCaption }));
    expect(wrapper.text()).toContain('...');
  });

  it('renders formatted date', () => {
    const wrapper = mountCard(makePost());
    // Should contain date in pt-PT format
    expect(wrapper.text()).toMatch(/15\/04\/2026/);
  });

  it('shows edit button for scheduled posts', () => {
    const wrapper = mountCard(makePost({ status: 'scheduled' }));
    expect(wrapper.text()).toContain('Editar');
  });

  it('shows edit button for draft posts', () => {
    const wrapper = mountCard(makePost({ status: 'draft' }));
    expect(wrapper.text()).toContain('Editar');
  });

  it('hides edit button for published posts', () => {
    const wrapper = mountCard(makePost({ status: 'published' }));
    expect(wrapper.text()).not.toContain('Editar');
  });

  it('shows publish now button for scheduled posts', () => {
    const wrapper = mountCard(makePost({ status: 'scheduled' }));
    expect(wrapper.text()).toContain('Publicar agora');
  });

  it('shows publish now button for failed posts', () => {
    const wrapper = mountCard(makePost({ status: 'failed' }));
    expect(wrapper.text()).toContain('Publicar agora');
  });

  it('hides publish now for published posts', () => {
    const wrapper = mountCard(makePost({ status: 'published' }));
    expect(wrapper.text()).not.toContain('Publicar agora');
  });

  it('shows delete button for editable posts', () => {
    const wrapper = mountCard(makePost({ status: 'draft' }));
    expect(wrapper.text()).toContain('Eliminar');
  });

  it('hides delete button for published posts', () => {
    const wrapper = mountCard(makePost({ status: 'published' }));
    expect(wrapper.text()).not.toContain('Eliminar');
  });

  it('emits delete event', async () => {
    const wrapper = mountCard(makePost());
    const deleteBtn = wrapper.findAll('button').find(b => b.text() === 'Eliminar');
    await deleteBtn!.trigger('click');

    expect(wrapper.emitted('delete')).toBeTruthy();
    expect(wrapper.emitted('delete')![0]).toEqual([1]);
  });

  it('emits publishNow event', async () => {
    const wrapper = mountCard(makePost());
    const publishBtn = wrapper.findAll('button').find(b => b.text() === 'Publicar agora');
    await publishBtn!.trigger('click');

    expect(wrapper.emitted('publishNow')).toBeTruthy();
    expect(wrapper.emitted('publishNow')![0]).toEqual([1]);
  });

  it('links to post detail page', () => {
    const wrapper = mountCard(makePost({ id: 42 }));
    const link = wrapper.find('a');
    expect(link.attributes('href')).toBe('/posts/42');
  });
});
