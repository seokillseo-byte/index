FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @index-assist/api... --no-frozen-lockfile
COPY apps/api apps/api
RUN pnpm --filter @index-assist/api build

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY apps/api/package.json ./package.json
RUN npm install --omit=dev
COPY --from=build /workspace/apps/api/dist ./dist
USER node
EXPOSE 4000
CMD ["node","dist/main.js"]
