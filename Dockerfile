FROM node:23-alpine AS build

WORKDIR /app

COPY . .

ARG BACKEND_URL

ENV VITE_BACKEND_URL=$BACKEND_URL

RUN npm install

RUN npm run build

FROM nginx:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx/nginx.conf /etc/nginx/conf.d

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]