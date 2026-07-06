
# AI Engineering Lab

A practical engineering lab for projects focused on Data, Generative AI, AI Agents, automation, dashboards, and scalable architectures applied to real business problems.

## Objective

This repository works as a technical portfolio to document and build projects related to data engineering, artificial intelligence, multi-agent systems, and process automation.

The main goal is to design simple, modular, secure, and scalable solutions while clearly separating deterministic business logic from AI-assisted reasoning.

## Areas of Work

- Data Engineering
- Generative AI
- AI Agents
- Multi-Agent Systems
- Dashboard Automation
- Business Intelligence
- API Integrations
- Workflow Automation
- Software Architecture
- Retrieval, Memory, and Tooling

## Included Projects

### 1. AI Data Dashboard Agents

A system designed to connect multiple data sources, process business information, and generate dynamic dashboards assisted by AI.

Planned data sources:

- SQL Server
- PostgreSQL
- MongoDB
- Excel / CSV
- Emails
- External APIs

Main components:

- Data connectors
- Backend API
- Agent orchestration layer
- Deterministic query and validation engine
- Dashboard generation
- Persistence and traceability

Status: design / MVP.

---

### 2. Parametric Insurance Multi-Agent POC

A proof of concept for a parametric insurance system based on external observations, deterministic rules, specialized agents, and traceable decisions.

Main components:

- Product engine
- Claims engine
- Oracle sources
- Event dispatcher
- Source agent
- Evaluation agent
- Settlement agent
- Subscription agent

Status: architecture and backend in progress.

---

### 3. Generative AI Learning Content

Educational content about generative AI, foundation models, LLMs, SLMs, agents, and practical use cases for both general and technical audiences.

Status: content in development.

## Architecture Principles

- Clear separation between AI reasoning, business rules, and persistence.
- Agents with specific responsibilities.
- Deterministic engines for critical validations.
- Traceability of events and decisions.
- Modular and extensible design.
- External configuration through environment variables.
- Docker-ready and reproducible execution.
- Security and observability considered from the beginning.

## Tech Stack

The stack may vary by project, but this lab mainly works with:

- Python
- Node.js / TypeScript
- PostgreSQL
- MongoDB
- Redis
- Docker
- REST APIs
- LLMs
- AI Agents
- Business Intelligence tools

## Suggested Structure

```text
ai-engineering-lab/
├── README.md
├── docs/
│   ├── architecture.md
│   ├── roadmap.md
│   └── decisions.md
├── projects/
│   ├── ai-data-dashboard-agents/
│   ├── parametric-insurance-poc/
│   └── genai-learning-content/
├── examples/
├── assets/
└── LICENSE
