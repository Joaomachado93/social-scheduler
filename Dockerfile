FROM node:20-slim

# Install pnpm and ffmpeg (for video watermark)
RUN npm install -g pnpm && apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build frontend + backend (backend build also copies migrations into dist/)
RUN pnpm --filter frontend build
RUN pnpm --filter backend build

# Expose port
EXPOSE 3001

# Start in production mode
ENV NODE_ENV=production
CMD ["node", "backend/dist/index.js"]
