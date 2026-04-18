FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY src/ ./src/

# Cache bust v3
ENV PORT=8080
EXPOSE 8080

CMD ["npx", "tsx", "src/index.ts"]