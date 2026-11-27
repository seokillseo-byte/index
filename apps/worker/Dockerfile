FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY apps/worker/package.json ./package.json
RUN npm install --omit=dev --ignore-scripts
COPY apps/worker/src ./src
USER node
CMD ["node","src/outbox-relay.mjs"]
