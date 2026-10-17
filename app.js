
const AI_API = "https://ai-hub-api.syedhasanshahqadri.workers.dev";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const chatForm = $("#chatForm");
  const chatInput = $("#promptInput");
  const messages = $("#messages");
  const welcome = $("#welcome");
  const historyList = $("#historyList");
  const themeButton = $("#themeToggle");
  const languageSelect = $("#languageSelect");
  const imageButton = $("#imageIdeaBtn");

  let conversations = [];
  let activeChatId = null;
  let isBusy = false;
  let installPrompt = null;

  // -----------------------------
  // Notifications
  // -----------------------------

  function showToast(text) {
    const toast = $("#toast");

    if (!toast) {
      console.log(text);
      return;
    }

    toast.textContent = text;
    toast.classList.add("show");

    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  }

  // -----------------------------
  // Theme: matches styles.css
  // -----------------------------

  function updateThemeButton() {
    if (!themeButton) return;

    const isLight = document.body.classList.contains("light-theme");

    themeButton.innerHTML = isLight
      ? '☾ <span>Dark mode</span>'
      : '☼ <span>Light mode</span>';

    themeButton.setAttribute(
      "aria-label",
      isLight ? "Switch to dark theme" : "Switch to light theme"
    );

    themeButton.title = isLight
      ? "Switch to dark theme"
      : "Switch to light theme";
  }

  function setTheme(isLight) {
    document.body.classList.toggle("light-theme", isLight);

    try {
      localStorage.setItem("ai-hub-theme", isLight ? "light" : "dark");
    } catch (_) {}

    updateThemeButton();
  }

  try {
    const savedTheme = localStorage.getItem("ai-hub-theme");

    if (savedTheme === "light") {
      document.body.classList.add("light-theme");
    } else if (savedTheme === "dark") {
      document.body.classList.remove("light-theme");
    }
  } catch (_) {}

  updateThemeButton();

  themeButton?.addEventListener("click", () => {
    setTheme(!document.body.classList.contains("light-theme"));
  });

  // -----------------------------
  // Chat helpers
  // -----------------------------

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const area = $("#chatArea");
      if (area) area.scrollTop = area.scrollHeight;
      if (messages) messages.scrollIntoView({ block: "end", behavior: "smooth" });
    });
  }

  function hideWelcome() {
    if (welcome) welcome.hidden = true;
  }

  function showWelcome() {
    if (welcome) welcome.hidden = false;
  }

  function createMessageElement(role, text) {
    const row = document.createElement("div");
    row.className = `message ${role}`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "You" : "✦";

    const body = document.createElement("div");
    body.className = "message-body";

    const label = document.createElement("div");
    label.className = "message-label";
    label.textContent = role === "user" ? "YOU" : "AI HUB";

    const content = document.createElement("div");
    content.className = "message-text";
    content.style.whiteSpace = "pre-wrap";
    content.style.overflowWrap = "anywhere";
    content.textContent = text;

    body.append(label, content);
    row.append(avatar, body);

    return { row, content, body };
  }

  function addMessage(role, text) {
    hideWelcome();

    const item = createMessageElement(role, text);
    messages.appendChild(item.row);

    if (activeChatId) {
      const chat = conversations.find((c) => c.id === activeChatId);

      if (chat) {
        chat.messages.push({ role, text });
        if (!chat.title && role === "user") {
          chat.title = text.slice(0, 42);
        }
        saveHistory();
        renderHistory();
      }
    }

    scrollToBottom();
    return item;
  }

  function newChat() {
    activeChatId = String(Date.now()) + Math.random().toString(36).slice(2, 7);

    conversations.unshift({
      id: activeChatId,
      title: "",
      messages: [],
      updated: Date.now()
    });

    messages.replaceChildren();
    showWelcome();
    renderHistory();
    saveHistory();
    chatInput?.focus();
  }

  function saveHistory() {
    try {
      localStorage.setItem("ai-hub-chats", JSON.stringify(conversations));
    } catch (error) {
      console.warn("Could not save chat history:", error);
    }
  }

  function loadHistory() {
    try {
      const stored = JSON.parse(localStorage.getItem("ai-hub-chats") || "[]");

      if (Array.isArray(stored)) {
        conversations = stored.filter(
          (c) => c && typeof c.id === "string" && Array.isArray(c.messages)
        );
      }
    } catch (_) {
      conversations = [];
    }

    renderHistory();

    if (conversations.length) {
      openChat(conversations[0].id);
    } else {
      newChat();
    }
  }

  function renderHistory() {
    if (!historyList) return;

    historyList.replaceChildren();

    const visibleChats = conversations.filter(
      (chat) => chat.messages && chat.messages.length
    );

    if (!visibleChats.length) {
      const empty = document.createElement("div");
      empty.className = "empty-history";
      empty.textContent = "Your conversations will appear here.";
      historyList.appendChild(empty);
      return;
    }

    visibleChats.forEach((chat) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "history-item" + (chat.id === activeChatId ? " active" : "");

      const icon = document.createElement("span");
      icon.textContent = "◦";

      const title = document.createElement("span");
      title.textContent = chat.title || "New chat";

      button.append(icon, title);
      button.title = title.textContent;
      button.addEventListener("click", () => openChat(chat.id));

      historyList.appendChild(button);
    });
  }

  function openChat(id) {
    const chat = conversations.find((c) => c.id === id);
    if (!chat) return;

    activeChatId = id;
    messages.replaceChildren();

    if (!chat.messages.length) {
      showWelcome();
    } else {
      hideWelcome();

      chat.messages.forEach((entry) => {
        const item = createMessageElement(entry.role, entry.text);
        messages.appendChild(item.row);
      });
    }

    renderHistory();
    scrollToBottom();
    closeSidebar();
  }

  $("#newChat")?.addEventListener("click", newChat);

  $("#clearHistory")?.addEventListener("click", () => {
    if (!confirm("Clear all saved chat history?")) return;

    conversations = [];
    activeChatId = null;
    saveHistory();
    newChat();
    showToast("Chat history cleared.");
  });

  // -----------------------------
  // Sidebar on mobile
  // -----------------------------

  const sidebar = $("#sidebar");

  function closeSidebar() {
    sidebar?.classList.remove("open");
  }

  $("#openSidebar")?.addEventListener("click", () => {
    sidebar?.classList.add("open");
  });

  $("#closeSidebar")?.addEventListener("click", closeSidebar);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSidebar();
  });

  // -----------------------------
  // AI chat API
  // -----------------------------

  async function sendMessage(rawText) {
    const text = String(rawText || "").trim();

    if (!text || isBusy) return;

    if (!activeChatId) newChat();

    isBusy = true;
    const sendButton = $("#sendBtn");
    if (sendButton) sendButton.disabled = true;

    addMessage("user", text);

    const loading = addMessage("assistant", "Thinking...");

    try {
      const response = await fetch(`${AI_API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          language: languageSelect?.value || "auto"
        })
      });

      let data;

      try {
        data = await response.json();
      } catch (_) {
        throw new Error("Server ne valid JSON response nahi diya.");
      }

      if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
      }

      const answer =
        data.response || data.reply || data.result || data.text;

      if (typeof answer !== "string" || !answer.trim()) {
        throw new Error("AI ne empty response diya.");
      }

      loading.content.textContent = answer;

      const chat = conversations.find((c) => c.id === activeChatId);
      if (chat && chat.messages.length) {
        chat.messages[chat.messages.length - 1].text = answer;
        chat.updated = Date.now();
        saveHistory();
      }
    } catch (error) {
      loading.content.textContent = `Sorry, error aa gaya: ${error.message}`;
      console.error("AI chat error:", error);
    } finally {
      isBusy = false;
      if (sendButton) sendButton.disabled = false;
      scrollToBottom();
    }
  }

  chatForm?.addEventListener("submit", (event) => {
    event.preventDefault();

    const text = chatInput?.value || "";
    if (!text.trim()) return;

    chatInput.value = "";
    chatInput.style.height = "auto";
    sendMessage(text);
  });

  chatInput?.addEventListener("input", () => {
    chatInput.style.height = "auto";
    chatInput.style.height = `${Math.min(chatInput.scrollHeight, 180)}px`;
  });

  chatInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      chatForm?.requestSubmit();
    }
  });

  // -----------------------------
  // Image generation + download
  // -----------------------------

  async function generateImage(promptText) {
    const text = String(promptText || "").trim();

    if (!text) {
      showToast("Pehle image ka prompt likho.");
      return;
    }

    if (!activeChatId) newChat();

    hideWelcome();

    const item = createMessageElement("assistant", "");
    item.content.textContent = "🎨 Image generate ho rahi hai...";
    item.row.classList.add("image-message");
    messages.appendChild(item.row);
    scrollToBottom();

    try {
      const response = await fetch(`${AI_API}/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text })
      });

      if (!response.ok) {
        let message = `Request failed (${response.status})`;

        try {
          const errorData = await response.json();
          message = errorData.error || message;
        } catch (_) {}

        throw new Error(message);
      }

      const contentType = response.headers.get("content-type") || "";
      let imageUrl;
      let objectUrl = false;

      if (contentType.includes("application/json")) {
        const data = await response.json();

        if (data.image) {
          imageUrl = data.image.startsWith("data:")
            ? data.image
            : `data:image/png;base64,${data.image}`;
        } else if (data.url) {
          imageUrl = data.url;
        } else {
          throw new Error(data.error || "Response mein image nahi mili.");
        }
      } else {
        const blob = await response.blob();
        imageUrl = URL.createObjectURL(blob);
        objectUrl = true;
      }

      item.content.textContent = "";

      const card = document.createElement("div");
      card.className = "generated-image-card";
      card.style.width = "100%";
      card.style.maxWidth = "620px";
      card.style.padding = "12px";
      card.style.border = "1px solid var(--border, #34415E)";
      card.style.borderRadius = "14px";

      const status = document.createElement("p");
      status.textContent = "✅ Tumhari image ready hai!";
      status.style.marginTop = "0";

      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = text;
      image.style.display = "block";
      image.style.width = "100%";
      image.style.height = "auto";
      image.style.borderRadius = "10px";
      image.style.marginBottom = "12px";

      const downloadButton = document.createElement("button");
      downloadButton.type = "button";
      downloadButton.textContent = "⬇ Download Image";
      downloadButton.style.display = "inline-block";
      downloadButton.style.padding = "12px 18px";
      downloadButton.style.border = "0";
      downloadButton.style.borderRadius = "9px";
      downloadButton.style.background = "var(--accent, #B8FFF1)";
      downloadButton.style.color = "var(--bg, #0B132B)";
      downloadButton.style.fontWeight = "700";

      downloadButton.addEventListener("click", async () => {
        try {
          // Fetch the image as a blob for a reliable download.
          const imageResponse = await fetch(imageUrl);

          if (!imageResponse.ok) {
            throw new Error("Image download nahi ho saki.");
          }

          const blob = await imageResponse.blob();
          const temporaryUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");

          link.href = temporaryUrl;
          link.download = "ai-hub-image.png";
          document.body.appendChild(link);
          link.click();
          link.remove();

          setTimeout(() => URL.revokeObjectURL(temporaryUrl), 1500);
          showToast("Image download start ho gayi!");
        } catch (error) {
          // For remote URLs, open the image as a fallback.
          if (/^https?:\/\//i.test(imageUrl)) {
            window.open(imageUrl, "_blank", "noopener");
            showToast("Image new tab mein khol di hai. Wahan se save karo.");
          } else {
            showToast(`Download error: ${error.message}`);
          }
        }
      });

      const promptLabel = document.createElement("p");
      promptLabel.textContent = `Prompt: ${text}`;
      promptLabel.style.fontSize = "12px";
      promptLabel.style.opacity = "0.8";
      promptLabel.style.overflowWrap = "anywhere";
      promptLabel.style.marginBottom = "0";

      card.append(status, image, downloadButton, promptLabel);
      item.content.appendChild(card);

      // Store a text entry in history; images may need to be generated again
      // when an old conversation is reopened.
      const chat = conversations.find((c) => c.id === activeChatId);
      if (chat) {
        chat.messages[chat.messages.length - 1].text =
          `[Generated image] ${text}`;
        chat.updated = Date.now();
        saveHistory();
      }

      if (objectUrl) {
        // Keep the object URL alive while the image is displayed.
        image.addEventListener("error", () => URL.revokeObjectURL(imageUrl), {
          once: true
        });
      }

      scrollToBottom();
    } catch (error) {
      item.content.textContent =
        `❌ Image generate nahi hui: ${error.message}`;
      console.error("Image generation error:", error);
    }
  }

  imageButton?.addEventListener("click", () => {
    const idea = window.prompt("What image would you like to create?");

    if (idea && idea.trim()) {
      generateImage(idea);
    }
  });

  // -----------------------------
  // Suggestion cards
  // -----------------------------

  $$(".suggestion[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      const promptText = button.dataset.prompt;
      if (chatInput) chatInput.value = promptText;
      sendMessage(promptText);
    });
  });

  // -----------------------------
  // Language preference
  // -----------------------------

  try {
    const savedLanguage = localStorage.getItem("ai-hub-language");
    if (savedLanguage && languageSelect) {
      languageSelect.value = savedLanguage;
    }
  } catch (_) {}

  languageSelect?.addEventListener("change", () => {
    try {
      localStorage.setItem("ai-hub-language", languageSelect.value);
    } catch (_) {}

    showToast("Language preference updated.");
  });

  // -----------------------------
  // Installable PWA
  // -----------------------------

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;

    const installButton = $("#installBtn");
    if (installButton) installButton.hidden = false;
  });

  $("#installBtn")?.addEventListener("click", async () => {
    if (!installPrompt) {
      showToast("Install option is not available in this browser yet.");
      return;
    }

    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;

    const installButton = $("#installBtn");
    if (installButton) installButton.hidden = true;
  });

  // Initial setup.
  loadHistory();

  console.log("AI HUB initialized.");
});
