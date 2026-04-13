<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { usePostsStore, type Post } from '../stores/posts.js';
import StatusBadge from '../components/StatusBadge.vue';

const store = usePostsStore();

const now = new Date();
const currentYear = ref(now.getFullYear());
const currentMonth = ref(now.getMonth() + 1);
const calendarPosts = ref<Post[]>([]);

const monthLabel = computed(() => {
  const d = new Date(currentYear.value, currentMonth.value - 1);
  return d.toLocaleString('pt-PT', { month: 'long', year: 'numeric' });
});

const daysInMonth = computed(() => new Date(currentYear.value, currentMonth.value, 0).getDate());
const firstDayOfWeek = computed(() => {
  const d = new Date(currentYear.value, currentMonth.value - 1, 1).getDay();
  return d === 0 ? 6 : d - 1; // Monday = 0
});

const calendarDays = computed(() => {
  const days: Array<{ day: number | null; posts: Post[] }> = [];

  // Empty slots before first day
  for (let i = 0; i < firstDayOfWeek.value; i++) {
    days.push({ day: null, posts: [] });
  }

  for (let d = 1; d <= daysInMonth.value; d++) {
    const dateStr = `${currentYear.value}-${String(currentMonth.value).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayPosts = calendarPosts.value.filter(p => p.scheduledAt.startsWith(dateStr));
    days.push({ day: d, posts: dayPosts });
  }

  return days;
});

async function loadMonth() {
  calendarPosts.value = await store.fetchCalendar(currentYear.value, currentMonth.value);
}

function prevMonth() {
  if (currentMonth.value === 1) {
    currentMonth.value = 12;
    currentYear.value--;
  } else {
    currentMonth.value--;
  }
}

function nextMonth() {
  if (currentMonth.value === 12) {
    currentMonth.value = 1;
    currentYear.value++;
  } else {
    currentMonth.value++;
  }
}

onMounted(loadMonth);
watch([currentYear, currentMonth], loadMonth);
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold">Calendario</h2>
      <div class="flex items-center gap-4">
        <button @click="prevMonth" class="px-3 py-1 bg-white rounded-lg shadow hover:bg-gray-50">&lt;</button>
        <span class="font-medium capitalize w-48 text-center">{{ monthLabel }}</span>
        <button @click="nextMonth" class="px-3 py-1 bg-white rounded-lg shadow hover:bg-gray-50">&gt;</button>
      </div>
    </div>

    <div class="bg-white rounded-xl shadow overflow-hidden">
      <div class="grid grid-cols-7 bg-gray-50 border-b">
        <div v-for="day in ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom']" :key="day"
          class="py-2 text-center text-sm font-medium text-gray-500">
          {{ day }}
        </div>
      </div>

      <div class="grid grid-cols-7">
        <div
          v-for="(cell, i) in calendarDays"
          :key="i"
          class="min-h-[100px] border-b border-r p-2"
          :class="cell.day ? 'bg-white' : 'bg-gray-50'"
        >
          <span v-if="cell.day" class="text-sm text-gray-600">{{ cell.day }}</span>
          <div v-for="post in cell.posts" :key="post.id" class="mt-1">
            <div class="text-xs p-1 rounded bg-blue-50 truncate flex items-center gap-1">
              <StatusBadge :status="post.status" />
              <span class="truncate">{{ post.caption?.slice(0, 20) || '(sem texto)' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
