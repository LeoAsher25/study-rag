FROM node:20-alpine

WORKDIR /app

# Dùng Yarn thay cho npm
RUN npm install -g yarn

COPY package.json ./

RUN yarn install --production=false

COPY . .

RUN yarn build

EXPOSE 4001

CMD ["node", "dist/main.js"]
