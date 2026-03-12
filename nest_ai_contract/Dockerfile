FROM node:20

WORKDIR /app

RUN corepack enable

COPY package.json ./

RUN yarn install --production=false

COPY . .

RUN npx prisma generate

RUN yarn build

EXPOSE 4001

CMD ["node", "dist/main.js"]