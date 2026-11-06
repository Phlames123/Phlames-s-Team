/**
 * Student Support Desk - Frontend Application Script
 * Communicates with the Express backend API (/api/requests)
 * Safe DOM rendering (textContent only for user and server input)
 */

// In-memory request tickets retrieved from backend
let requestsState = [];

// ID of a ticket pending deletion in the confirmation modal
let pendingDeleteId = null;

/* --------------------------------------------------------------------------
   DOM Elements Cache
   -------------------------------------------------------------------------- */
const form = document.getElementById("support-form");
const fullNameInput = document.getElementById("fullname");
const studentIdInput = document.getElementById("studentid");
const emailInput = document.getElementById("email");
const requestTypeSelect = document.getElementById("requesttype");
const messageTextarea = document.getElementById("message");
const charCountSpan = document.getElementById("char-count");
const charCounterContainer = document.getElementById("char-counter");

const submitBtn = document.getElementById("submit-btn");
const submitBtnText = document.getElementById("submit-btn-text");
const submitSpinner = document.getElementById("submit-spinner");
const submitIcon = document.getElementById("submit-icon");

const requestsListContainer = document.getElementById("requests-list");
const emptyState = document.getElementById("empty-state");
const statusFilterSelect = document.getElementById("status-filter");
const summaryText = document.getElementById("summary-text");
const refreshBtn = document.getElementById("refresh-btn");
const backendHealthTag = document.getElementById("backend-health-tag");

const toast = document.getElementById("feedback-toast");
const toastMessage = document.getElementById("toast-message");
const toastClose = document.getElementById("toast-close");

const loadSampleBtn = document.getElementById("load-sample-btn");
const emptySeedBtn = document.getElementById("empty-seed-btn");
const clearAllBtn = document.getElementById("clear-all-btn");

// Delete Confirmation Modal
const confirmModal = document.getElementById("confirm-modal");
const confirmModalDesc = document.getElementById("confirm-modal-desc");
const modalCancelBtn = document.getElementById("modal-cancel-btn");
const modalDeleteBtn = document.getElementById("modal-delete-btn");

// Response Modal (shown upon successful ticket creation)
const responseModal = document.getElementById("response-modal");
const responseTicketId = document.getElementById("response-ticket-id");
const responseModalTime = document.getElementById("response-modal-time");
const responseModalBody = document.getElementById("response-modal-body");
const responseCloseBtn = document.getElementById("response-close-btn");
const responseViewTrackerBtn = document.getElementById("response-view-tracker-btn");

/* --------------------------------------------------------------------------
   Form Validation Functions
   Validates fields against constraints and returns { isValid, message }
   -------------------------------------------------------------------------- */

function validateFullName(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { isValid: false, message: "Full name is required." };
  }
  if (trimmed.length < 3) {
    return { isValid: false, message: "Full name must be at least 3 characters long." };
  }
  return { isValid: true, message: "" };
}

function validateStudentId(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { isValid: false, message: "Student ID is required." };
  }
  const regex = /^[a-zA-Z0-9/-]{4,20}$/;
  if (!regex.test(trimmed)) {
    return {
      isValid: false,
      message: "Student ID must be 4 to 20 characters (letters, numbers, / or - only).",
    };
  }
  return { isValid: true, message: "" };
}

function validateEmail(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { isValid: false, message: "Email address is required." };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(trimmed)) {
    return { isValid: false, message: "Please enter a valid email address (e.g. name@university.edu)." };
  }
  return { isValid: true, message: "" };
}

function validateRequestType(value) {
  const allowed = ["Academic", "Administrative", "Other"];
  if (!value || !allowed.includes(value)) {
    return { isValid: false, message: "Please select a valid request category." };
  }
  return { isValid: true, message: "" };
}

function validateMessage(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { isValid: false, message: "Message is required." };
  }
  if (trimmed.length < 10) {
    return { isValid: false, message: "Message must be at least 10 characters long." };
  }
  if (trimmed.length > 500) {
    return { isValid: false, message: "Message cannot exceed 500 characters." };
  }
  return { isValid: true, message: "" };
}

