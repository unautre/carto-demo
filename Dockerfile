# syntax=docker/dockerfile:1

# ---- build: compile the app with Vite ----
# The output is static files, so build once on the runner's native platform
# and reuse it for every target architecture (no emulated npm install).
FROM --platform=$BUILDPLATFORM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build

# ---- runtime: serve dist/ with nginx ----
FROM nginx:stable-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
