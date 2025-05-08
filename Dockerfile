FROM node:22

RUN apt-get update && \
    apt-get install -y jq && \
    rm -rf /var/lib/apt/lists/*

# Install dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./

RUN if [ -f pnpm-lock.yaml ]; then \
      npm install -g pnpm && pnpm install; \
    else \
      npm install; \
    fi

RUN npm install -g tsx

COPY . .


# Copy your script into a directory in PATH
RUN chmod +x /app/run.sh

# Default to bash if no command is provided
ENTRYPOINT ["/bin/bash", "-c"]