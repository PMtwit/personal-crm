# syntax=docker/dockerfile:1

# App image: the Next.js standalone server plus the database scripts.
# The deploy runs it as a one-off container to apply migrations, then as the app.

FROM node:24-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS build
# pnpm of the version pinned in package.json
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# The build loads the database module but never connects to it:
# the real address comes from the server's .env when the container starts
RUN DOCKER_BUILD=1 DATABASE_URL=postgres://build@localhost/build pnpm build
# The server has its own bundled copy of drizzle-orm; the scripts need the package
RUN cp -RL node_modules/drizzle-orm /tmp/drizzle-orm

FROM base AS runner
LABEL org.opencontainers.image.source=https://github.com/PMtwit/personal-crm
# The scripts import .ts files that sit under the server's CommonJS package.json:
# Node loads them as ES modules just fine, its warning about that is only noise
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NODE_OPTIONS=--disable-warning=MODULE_TYPELESS_PACKAGE_JSON
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build /tmp/drizzle-orm ./node_modules/drizzle-orm
COPY drizzle ./drizzle
COPY src/db/schema.ts ./src/db/
COPY scripts/migrate.mts scripts/seed.mts scripts/seed-data.ts ./scripts/
USER node
EXPOSE 3000
CMD ["node", "server.js"]
