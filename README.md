# Student Support Desk (Full-Stack)

A full-stack, responsive web application with an **Express backend** and an **Intelligent Automated Triage Response System** powered by Google Gemini API. Students submit academic or administrative inquiries, instantly receive an official preliminary guidance response, and track the status of their ticket in real time.

---

## Architecture Overview

- **Frontend**: Responsive, accessible vanilla HTML5, CSS3, and modern JavaScript (`index.html`, `style.css`, `script.js`).
- **Backend**: Node.js & Express REST API (`server.ts`) with persistent file storage (`data/requests.json`) and automated desk response generation.
- **Intelligent Response Engine**: Server-side Google GenAI (`gemini-3.8-flash`) analyzes the student's inquiry and crafts an immediate, structured guidance response with realistic review timelines and practical checklist items (with domain-tailored fallback when offline).

---

## Features

- **Full-Stack REST API**:
  - `GET /api/requests`: Retrieves all logged tickets with timestamps and desk responses.
  - `POST /api/requests`: Validates form inputs, assigns a sequential ID (`REQ-001`, `REQ-002`, ...), generates the automated triage response, and persists the ticket.
  - `PATCH /api/requests/:id/status`: Simulates administrative triage (`Submitted`, `In Progress`, `Resolved`).
  - `DELETE /api/requests/:id`: Removes a ticket with confirmation.
  - `POST /api/requests/seed`: Re-seeds sample student tickets.
  - `POST /api/requests/reset`: Clears all tickets on the server.
  - `GET /api/health`: Health status and Gemini AI readiness check.
- **Automated Triage Response upon Submission**:
  - As soon as a student submits their request, the backend immediately analyzes the ticket category and message to generate official preliminary guidance.
  - A modal dialog appears immediately on submission showing the ticket reference number, submission timestamp, and the full advisory guidance.
  - The response is also permanently attached to the ticket card in the Request Tracker for future reference.
- **Form Intake with Strict Validation**:
  - **Full Name** ($\ge 3$ characters).
  - **Student ID** (4–20 characters: letters, numbers, `/`, or `-`).
  - **Email** (valid university email format).
  - **Request Type** (Academic, Administrative, Other).
  - **Message** (10–500 characters with live character counter).
  - Validates on `blur` and `submit`, with accessible `aria-invalid` attributes and auto-focus on the first invalid field.
- **Security & Data Safety**:
  - Zero `innerHTML` used for user or response text rendering (all DOM nodes built strictly with `textContent`).
  - API keys remain 100% server-side in `server.ts` and are never exposed to the client browser.

---

## Setup & Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server (runs Express with Vite dev middleware on port 3000):
   ```bash
   npm run dev
   ```
3. Open your browser and navigate to `http://localhost:3000`.

### Building & Production Deployment

To build the frontend and run the production server:
```bash
npm run build
npm run start
```

---

## Environment Variables

Configure your `.env` file (copied from `.env.example`):

```bash
# Optional: GEMINI_API_KEY enables intelligent AI triage generation.
# If omitted, the server uses built-in domain-tailored advisory response templates.
GEMINI_API_KEY="your-gemini-api-key"
PORT=3000
```

---

## Where I Used References or AI

*Fill in your personal sources, documentation references, and AI tool usage below:*

- **Gemini API Integration**: Used `@google/genai` TypeScript SDK on the Express server to implement automated student triage responses with the `gemini-3.8-flash` model.
- **MDN Web Docs**:
  - Fetch API and REST request handling with JSON bodies.
  - Web Accessibility (`aria-invalid`, `role="status"`, `aria-live="polite"`).
  - CSS Grid responsive breakpoints and system typography tokens.
