FROM node:20-bullseye
RUN corepack enable
WORKDIR /workspace

# Manifiestos del monorepo (en la raíz)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./

# Código de la API (no hay package.json dentro de api en Nx integrado)
COPY api/ api/

# Instalar dependencias del monorepo
RUN pnpm install --no-frozen-lockfile

# Generar Prisma Client usando el schema de la API
RUN pnpm dlx prisma generate --schema=api/prisma/schema.prisma

# Build de la API con Nx
RUN pnpm nx build api

EXPOSE 3000

# Al iniciar el contenedor: aplicar migraciones y arrancar
CMD bash -lc "pnpm dlx prisma migrate deploy --schema=api/prisma/schema.prisma && node dist/api/main.js"