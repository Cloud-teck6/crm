# ---- Build stage ----
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Build deps for argon2 native bindings
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

EXPOSE 4000
# migrate deploy is run by docker-compose command; image just starts the server.
CMD ["node", "dist/main.js"]
