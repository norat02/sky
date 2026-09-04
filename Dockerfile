FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY api ./api
EXPOSE 4000
CMD ["node", "server/index.mjs"]
