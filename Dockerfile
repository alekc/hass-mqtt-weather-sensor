FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production || yarn --production
COPY . .
CMD ["node", "index.js"] 