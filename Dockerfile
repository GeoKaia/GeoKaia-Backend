FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN DATABASE_URL="postgresql://u:p@localhost:5432/db" npx prisma generate
ENV NODE_ENV=production
EXPOSE 4000
USER node
CMD ["node", "src/index.js"]
