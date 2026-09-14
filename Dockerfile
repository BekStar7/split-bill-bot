# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
RUN corepack enable
# pnpm-workspace.yaml carries allowBuilds, without which pnpm 10 silently skips
# better-sqlite3's native build and the binding is missing at runtime.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build && pnpm prune --prod

# ---- runtime stage ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache su-exec
RUN mkdir -p /app/data && chown node:node /app/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY drizzle ./drizzle
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
# Starts as root only to chown the mounted volume, then drops to `node`.
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
