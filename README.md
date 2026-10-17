# AI HUB — by Syed Hasan Shah

A responsive, dark-themed AI chat **front-end prototype** using the chosen colors:
- Aqua Foam / deep navy background: `#0B132B`
- Cyber Teal / soft mint accent: `#B8FFF1`

## What's included
- Responsive layout for laptop, tablet, and mobile
- ChatGPT-inspired chat interface
- Local chat history saved in the current browser with `localStorage`
- New chat, clear history, language preference selector
- Dark and light themes with preference saved in the browser
- PWA manifest, SVG icon, and service worker for install/offline shell
- Creator attribution response in demo mode

## Important limitation
This package is currently a **front-end demo**, not a fully connected AI assistant. Messages are saved locally and demo replies are returned. Real AI answers, real image generation, web research, accounts, and cloud-synced chat history require a backend and connected AI services. Do not put private API keys in `app.js` or any browser-side file.

## Run locally
1. Extract the ZIP.
2. Open a terminal in this folder.
3. If Python is installed, run:
   ```bash
   python -m http.server 8000
   ```
4. Open `http://localhost:8000`.

Opening `index.html` directly works for the basic interface, but PWA/service-worker features require localhost or HTTPS.

## Deploy free (static demo)
You can deploy this folder to a static host such as Cloudflare Pages or Vercel. Free tiers have limits and terms may change.

## Next development milestone
Add a server-side endpoint such as `/api/chat` and connect it to an AI model with an available free tier. Verify the provider's current quota, supported languages, model capabilities, and terms before choosing it. Keep credentials as server-side secrets. Add rate limiting and server-side usage caps so the project does not accidentally incur costs.

For production, add authentication and a database before promising cross-device saved chats. The browser-local history in this prototype is only saved on that same browser/device.
