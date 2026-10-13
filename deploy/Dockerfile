FROM oven/bun:1.3.9 AS bun
FROM node:24-bookworm-slim AS base
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app

FROM base AS build
RUN npm install --global pnpm@10.18.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY server ./server
COPY client ./client
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile
RUN node scripts/build-package.mjs bindings schema sdk maker-sdk

FROM build AS website-build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --dir client build

FROM base AS backend
RUN groupadd --gid 10001 depth && useradd --uid 10001 --gid depth --no-create-home depth
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/server ./server
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./package.json
COPY deploy/boot.mjs ./deploy/boot.mjs
RUN command -v flock && mkdir -p data/runtime && chown -R depth:depth data
USER depth
ENV NODE_ENV=production DEPTH_SERVICES_CLIENT=false DEPTH_LOG_STDOUT=true
EXPOSE 8787
CMD ["flock", "--nonblock", "--no-fork", "/app/data/runtime/container.lock", "node", "deploy/boot.mjs", "run"]

FROM node:24-bookworm-slim AS website
WORKDIR /app
COPY --from=website-build --chown=node:node /app/client/.next/standalone ./
COPY --from=website-build --chown=node:node /app/client/.next/static ./client/.next/static
COPY --from=website-build --chown=node:node /app/client/public ./client/public
USER node
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["node", "client/server.js"]
