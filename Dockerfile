# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build && npm prune --omit=dev --legacy-peer-deps

# Production stage: a small Node server serves dist/ and the interpretation API routes.
# Pass the key at run time, never at build time:
#   docker run -p 8080:8080 -e ANTHROPIC_API_KEY=... voicearchitect
FROM node:24-alpine AS production

WORKDIR /app
ENV NODE_ENV=production PORT=8080

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/types ./src/types

USER node
EXPOSE 8080

CMD ["node", "server/serve.ts"]
