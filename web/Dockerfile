# What-If AI React + Vite Frontend (served by Nginx)
# Build from ./web context:
#   docker build -t whatif-web ./web

FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE=http://localhost:8080
ARG VITE_USE_FIXTURES=0
ENV VITE_API_BASE=${VITE_API_BASE} \
    VITE_USE_FIXTURES=${VITE_USE_FIXTURES}

RUN npm run build

FROM nginx:1.27-alpine

RUN apk add --no-cache wget

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

