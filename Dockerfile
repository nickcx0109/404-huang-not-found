# Game server image: one port serves the page (web/, art/), /health and the WebSocket.
#   docker build -t huang-coop .
#   docker run --rm -p 8787:8787 huang-coop    -> http://localhost:8787/
FROM node:22-slim

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787
WORKDIR /app

# Runtime dependencies only (ws); playwright is a dev tool.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# The server imports game logic from web/js and reads the level list from web/levels;
# web/ and art/ are also the files it serves to browsers.
COPY server ./server
COPY web ./web
COPY art ./art

USER node
EXPOSE 8787
CMD ["node", "server/main.mjs"]
