# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig*.json vite.config.ts index.html ./
RUN npm ci

COPY public/ ./public/
COPY src/ ./src/
RUN npm run build

# Stage 2: Web Server
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
