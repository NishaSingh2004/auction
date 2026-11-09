# Use Node 20 Slim (Debian glibc) for fast pre-compiled native module support (sqlite3)
FROM node:20-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Bundle app source
COPY . .

# Set production environment
ENV NODE_ENV=production
EXPOSE 3000
EXPOSE 8080

# Start the application
CMD [ "node", "app.js" ]