/* --------------------------------------------------------------------------
   Field Error Display Helpers
   -------------------------------------------------------------------------- */
function setFieldValidationState(inputElement, errorElementId, validationResult) {
  const errorEl = document.getElementById(errorElementId);
  if (!errorEl) return;

  if (validationResult.isValid) {
    inputElement.setAttribute("aria-invalid", "false");
    errorEl.textContent = "";
    errorEl.classList.remove("visible");
  } else {
    inputElement.setAttribute("aria-invalid", "true");
    errorEl.textContent = validationResult.message;
    errorEl.classList.add("visible");
  }
}

function clearFieldError(inputElement, errorElementId) {
  const errorEl = document.getElementById(errorElementId);
  if (errorEl) {
    errorEl.textContent = "";
    errorEl.classList.remove("visible");
  }
  inputElement.setAttribute("aria-invalid", "false");
}

/* --------------------------------------------------------------------------
   Live Character Counter
   -------------------------------------------------------------------------- */
function updateCharacterCounter() {
  const length = messageTextarea.value.length;
  charCountSpan.textContent = String(length);

  if (length >= 10 && length <= 500) {
    charCounterContainer.classList.add("counter-valid");
    charCounterContainer.classList.remove("counter-limit");
  } else if (length > 480) {
    charCounterContainer.classList.add("counter-limit");
    charCounterContainer.classList.remove("counter-valid");
  } else {
    charCounterContainer.classList.remove("counter-valid");
    charCounterContainer.classList.remove("counter-limit");
  }
}

/* --------------------------------------------------------------------------
   Toast Notifications
   -------------------------------------------------------------------------- */
let toastTimeout = null;

function showToast(message, isError = false) {
  if (toastTimeout) clearTimeout(toastTimeout);
  toastMessage.textContent = message;
  toast.hidden = false;
  toast.classList.toggle("toast-error", isError);

  toastTimeout = setTimeout(() => {
    toast.hidden = true;
  }, 4000);
}

toastClose.addEventListener("click", () => {
  toast.hidden = true;
  if (toastTimeout) clearTimeout(toastTimeout);
});

/* --------------------------------------------------------------------------
   Backend API Service
   Wraps all fetch requests with robust error handling
   -------------------------------------------------------------------------- */

/**
 * Checks backend health and displays connection state.
 */
async function checkBackendHealth() {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error("Health check non-200");
    const data = await res.json();
    if (backendHealthTag) {
      backendHealthTag.textContent = data.geminiEnabled ? "Live API & AI Active" : "Backend Connected";
    }
  } catch (err) {
    if (backendHealthTag) {
      backendHealthTag.textContent = "Connecting to Backend...";
    }
  }
}

/**
 * Fetches the ticket list from the Express server.
 */
async function fetchRequestsFromServer() {
  try {
    summaryText.textContent = "Synchronizing with server...";
    const res = await fetch("/api/requests");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    requestsState = Array.isArray(data) ? data : [];
    renderRequests();
  } catch (err) {
    console.error("Failed to load requests from server:", err);
    showToast("Warning: Could not sync with server. Using local cache if present.", true);
  }
}

/**
 * Submits a new support request to the backend.
 * The backend generates an automated triage response.
 */
async function submitRequestToServer(payload) {
  const res = await fetch("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Server rejected request.");
  }
  return data;
}

/**
 * Updates status of a ticket on the backend.
 */
async function updateStatusOnServer(id, newStatus) {
  const res = await fetch(`/api/requests/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: newStatus }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to update status on server.");
  }
  return data;
}

/**
 * Deletes a ticket on the backend.
 */
async function deleteTicketOnServer(id) {
  const res = await fetch(`/api/requests/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Failed to delete ticket.");
  }
  return data;
}

/**
 * Seeds sample tickets on the server.
 */
