FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY src/ ./src/

ENV PORT=3000
EXPOSE 3000

CMD ["npx", "tsx", "src/index.ts"]