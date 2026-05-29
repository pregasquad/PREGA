FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY lib/ lib/
COPY artifacts/api-server/ artifacts/api-server/

ENV npm_config_user_agent="pnpm/10.26.1 node/v24.0.0 linux x64"

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @workspace/api-server...

RUN pnpm --filter @workspace/api-server run build

FROM node:24-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/lib ./lib
COPY --from=base /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=base /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules
COPY --from=base /app/artifacts/api-server/package.json ./artifacts/api-server/package.json

EXPOSE 8080
ENV PORT=8080

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.js"]
