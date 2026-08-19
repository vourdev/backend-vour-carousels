FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /app

# Install Node.js 20
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Full install (incl. devDeps) so esbuild/tsx are available to build from source.
COPY package*.json ./
RUN npm ci

# Build dist/ inside the image, then drop devDeps to slim the runtime layer.
# dist is intentionally git-ignored in the build context (.dockerignore) and
# rebuilt here, so a stale committed dist can never ship.
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY healthcheck.js ./
RUN npm run build && npm prune --omit=dev

EXPOSE 3000 3001

CMD ["node", "dist/server.js"]
