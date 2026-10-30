# =========================================================
# FRONTEND IMAGE - build React, then serve it with Nginx
# =========================================================

# ---------- Step 1: build the React website ----------
FROM node:22-alpine AS build

WORKDIR /app

# Exact package versions from package-lock.json
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The website calls the backend at /api (same address as the site).
ARG REACT_APP_API_BASE_URL=/api
ENV REACT_APP_API_BASE_URL=$REACT_APP_API_BASE_URL

# Don't publish source maps (keeps the original code private, saves memory).
ENV GENERATE_SOURCEMAP=false

RUN npm run build

# ---------- Step 2: serve the built website ----------
FROM nginx:stable-alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80