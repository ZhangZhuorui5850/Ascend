ARG NODE_IMAGE=node:24.18.0-bookworm-slim
FROM ${NODE_IMAGE} AS deps
WORKDIR /gateway
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM ${NODE_IMAGE}
WORKDIR /gateway
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 gateway \
    && useradd --system --uid 1001 --gid gateway gateway \
    && mkdir -p /var/lib/ascend-judge-gateway \
    && chown -R gateway:gateway /var/lib/ascend-judge-gateway
COPY --from=deps /gateway/node_modules ./node_modules
COPY services/judge-gateway ./services/judge-gateway
USER gateway
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4100/health',{headers:{authorization:'Bearer '+process.env.ASCEND_JUDGE_GATEWAY_TOKEN}}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "services/judge-gateway/server.mjs"]
