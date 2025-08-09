FROM node:20-alpine
WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm ci --no-audit --no-fund

COPY server ./server
# Ensure dotenv loads if mounted .env present at /app/.env
ENV NODE_ENV=production

ENV PORT=3001
EXPOSE 3001
CMD ["node", "server/server.js"]


