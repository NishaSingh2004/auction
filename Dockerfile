# Use Node 20 Alpine as base image for a small footprint
FROM node:20-alpine

# Build tools required to compile native modules (sqlite3) when no prebuilt binary is available
RUN apk add --no-cache python3 make g++

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install production dependencies
RUN npm install

# Bundle app source
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the application
CMD [ "node", "app.js" ]
