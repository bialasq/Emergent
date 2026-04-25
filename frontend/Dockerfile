FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* /app/
RUN npm ci --silent || npm install --silent
COPY . /app
ARG REACT_APP_BACKEND_URL=
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80

