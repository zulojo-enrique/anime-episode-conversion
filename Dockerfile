FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install

COPY tsconfig.json ./
COPY src/ ./src/

RUN pnpm run build

FROM node:20-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --prod

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data

EXPOSE 3001

CMD ["node", "dist/index.js"]
