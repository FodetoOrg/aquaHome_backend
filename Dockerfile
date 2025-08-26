# syntax=docker/dockerfile:1
ARG NODE_VERSION=20.18.0
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"
WORKDIR /app
ENV NODE_ENV=production

FROM base AS build
RUN apt-get update -qq && apt-get install --no-install-recommends -y \
    build-essential node-gyp pkg-config python-is-python3

# install deps (clean)
COPY package*.json ./
RUN npm ci

# copy source & build
COPY . .
RUN npm run build

# prune dev deps for runtime
RUN npm prune --omit=dev

FROM base
WORKDIR /app
COPY --from=build /app /app

EXPOSE 3000
CMD ["npm","run","start"]
