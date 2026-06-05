import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import VideoCreatePostPage from '../pages/video/VideoCreatePostPage.vue';

vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
  },
}));

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
}

describe('VideoCreatePostPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('disables submit while no video file is selected', async () => {
    const wrapper = mount(VideoCreatePostPage, {
      global: {
        plugins: [createPinia(), makeRouter()],
        stubs: { MediaUploader: true },
      },
    });
    const btn = wrapper.get('button[data-test="submit"]');
    expect(btn.attributes('disabled')).toBeDefined();
  });

  it('disables submit when MediaUploader emits constraint errors', async () => {
    const MediaUploaderStub = {
      name: 'MediaUploader',
      template: '<div class="media-uploader-stub" />',
      emits: ['update:modelValue', 'update:errors'],
    };

    const wrapper = mount(VideoCreatePostPage, {
      global: {
        plugins: [createPinia(), makeRouter()],
        stubs: { MediaUploader: MediaUploaderStub },
      },
    });

    // Simulate a file upload with a valid media file to satisfy hasMedia
    const uploaderEl = wrapper.findComponent(MediaUploaderStub);
    await uploaderEl.vm.$emit('update:modelValue', [
      { id: 1, mediaType: 'video', processingStatus: 'done' },
    ]);
    // Simulate constraint errors from the uploader
    await uploaderEl.vm.$emit('update:errors', ['container']);
    await wrapper.vm.$nextTick();

    const btn = wrapper.get('button[data-test="submit"]');
    expect(btn.attributes('disabled')).toBeDefined();
  });
});
