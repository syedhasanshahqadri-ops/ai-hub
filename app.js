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
function applyTheme(theme) {
  const light = theme === "light";
  document.body.classList.toggle("light-theme", light);
  themeToggle.innerHTML = light ? '☾ <span>Dark mode</span>' : '☼ <span>Light mode</span>';
  themeToggle.setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");
  themeToggle.title = light ? "Switch to dark theme" : "Switch to light theme";
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute("content", light ? "#F3F7FC" : "#0B132B");
  try { localStorage.setItem("aihub_theme", theme); } catch {}
}
let savedTheme = "dark";
try { savedTheme = localStorage.getItem("aihub_theme") || "dark"; } catch {}
applyTheme(savedTheme);
themeToggle.addEventListener("click", () => {
  applyTheme(document.body.classList.contains("light-theme") ? "dark" : "light");
});


function readChats() {
  try { return JSON.parse(localStorage.getItem("aihub_chats") || "[]"); }
  catch { return []; }
}
function persist() {
  try { localStorage.setItem("aihub_chats", JSON.stringify(chats)); }
  catch { showToast("Could not save chats in this browser."); }
}
function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toastEl.classList.remove("show"), 2400);
}
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function currentChat() { return chats.find(c => c.id === activeChatId); }
function renderHistory() {
  historyList.innerHTML = "";
  if (!chats.length) {
    historyList.innerHTML = '<div class="empty-history">Your saved conversations will appear here.</div>';
    return;
  }
  chats.slice().sort((a,b) => b.updated - a.updated).forEach(chat => {
    const btn = document.createElement("button");
    btn.className = "history-item" + (chat.id === activeChatId ? " active" : "");
    btn.innerHTML = `<span>▤</span><span>${escapeHtml(chat.title || "New chat")}</span>`;
    btn.title = chat.title || "New chat";
    btn.addEventListener("click", () => loadChat(chat.id));
    historyList.appendChild(btn);
  });
}
function renderMessages() {
  const chat = currentChat();
  messagesEl.innerHTML = "";
  const hasMessages = !!chat && chat.messages.length > 0;
  welcomeEl.hidden = hasMessages;
  if (!hasMessages) return;
  chat.messages.forEach(msg => {
    const item = document.createElement("article");
    item.className = "message " + (msg.role === "user" ? "user" : "assistant");
    const avatar = msg.role === "user" ? "HS" : "✦";
    item.innerHTML = `<div class="message-avatar">${avatar}</div><div class="message-body">${msg.role === "assistant" ? '<div class="message-label">AI HUB</div>' : ""}${escapeHtml(msg.content).replace(/\n/g,"<br>")}${msg.demo ? '<div class="demo-note">Demo response: connect an AI model in the backend to enable real AI answers.</div>' : ""}</div>`;
    messagesEl.appendChild(item);
  });
  requestAnimationFrame(() => {
    const area = $("#chatArea");
    area.scrollTop = area.scrollHeight;
  });
}
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
    chat = { id: id(), title: firstMessage.slice(0, 38) || "New chat", messages: [], updated: Date.now() };
    chats.push(chat);
    activeChatId = chat.id;
  }
  return chat;
}
function demoReply(prompt) {
  const lang = $("#languageSelect").value;
  if (/who (made|created|built) you|who are your creator|kis ne banaya|tumhe kis ne banaya|تمہیں کس نے بنایا/i.test(prompt)) {
    return "Mujhe Syed Hasan Shah ne banaya hai. Main AI HUB hoon, ek AI assistant project jo learning, problem-solving aur creative work mein madad ke liye design kiya gaya hai.";
  }
  if (lang === "ur") return "AI HUB ka demo abhi interface aur chat saving dikhata hai. Asal AI jawab dene ke liye backend mein AI model connect karna hoga. Aapka sawal save ho gaya hai.";
  if (lang === "hi") return "AI HUB का यह डेमो अभी इंटरफ़ेस और चैट सेव करना दिखाता है। असली AI जवाबों के लिए बैकएंड में AI मॉडल जोड़ना होगा।";
  if (lang === "roman") return "Samajh gaya! Ye AI HUB ka abhi demo mode hai. Real answers ke liye humein backend mein AI model connect karna hoga. Tumhara message save ho gaya hai.";
  return "Thanks for your message! This is the AI HUB interface demo, so it can save conversations but is not connected to a real AI model yet. Next, connect a model through the secure backend to enable genuine answers, MCQ solving, research, and other AI capabilities.";
}
function sendMessage(text) {
  const clean = text.trim();
  if (!clean) return;
  const chat = ensureChat(clean);
  chat.messages.push({ role: "user", content: clean });
  chat.updated = Date.now();
  if (chat.messages.length === 1) chat.title = clean.slice(0, 38);
  persist();
  renderHistory();
  renderMessages();
  promptInput.value = "";
  promptInput.style.height = "auto";
  const reply = demoReply(clean);
  setTimeout(() => {
    const latest = currentChat();
    if (!latest) return;
    latest.messages.push({ role: "assistant", content: reply, demo: true });
    latest.updated = Date.now();
    persist();
    renderMessages();
    renderHistory();
  }, 350);
}
chatForm.addEventListener("submit", e => { e.preventDefault(); sendMessage(promptInput.value); });
promptInput.addEventListener("input", () => {
  promptInput.style.height = "auto";
  promptInput.style.height = Math.min(promptInput.scrollHeight, 180) + "px";
});
promptInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); chatForm.requestSubmit(); }
});
$("#newChat").addEventListener("click", newChat);
$("#clearHistory").addEventListener("click", () => {
  if (!chats.length) { showToast("No saved chats to clear."); return; }
  if (confirm("Delete all saved chats from this browser?")) {
    chats = []; activeChatId = null; persist(); renderHistory(); renderMessages(); welcomeEl.hidden = false; showToast("Chat history cleared.");
  }
});
document.querySelectorAll(".suggestion").forEach(btn => btn.addEventListener("click", () => sendMessage(btn.dataset.prompt)));
$("#imageIdeaBtn").addEventListener("click", () => showToast("Image generation will be added when an image model is connected."));
$("#openSidebar").addEventListener("click", () => $("#sidebar").classList.add("open"));
$("#closeSidebar").addEventListener("click", closeSidebar);
function closeSidebar() { $("#sidebar").classList.remove("open"); }
$("#languageSelect").addEventListener("change", () => showToast("Language preference updated."));
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault(); installPrompt = e; $("#installBtn").hidden = false;
});
$("#installBtn").addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null; $("#installBtn").hidden = true;
});
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
renderHistory();
if (chats.length) {
  // Start on a fresh welcome screen while retaining old conversations in the sidebar.
  activeChatId = null;
  renderHistory();
}
