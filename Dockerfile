FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# Build number is passed in by Jenkins so the running version is visible on the page
ARG APP_VERSION=dev

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server/ server/
COPY public/ public/
RUN sed -i "s/__APP_VERSION__/${APP_VERSION}/g" public/index.html

USER node
EXPOSE 3000

# Healthy only when the app is up AND the database is reachable
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server/index.js"]
