FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./

RUN npm ci --include=dev

COPY . .

RUN npm run build

RUN npm prune --production

EXPOSE 8000

ENV NODE_ENV=production
ENV PORT=8000
ENV DB_DIALECT=mysql

CMD ["npm", "run", "start"]
