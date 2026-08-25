# NOT the deploy path any more -- kept for building and running the app locally, and as
# the recipe the runtime base image on the VPS was originally derived from.
# CI stopped building images for deployment on 25 Aug 2026: this image is 2.6 GB because
# of the Playwright browsers, and the VPS link sustains 36 KB/s. Deploys now rsync dist/
# plus the pruned node_modules and assemble the image on the box. See
# .github/workflows/deploy-vps.yml and deploy/ci-deploy-backend.sh.

FROM mcr.microsoft.com/playwright:v1.62.1-jammy

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
