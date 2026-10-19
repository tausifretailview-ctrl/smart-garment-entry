FROM node:20-alpine AS build
# Baileys pulls libsignal from GitHub, so npm needs git.
RUN apk add --no-cache git
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
# ffmpeg makes campaign videos Small (480p) / Medium (720p) before sending.
RUN apk add --no-cache git ffmpeg
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
ENV AUTH_DIR=/data/sessions PORT=8787
EXPOSE 8787
CMD ["node", "dist/server.js"]
