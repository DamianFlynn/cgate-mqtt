FROM node:22-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY src/package*.json ./

RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY src/ .

# C-Gate command port 20023 and event port 20025 are outbound TCP connections
# initiated by this process — no inbound ports are needed.
# EXPOSE is intentionally omitted.
CMD [ "node", "index.js" ]