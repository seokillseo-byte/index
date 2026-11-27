FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /workspace

FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @index-assist/api... --frozen-lockfile=false

FROM deps AS build
COPY apps/api apps/api
RUN pnpm --filter @index-assist/api build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /workspace/apps/api/dist ./dist
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/apps/api/node_modules ./node_modules
COPY --from=deps /workspace/apps/api/package.json ./package.json
USER node
EXPOSE 4000
CMD ["node","dist/main.js"]
