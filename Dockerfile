FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# 生产服务器在大陆，官方 registry 单请求 ~6s，走 npmmirror
# better-sqlite3 的预编译包不可用时，node-gyp 使用这套工具链完成兜底编译。
RUN sed -i \
      -e 's|deb.debian.org/debian|mirrors.aliyun.com/debian|g' \
      -e 's|security.debian.org/debian-security|mirrors.aliyun.com/debian-security|g' \
      /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && npm config set registry https://registry.npmmirror.com \
    && npm ci

FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm config set registry https://registry.npmmirror.com && npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts ./scripts
RUN mkdir -p /app/data /app/backups && chown -R nextjs:nodejs /app/data /app/backups
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
