# workspace-map-mcp — prebuilt runtime image (contracts/packaging.md, research R7).
# CI builds dist/ BEFORE `docker build`; the image never compiles TypeScript.
FROM node:20-slim

ENV NODE_ENV=production
WORKDIR /app

# Production dependency install from the lockfile only — no lifecycle scripts.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Prebuilt server + WASM grammar assets.
COPY dist/ ./dist/
COPY assets/grammars/ ./assets/grammars/

USER node

# All server flags are appended by `docker run` (e.g. --workspace /workspace [--http --port 3579 --host 0.0.0.0]).
ENTRYPOINT ["node", "dist/index.js"]
