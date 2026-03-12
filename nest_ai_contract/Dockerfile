FROM node:20-alpine

WORKDIR /app

RUN corepack enable

COPY package.json ./

RUN yarn install --production=false

COPY . .

# Generate Prisma client bên trong image
RUN npx prisma generate

RUN yarn build

EXPOSE 4001

CMD ["node", "dist/main.js"]