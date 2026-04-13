<script setup lang="ts">
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold mb-6">Dashboard</h2>

    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div class="bg-white rounded-xl shadow p-6">
        <p class="text-sm text-gray-500">Total</p>
        <p class="text-3xl font-bold">0</p>
      </div>
      <div class="bg-white rounded-xl shadow p-6">
        <p class="text-sm text-gray-500">Agendados</p>
        <p class="text-3xl font-bold text-blue-600">0</p>
      </div>
      <div class="bg-white rounded-xl shadow p-6">
        <p class="text-sm text-gray-500">Publicados</p>
        <p class="text-3xl font-bold text-green-600">0</p>
      </div>
      <div class="bg-white rounded-xl shadow p-6">
        <p class="text-sm text-gray-500">Falhados</p>
        <p class="text-3xl font-bold text-red-600">0</p>
      </div>
    </div>

    <div class="bg-white rounded-xl shadow p-6">
      <h3 class="text-lg font-semibold mb-4">Posts recentes</h3>
      <p class="text-gray-400">Nenhum post ainda. Cria o teu primeiro!</p>
    </div>
  </div>
</template>
