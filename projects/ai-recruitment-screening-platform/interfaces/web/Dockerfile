FROM node:20-alpine

WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY interfaces/web/package.json interfaces/web/package.json
COPY services/session-api/package.json services/session-api/package.json
COPY engines/interview/package.json engines/interview/package.json
COPY agents/interview-agent/package.json agents/interview-agent/package.json
RUN npm install

COPY interfaces/web interfaces/web
RUN npm run build -w interfaces/web

EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "interfaces/web"]
