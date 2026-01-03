FROM node:20-alpine

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

COPY package*.json ./

# Use npm install to ensure package-lock is updated if needed, 
# but for production Docker it's usually better to have a solid lockfile.
# However, if the build is failing, npm install is safer for now.
RUN npm install

COPY . .

# Run the build script
RUN npm run build

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

# Ensure the entrypoint script is executable
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

CMD ["/docker-entrypoint.sh"]
