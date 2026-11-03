# Optional: run model-written code in a container instead of directly on your machine.
FROM node:20-bookworm
RUN apt-get update && apt-get install -y python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["python3", "run_eval.py", "selftest"]