async function seedSampleTicketsOnServer() {
  const res = await fetch("/api/requests/seed", { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error("Failed to seed samples.");
  return data.requests;
}

/**
 * Clears all tickets on the server.
 */
async function resetAllTicketsOnServer() {
  const res = await fetch("/api/requests/reset", { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error("Failed to reset tickets.");
  return data.requests;
}

/* --------------------------------------------------------------------------
   Card Rendering (Strictly Safe DOM - No innerHTML with user or server inputs)
   -------------------------------------------------------------------------- */

function createRequestCard(request) {
  const card = document.createElement("article");
  card.className = "request-card";
  card.setAttribute("data-id", request.id);

  // Top header row
  const header = document.createElement("div");
  header.className = "request-card-header";

  const metaTop = document.createElement("div");
  metaTop.className = "request-meta-top";

  const idBadge = document.createElement("span");
  idBadge.className = "badge-id";
  idBadge.textContent = request.id;

  const typeBadge = document.createElement("span");
  typeBadge.className = "badge-type";
  typeBadge.textContent = request.type;

  metaTop.appendChild(idBadge);
  metaTop.appendChild(typeBadge);

  const statusBadge = document.createElement("span");
  statusBadge.className = `status-badge ${getStatusBadgeClass(request.status)}`;
  statusBadge.textContent = request.status;

  header.appendChild(metaTop);
  header.appendChild(statusBadge);
  card.appendChild(header);

  // Student details section
  const userInfo = document.createElement("div");
  userInfo.className = "request-user-info";

  const studentName = document.createElement("h3");
  studentName.className = "request-student-name";
  studentName.textContent = request.fullName;

  const subMeta = document.createElement("div");
  subMeta.className = "request-sub-meta";

  const idMeta = document.createElement("span");
  idMeta.textContent = `ID: ${request.studentId}`;

  const emailMeta = document.createElement("span");
  emailMeta.textContent = request.email;

  const timeMeta = document.createElement("time");
  timeMeta.dateTime = request.createdAt;
  timeMeta.textContent = request.createdAtFormatted || new Date(request.createdAt).toLocaleString();

  subMeta.appendChild(idMeta);
  subMeta.appendChild(emailMeta);
  subMeta.appendChild(timeMeta);

  userInfo.appendChild(studentName);
  userInfo.appendChild(subMeta);
  card.appendChild(userInfo);

  // Student Inquiry Message
  const messageBox = document.createElement("div");
  messageBox.className = "request-message-box";

  const messageLabel = document.createElement("div");
  messageLabel.className = "request-message-label";
  messageLabel.textContent = "Student Inquiry:";

  const messageText = document.createElement("p");
  messageText.className = "request-message-text";
  messageText.textContent = request.message;

  messageBox.appendChild(messageLabel);
  messageBox.appendChild(messageText);
  card.appendChild(messageBox);

  // Official Desk Automated Response (if provided by backend)
  if (request.response) {
    const responseBox = document.createElement("div");
    responseBox.className = "card-response-box";

    const responseHead = document.createElement("div");
    responseHead.className = "card-response-header";

    const responseTag = document.createElement("div");
    responseTag.className = "card-response-tag";

    // Shield/checkmark icon
    responseTag.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      <span>Desk Guidance Response</span>
    `;

    const responseTime = document.createElement("span");
    responseTime.className = "card-response-time";
    responseTime.textContent = request.responseTimestamp
      ? new Date(request.responseTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "Automated";

    responseHead.appendChild(responseTag);
    responseHead.appendChild(responseTime);

    const responseText = document.createElement("p");
    responseText.className = "card-response-text";
    responseText.textContent = request.response; // Safe: textContent prevents HTML injection

    responseBox.appendChild(responseHead);
    responseBox.appendChild(responseText);
    card.appendChild(responseBox);
  }

  // Card footer with admin status simulation dropdown and delete button
  const footer = document.createElement("div");
  footer.className = "request-card-footer";

  const adminControl = document.createElement("div");
  adminControl.className = "admin-status-control";

  const adminLabel = document.createElement("label");
  adminLabel.className = "admin-status-label";
  const selectId = `status-select-${request.id}`;
  adminLabel.htmlFor = selectId;
  adminLabel.textContent = "Status:";

  const statusSelect = document.createElement("select");
  statusSelect.id = selectId;
  statusSelect.className = "admin-status-select";
  statusSelect.setAttribute("aria-label", `Change status for ticket ${request.id}`);

  const statuses = ["Submitted", "In Progress", "Resolved"];
  statuses.forEach((statusOption) => {
    const opt = document.createElement("option");
    opt.value = statusOption;
    opt.textContent = statusOption;
    if (statusOption === request.status) {
      opt.selected = true;
    }
    statusSelect.appendChild(opt);
  });

  statusSelect.addEventListener("change", async (e) => {
    await handleStatusChange(request.id, e.target.value);
  });

  adminControl.appendChild(adminLabel);
  adminControl.appendChild(statusSelect);

  // Delete button
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn-card-delete";
  deleteBtn.setAttribute("aria-label", `Delete request ${request.id}`);
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    openDeleteModal(request.id);
  });

  footer.appendChild(adminControl);
  footer.appendChild(deleteBtn);
  card.appendChild(footer);

  return card;
}

function getStatusBadgeClass(status) {
  switch (status) {
    case "In Progress":
      return "status-in-progress";
    case "Resolved":
      return "status-resolved";
    case "Submitted":
    default:
      return "status-submitted";
  }
}

/* --------------------------------------------------------------------------
   Render & Filter Requests
   -------------------------------------------------------------------------- */
function renderRequests() {
  const currentFilter = statusFilterSelect.value;

  const filtered = requestsState.filter((item) => {
    if (currentFilter === "All") return true;
    return item.status === currentFilter;
  });

  while (requestsListContainer.firstChild) {
    requestsListContainer.removeChild(requestsListContainer.firstChild);
  }

  updateFilterCounts();

  if (requestsState.length === 0) {
    emptyState.classList.remove("hidden");
    requestsListContainer.style.display = "none";
    summaryText.textContent = "Showing 0 requests";
    return;
  }

  if (filtered.length === 0) {
    emptyState.classList.remove("hidden");
    requestsListContainer.style.display = "none";
    summaryText.textContent = `No requests found with status "${currentFilter}"`;
    return;
  }

  emptyState.classList.add("hidden");
  requestsListContainer.style.display = "flex";

  filtered.forEach((request) => {
    const cardEl = createRequestCard(request);
    requestsListContainer.appendChild(cardEl);
  });

  summaryText.textContent = `Showing ${filtered.length} of ${requestsState.length} ${
    requestsState.length === 1 ? "request" : "requests"
  }`;
}

function updateFilterCounts() {
  const total = requestsState.length;
  const submittedCount = requestsState.filter((r) => r.status === "Submitted").length;
  const inProgressCount = requestsState.filter((r) => r.status === "In Progress").length;
  const resolvedCount = requestsState.filter((r) => r.status === "Resolved").length;

  const countAll = document.getElementById("count-all");
  const countSubmitted = document.getElementById("count-submitted");
  const countInProgress = document.getElementById("count-in-progress");
  const countResolved = document.getElementById("count-resolved");

  if (countAll) countAll.textContent = String(total);
  if (countSubmitted) countSubmitted.textContent = String(submittedCount);
  if (countInProgress) countInProgress.textContent = String(inProgressCount);
  if (countResolved) countResolved.textContent = String(resolvedCount);
}

/* --------------------------------------------------------------------------
   Status Update Handler
   -------------------------------------------------------------------------- */
async function handleStatusChange(requestId, newStatus) {
  try {
    const result = await updateStatusOnServer(requestId, newStatus);
    const target = requestsState.find((r) => r.id === requestId);
    if (target) {
      target.status = newStatus;
    }
    renderRequests();
    showToast(`Status for ${requestId} updated to "${newStatus}"`);
  } catch (err) {
    console.error("Status update failed:", err);
    showToast(`Failed to update status: ${err.message}`, true);
    renderRequests(); // Revert to current state
  }
}

/* --------------------------------------------------------------------------
   Response Modal
   Presents automated triage response upon successful submission
   -------------------------------------------------------------------------- */
function openResponseModal(request) {
  responseTicketId.textContent = request.id;
  responseModalTime.textContent = request.createdAtFormatted || "Just now";
  responseModalBody.textContent = request.response || "Your ticket has been logged and is pending review.";
  responseModal.hidden = false;
  responseViewTrackerBtn.focus();
}

function closeResponseModal() {
  responseModal.hidden = true;
}

responseCloseBtn.addEventListener("click", closeResponseModal);
responseViewTrackerBtn.addEventListener("click", () => {
  closeResponseModal();
  const listHeading = document.getElementById("tracker-heading");
  if (listHeading) {
    listHeading.scrollIntoView({ behavior: "smooth" });
  }
});

/* --------------------------------------------------------------------------
   Delete Confirmation Modal
   -------------------------------------------------------------------------- */
function openDeleteModal(requestId) {
  pendingDeleteId = requestId;
  if (requestId === "ALL") {
    confirmModalDesc.textContent =
      "Are you sure you want to delete and reset all stored support requests on the server?";
  } else {
    confirmModalDesc.textContent = `Are you sure you want to delete request ${requestId}? This action cannot be undone.`;
  }
  confirmModal.hidden = false;
  modalCancelBtn.focus();
}

function closeDeleteModal() {
  confirmModal.hidden = true;
  pendingDeleteId = null;
}

modalCancelBtn.addEventListener("click", closeDeleteModal);

modalDeleteBtn.addEventListener("click", async () => {
  if (!pendingDeleteId) return;

  const targetId = pendingDeleteId;
  closeDeleteModal();

  try {
    if (targetId === "ALL") {
      requestsState = await resetAllTicketsOnServer();
      renderRequests();
      showToast("All tickets were cleared on the server.");
    } else {
      await deleteTicketOnServer(targetId);
      requestsState = requestsState.filter((r) => r.id !== targetId);
      renderRequests();
      showToast(`Request ${targetId} was deleted.`);
    }
  } catch (err) {
    console.error("Delete operation failed:", err);
    showToast(`Error deleting ticket: ${err.message}`, true);
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!confirmModal.hidden) closeDeleteModal();
    if (!responseModal.hidden) closeResponseModal();
  }
});

/* --------------------------------------------------------------------------
   Field Event Listeners (Validation on Blur & Input)
   -------------------------------------------------------------------------- */
fullNameInput.addEventListener("blur", () => {
  const result = validateFullName(fullNameInput.value);
  setFieldValidationState(fullNameInput, "fullname-error", result);
});
fullNameInput.addEventListener("input", () => {
  if (fullNameInput.getAttribute("aria-invalid") === "true") {
    clearFieldError(fullNameInput, "fullname-error");
  }
});

studentIdInput.addEventListener("blur", () => {
  const result = validateStudentId(studentIdInput.value);
  setFieldValidationState(studentIdInput, "studentid-error", result);
});
studentIdInput.addEventListener("input", () => {
  if (studentIdInput.getAttribute("aria-invalid") === "true") {
    clearFieldError(studentIdInput, "studentid-error");
  }
});

emailInput.addEventListener("blur", () => {
  const result = validateEmail(emailInput.value);
  setFieldValidationState(emailInput, "email-error", result);
});
emailInput.addEventListener("input", () => {
  if (emailInput.getAttribute("aria-invalid") === "true") {
    clearFieldError(emailInput, "email-error");
  }
});

requestTypeSelect.addEventListener("blur", () => {
  const result = validateRequestType(requestTypeSelect.value);
  setFieldValidationState(requestTypeSelect, "requesttype-error", result);
});
requestTypeSelect.addEventListener("change", () => {
  clearFieldError(requestTypeSelect, "requesttype-error");
});

messageTextarea.addEventListener("input", () => {
  updateCharacterCounter();
  if (messageTextarea.getAttribute("aria-invalid") === "true") {
    clearFieldError(messageTextarea, "message-error");
  }
});
messageTextarea.addEventListener("blur", () => {
  const result = validateMessage(messageTextarea.value);
  setFieldValidationState(messageTextarea, "message-error", result);
});

/* --------------------------------------------------------------------------
   Form Submission (With Backend Call & Immediate Response)
   -------------------------------------------------------------------------- */
form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const valName = validateFullName(fullNameInput.value);
  const valStudentId = validateStudentId(studentIdInput.value);
  const valEmail = validateEmail(emailInput.value);
  const valType = validateRequestType(requestTypeSelect.value);
  const valMessage = validateMessage(messageTextarea.value);

  setFieldValidationState(fullNameInput, "fullname-error", valName);
  setFieldValidationState(studentIdInput, "studentid-error", valStudentId);
  setFieldValidationState(emailInput, "email-error", valEmail);
  setFieldValidationState(requestTypeSelect, "requesttype-error", valType);
  setFieldValidationState(messageTextarea, "message-error", valMessage);

  const validationList = [
    { input: fullNameInput, result: valName },
    { input: studentIdInput, result: valStudentId },
    { input: emailInput, result: valEmail },
    { input: requestTypeSelect, result: valType },
    { input: messageTextarea, result: valMessage },
  ];

  const firstInvalid = validationList.find((item) => !item.result.isValid);
  if (firstInvalid) {
    firstInvalid.input.focus();
    return;
  }

  // Set submitting / loading state
  submitBtn.disabled = true;
  submitSpinner.hidden = false;
  submitIcon.hidden = true;
  submitBtnText.textContent = "Submitting & Generating Response...";

  const payload = {
    fullName: fullNameInput.value.trim(),
    studentId: studentIdInput.value.trim(),
    email: emailInput.value.trim(),
    type: requestTypeSelect.value,
    message: messageTextarea.value.trim(),
  };

  try {
    const data = await submitRequestToServer(payload);
    const newTicket = data.request;

    // Add to in-memory state and re-render tracker
    requestsState.unshift(newTicket);
    renderRequests();

    // Reset form
    form.reset();
    updateCharacterCounter();
    [fullNameInput, studentIdInput, emailInput, requestTypeSelect, messageTextarea].forEach((input) => {
      input.setAttribute("aria-invalid", "false");
    });

    // Present automated triage guidance response to user immediately!
    openResponseModal(newTicket);
    showToast(`Request ${newTicket.id} submitted! Triage response generated.`);
  } catch (err) {
    console.error("Submission failed:", err);
    showToast(`Submission failed: ${err.message}`, true);
  } finally {
    submitBtn.disabled = false;
    submitSpinner.hidden = true;
    submitIcon.hidden = false;
    submitBtnText.textContent = "Submit Support Request";
  }
});

/* --------------------------------------------------------------------------
   Filter & Utility Listeners
   -------------------------------------------------------------------------- */
statusFilterSelect.addEventListener("change", () => {
  renderRequests();
});

if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    fetchRequestsFromServer();
    checkBackendHealth();
  });
}

loadSampleBtn.addEventListener("click", async () => {
  try {
    requestsState = await seedSampleTicketsOnServer();
    renderRequests();
    showToast("Sample student requests reloaded from server.");
  } catch (err) {
    showToast("Failed to reload sample requests.", true);
  }
});

if (emptySeedBtn) {
  emptySeedBtn.addEventListener("click", async () => {
    try {
      requestsState = await seedSampleTicketsOnServer();
      renderRequests();
      showToast("Sample student requests loaded.");
    } catch (err) {
      showToast("Failed to load sample requests.", true);
    }
  });
}

clearAllBtn.addEventListener("click", () => {
  if (requestsState.length === 0) {
    showToast("There are no requests to reset.");
    return;
  }
  openDeleteModal("ALL");
});

/* --------------------------------------------------------------------------
   Application Initialization
   -------------------------------------------------------------------------- */
function init() {
  updateCharacterCounter();
  checkBackendHealth();
  fetchRequestsFromServer();
}

init();
