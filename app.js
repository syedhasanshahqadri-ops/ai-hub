
const AI_API = "https://ai-hub-api.syedhasanshahqadri.workers.dev";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (selector) => document.querySelector(selector);

  const chatForm =
    $("#chatForm") ||
    document.querySelector("form");

  const chatInput =
    $("#messageInput") ||
    $("#userInput") ||
    $("#promptInput") ||
    $("textarea");

  const chatContainer =
    $("#chatMessages") ||
    $("#messages") ||
    $("#chatHistory");

  const imageButton =
    $("#imageIdeaBtn");

  // Show a small notification.
  function showToast(message) {
    const toast = $("#toast");

    if (toast) {
      toast.textContent = message;
      toast.classList.add("show");

      setTimeout(() => {
        toast.classList.remove("show");
      }, 3000);
    } else {
      alert(message);
    }
  }

  // Find the best available chat display container.
  function getChatContainer() {
    return (
      chatContainer ||
      $("#chat") ||
      $(".chat-messages") ||
      $(".messages") ||
      document.body
    );
  }

  // Add a chat message to the page.
  function addMessage(text, sender = "assistant") {
    const container = getChatContainer();
    const message = document.createElement("div");

    message.className = `message ${sender}-message`;
    message.style.whiteSpace = "pre-wrap";
    message.style.overflowWrap = "anywhere";

    const label = document.createElement("strong");
    label.textContent =
      sender === "user" ? "You: " : "AI HUB: ";

    const content = document.createElement("span");
    content.textContent = text;

    message.append(label, content);
    container.appendChild(message);

    return message;
  }

  // Talk to the real AI backend.
  async function sendMessage(message) {
    const text = String(message || "").trim();

    if (!text) return;

    addMessage(text, "user");

    const loading = addMessage("Thinking...", "assistant");

    try {
      const response = await fetch(`${AI_API}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ message: text })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || `Request failed (${response.status})`
        );
      }

      const answer =
        data.response ||
        data.reply ||
        data.result ||
        data.text;

      if (!answer) {
        throw new Error("AI ne empty response diya.");
      }

      loading.querySelector("span").textContent = answer;
    } catch (error) {
      loading.querySelector("span").textContent =
        `Error: ${error.message}`;

      console.error("Chat error:", error);
    }
  }

  // Download a generated image.
  function downloadImage(imageUrl, filename = "ai-hub-image.png") {
    const link = document.createElement("a");

    link.href = imageUrl;
    link.download = filename;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // Generate an image and display a Download button.
  async function generateImage(promptText) {
    const text = String(promptText || "").trim();

    if (!text) {
      showToast("Pehle image ka prompt likho.");
      return;
    }

    const container = getChatContainer();
    const result = document.createElement("div");

    result.className = "message assistant-message image-result";
    result.style.margin = "16px 0";
    result.style.padding = "12px";
    result.style.borderRadius = "12px";

    const title = document.createElement("p");
    title.textContent = "🎨 Image generate ho rahi hai...";
    result.appendChild(title);

    container.appendChild(result);

    try {
      const response = await fetch(`${AI_API}/image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt: text })
      });

      if (!response.ok) {
        let errorMessage = `Request failed (${response.status})`;

        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (_) {}

        throw new Error(errorMessage);
      }

      const contentType =
        response.headers.get("content-type") || "";

      let imageUrl;
      let data;

      if (contentType.includes("application/json")) {
        data = await response.json();

        if (data.image) {
          imageUrl = data.image.startsWith("data:")
            ? data.image
            : `data:image/png;base64,${data.image}`;
        } else if (data.url) {
          imageUrl = data.url;
        } else {
          throw new Error(
            data.error || "Response mein image nahi mili."
          );
        }
      } else {
        const blob = await response.blob();
        imageUrl = URL.createObjectURL(blob);
      }

      title.textContent = "✅ Tumhari image ready hai!";

      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = text;
      image.style.display = "block";
      image.style.width = "100%";
      image.style.maxWidth = "600px";
      image.style.height = "auto";
      image.style.borderRadius = "12px";
      image.style.margin = "12px 0";

      result.appendChild(image);

      // Download button.
      const downloadBtn = document.createElement("a");
      downloadBtn.href = imageUrl;
      downloadBtn.download = "ai-hub-image.png";
      downloadBtn.textContent = "⬇ Download Image";
      downloadBtn.setAttribute("role", "button");

      downloadBtn.style.display = "inline-block";
      downloadBtn.style.padding = "12px 18px";
      downloadBtn.style.marginTop = "8px";
      downloadBtn.style.borderRadius = "8px";
      downloadBtn.style.background = "#2563eb";
      downloadBtn.style.color = "#ffffff";
      downloadBtn.style.textDecoration = "none";
      downloadBtn.style.fontWeight = "bold";
      downloadBtn.style.cursor = "pointer";

      downloadBtn.addEventListener("click", (event) => {
        event.preventDefault();

        // Use the image's actual URL/data URL.
        downloadImage(imageUrl, "ai-hub-image.png");
      });

      result.appendChild(downloadBtn);

      const promptLabel = document.createElement("p");
      promptLabel.textContent = `Prompt: ${text}`;
      promptLabel.style.fontSize = "13px";
      promptLabel.style.opacity = "0.8";
      result.appendChild(promptLabel);

    } catch (error) {
      title.textContent = `❌ Image generate nahi hui: ${error.message}`;
      console.error("Image generation error:", error);
    }
  }

  // Chat form submission.
  if (chatForm && chatInput) {
    chatForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const text = chatInput.value.trim();

      if (!text) return;

      chatInput.value = "";
      sendMessage(text);
    });
  }

  // Support common send-button IDs if no form is used.
  const sendButton =
    $("#sendBtn") ||
    $("#sendButton") ||
    $("#sendMessage");

  if (sendButton && !chatForm) {
    sendButton.addEventListener("click", () => {
      if (!chatInput) return;

      const text = chatInput.value.trim();

      if (!text) return;

      chatInput.value = "";
      sendMessage(text);
    });
  }

  // Image generation button.
  if (imageButton) {
    imageButton.addEventListener("click", () => {
      const idea = window.prompt(
        "What image would you like to create?"
      );

      if (idea && idea.trim()) {
        generateImage(idea);
      }
    });
  }

  // Theme toggle.
  const themeButton =
    $("#themeToggle") ||
    $("#themeBtn");

  if (themeButton) {
    themeButton.addEventListener("click", () => {
      document.body.classList.toggle("dark-mode");
      document.body.classList.toggle("dark");
    });
  }

  console.log("AI HUB initialized.");
});
