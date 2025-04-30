FROM node:22
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN if [ -f pnpm-lock.yaml ]; then \
      npm install -g pnpm && pnpm install; \
    else \
      npm install; \
    fi
COPY . .
ENV NODE_ENV=production

ENTRYPOINT ["pnpm", "start"]
CMD ["--network=testnet", "--quantity=1"]