FROM node:10-slim
WORKDIR /pubg
ADD . /pubg

RUN npm install

CMD ["node","./index.js"]