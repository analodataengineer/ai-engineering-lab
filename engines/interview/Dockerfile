FROM node:20-alpine

WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY interfaces/web/package.json interfaces/web/package.json
COPY services/session-api/package.json services/session-api/package.json
COPY engines/interview/package.json engines/interview/package.json
COPY agents/interview-agent/package.json agents/interview-agent/package.json
COPY evals/package.json evals/package.json
RUN npm install

COPY engines/interview engines/interview
RUN npm run build -w engines/interview

EXPOSE 3002
CMD ["npm", "run", "dev", "-w", "engines/interview"]
