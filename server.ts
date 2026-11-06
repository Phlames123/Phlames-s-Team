import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Initialize Google GenAI on the server side
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    })
  : null;

// File-based persistent storage for support requests
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "requests.json");

export interface SupportRequest {
  id: string;
  fullName: string;
  studentId: string;
  email: string;
  type: "Academic" | "Administrative" | "Other";
  message: string;
  status: "Submitted" | "In Progress" | "Resolved";
  response?: string;
  responseTimestamp?: string;
  createdAt: string;
  createdAtFormatted: string;
}

/**
 * Ensures data directory and requests.json exist on disk.
 */
function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    const initialSamples: SupportRequest[] = [
      {
        id: "REQ-001",
        fullName: "Maya Lin",
        studentId: "CS-2026/041",
        email: "maya.lin@university.edu",
        type: "Academic",
        message:
          "I need advisor approval to enroll in Advanced Algorithms (CS-402) as the prerequisite waiver was submitted last Friday.",
        status: "In Progress",
        response:
          "Hello Maya, your prerequisite waiver verification is currently under departmental review with the Computer Science Advising Committee. Typical review turnaround is 24 to 48 business hours. If approved, an electronic override permit will be attached to your student portal automatically.",
        responseTimestamp: new Date(Date.now() - 3600000 * 25).toISOString(),
        createdAt: new Date(Date.now() - 3600000 * 26).toISOString(),
        createdAtFormatted: "Yesterday, 10:15 AM",
      },
      {
        id: "REQ-002",
        fullName: "Marcus Davies",
        studentId: "ADM-9942/A",
        email: "m.davies@university.edu",
        type: "Administrative",
        message:
          "Requesting an updated proof of enrollment letter with official university seal for health insurance verification.",
        status: "Submitted",
        response:
          "Hello Marcus, thank you for submitting your document verification request. Official stamped enrollment letters are queued by the Registrar's Office daily at 11:00 AM and 3:00 PM. A PDF copy will be dispatched directly to your university inbox.",
        responseTimestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
        createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
        createdAtFormatted: "Today, 8:30 AM",
      },
      {
        id: "REQ-003",
        fullName: "Sophia Chen",
        studentId: "BIO-1088/2",
        email: "sophia.chen@university.edu",
        type: "Other",
        message:
          "My keycard access to the Science Building Annex stopped working after the weekend maintenance upgrade.",
        status: "Resolved",
        response:
          "Hello Sophia, Campus Security has synchronized the NFC door controllers across the Science Building Annex. Your student RFID credentials have been refreshed in the security database. Please tap your card at the exterior reader to test access.",
        responseTimestamp: new Date(Date.now() - 3600000 * 70).toISOString(),
        createdAt: new Date(Date.now() - 3600000 * 72).toISOString(),
        createdAtFormatted: "Nov 3, 2026, 2:45 PM",
      },
    ];
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialSamples, null, 2), "utf-8");
  }
}

/**
 * Reads all stored requests from requests.json.
 */
function readRequests(): SupportRequest[] {
  ensureStorage();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading requests.json:", err);
    return [];
  }
}

/**
 * Persists the requests array to requests.json.
 */
function writeRequests(requests: SupportRequest[]) {
  ensureStorage();
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(requests, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing requests.json:", err);
  }
}

/**
 * Computes next sequential ID (REQ-001, REQ-002, etc.).
 */
function getNextId(requests: SupportRequest[]): string {
  let highest = 0;
  for (const r of requests) {
    const match = r.id.match(/^REQ-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > highest) highest = num;
    }
  }
  return `REQ-${String(highest + 1).padStart(3, "0")}`;
}

/**
 * Generates an automated, contextual triage response for the student upon ticket submission.
 * Uses Gemini AI if available; falls back to domain-tailored response templates.
 */
async function generateDeskResponse(
  fullName: string,
  studentId: string,
  type: string,
  message: string,
  ticketId: string
): Promise<string> {
  const firstName = fullName.trim().split(" ")[0] || fullName.trim();

  if (ai) {
    try {
      const prompt = `You are the University Student Support Desk automated triage and advising officer.
A student has just submitted a support ticket.
Provide a clear, warm, empathetic, and professional first response acknowledging their inquiry and offering actionable preliminary guidance.

Student Details:
- Name: ${fullName}
- Student ID: ${studentId}
- Ticket ID: ${ticketId}
- Category: ${type}
- Student Inquiry: "${message}"

Guidelines for your response:
1. Address the student warmly by their first name (${firstName}).
2. Confirm receipt and state that their ${type.toLowerCase()} request has been logged under ticket ${ticketId}.
3. Provide realistic, helpful guidance specific to their exact issue (e.g., typical processing times of 24-48 business hours, tips, or what to prepare while an advisor reviews it).
4. Keep the tone calm, collegiate, reassuring, and concise (around 2 to 3 short paragraphs).
5. Sign off as:
"Best regards,
Student Support Desk Triage Team"`;

      // 6-second timeout to guarantee fast responsiveness on all network conditions
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 6000);
      });

      const genPromise = ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
      });

      const result = await Promise.race([genPromise, timeoutPromise]);
      if (result && "text" in result && result.text) {
        return result.text.trim();
      }
    } catch (err) {
      console.warn("Gemini generation encountered an error, falling back to standard advisor template:", err);
    }
  }

  // Domain-aware fallback response if Gemini is not configured or offline
  const baseGreeting = `Hello ${firstName}, thank you for contacting the Student Support Desk. Your request has been logged under ticket reference ${ticketId}.`;

  if (type === "Academic") {
    return `${baseGreeting}

Academic advising inquiries and course waiver requests are reviewed by academic department counselors within 24 to 48 business hours. In the meantime, please ensure your prerequisite documentation or course code list is accessible in case your assigned advisor requires supplementary details.

Best regards,
Student Support Desk Triage Team`;
  } else if (type === "Administrative") {
    return `${baseGreeting}

Administrative and registrar inquiries (including official transcripts, financial accounts, and enrollment verifications) are processed in order of submission during standard office hours (Mon–Fri, 9:00 AM – 4:30 PM). If an official stamped letter was requested, you will receive an automated email notice when the document is ready for download.

Best regards,
Student Support Desk Triage Team`;
  } else {
    return `${baseGreeting}

Your inquiry has been assigned to our general student services support coordinators. We will examine the details of your request and route it to the appropriate university department within 1 business day.

Best regards,
Student Support Desk Triage Team`;
  }
}

