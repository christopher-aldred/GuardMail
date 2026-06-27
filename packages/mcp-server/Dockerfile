FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/mcp-server/package.json ./packages/mcp-server/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm config set ignore-scripts true && pnpm install --config.minimumReleaseAge=0 --filter @guardmail/mcp-server...
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/mcp-server ./packages/mcp-server
RUN pnpm --filter @guardmail/shared build
RUN pnpm --filter @guardmail/mcp-server build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3001
CMD ["node", "packages/mcp-server/dist/http-server.js"]
