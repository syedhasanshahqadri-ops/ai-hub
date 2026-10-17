
const AI_API = "https://ai-hub-api.syedhasanshahqadri.workers.dev";

const $ = (s) => document.querySelector(s);
const messagesEl = $("#messages");
const welcomeEl = $("#welcome");
const historyList = $("#historyList");
const promptInput = $("#promptInput");
const chatForm = $("#chatForm");
const toastEl = $("#toast");

let chats = readChats();
let activeChatId = null;
let installPrompt = null;

const themeToggle = $("#themeToggle");

// THEME
function applyTheme(theme) {
  const light = theme === "light";
  document.body.classList.toggle("light-theme", light);

  themeToggle.innerHTML = light
    ? '☾ <span>Dark mode</span>'
    : '☼ <span>Light mode</span>';

  themeToggle.setAttribute(
    "aria-label",
    light ? "Switch to dark theme" : "Switch to light theme"
  );

  themeToggle.title = light ? "Switch to dark theme" : "Switch to light theme";

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute("content", light ? "#F3F7FC" : "#0B132B");
  }

  try {
    localStorage.setItem("aihub_theme", theme);
  } catch {}
}

let savedTheme = "dark";

try {
  savedTheme = localStorage.getItem("aihub_theme") || "dark";
} catch {}

applyTheme(savedTheme);

themeToggle.addEventListener("click", () => {
  applyTheme(
    document.body.classList.contains("light-theme") ? "dark" : "light"
  );
});

// CHAT STORAGE
function readChats() {
  try {
    return JSON.parse(localStorage.getItem("aihub_chats") || "[]");
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem("aihub_chats", JSON.stringify(chats));
  } catch {
    showToast("Could not save chats in this browser.");
  }
}

function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("show");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 3000);
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function currentChat() {
  return chats.find((c) => c.id === activeChatId);
}

// CHAT HISTORY
function renderHistory() {
  historyList.innerHTML = "";

  if (!chats.length) {
    historyList.innerHTML =
      '<div class="empty-history">Your saved conversations will appear here.</div>';
    return;
  }

  chats.slice().sort((a, b) => b.updated - a.updated).forEach((chat) => {
    const btn = document.createElement("button");

    btn.className =
      "history-item" + (chat.id === activeChatId ? " active" : "");

    btn.innerHTML =
      `<span>▤</span><span>${escapeHtml(chat.title || "New chat")}</span>`;

    btn.title = chat.title || "New chat";
    btn.addEventListener("click", () => loadChat(chat.id));

    historyList.appendChild(btn);
  });
}

// DISPLAY MESSAGES
function renderMessages() {
  const chat = currentChat();

  messagesEl.innerHTML = "";

  const hasMessages = !!chat && chat.messages.length > 0;
  welcomeEl.hidden = hasMessages;

  if (!hasMessages) return;

  chat.messages.forEach((msg) => {
    const item = document.createElement("article");

    item.className =
      "message " + (msg.role === "user" ? "user" : "assistant");

    const avatar = msg.role === "user" ? "HS" : "✦";
    const body = document.createElement("div");
    body.className = "message-body";

    const avatarEl = document.createElement("div");
    avatarEl.className = "message-avatar";
    avatarEl.textContent = avatar;

    if (msg.role === "assistant") {
      const label = document.createElement("div");
      label.className = "message-label";
      label.textContent = "AI HUB";
      body.appendChild(label);
    }

    if (msg.image) {
      const img = document.createElement("img");
      img.src = msg.image;
      img.alt = "AI-generated image";
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      img.style.borderRadius = "12px";
      img.style.display = "block";
      img.style.marginTop = "8px";
      body.appendChild(img);
    } else {
      const content = document.createElement("div");
      content.textContent = msg.content || "";
      content.style.whiteSpace = "pre-wrap";
      body.appendChild(content);
    }

    if (msg.loading) {
      const status = document.createElement("div");
      status.className = "demo-note";
      status.textContent = "Please wait...";
      body.appendChild(status);
    }

    item.append(avatarEl, body);
    messagesEl.appendChild(item);
  });

  requestAnimationFrame(() => {
    const area = $("#chatArea");
    if (area) area.scrollTop = area.scrollHeight;
  });
}

// CHAT MANAGEMENT
function newChat() {
  activeChatId = null;
  messagesEl.innerHTML = "";
  welcomeEl.hidden = false;
  renderHistory();
  promptInput.focus();
  closeSidebar();
}

function loadChat(chatId) {
  activeChatId = chatId;
  renderHistory();
  renderMessages();
  closeSidebar();
}

function ensureChat(firstMessage) {
  let chat = currentChat();

  if (!chat) {
    chat = {
      id: id(),
      title: firstMessage.slice(0, 38) || "New chat",
      messages: [],
      updated: Date.now()
    };

    chats.push(chat);
    activeChatId = chat.id;
  }

  return chat;
}

