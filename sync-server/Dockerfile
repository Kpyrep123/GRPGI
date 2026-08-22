FROM node:22-alpine
WORKDIR /app
COPY package.json server.js market-engine.js ./
ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0
ENV DATA_DIR=/data
EXPOSE 8787
VOLUME ["/data"]
CMD ["node", "server.js"]
