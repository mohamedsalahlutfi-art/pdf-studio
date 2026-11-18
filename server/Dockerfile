FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY server/package.json ./package.json
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY server/server.js ./server.js
COPY server/public/ ./public/
USER node
EXPOSE 8787
CMD ["node","server.js"]
