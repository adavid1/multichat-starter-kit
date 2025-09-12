# Multi-stage build for multichat app
FROM node:24-alpine AS base
WORKDIR /app
RUN npm install -g typescript

# -------------------------
# Install dependencies
# -------------------------
  FROM base AS deps

  # Copy package files
  COPY package*.json ./
  COPY server/package*.json ./server/
  COPY client/package*.json ./client/
  
  # Install all dependencies (including dev)
  RUN npm ci --ignore-scripts
  RUN cd server && npm ci --ignore-scripts
  RUN cd client && npm ci --ignore-scripts

# -------------------------
# Build client & server
# -------------------------
  FROM base AS builder
  WORKDIR /app
  
  # Copy everything
  COPY . .
  
  # Copy node_modules from deps stage
  COPY --from=deps /app/node_modules ./node_modules
  COPY --from=deps /app/server/node_modules ./server/node_modules
  COPY --from=deps /app/client/node_modules ./client/node_modules
  
  # Ensure devDependencies exist for server
  RUN cd server && npm install typescript --save-dev
  
  # 1️⃣ Build shared first
  RUN cd shared && npx tsc --build
  
  # 2️⃣ Build server and client
  RUN cd server && npx tsc --build
  RUN cd client && npm run build
  
  # -------------------------
  # Production image
  # -------------------------
  FROM node:18-alpine AS runner
  WORKDIR /app
  
  ENV NODE_ENV=production
  
  # Create app user
  RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 multichat
  
  # Copy built application
  COPY --from=builder /app/server ./server
  COPY --from=builder /app/shared ./shared
  COPY --from=builder /app/client/dist ./client/dist
  COPY --from=builder /app/client/public/twitchGlobalEmotes.json ./client/dist/
  COPY --from=builder /app/client/public/twitchGlobalBadges.json ./client/dist/
  
  # Install only production dependencies for server
  COPY server/package*.json ./server/
  RUN cd server && npm ci --only=production --ignore-scripts
  
  # Permissions
  RUN chown -R multichat:nodejs /app
  USER multichat
  
  EXPOSE 8787
  
  HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8787/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"
  
  CMD ["node", "server/dist/index.js"]
  