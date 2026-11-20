# ---- build frontend ----
FROM node:20-slim AS client-build
WORKDIR /app/client
COPY client/package.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# ---- runtime ----
FROM node:20-slim
WORKDIR /app/server
# native deps for sharp / better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends python3 build-essential \
  && rm -rf /var/lib/apt/lists/*
COPY server/package.json ./
RUN npm install --omit=dev
COPY server/ ./
COPY --from=client-build /app/client/dist ../client/dist

ENV PORT=3001
EXPOSE 3001
VOLUME ["/app/server/data"]
CMD ["node", "index.js"]