// REAL AI CHAT
async function sendMessage(text) {
  const clean = text.trim();
  if (!clean) return;

  const chat = ensureChat(clean);
  const chatId = chat.id;
  const requestId = id();

  chat.messages.push({
    role: "user",
    content: clean
  });

  chat.messages.push({
    role: "assistant",
    content: "AI is thinking...",
    loading: true,
    requestId
  });

  chat.updated = Date.now();

  if (chat.messages.length === 2) {
    chat.title = clean.slice(0, 38);
  }

  persist();
  renderHistory();
  renderMessages();

  promptInput.value = "";
  promptInput.style.height = "auto";

  try {
    const response = await fetch(`${AI_API}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ message: clean })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }

    if (typeof data.reply !== "string") {
      throw new Error("The AI returned an empty response.");
    }

    const latest = chats.find((c) => c.id === chatId);
    if (!latest) return;

    const index = latest.messages.findIndex(
      (m) => m.requestId === requestId
    );

    if (index === -1) return;

    latest.messages[index] = {
      role: "assistant",
      content: data.reply
    };

    latest.updated = Date.now();
    persist();

    if (activeChatId === chatId) renderMessages();
    renderHistory();
  } catch (error) {
    const latest = chats.find((c) => c.id === chatId);
    if (!latest) return;

    const index = latest.messages.findIndex(
      (m) => m.requestId === requestId
    );

    if (index === -1) return;

    latest.messages[index] = {
      role: "assistant",
      content: `AI request failed: ${error.message}. Please try again.`
    };

    latest.updated = Date.now();
    persist();

    if (activeChatId === chatId) renderMessages();
    renderHistory();

    console.error("AI chat error:", error);
  }
}

// CHAT FORM
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  sendMessage(promptInput.value);
});

promptInput.addEventListener("input", () => {
  promptInput.style.height = "auto";
  promptInput.style.height =
    Math.min(promptInput.scrollHeight, 180) + "px";
});

promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

// NEW CHAT AND CLEAR HISTORY
$("#newChat").addEventListener("click", newChat);

$("#clearHistory").addEventListener("click", () => {
  if (!chats.length) {
    showToast("No saved chats to clear.");
    return;
  }

  if (confirm("Delete all saved chats from this browser?")) {
    chats = [];
    activeChatId = null;
    persist();
    renderHistory();
    renderMessages();
    welcomeEl.hidden = false;
    showToast("Chat history cleared.");
  }
});

// SUGGESTIONS
document.querySelectorAll(".suggestion").forEach((btn) => {
  btn.addEventListener("click", () => {
    sendMessage(btn.dataset.prompt || "");
  });
});

// IMAGE GENERATION
async function generateImage(prompt) {
  const clean = prompt.trim();

  if (!clean) {
    showToast("Enter an image description first.");
    return;
  }

  if (clean.length > 1500) {
    showToast("Keep the image prompt under 1500 characters.");
    return;
  }

  const chat = ensureChat(`Image: ${clean}`);
  const chatId = chat.id;
  const requestId = id();

  chat.messages.push({
    role: "user",
    content: `Generate an image: ${clean}`
  });

  chat.messages.push({
    role: "assistant",
    content: "Creating your image...",
    loading: true,
    requestId
  });

  chat.updated = Date.now();
  persist();
  renderHistory();
  renderMessages();

  try {
    const response = await fetch(`${AI_API}/image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt: clean })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }

    if (
      typeof data.image !== "string" ||
      !data.image.startsWith("data:image/")
    ) {
      throw new Error("The image model returned no valid image.");
    }

    const latest = chats.find((c) => c.id === chatId);
    if (!latest) return;

    const index = latest.messages.findIndex(
      (m) => m.requestId === requestId
    );

    if (index === -1) return;

    latest.messages[index] = {
      role: "assistant",
      content: "Here is your generated image.",
      image: data.image
    };

    latest.updated = Date.now();
    persist();

    if (activeChatId === chatId) renderMessages();
    renderHistory();

    showToast("Image generated successfully!");
  } catch (error) {
    const latest = chats.find((c) => c.id === chatId);
    if (!latest) return;

    const index = latest.messages.findIndex(
      (m) => m.requestId === requestId
    );

    if (index !== -1) {
      latest.messages[index] = {
        role: "assistant",
        content: `Image generation failed: ${error.message}`
      };
    }

    latest.updated = Date.now();
    persist();

    if (activeChatId === chatId) renderMessages();

    console.error("Image generation error:", error);
    showToast("Image generation failed. Check the error message.");
  }
}

// IMAGE BUTTON: OPEN PROMPT DIALOG
$("#imageIdeaBtn").addEventListener("click", () => {
  const idea = prompt("What image would you like to create?");

  if (idea && idea.trim()) {
    generateImage(idea);
  }
});

// SIDEBAR
$("#openSidebar").addEventListener("click", () => {
  $("#sidebar").classList.add("open");
});

$("#closeSidebar").addEventListener("click", closeSidebar);

function closeSidebar() {
  $("#sidebar").classList.remove("open");
}

// LANGUAGE SELECTOR
$("#languageSelect").addEventListener("change", () => {
  showToast("Language preference updated.");
});

// PWA INSTALL
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  $("#installBtn").hidden = false;
});

$("#installBtn").addEventListener("click", async () => {
  if (!installPrompt) return;

  installPrompt.prompt();
  await installPrompt.userChoice;

  installPrompt = null;
  $("#installBtn").hidden = true;
});

// SERVICE WORKER
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// INITIALIZE
renderHistory();
activeChatId = null;
renderHistory();
