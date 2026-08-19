FROM mcr.microsoft.com/playwright:v1.61.1-jammy

WORKDIR /app

# Install Node.js 20
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist
COPY healthcheck.js ./

EXPOSE 3000 3001

CMD ["node", "dist/server.js"]
