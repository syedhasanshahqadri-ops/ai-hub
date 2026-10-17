
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
  const sidebar = $("#sidebar");

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
  // Theme
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
  // UI helpers
  // -----------------------------

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const area = $("#chatArea");
      if (area) area.scrollTop = area.scrollHeight;
      if (messages) messages.scrollIntoView({
        block: "end",
        behavior: "smooth"
      });
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
    content.textContent = text || "";

    body.append(label, content);
    row.append(avatar, body);

    return { row, content, body };
  }

  function getActiveChat() {
    return conversations.find((chat) => chat.id === activeChatId);
  }

  function saveHistory() {
    try {
      localStorage.setItem("ai-hub-chats", JSON.stringify(conversations));
    } catch (error) {
      console.warn("Could not save chat history:", error);
    }
  }

  function addHistoryMessage(role, text) {
    const chat = getActiveChat();
    if (!chat) return null;

    const entry = { role, text: String(text || "") };
    chat.messages.push(entry);
    chat.updated = Date.now();

    if (!chat.title && role === "user") {
      chat.title = entry.text.slice(0, 42) || "New chat";
    }

    saveHistory();
    renderHistory();
    return entry;
  }

  function addMessage(role, text) {
    hideWelcome();

    const item = createMessageElement(role, text);
    messages.appendChild(item.row);

    addHistoryMessage(role, text);
    scrollToBottom();

    return item;
  }

  // -----------------------------
  // Chat history
  // -----------------------------

  function newChat() {
    activeChatId =
      String(Date.now()) + Math.random().toString(36).slice(2, 7);

    conversations.unshift({
      id: activeChatId,
      title: "",
      messages: [],
      updated: Date.now()
    });

    messages?.replaceChildren();
    showWelcome();
    renderHistory();
    saveHistory();
    chatInput?.focus();
  }

  function renderHistory() {
    if (!historyList) return;

    historyList.replaceChildren();

    const visibleChats = conversations.filter(
      (chat) => Array.isArray(chat.messages) && chat.messages.length
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
    const chat = conversations.find((item) => item.id === id);
    if (!chat) return;

    activeChatId = id;
    messages?.replaceChildren();

    if (!chat.messages.length) {
      showWelcome();
    } else {
      hideWelcome();

      chat.messages.forEach((entry) => {
        const item = createMessageElement(
          entry.role || "assistant",
          entry.text || ""
        );
        messages.appendChild(item.row);
      });
    }

    renderHistory();
    scrollToBottom();
    closeSidebar();
  }

  function loadHistory() {
    try {
      const stored = JSON.parse(
        localStorage.getItem("ai-hub-chats") || "[]"
      );

      if (Array.isArray(stored)) {
        conversations = stored
          .filter((chat) =>
            chat &&
            typeof chat.id === "string" &&
            Array.isArray(chat.messages)
          )
          .map((chat) => ({
            ...chat,
            messages: chat.messages.filter(
              (entry) => entry && typeof entry === "object"
            )
          }));
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
  // Sidebar
  // -----------------------------

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
  // Chat API
  // -----------------------------

  async function sendMessage(rawText) {
    const text = String(rawText || "").trim();

    if (!text || isBusy) return;
    if (!activeChatId) newChat();

    isBusy = true;

    const sendButton = $("#sendBtn");
    if (sendButton) sendButton.disabled = true;

    addMessage("user", text);
    const assistantEntry = addHistoryMessage("assistant", "Thinking...");
    const loading = createMessageElement("assistant", "Thinking...");
    messages.appendChild(loading.row);
    scrollToBottom();

    try {
      const response = await fetch(`${AI_API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          language: languageSelect?.value || "auto"
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || `Chat request failed (${response.status})`
        );
      }

      const answer =
        data.response || data.reply || data.result || data.text;

      if (typeof answer !== "string" || !answer.trim()) {
        throw new Error("AI ne empty response diya.");
      }

      loading.content.textContent = answer;

      const chat = getActiveChat();
      if (chat && assistantEntry) {
        assistantEntry.text = answer;
        chat.updated = Date.now();
        saveHistory();
      }
    } catch (error) {
      const message = `Sorry, error aa gaya: ${error.message}`;
      loading.content.textContent = message;

      const chat = getActiveChat();
      if (chat && assistantEntry) {
        assistantEntry.text = message;
        saveHistory();
      }

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
    chatInput.style.height =
      `${Math.min(chatInput.scrollHeight, 180)}px`;
  });

  chatInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      chatForm?.requestSubmit();
    }
  });

  // -----------------------------
  // Image generation
  // -----------------------------

  function saveImageHistory(prompt) {
    const chat = getActiveChat();
    if (!chat) return;

    const historyText = `[Generated image] ${prompt}`;
    const lastMessage = chat.messages[chat.messages.length - 1];

    if (
      lastMessage &&
      lastMessage.role === "assistant" &&
      lastMessage.isImagePending
    ) {
      lastMessage.text = historyText;
      delete lastMessage.isImagePending;
    } else {
      chat.messages.push({
        role: "assistant",
        text: historyText
      });
    }

    chat.updated = Date.now();
    saveHistory();
    renderHistory();
  }

  async function generateImage(promptText) {
    const prompt = String(promptText || "").trim();

    if (!prompt) {
      showToast("Pehle image ka prompt likho.");
      return;
    }

    if (isBusy) {
      showToast("Pehle current request complete hone do.");
      return;
    }

    if (!activeChatId) newChat();

    hideWelcome();

    const pendingEntry = addHistoryMessage(
      "assistant",
      "🎨 Image generate ho rahi hai..."
    );

    if (pendingEntry) pendingEntry.isImagePending = true;

    const item = createMessageElement(
      "assistant",
      "🎨 Image generate ho rahi hai..."
    );
    item.row.classList.add("image-message");
    messages.appendChild(item.row);
    scrollToBottom();

    try {
      const response = await fetch(`${AI_API}/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });

      const contentType = response.headers.get("content-type") || "";

      if (!response.ok) {
        let errorMessage = `Image request failed (${response.status})`;

        if (contentType.includes("application/json")) {
          const errorData = await response.json().catch(() => ({}));
          errorMessage = errorData.error || errorData.message || errorMessage;
        } else {
          const errorText = await response.text().catch(() => "");
          if (errorText.trim()) errorMessage = errorText.slice(0, 250);
        }

        throw new Error(errorMessage);
      }

      let imageUrl;
      let objectUrl = false;

      if (contentType.includes("application/json")) {
        const data = await response.json();

        if (typeof data.image === "string" && data.image) {
          imageUrl = data.image.startsWith("data:")
            ? data.image
            : `data:image/png;base64,${data.image}`;
        } else if (typeof data.base64 === "string" && data.base64) {
          imageUrl = `data:image/png;base64,${data.base64}`;
        } else if (typeof data.url === "string" && data.url) {
          imageUrl = data.url;
        } else if (
          data.result &&
          typeof data.result.image === "string"
        ) {
          imageUrl = `data:image/png;base64,${data.result.image}`;
        } else {
          throw new Error(
            data.error || "API response mein image data ya URL nahi mili."
          );
        }
      } else if (contentType.startsWith("image/")) {
        const blob = await response.blob();
        imageUrl = URL.createObjectURL(blob);
        objectUrl = true;
      } else {
        throw new Error(
          `Unsupported response type: ${contentType || "unknown"}`
        );
      }

      item.content.replaceChildren();

      const card = document.createElement("div");
      card.className = "generated-image-card";
      Object.assign(card.style, {
        width: "100%",
        maxWidth: "620px",
        padding: "12px",
        boxSizing: "border-box",
        border: "1px solid var(--border, #34415E)",
        borderRadius: "14px"
      });

      const status = document.createElement("p");
      status.textContent = "✅ Tumhari image ready hai!";
      status.style.marginTop = "0";

      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = prompt;
      Object.assign(image.style, {
        display: "block",
        width: "100%",
        height: "auto",
        borderRadius: "10px",
        marginBottom: "12px"
      });

      image.addEventListener("error", () => {
        status.textContent =
          "Image mili, lekin display nahi ho saki. API response check karo.";
      }, { once: true });

      const downloadButton = document.createElement("button");
      downloadButton.type = "button";
      downloadButton.textContent = "⬇ Download Image";

      Object.assign(downloadButton.style, {
        display: "inline-block",
        padding: "12px 18px",
        border: "0",
        borderRadius: "9px",
        background: "var(--accent, #B8FFF1)",
        color: "var(--bg, #0B132B)",
        fontWeight: "700",
        cursor: "pointer"
      });

      downloadButton.addEventListener("click", async () => {
        try {
          let blob;

          if (imageUrl.startsWith("data:")) {
            const imageResponse = await fetch(imageUrl);
            blob = await imageResponse.blob();
          } else {
            const imageResponse = await fetch(imageUrl);

            if (!imageResponse.ok) {
              throw new Error("Image download nahi ho saki.");
            }

            blob = await imageResponse.blob();
          }

          const temporaryUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");

          link.href = temporaryUrl;
          link.download = "ai-hub-image.png";
          document.body.appendChild(link);
          link.click();
          link.remove();

          setTimeout(() => URL.revokeObjectURL(temporaryUrl), 2000);
          showToast("Image download start ho gayi!");
        } catch (error) {
          if (/^https?:\/\//i.test(imageUrl)) {
            window.open(imageUrl, "_blank", "noopener,noreferrer");
            showToast("Image new tab mein khol di hai.");
          } else {
            showToast(`Download error: ${error.message}`);
          }
        }
      });

      const promptLabel = document.createElement("p");
      promptLabel.textContent = `Prompt: ${prompt}`;
      Object.assign(promptLabel.style, {
        fontSize: "12px",
        opacity: "0.8",
        overflowWrap: "anywhere",
        marginBottom: "0"
      });

      card.append(status, image, downloadButton, promptLabel);
      item.content.appendChild(card);

      saveImageHistory(prompt);

      if (objectUrl) {
        image.addEventListener("load", () => {
          // Keep the object URL alive while this image is displayed.
        }, { once: true });
      }

      scrollToBottom();
    } catch (error) {
      const errorMessage =
        `❌ Image generate nahi hui: ${error.message}`;

      item.content.textContent = errorMessage;

      const chat = getActiveChat();
      if (chat) {
        const lastMessage = chat.messages[chat.messages.length - 1];

        if (lastMessage && lastMessage.isImagePending) {
          lastMessage.text = errorMessage;
          delete lastMessage.isImagePending;
          saveHistory();
        }
      }

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
      const prompt = button.dataset.prompt;
      if (chatInput) chatInput.value = prompt;
      sendMessage(prompt);
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
  // PWA install
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

    try {
      installPrompt.prompt();
      await installPrompt.userChoice;
    } catch (error) {
      console.warn("PWA install prompt error:", error);
    }

    installPrompt = null;

    const installButton = $("#installBtn");
    if (installButton) installButton.hidden = true;
  });

  // -----------------------------
  // Initial setup
  // -----------------------------

  loadHistory();

  console.log("AI HUB initialized.");
});
