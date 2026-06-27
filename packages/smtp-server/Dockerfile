FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/smtp-server/package.json ./packages/smtp-server/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm config set ignore-scripts true && pnpm install --config.minimumReleaseAge=0 --filter @guardmail/smtp-server...
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/smtp-server ./packages/smtp-server
RUN pnpm --filter @guardmail/shared build
RUN pnpm --filter @guardmail/smtp-server build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 25
CMD ["node", "packages/smtp-server/dist/index.js"]
