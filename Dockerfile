FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY lib/ lib/
COPY artifacts/pregasquad-manager/ artifacts/pregasquad-manager/

ENV npm_config_user_agent="pnpm/10.26.1 node/v24.0.0 linux x64"

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @workspace/pregasquad-manager...

RUN cd artifacts/pregasquad-manager && PORT=8000 BASE_PATH=/ pnpm run build

FROM node:24-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

COPY --from=base /app/artifacts/pregasquad-manager/dist ./artifacts/pregasquad-manager/dist
COPY --from=base /app/artifacts/pregasquad-manager/server.cjs ./artifacts/pregasquad-manager/server.cjs

EXPOSE 8000
ENV PORT=8000

CMD ["node", "artifacts/pregasquad-manager/server.cjs"]
