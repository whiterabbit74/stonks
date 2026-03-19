# Frontend is pre-built locally (deploy.sh runs npm run build before sending to server)
# This stage just copies the ready dist/ into nginx — no Vite build on server
FROM nginx:stable
WORKDIR /usr/share/nginx/html

COPY dist/ /usr/share/nginx/html

# Nginx config (proxy /api → server:3001)
COPY ./docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]


