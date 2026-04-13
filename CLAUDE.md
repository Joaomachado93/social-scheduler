# Social Media Scheduler

## O que é
Aplicação full-stack para agendar publicações no Facebook, Instagram e YouTube com watermark automática (logo fixo).

## Stack
- **Frontend:** Vue 3 + Vite + Tailwind CSS + Pinia + Vue Router
- **Backend:** Node.js + Fastify + TypeScript
- **Database:** SQLite via better-sqlite3 + Drizzle ORM
- **Media:** Sharp (imagens) + fluent-ffmpeg (vídeos)
- **Scheduler:** node-cron + DB polling
- **Auth:** bcrypt + JWT
- **Monorepo:** pnpm workspaces

## Comandos
```bash
pnpm dev              # Arranca backend + frontend
pnpm dev:backend      # Só backend (porta 3001)
pnpm dev:frontend     # Só frontend (porta 5173)
pnpm --filter backend db:generate   # Gerar migração Drizzle
pnpm --filter backend db:migrate    # Aplicar migrações
```

## Estrutura
```
social-scheduler/
├── backend/src/
│   ├── index.ts          # Entry point Fastify
│   ├── config.ts         # Variáveis de ambiente
│   ├── db/schema.ts      # Tabelas Drizzle (6 tabelas)
│   ├── routes/           # auth, posts, platforms, media, dashboard
│   ├── services/         # watermark, scheduler, publishers/, oauth/
│   └── middleware/auth.ts
├── frontend/src/
│   ├── pages/            # Login, Dashboard, Calendar, CreatePost, Platforms
│   ├── components/       # PostCard, PostForm, MediaUploader, StatusBadge
│   ├── stores/           # auth, posts, platforms (Pinia)
│   └── layouts/          # MainLayout com sidebar
└── .env                  # Secrets (META_APP_ID, GOOGLE_CLIENT_ID, etc.)
```

## APIs externas
- **Meta Graph API** (Facebook + Instagram) — OAuth2, scope: pages_manage_posts, instagram_content_publish
- **YouTube Data API v3** — OAuth2 via googleapis npm, scope: youtube.upload

## Watermark
- Logo fixo em `backend/watermark/logo.png`
- Posição: canto inferior direito, 15% da menor dimensão, opacidade 70%
- Processado no momento de guardar o post (não no publish)

## Convenções
- Backend em TypeScript com ESM (type: module)
- Rotas registadas como plugins Fastify
- DB queries com Drizzle ORM (não SQL raw)
- Frontend usa Composition API + script setup
- Stores Pinia para estado global
