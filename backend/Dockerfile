# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npm run build

# Stage 2: Production Runner
FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Create unprivileged uploads directory
RUN mkdir -p /app/uploads/secure_records && chown -R node:node /app

USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:5000/api/v1/health || exit 1

CMD ["node", "dist/index.js"]
