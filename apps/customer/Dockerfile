FROM node:22-bookworm-slim
WORKDIR /workspace
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @index-assist/customer build
ENV NODE_ENV=production PORT=3002 HOSTNAME=0.0.0.0
EXPOSE 3002
CMD ["pnpm","--filter","@index-assist/customer","start"]
