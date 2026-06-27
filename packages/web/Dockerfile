FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/web/package.json ./packages/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm config set ignore-scripts true && pnpm install --config.minimumReleaseAge=0 --filter @guardmail/web...
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/web ./packages/web
RUN pnpm --filter @guardmail/shared build
RUN pnpm --filter @guardmail/web build

FROM nginx:alpine AS runtime
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["sh", "-c", "sed -i \"s|%VITE_API_URL%|${VITE_API_URL}|g\" /usr/share/nginx/html/index.html && nginx -g 'daemon off;'"]
