# API + NLP engine.  Build context is the REPO ROOT:  docker build -f src/server/Dockerfile -t risk-api .
FROM node:22-slim
WORKDIR /app

# The code resolves ../../data from src/server, so keep the repo layout inside the image.
COPY data ./data
COPY src/server/package*.json ./src/server/
WORKDIR /app/src/server
RUN npm ci || npm install

COPY src/server ./
# Precompute signals at build time (rules-only, offline) so the container starts instantly.
RUN npm run build:signals

ENV PORT=4000 NODE_ENV=production
EXPOSE 4000
CMD ["npm", "start"]
