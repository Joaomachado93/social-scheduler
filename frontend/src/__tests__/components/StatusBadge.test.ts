import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import StatusBadge from '../../components/StatusBadge.vue';

describe('StatusBadge', () => {
  it('renders "Publicado" for published status with green classes', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'published' } });
    expect(wrapper.text()).toBe('Publicado');
    expect(wrapper.classes()).toContain('bg-green-100');
    expect(wrapper.classes()).toContain('text-green-700');
  });

  it('renders "Falhado" for failed status with red classes', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'failed' } });
    expect(wrapper.text()).toBe('Falhado');
    expect(wrapper.classes()).toContain('bg-red-100');
    expect(wrapper.classes()).toContain('text-red-700');
  });

  it('renders "Agendado" for scheduled status with blue classes', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'scheduled' } });
    expect(wrapper.text()).toBe('Agendado');
    expect(wrapper.classes()).toContain('bg-blue-100');
    expect(wrapper.classes()).toContain('text-blue-700');
  });

  it('renders "Rascunho" for draft status', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'draft' } });
    expect(wrapper.text()).toBe('Rascunho');
    expect(wrapper.classes()).toContain('bg-gray-100');
  });

  it('renders "A processar" for processing status', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'processing' } });
    expect(wrapper.text()).toBe('A processar');
    expect(wrapper.classes()).toContain('bg-yellow-100');
  });

  it('renders "Parcial" for partial status', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'partial' } });
    expect(wrapper.text()).toBe('Parcial');
    expect(wrapper.classes()).toContain('bg-orange-100');
  });

  it('renders raw status for unknown values', () => {
    const wrapper = mount(StatusBadge, { props: { status: 'unknown_status' } });
    expect(wrapper.text()).toBe('unknown_status');
    expect(wrapper.classes()).toContain('bg-gray-100');
  });
});
