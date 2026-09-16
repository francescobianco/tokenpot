FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production POOL_ENV=production PORT=3000 DATABASE_PATH=/app/data/pool.sqlite
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p data && chown -R node:node data transparency
USER node
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
