FROM node:20-alpine

WORKDIR /app

# Dùng Yarn thay cho npm
RUN npm install -g yarn

COPY package.json ./

RUN yarn install --production=false

COPY . .

RUN yarn build

EXPOSE 4000

CMD ["yarn", "start", "--", "-p", "4000"]

