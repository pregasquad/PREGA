FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++ sqlite

COPY package*.json ./

RUN npm ci --include=dev

COPY . .

RUN npm run build

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

CMD ["/docker-entrypoint.sh"]
