FROM node:20-alpine

# Install system dependencies for sharp (native image processing)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    vips-dev \
    libheif-dev \
    libjpeg-turbo-dev \
    libpng-dev \
    libwebp-dev

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev"]
