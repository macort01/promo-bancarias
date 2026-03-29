FROM node:20-alpine

WORKDIR /app
COPY . .

WORKDIR /app/backend
RUN npm install --omit=dev

EXPOSE 3000
CMD ["npm", "start"]
