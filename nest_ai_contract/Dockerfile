FROM node:20-alpine

WORKDIR /app

# Dùng Yarn (qua Corepack trong Node 20)
RUN corepack enable

COPY package.json ./

RUN yarn install --production=false

COPY . .

RUN yarn build

EXPOSE 4001

CMD ["node", "dist/main.js"]