/* --------------------------------------------------------------------------
   API Endpoints
   -------------------------------------------------------------------------- */

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    backend: "express",
    geminiEnabled: Boolean(apiKey),
    timestamp: new Date().toISOString(),
  });
});

// GET /api/requests - Retrieve all tickets (newest first)
app.get("/api/requests", (req, res) => {
  const list = readRequests();
  res.json(list);
});

// POST /api/requests - Submit a new ticket and generate an automated desk response
app.post("/api/requests", async (req, res) => {
  try {
    const { fullName, studentId, email, type, message } = req.body;

    // Server-side validation
    if (!fullName || typeof fullName !== "string" || fullName.trim().length < 3) {
      return res.status(400).json({ error: "Full name must be at least 3 characters long." });
    }
    const studentIdTrimmed = String(studentId || "").trim();
    if (!/^[a-zA-Z0-9/-]{4,20}$/.test(studentIdTrimmed)) {
      return res.status(400).json({ error: "Student ID must be 4 to 20 characters (letters, numbers, / or -)." });
    }
    const emailTrimmed = String(email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailTrimmed)) {
      return res.status(400).json({ error: "A valid university email address is required." });
    }
    if (!["Academic", "Administrative", "Other"].includes(type)) {
      return res.status(400).json({ error: "Please select a valid request category." });
    }
    const messageTrimmed = String(message || "").trim();
    if (messageTrimmed.length < 10 || messageTrimmed.length > 500) {
      return res.status(400).json({ error: "Message must be between 10 and 500 characters." });
    }

    const currentList = readRequests();
    const ticketId = getNextId(currentList);
    const now = new Date();
    const formattedDate = now.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Generate automated desk triage response
    const deskResponse = await generateDeskResponse(
      fullName.trim(),
      studentIdTrimmed,
      type,
      messageTrimmed,
      ticketId
    );

    const newRequest: SupportRequest = {
      id: ticketId,
      fullName: fullName.trim(),
      studentId: studentIdTrimmed,
      email: emailTrimmed,
      type,
      message: messageTrimmed,
      status: "Submitted",
      response: deskResponse,
      responseTimestamp: now.toISOString(),
      createdAt: now.toISOString(),
      createdAtFormatted: formattedDate,
    };

    currentList.unshift(newRequest);
    writeRequests(currentList);

    return res.status(201).json({
      success: true,
      request: newRequest,
      message: `Request ${ticketId} submitted successfully.`,
    });
  } catch (error) {
    console.error("Error creating support request:", error);
    return res.status(500).json({ error: "Internal server error processing request." });
  }
});

// PATCH /api/requests/:id/status - Update ticket status (simulates admin action)
app.patch("/api/requests/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["Submitted", "In Progress", "Resolved"].includes(status)) {
    return res.status(400).json({ error: "Invalid status value." });
  }

  const list = readRequests();
  const ticket = list.find((r) => r.id === id);

  if (!ticket) {
    return res.status(404).json({ error: "Request not found." });
  }

  ticket.status = status;
  writeRequests(list);

  return res.json({ success: true, request: ticket });
});

// DELETE /api/requests/:id - Delete a single ticket
app.delete("/api/requests/:id", (req, res) => {
  const { id } = req.params;
  let list = readRequests();
  const initialLength = list.length;
  list = list.filter((r) => r.id !== id);

  if (list.length === initialLength) {
    return res.status(404).json({ error: "Request not found." });
  }

  writeRequests(list);
  return res.json({ success: true, message: `Request ${id} deleted.` });
});

// POST /api/requests/seed - Reset to demo sample requests
app.post("/api/requests/seed", (req, res) => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      fs.unlinkSync(DATA_FILE);
    }
    ensureStorage();
    const samples = readRequests();
    return res.json({ success: true, requests: samples });
  } catch (err) {
    return res.status(500).json({ error: "Failed to reload sample requests." });
  }
});

// POST /api/requests/reset - Clear all requests
app.post("/api/requests/reset", (req, res) => {
  writeRequests([]);
  return res.json({ success: true, requests: [] });
});

// Explicitly serve style.css and script.js as static assets with proper MIME types
// to prevent Vite from wrapping CSS in JavaScript HMR modules
app.get("/style.css", (req, res) => {
  res.setHeader("Content-Type", "text/css; charset=utf-8");
  res.sendFile(path.join(__dirname, "style.css"));
});

app.get("/script.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.sendFile(path.join(__dirname, "script.js"));
});

/* --------------------------------------------------------------------------
   Vite Dev Server Integration / Static Hosting
   -------------------------------------------------------------------------- */
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Student Support Desk server running on port ${PORT}`);
  });
}

startServer();
