FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

COPY . .

ARG NEXT_PUBLIC_API_URL=""
ARG INTERNAL_BACKEND_URL="http://backend:8040"

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV INTERNAL_BACKEND_URL=$INTERNAL_BACKEND_URL
ENV NODE_ENV=production
ENV PORT=3000

RUN npm run build

USER node

EXPOSE 3000

CMD ["npm", "start"]
