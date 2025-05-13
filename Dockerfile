FROM node:22

RUN apt-get update && apt-get install -y jq bash dos2unix

WORKDIR /app

RUN mkdir -p /app/work
RUN mkdir -p /app/work/pid

COPY package.json pnpm-lock.yaml* ./

RUN if [ -f pnpm-lock.yaml ]; then \
      npm install -g pnpm && pnpm install; \
    else \
      npm install; \
    fi

RUN npm install -g tsx

COPY . .

RUN find /app -type f -name "*.sh" -exec dos2unix {} \;
RUN chmod +x /app/*.sh

#ENTRYPOINT ["/bin/bash", "-c"]
ENTRYPOINT ["bash", "-c", "dos2unix /app/*.sh && while true; do echo \"[tvt] Container is up - $(date)\"; sleep 10; done"]
