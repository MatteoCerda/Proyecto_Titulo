FROM node:20-alpine AS build
WORKDIR /app

# Install deps first
# Copiamos solo package.json para evitar lockfiles con BOM
COPY package.json ./
# Evitamos uso de lockfile si este tiene BOM; puedes volver a npm ci cuando lo normalices
RUN apk add --no-cache openssl \
 && npm install --no-audit --no-fund

# Copy sources
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

# Prisma generate + build
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
RUN apk add --no-cache openssl mariadb-client
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist

# Expose port
EXPOSE 3000

# Run migrations then start (DB readiness handled by compose healthcheck)
CMD ["/bin/sh","-c","npx prisma migrate deploy && node dist/server.js"]
