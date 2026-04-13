<script setup lang="ts">
</script>

<template>
  <div>
    <h2 class="text-2xl font-bold mb-6">Plataformas</h2>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="bg-white rounded-xl shadow p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">f</div>
          <h3 class="text-lg font-semibold">Facebook</h3>
        </div>
        <p class="text-sm text-gray-500 mb-4">Publica em páginas do Facebook</p>
        <button class="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          Conectar
        </button>
      </div>

      <div class="bg-white rounded-xl shadow p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 bg-gradient-to-br from-purple-600 to-pink-500 rounded-lg flex items-center justify-center text-white font-bold">ig</div>
          <h3 class="text-lg font-semibold">Instagram</h3>
        </div>
        <p class="text-sm text-gray-500 mb-4">Publica no Instagram Business</p>
        <button class="w-full py-2 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-lg hover:opacity-90 transition-opacity">
          Conectar
        </button>
      </div>

      <div class="bg-white rounded-xl shadow p-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center text-white font-bold">YT</div>
          <h3 class="text-lg font-semibold">YouTube</h3>
        </div>
        <p class="text-sm text-gray-500 mb-4">Upload de vídeos para o YouTube</p>
        <button class="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
          Conectar
        </button>
      </div>
    </div>
  </div>
</template>
