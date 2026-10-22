/* AI HUB v2 — application logic.
   Talks to the Cloudflare Worker in /worker (POST /chat, /image, /title, GET /health).
   It also works with the older worker that only returned { response } JSON. */
(function () {
  "use strict";

  const CFG = window.AI_HUB_CONFIG || {};
  const MD = window.AIHubMD, I18N = window.AIHubI18n, ORB = window.AIHubOrb;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const NS = "http://www.w3.org/2000/svg";

  const KEY_CHATS = "ai-hub-chats", KEY_SETTINGS = "ai-hub-settings";
  const ACCENTS = { mint: "#4FE3C8", violet: "#8F6BFF", amber: "#FFAE3D", rose: "#FF5E93", sky: "#4DAAFF" };
  const ACCENT_NAMES = { mint: "Mint", violet: "Violet", amber: "Amber", rose: "Rose", sky: "Sky" };
  const LANGS = [["auto", "Auto"], ["en", "English"], ["ur", "Urdu"], ["roman", "Roman Urdu"], ["hi", "Hindi"]];
  const MODES = [
    { id: "general", name: "General", desc: "Everyday questions and ideas", icon: "sparkles" },
    { id: "tutor", name: "Tutor", desc: "Step-by-step lessons and practice", icon: "cap" },
    { id: "coder", name: "Coder", desc: "Write, explain and debug code", icon: "code" },
    { id: "writer", name: "Writer", desc: "Drafts, emails and rewrites", icon: "pen" },
    { id: "translator", name: "Translator", desc: "Urdu, Roman Urdu, Hindi, English", icon: "globe" }
  ];
  const IMG_STYLES = [
    { id: "auto", name: "Auto" }, { id: "photo", name: "Photo" }, { id: "cinematic", name: "Cinematic" },
    { id: "anime", name: "Anime" }, { id: "3d", name: "3D render" }, { id: "watercolor", name: "Watercolor" }, { id: "minimal", name: "Minimal" }
  ];

  /* ---------- helpers ---------- */
  const store = {
    read(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
    write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } }
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const slug = (s) => String(s || "chat").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff\u0900-\u097f]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "chat";

  function h(tag, attrs) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    Array.prototype.slice.call(arguments, 2).flat().forEach((c) => {
      if (c == null || c === false) return;
      el.append(c.nodeType ? c : document.createTextNode(c));
    });
    return el;
  }
  function icon(name) {
    const s = document.createElementNS(NS, "svg"); s.setAttribute("class", "i");
    const u = document.createElementNS(NS, "use"); u.setAttribute("href", "#i-" + name);
    s.appendChild(u); return s;
  }
  function toast(text, opts) {
    opts = opts || {};
    const el = h("div", { class: "toast" }, h("span", { text }));
    const dismiss = () => { el.classList.add("out"); setTimeout(() => el.remove(), 260); };
    if (opts.action) {
      el.append(h("button", { type: "button", text: opts.action, onclick: () => { dismiss(); opts.onAction && opts.onAction(); } }));
    }
    $("#toasts").append(el);
    setTimeout(dismiss, opts.duration || (opts.action ? 6000 : 2600));
  }
  async function copyText(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch (_) {
      const t = h("textarea", { style: "position:fixed;opacity:0" }); t.value = text;
      document.body.append(t); t.select(); try { document.execCommand("copy"); } catch (__) {} t.remove();
    }
    if (btn && btn.hasAttribute("data-copy-code")) {
      const o = btn.textContent; btn.textContent = "Copied"; setTimeout(() => { btn.textContent = o; }, 1400);
    } else toast("Copied to clipboard");
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h("a", { href: url, download: name }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const scriptOf = (t) => (/[\u0600-\u06FF]/.test(t) ? "ur" : /[\u0900-\u097F]/.test(t) ? "hi" : "");

  /* ---------- elements ---------- */
  const app = $("#app"), stage = $("#stage"), messagesEl = $("#messages"), welcomeEl = $("#welcome");
  const input = $("#promptInput"), form = $("#chatForm"), sendBtn = $("#sendBtn");
  const chipsEl = $("#chips"), menuEl = $("#toolsMenu"), toolsBtn = $("#toolsBtn"), micBtn = $("#micBtn");
  const historyEl = $("#historyList"), searchEl = $("#chatSearch"), langSel = $("#languageSelect");
  const toBottomBtn = $("#toBottom");
  const settingsDlg = $("#settingsDialog"), palDlg = $("#paletteDialog"), palInput = $("#palInput"), palList = $("#palList");

  /* ---------- settings ---------- */
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const defaults = { theme: "system", accent: "mint", size: "md", motion: !reduce, enterSend: true, stream: true, language: "auto", apiBase: CFG.apiBase || "", collapsed: false };
  const savedSettings = store.read(KEY_SETTINGS, null);
  let settings = Object.assign({}, defaults, savedSettings || {});
  if (!savedSettings) {
    try {
      const lt = localStorage.getItem("ai-hub-theme"), ll = localStorage.getItem("ai-hub-language");
      if (lt === "light" || lt === "dark") settings.theme = lt;
      if (ll) settings.language = ll;
    } catch (_) {}
  }
  const resolvedTheme = () => (settings.theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : settings.theme);
  const isMobile = () => matchMedia("(max-width: 860px)").matches;

  function patch(p) { Object.assign(settings, p); store.write(KEY_SETTINGS, settings); applySettings(); }
  function applySettings() {
    const r = document.documentElement, t = resolvedTheme();
    r.dataset.theme = t; r.dataset.accent = settings.accent; r.dataset.motion = settings.motion ? "on" : "off";
    r.style.setProperty("--scale", { sm: 0.94, md: 1, lg: 1.1 }[settings.size] || 1);
    $("#metaTheme").content = t === "dark" ? "#080E1F" : "#F4F7FC";
    $("#themeToggle use").setAttribute("href", t === "dark" ? "#i-sun" : "#i-moon");
    app.classList.toggle("collapsed", !!settings.collapsed && !isMobile());
    langSel.value = settings.language;
    ORB.setMotion(settings.motion); ORB.refreshColor();
    I18N.apply(settings.language);
    renderChips();
    syncSettingsUI();
  }
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (settings.theme === "system") applySettings(); });
  const toggleTheme = () => patch({ theme: resolvedTheme() === "dark" ? "light" : "dark" });
  const api = (path) => String(settings.apiBase || "").replace(/\/+$/, "") + path;

  /* ---------- chat data ---------- */
  let chats = [], activeId = null, busy = false, controller = null, imageMode = false, imageStyle = "auto", stick = true;
  const imgCache = new Map();

  function normalizeChats(raw) {
    return (Array.isArray(raw) ? raw : []).filter((c) => c && typeof c.id === "string" && Array.isArray(c.messages)).map((c) => {
      const msgs = [];
      c.messages.forEach((m) => {
        if (!m || typeof m !== "object" || m.isImagePending) return;
        const text = String(m.text || "");
        if (m.role === "assistant" && (text === "" || text === "Thinking...") && m.type !== "image") return;
        let msg = { id: m.id || uid(), role: m.role === "user" ? "user" : "assistant", text, ts: m.ts || c.updated || Date.now() };
        const im = /^\[Generated image\]\s*([\s\S]*)$/.exec(text);
        if (msg.role === "assistant" && (im || m.type === "image")) {
          const prompt = im ? im[1] : String(m.prompt || text);
          msg = { id: msg.id, role: "assistant", type: "image", prompt, text: prompt, style: m.style, ts: msg.ts, state: m.state === "error" ? "error" : "expired", errorText: m.errorText };
        }
        if (m.error) msg.error = true;
        if (m.stopped) msg.stopped = true;
        msgs.push(msg);
      });
      return { id: c.id, title: String(c.title || ""), autoTitle: !!c.autoTitle, pinned: !!c.pinned, mode: MODES.some((x) => x.id === c.mode) ? c.mode : "general", messages: msgs, created: c.created || c.updated || Date.now(), updated: c.updated || Date.now() };
    });
  }
  function serialize(c) {
    return {
      id: c.id, title: c.title, autoTitle: c.autoTitle, pinned: c.pinned, mode: c.mode, created: c.created, updated: c.updated,
      messages: c.messages.filter((m) => !(m.pending && !m.text)).map((m) => {
        const o = { id: m.id, role: m.role, text: m.text, ts: m.ts };
        if (m.error) o.error = true;
        if (m.stopped) o.stopped = true;
        if (m.type === "image") { o.type = "image"; o.prompt = m.prompt; o.style = m.style; o.state = m.state === "error" ? "error" : "expired"; o.errorText = m.errorText; }
        return o;
      })
    };
  }
  let saveTimer = 0;
  function persist(now) {
    clearTimeout(saveTimer);
    const run = () => {
      const ok = store.write(KEY_CHATS, chats.filter((c) => c.messages.length).map(serialize));
      if (!ok && !persist.warned) { persist.warned = true; toast("Browser storage is full. Export or delete old chats."); }
    };
    if (now) run(); else saveTimer = setTimeout(run, 250);
  }
  window.addEventListener("pagehide", () => persist(true));

  const activeChat = () => chats.find((c) => c.id === activeId);
  const titleOf = (c) => c.title || (c.messages.find((m) => m.role === "user") || {}).text?.replace(/\s+/g, " ").slice(0, 48) || "New chat";
  function ensureChat() { let c = activeChat(); if (!c) { newChat(); c = activeChat(); } return c; }

  /* ---------- rendering: messages ---------- */
  function paintContent(msg, el) {
    const sc = scriptOf(msg.text || "");
    el.classList.toggle("ur", sc === "ur"); el.classList.toggle("hi", sc === "hi");
    el.innerHTML = msg.text ? MD.render(msg.text) : '<span class="typing"><i></i><i></i><i></i></span>';
    el.classList.toggle("caret", !!msg.streaming && !!msg.text);
  }
  function actBtn(act, ic, label) {
    return h("button", { class: "act", type: "button", "data-act": act, "aria-label": label }, icon(ic), label);
  }
  function imageCard(msg) {
    const url = imgCache.get(msg.id), loading = msg.state === "loading";
    const frame = h("div", { class: "imgframe" + (loading ? " loading" : "") });
    if (loading) frame.append(h("div", { class: "ph", text: "Painting your idea…" }));
    else if (url && msg.state === "ready") {
      const img = h("img", { src: url, alt: msg.prompt });
      img.addEventListener("error", () => frame.replaceChildren(h("div", { class: "ph", text: "The image could not be displayed." })), { once: true });
      frame.append(img);
    } else if (msg.state === "error") frame.append(h("div", { class: "ph", text: msg.errorText || "The image could not be created." }));
    else frame.append(h("div", { class: "ph", text: "Images aren't saved with the chat. Create it again to see it here." }));
    const btns = h("div", { class: "imgbtns" });
    if (url && msg.state === "ready") btns.append(h("button", { class: "btn", type: "button", "data-act": "img-dl" }, icon("download"), "Download"));
    btns.append(h("button", { class: "btn", type: "button", "data-act": "img-copy" }, icon("copy"), "Copy prompt"));
    if (!loading) btns.append(h("button", { class: "btn", type: "button", "data-act": "img-again" }, icon("refresh"), url && msg.state === "ready" ? "New variation" : "Create again"));
    return h("div", { class: "imgcard" }, frame, h("div", { class: "imgmeta" }, h("p", { dir: "auto", text: msg.prompt }), btns));
  }
  function messageEl(msg, fresh) {
    const cls = "msg " + msg.role + (msg.error ? " err" : "") + (msg.pending ? " pending" : "") + (fresh ? " fresh" : "");
    const row = h("div", { class: cls, "data-id": msg.id });
    if (msg.role === "user") {
      row.append(h("div", { class: "body" }, h("div", { class: "bubble", dir: "auto", text: msg.text }),
        h("div", { class: "actions", style: "justify-content:flex-end" }, actBtn("copy", "copy", "Copy"))));
      return row;
    }
    const body = h("div", { class: "body" });
    if (msg.type === "image") body.append(imageCard(msg));
    else {
      const md = h("div", { class: "md", dir: "auto" }); paintContent(msg, md); body.append(md);
      if (msg.stopped) body.append(h("div", { class: "note", text: "Stopped" }));
      if (!msg.pending) {
        const acts = h("div", { class: "actions" });
        if (!msg.error) acts.append(actBtn("copy", "copy", "Copy"), actBtn("speak", "speaker", "Read aloud"));
        acts.append(actBtn("regen", "refresh", msg.error ? "Try again" : "Retry"));
        body.append(acts);
      }
    }
    row.append(h("div", { class: "avatar" }, icon("sparkles")), body);
    return row;
  }
  const rowOf = (id) => messagesEl.querySelector('[data-id="' + id + '"]');
  function markLast() {
    $$(".msg.last", messagesEl).forEach((e) => e.classList.remove("last"));
    const last = messagesEl.lastElementChild;
    if (last && last.classList.contains("assistant")) last.classList.add("last");
  }
  function replaceRow(msg) { const old = rowOf(msg.id); if (old) { old.replaceWith(messageEl(msg)); markLast(); } }
  function scrollDown(force) { if (force || stick) stage.scrollTo({ top: stage.scrollHeight, behavior: "auto" }); }
  stage.addEventListener("scroll", () => {
    stick = stage.scrollHeight - stage.scrollTop - stage.clientHeight < 90;
    const c = activeChat(); toBottomBtn.hidden = stick || !(c && c.messages.length);
  }, { passive: true });
  toBottomBtn.addEventListener("click", () => { stick = true; stage.scrollTo({ top: stage.scrollHeight, behavior: "smooth" }); });

  let dirty = new Set(), paintRaf = 0;
  function schedulePaint(msg) {
    dirty.add(msg);
    if (paintRaf) return;
    paintRaf = requestAnimationFrame(() => {
      paintRaf = 0;
      dirty.forEach((m) => { const r = rowOf(m.id), md = r && r.querySelector(".md"); if (md) paintContent(m, md); });
      dirty = new Set(); scrollDown();
    });
  }

  function addMsg(chat, msg) {
    msg.id = uid(); msg.ts = Date.now(); chat.messages.push(msg); chat.updated = msg.ts;
    if (msg.role === "user" && !chat.title) { chat.title = msg.text.replace(/\s+/g, " ").slice(0, 48); chat.autoTitle = true; }
    if (chat.id === activeId) {
      welcomeEl.hidden = true; messagesEl.append(messageEl(msg, true)); markLast(); updateTitleBar();
    }
    persist(); renderHistory();
    return msg;
  }
  function renderChat() {
    messagesEl.replaceChildren();
    const c = activeChat(), has = !!(c && c.messages.length);
    welcomeEl.hidden = has;
    if (has) c.messages.forEach((m) => messagesEl.append(messageEl(m)));
    markLast(); updateTitleBar(); renderChips(); renderHistory();
    stick = true; stage.scrollTop = has ? stage.scrollHeight : 0; toBottomBtn.hidden = true;
  }
  function updateTitleBar() {
    const c = activeChat(); $("#chatTitle").textContent = c && c.messages.length ? titleOf(c) : "New chat";
  }

  /* ---------- sidebar history ---------- */
  function groupOf(c) {
    if (c.pinned) return "Pinned";
    const now = new Date(), d = new Date(c.updated);
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 864e5);
    return diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : diff <= 7 ? "Previous 7 days" : "Older";
  }
  function mini(ic, label, fn, on) {
    return h("button", { class: "mini" + (on ? " on" : ""), type: "button", "aria-label": label, title: label, onclick: (e) => { e.stopPropagation(); fn(); } }, icon(ic));
  }
  function renderHistory() {
    const q = searchEl.value.trim().toLowerCase();
    const list = chats.filter((c) => c.messages.length && (!q || titleOf(c).toLowerCase().includes(q) || c.messages.some((m) => (m.text || "").toLowerCase().includes(q))))
      .sort((a, b) => b.updated - a.updated);
    historyEl.replaceChildren();
    if (!list.length) {
      historyEl.append(h("div", { class: "empty-history", text: q ? "No chats match your search." : "Your conversations will appear here." }));
      return;
    }
    ["Pinned", "Today", "Yesterday", "Previous 7 days", "Older"].forEach((g) => {
      const items = list.filter((c) => groupOf(c) === g);
      if (!items.length) return;
      historyEl.append(h("div", { class: "group-label", text: g }));
      items.forEach((c) => {
        const row = h("div", { class: "chat-row" + (c.id === activeId ? " active" : ""), "data-id": c.id },
          h("button", { class: "chat-main", type: "button", title: titleOf(c), onclick: () => openChat(c.id) }, icon("chat"), h("span", { class: "chat-title", dir: "auto", text: titleOf(c) })),
          h("div", { class: "row-actions" },
            mini("pin", c.pinned ? "Unpin" : "Pin", () => { c.pinned = !c.pinned; persist(); renderHistory(); }, c.pinned),
            mini("pencil", "Rename", () => startRename(c, row)),
            mini("trash", "Delete", () => deleteChat(c.id))));
        historyEl.append(row);
      });
    });
  }
  function startRename(c, row) {
    const input2 = h("input", { class: "chat-rename", value: titleOf(c), maxlength: "80", "aria-label": "Rename chat" });
    row.querySelector(".chat-main").replaceWith(input2); input2.focus(); input2.select();
    let done = false;
    const finish = (ok) => {
      if (done) return; done = true;
      const v = input2.value.trim();
      if (ok && v) { c.title = v; c.autoTitle = false; persist(); }
      renderHistory(); updateTitleBar();
    };
    input2.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); finish(true); } else if (e.key === "Escape") finish(false); });
    input2.addEventListener("blur", () => finish(true));
  }
  function deleteChat(id) {
    const idx = chats.findIndex((c) => c.id === id); if (idx < 0) return;
    const removed = chats.splice(idx, 1)[0];
    if (id === activeId) { activeId = null; newChat(); }
    persist(); renderHistory();
    toast("Chat deleted", { action: "Undo", onAction: () => { chats.splice(Math.min(idx, chats.length), 0, removed); persist(); renderHistory(); } });
  }
  function newChat() {
    if (busy) stopGeneration();
    const cur = activeChat();
    if (cur && !cur.messages.length) { imageMode = false; renderChat(); input.focus(); closeMobileSidebar(); return; }
    const c = { id: uid(), title: "", autoTitle: true, pinned: false, mode: "general", messages: [], created: Date.now(), updated: Date.now() };
    chats.unshift(c); activeId = c.id; imageMode = false;
    renderChat(); if (!isMobile()) input.focus(); closeMobileSidebar();
  }
  function openChat(id) {
    if (!chats.find((c) => c.id === id)) return;
    if (busy) stopGeneration();
    activeId = id; imageMode = false; renderChat(); closeMobileSidebar();
  }
  searchEl.addEventListener("input", renderHistory);
  searchEl.addEventListener("keydown", (e) => { if (e.key === "Escape") { searchEl.value = ""; renderHistory(); } });

  /* ---------- composer ---------- */
  function autosize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 200) + "px"; }
  function updateSend() { sendBtn.disabled = !busy && !input.value.trim(); }
  function setBusy(b) {
    busy = b; sendBtn.classList.toggle("stop", b);
    sendBtn.querySelector("use").setAttribute("href", b ? "#i-stop" : "#i-send");
    sendBtn.setAttribute("aria-label", b ? "Stop generating" : "Send message");
    ORB.setBusy(b); updateSend();
  }
  function stopGeneration() { if (controller) controller.abort(); }
  input.addEventListener("input", () => { autosize(); updateSend(); });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    const wants = settings.enterSend ? !e.shiftKey : (e.ctrlKey || e.metaKey);
    if (wants) { e.preventDefault(); if (!busy) form.requestSubmit(); }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (busy) { stopGeneration(); return; }
    const t = input.value; if (!t.trim()) return;
    input.value = ""; autosize(); updateSend(); send(t);
  });

  function setImageMode(on) {
    imageMode = !!on; renderChips();
    if (on) { input.focus(); toast("Image mode on — describe what you want to see"); }
  }
  function setMode(id) {
    const c = ensureChat(), m = MODES.find((x) => x.id === id) || MODES[0];
    c.mode = m.id; persist(); renderChips();
    if (m.id !== "general") toast(m.name + " mode on");
  }
  function renderChips() {
    const c = activeChat(), mode = (c && c.mode) || "general";
    chipsEl.replaceChildren(); form.classList.toggle("imagemode", imageMode);
    if (imageMode) {
      const sel = h("select", { "aria-label": "Image style" }, IMG_STYLES.map((s) => h("option", { value: s.id, selected: s.id === imageStyle, text: s.name })));
      sel.addEventListener("change", () => { imageStyle = sel.value; });
      chipsEl.append(h("span", { class: "chip" }, icon("image"), "Image", sel,
        h("button", { type: "button", "aria-label": "Turn off image mode", onclick: () => setImageMode(false) }, icon("x"))));
    }
    if (mode !== "general") {
      const m = MODES.find((x) => x.id === mode);
      chipsEl.append(h("span", { class: "chip" }, icon(m.icon), m.name + " mode",
        h("button", { type: "button", "aria-label": "Switch to General mode", onclick: () => setMode("general") }, icon("x"))));
    }
    input.placeholder = imageMode ? "Describe the image you want" : I18N.t(settings.language, "placeholder");
  }

  /* tools menu */
  function menuItem(ic, title, desc, checked, fn) {
    return h("button", { class: "menu-item", type: "button", role: "menuitemradio", "aria-checked": String(!!checked), onclick: fn },
      h("span", { class: "mi" }, icon(ic)), h("span", { class: "t" }, h("b", { text: title }), h("small", { text: desc })), h("span", { class: "tick" }, icon("check")));
  }
  function openMenu() {
    const cur = (activeChat() || {}).mode || "general";
    menuEl.replaceChildren(
      h("div", { class: "menu-label", text: "Create" }),
      menuItem("image", "Create an image", "Turn a description into a picture", imageMode, () => { setImageMode(!imageMode); closeMenu(); }),
      h("div", { class: "menu-label", text: "Mode" }),
      ...MODES.map((m) => menuItem(m.icon, m.name, m.desc, cur === m.id, () => { setMode(m.id); closeMenu(); })));
    menuEl.hidden = false; toolsBtn.setAttribute("aria-expanded", "true");
    const first = $(".menu-item", menuEl); if (first) first.focus();
  }
  function closeMenu() { if (menuEl.hidden) return; menuEl.hidden = true; toolsBtn.setAttribute("aria-expanded", "false"); }
  toolsBtn.addEventListener("click", () => (menuEl.hidden ? openMenu() : closeMenu()));
  document.addEventListener("click", (e) => { if (!menuEl.hidden && !menuEl.contains(e.target) && !toolsBtn.contains(e.target)) closeMenu(); });

  /* voice input */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  if (!SR) micBtn.hidden = true;
  micBtn.addEventListener("click", () => {
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = { ur: "ur-PK", roman: "ur-PK", hi: "hi-IN", en: "en-US" }[settings.language] || navigator.language || "en-US";
    rec.interimResults = true; rec.continuous = false;
    const base = input.value ? input.value.trimEnd() + " " : "";
    rec.onresult = (e) => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; input.value = base + t; autosize(); updateSend(); };
    rec.onerror = (ev) => { if (ev.error === "not-allowed") toast("Microphone access was blocked."); else if (ev.error !== "aborted" && ev.error !== "no-speech") toast("Voice input failed. Try again."); };
    rec.onend = () => { rec = null; micBtn.classList.remove("live"); input.focus(); };
    try { rec.start(); micBtn.classList.add("live"); } catch (_) { rec = null; }
  });

  /* ---------- sending ---------- */
  function friendly(err) {
    const m = String((err && err.message) || err);
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Couldn't reach the AI service. Check your connection and the API address in Settings, then try again.";
    return m;
  }
  async function send(text) {
    text = String(text || "").trim(); if (!text || busy) return;
    const chat = ensureChat();
    if (imageMode) return makeImage(chat, text);
    addMsg(chat, { role: "user", text });
    const reply = addMsg(chat, { role: "assistant", text: "", pending: true });
    stick = true; scrollDown(true);
    await runReply(chat, reply);
  }
  function buildContext(chat, reply) {
    const out = [];
    for (const m of chat.messages) {
      if (m === reply) break;
      if (m.type === "image" || m.error || !m.text) continue;
      out.push({ role: m.role, content: m.text.slice(0, 6000) });
    }
    return out.slice(-16);
  }
  async function runReply(chat, reply) {
    setBusy(true); controller = new AbortController();
    reply.pending = true; reply.streaming = false; reply.error = false; reply.stopped = false; reply.text = "";
    const ctx = buildContext(chat, reply);
    try {
      if (!settings.apiBase) throw new Error("No API address is set. Add it in Settings → Backend.");
      const res = await fetch(api("/chat"), {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ message: ctx.length ? ctx[ctx.length - 1].content : "", messages: ctx, language: settings.language, mode: chat.mode || "general", stream: !!settings.stream })
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Chat request failed (" + res.status + ")");
      }
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("text/event-stream") && res.body) await readStream(res, reply);
      else {
        const d = await res.json();
        const ans = d.response || d.reply || d.result || d.text;
        if (typeof ans !== "string" || !ans.trim()) throw new Error("The AI returned an empty answer. Please try again.");
        reply.text = ans;
      }
      if (!reply.text.trim()) throw new Error("The AI returned an empty answer. Please try again.");
    } catch (err) {
      if (err && err.name === "AbortError") { reply.stopped = true; if (!reply.text) { reply.text = "Generation stopped."; reply.error = true; } }
      else { reply.error = true; reply.text = (reply.text ? reply.text + "\n\n" : "") + friendly(err); }
    } finally {
      reply.pending = false; reply.streaming = false; controller = null;
      chat.updated = Date.now(); setBusy(false); replaceRow(reply); persist(); renderHistory();
      if (!reply.error && chat.autoTitle && chat.messages.length <= 2) refineTitle(chat);
    }
  }
  async function readStream(res, reply) {
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "";
    const handle = (line) => {
      line = line.trim(); if (!line.startsWith("data:")) return false;
      const data = line.slice(5).trim(); if (data === "[DONE]") return true;
      try {
        const j = JSON.parse(data);
        const tok = j.response != null ? j.response : (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) || j.token || "";
        if (tok) { reply.text += tok; reply.streaming = true; schedulePaint(reply); }
      } catch (_) {}
      return false;
    };
    for (;;) {
      const r = await reader.read(); if (r.done) break;
      buf += dec.decode(r.value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (handle(line)) return; }
    }
    if (buf) handle(buf);
  }
  async function refineTitle(chat) {
    const u = chat.messages.find((m) => m.role === "user"), a = chat.messages.find((m) => m.role === "assistant" && !m.error && m.text);
    if (!u || !a || !settings.apiBase) return;
    try {
      const r = await fetch(api("/title"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: u.text.slice(0, 400), reply: a.text.slice(0, 400), language: settings.language }) });
      if (!r.ok) return;
      const d = await r.json(), t = String(d.title || "").replace(/["\n\r]/g, "").trim().slice(0, 60);
      if (t && chat.autoTitle) { chat.title = t; persist(); renderHistory(); updateTitleBar(); }
    } catch (_) {}
  }

  /* ---------- images ---------- */
  async function readImage(res) {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const d = await res.json(), b = d.image || d.base64 || (d.result && d.result.image);
      if (typeof b === "string" && b) return b.startsWith("data:") ? b : "data:image/png;base64," + b;
      if (typeof d.url === "string" && d.url) return d.url;
      throw new Error(d.error || "The server did not return an image.");
    }
    if (ct.startsWith("image/")) return URL.createObjectURL(await res.blob());
    throw new Error("Unexpected response from the image service.");
  }
  async function makeImage(chat, prompt, existing) {
    if (busy) return;
    let msg;
    if (existing) { msg = existing; msg.state = "loading"; msg.errorText = ""; replaceRow(msg); }
    else {
      addMsg(chat, { role: "user", text: prompt });
      msg = addMsg(chat, { role: "assistant", type: "image", prompt, text: prompt, style: imageStyle, state: "loading" });
    }
    stick = true; scrollDown(true); setBusy(true); controller = new AbortController();
    try {
      if (!settings.apiBase) throw new Error("No API address is set. Add it in Settings → Backend.");
      const res = await fetch(api("/image"), { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ prompt, style: msg.style || "auto" }) });
      if (!res.ok) {
        let em = "Image request failed (" + res.status + ")";
        if ((res.headers.get("content-type") || "").includes("json")) { const d = await res.json().catch(() => ({})); em = d.error || d.message || em; }
        throw new Error(em);
      }
      imgCache.set(msg.id, await readImage(res)); msg.state = "ready";
    } catch (err) {
      msg.state = "error"; msg.errorText = err && err.name === "AbortError" ? "Image creation was stopped." : friendly(err);
    } finally {
      controller = null; setBusy(false); replaceRow(msg); persist(); scrollDown(true);
    }
  }

  /* ---------- message actions ---------- */
  function plain(md) {
    return md.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/```[\s\S]*?```/g, " code block ").replace(/[`*_#>~|]/g, "");
  }
  function speak(msg, btn) {
    const synth = window.speechSynthesis;
    if (!synth) { toast("Read aloud isn't supported in this browser."); return; }
    const wasOn = btn.classList.contains("on");
    if (synth.speaking || synth.pending) synth.cancel();
    $$(".act.on[data-act=speak]").forEach((b) => b.classList.remove("on"));
    if (wasOn) return;
    const text = plain(msg.text), sc = scriptOf(text), u = new SpeechSynthesisUtterance(text);
    u.lang = sc === "ur" ? "ur-PK" : sc === "hi" ? "hi-IN" : settings.language === "roman" ? "en-IN" : "en-US";
    const v = synth.getVoices().find((x) => x.lang && x.lang.toLowerCase().indexOf(u.lang.slice(0, 2)) === 0);
    if (v) u.voice = v;
    btn.classList.add("on"); u.onend = u.onerror = () => btn.classList.remove("on");
    synth.speak(u);
  }
  function regenerate() {
    const chat = activeChat(); if (!chat || busy) return;
    const last = chat.messages[chat.messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (last.type === "image") { makeImage(chat, last.prompt, last); return; }
    chat.messages.pop();
    const row = rowOf(last.id); if (row) row.remove();
    const reply = addMsg(chat, { role: "assistant", text: "", pending: true });
    stick = true; scrollDown(true); runReply(chat, reply);
  }
  messagesEl.addEventListener("click", (e) => {
    const cc = e.target.closest("[data-copy-code]");
    if (cc) { copyText(cc.closest(".codeblock").querySelector("code").textContent, cc); return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const row = b.closest(".msg"), chat = activeChat();
    const msg = chat && row && chat.messages.find((m) => m.id === row.dataset.id); if (!msg) return;
    switch (b.dataset.act) {
      case "copy": copyText(msg.text, b); break;
      case "speak": speak(msg, b); break;
      case "regen": regenerate(); break;
      case "img-copy": copyText(msg.prompt, b); break;
      case "img-again": if (!busy) makeImage(chat, msg.prompt, msg); break;
      case "img-dl": {
        const url = imgCache.get(msg.id); if (!url) break;
        const a = h("a", { href: url, download: "ai-hub-" + slug(msg.prompt) + ".png", target: "_blank", rel: "noopener" });
        document.body.append(a); a.click(); a.remove(); toast("Download started"); break;
      }
    }
  });

  /* ---------- welcome cards ---------- */
  $$(".card").forEach((card) => {
    card.addEventListener("click", () => {
      if (card.dataset.action === "image") { ensureChat(); setImageMode(true); return; }
      ensureChat();
      if (card.dataset.mode) setMode(card.dataset.mode);
      send(card.dataset.prompt);
    });
    card.addEventListener("pointermove", (e) => {
      if (!settings.motion || e.pointerType === "touch") return;
      const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty("--ry", (x * 7).toFixed(2) + "deg"); card.style.setProperty("--rx", (-y * 7).toFixed(2) + "deg");
    });
    card.addEventListener("pointerleave", () => { card.style.removeProperty("--rx"); card.style.removeProperty("--ry"); });
  });

  /* ---------- sidebar / topbar ---------- */
  function closeMobileSidebar() { app.classList.remove("open"); }
  $("#openSidebar").addEventListener("click", () => { if (isMobile()) app.classList.toggle("open"); else patch({ collapsed: !settings.collapsed }); });
  $("#closeSidebar").addEventListener("click", closeMobileSidebar);
  $("#scrim").addEventListener("click", closeMobileSidebar);
  $("#newChat").addEventListener("click", newChat);
  $("#themeToggle").addEventListener("click", toggleTheme);
  $("#openPalette").addEventListener("click", openPalette);
  $("#openSettings").addEventListener("click", openSettings);
  langSel.addEventListener("change", () => { patch({ language: langSel.value }); toast("Reply language: " + (LANGS.find((l) => l[0] === langSel.value) || [])[1]); });

  /* ---------- connection ---------- */
  function setConn(state, text) { $("#connDot").className = "dot " + state; $("#connText").textContent = text; $("#connPill").title = text; }
  async function checkHealth() {
    if (!navigator.onLine) { setConn("bad", "Offline"); return { ok: false, msg: "You're offline." }; }
    if (!settings.apiBase) { setConn("bad", "No API address"); return { ok: false, msg: "Enter an API address first." }; }
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(api("/health"), { signal: ctl.signal, cache: "no-store" }); clearTimeout(t);
      let info = {}; try { info = await r.json(); } catch (_) {}
      setConn("ok", "Connected");
      return { ok: true, msg: r.ok ? "Connected" + (info.model ? " · " + info.model : "") : "Reachable. This server has no /health route (HTTP " + r.status + "), which is fine." };
    } catch (_) {
      clearTimeout(t); setConn("bad", "Backend unreachable");
      return { ok: false, msg: "Could not reach the server. Check the address, that the Worker is deployed, and that it allows this website's origin." };
    }
  }
  window.addEventListener("online", () => { $("#offlineBar").hidden = true; checkHealth(); });
  window.addEventListener("offline", () => { $("#offlineBar").hidden = false; setConn("bad", "Offline"); });

  /* ---------- settings dialog ---------- */
  function syncSettingsUI() {
    $$(".seg[data-setting]").forEach((seg) => $$("button", seg).forEach((b) => b.setAttribute("aria-pressed", String(settings[seg.dataset.setting] === b.dataset.v))));
    $$("#swatches .sw").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === settings.accent)));
    $("#setMotion").checked = settings.motion; $("#setEnter").checked = settings.enterSend; $("#setStream").checked = settings.stream;
    $("#setApi").value = settings.apiBase; $("#verText").textContent = "v" + (CFG.version || "2");
  }
  function openSettings() { syncSettingsUI(); $("#apiStatus").textContent = ""; $("#apiStatus").className = "status"; settingsDlg.showModal(); }
  Object.keys(ACCENTS).forEach((k) => {
    $("#swatches").append(h("button", { class: "sw", type: "button", "data-v": k, "aria-label": ACCENT_NAMES[k], title: ACCENT_NAMES[k], style: "--sw:" + ACCENTS[k], onclick: () => patch({ accent: k }) }));
  });
  $$(".seg[data-setting]").forEach((seg) => seg.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (b) patch({ [seg.dataset.setting]: b.dataset.v });
  }));
  $("#setMotion").addEventListener("change", (e) => patch({ motion: e.target.checked }));
  $("#setEnter").addEventListener("change", (e) => patch({ enterSend: e.target.checked }));
  $("#setStream").addEventListener("change", (e) => patch({ stream: e.target.checked }));
  function saveApi() {
    const v = $("#setApi").value.trim().replace(/\/+$/, "");
    if (v) { try { const u = new URL(v); if (!/^https?:$/.test(u.protocol)) throw 0; } catch (_) { toast("Enter a full address starting with https://"); return false; } }
    if (v !== settings.apiBase) patch({ apiBase: v });
    return true;
  }
  $("#setApi").addEventListener("change", saveApi);
  $("#testApi").addEventListener("click", async () => {
    if (!saveApi()) return;
    const s = $("#apiStatus"); s.className = "status"; s.textContent = "Testing…";
    const r = await checkHealth(); s.textContent = r.msg; s.className = "status " + (r.ok ? "ok" : "bad");
  });
  [settingsDlg, palDlg].forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));
  $$("[data-close]", settingsDlg).forEach((b) => b.addEventListener("click", () => settingsDlg.close()));

  /* ---------- export / import ---------- */
  function chatToMarkdown(c) {
    return "# " + titleOf(c) + "\n\n" + c.messages.map((m) => m.type === "image" ? "**AI HUB:** [Image] " + m.prompt : "**" + (m.role === "user" ? "You" : "AI HUB") + ":**\n\n" + m.text).join("\n\n---\n\n") + "\n";
  }
  function exportChat(c) {
    if (!c || !c.messages.length) { toast("This chat is empty."); return; }
    download(slug(titleOf(c)) + ".md", chatToMarkdown(c), "text/markdown"); toast("Chat exported");
  }
  function exportAll() {
    const list = chats.filter((c) => c.messages.length).map(serialize);
    if (!list.length) { toast("There are no chats to export."); return; }
    download("ai-hub-chats-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify({ app: "ai-hub", version: 2, exported: new Date().toISOString(), chats: list }, null, 2), "application/json");
    toast("Exported " + list.length + " chats");
  }
  $("#exportAll").addEventListener("click", exportAll);
  $("#importAll").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const incoming = normalizeChats(Array.isArray(data) ? data : data.chats).filter((c) => c.messages.length);
      const have = new Set(chats.map((c) => c.id)); let added = 0;
      incoming.forEach((c) => { if (!have.has(c.id)) { chats.push(c); added++; } });
      persist(true); renderHistory(); toast(added ? "Imported " + added + " chats" : "No new chats found in that file");
    } catch (_) { toast("That file couldn't be read as AI HUB chats."); }
  });
  $("#clearAll").addEventListener("click", () => {
    if (!confirm("Delete all saved chats from this browser? Export a backup first if you might need them.")) return;
    chats = []; activeId = null; persist(true); newChat(); settingsDlg.close(); toast("All chats deleted");
  });

  /* ---------- command palette ---------- */
  let palItems = [], palIndex = 0;
  function commands() {
    const list = [
      { g: "Chat", ic: "plus", label: "New chat", run: newChat },
      { g: "Chat", ic: "image", label: imageMode ? "Turn off image mode" : "Create an image", run: () => setImageMode(!imageMode) },
      { g: "Chat", ic: "download", label: "Export this chat (Markdown)", run: () => exportChat(activeChat()) },
      { g: "Chat", ic: "trash", label: "Delete this chat", run: () => { const c = activeChat(); if (c && c.messages.length) deleteChat(c.id); else toast("Nothing to delete yet."); } },
      { g: "Appearance", ic: "sun", label: "Switch theme", run: toggleTheme }
    ];
    Object.keys(ACCENTS).forEach((k) => list.push({ g: "Appearance", ic: "sparkles", label: "Accent: " + ACCENT_NAMES[k], run: () => patch({ accent: k }) }));
    MODES.forEach((m) => list.push({ g: "Mode", ic: m.icon, label: "Mode: " + m.name, run: () => setMode(m.id) }));
    LANGS.forEach((l) => list.push({ g: "Language", ic: "globe", label: "Language: " + l[1], run: () => patch({ language: l[0] }) }));
    list.push({ g: "App", ic: "sliders", label: "Open settings", run: openSettings }, { g: "App", ic: "download", label: "Export all chats", run: exportAll });
    if (installPrompt) list.push({ g: "App", ic: "download", label: "Install app", run: install });
    return list;
  }
  function selectPal(i, scroll) {
    palIndex = i;
    $$("li.opt", palList).forEach((li) => { const on = +li.dataset.i === i; li.setAttribute("aria-selected", String(on)); if (on && scroll) li.scrollIntoView({ block: "nearest" }); });
  }
  function runPal(i) { const it = palItems[i]; if (!it) return; palDlg.close(); it.run(); }
  function renderPalette() {
    const q = palInput.value.trim().toLowerCase();
    let items = commands().filter((c) => !q || c.label.toLowerCase().includes(q));
    if (q) {
      const hits = chats.filter((c) => c.messages.length && (titleOf(c).toLowerCase().includes(q) || c.messages.some((m) => (m.text || "").toLowerCase().includes(q)))).slice(0, 6)
        .map((c) => ({ g: "Chats", ic: "chat", label: titleOf(c), hint: "Open", run: () => openChat(c.id) }));
      items = hits.concat(items);
    }
    palItems = items; palIndex = 0; palList.replaceChildren();
    if (!items.length) { palList.append(h("li", { class: "none", text: "No matches" })); return; }
    let g = "";
    items.forEach((it, i) => {
      if (it.g !== g) { g = it.g; palList.append(h("li", { class: "gl", role: "presentation", text: g })); }
      palList.append(h("li", { class: "opt", role: "option", "aria-selected": String(i === 0), "data-i": i, onclick: () => runPal(i), onmousemove: () => { if (palIndex !== i) selectPal(i, false); } },
        icon(it.ic), h("span", { text: it.label }), it.hint ? h("small", { text: it.hint }) : null));
    });
  }
  function openPalette() { if (palDlg.open) return; palInput.value = ""; renderPalette(); palDlg.showModal(); palInput.focus(); }
  palInput.addEventListener("input", renderPalette);
  palInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); selectPal(Math.min(palIndex + 1, palItems.length - 1), true); }
    else if (e.key === "ArrowUp") { e.preventDefault(); selectPal(Math.max(palIndex - 1, 0), true); }
    else if (e.key === "Enter") { e.preventDefault(); runPal(palIndex); }
  });

  /* ---------- shortcuts ---------- */
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (palDlg.open) palDlg.close(); else openPalette(); return; }
    if (e.key === "Escape") { closeMenu(); closeMobileSidebar(); }
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$("dialog[open]")) { e.preventDefault(); input.focus(); }
  });

  /* ---------- install + service worker ---------- */
  let installPrompt = null;
  function showInstall(on) { $("#installBtn").hidden = !on; $("#installBtn2").hidden = !on; }
  async function install() {
    if (!installPrompt) return;
    installPrompt.prompt(); try { await installPrompt.userChoice; } catch (_) {}
    installPrompt = null; showInstall(false);
  }
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; showInstall(true); });
  window.addEventListener("appinstalled", () => { installPrompt = null; showInstall(false); toast("AI HUB installed"); });
  $("#installBtn").addEventListener("click", install);
  $("#installBtn2").addEventListener("click", install);

  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (had) toast("AI HUB was updated", { action: "Reload", onAction: () => location.reload(), duration: 10000 }); });
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  /* ---------- start ---------- */
  ORB.init($("#orb"));
  chats = normalizeChats(store.read(KEY_CHATS, []));
  applySettings();
  newChat();
  updateSend();
  if (!navigator.onLine) { $("#offlineBar").hidden = false; }
  checkHealth();
})();
