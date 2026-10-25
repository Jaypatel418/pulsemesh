# PulseMesh

> Real-Time API Health Monitor & Synthetic Latency Telemetry Hub

PulseMesh is a full-stack real-time monitoring dashboard built with Node.js, Express, Socket.IO, MongoDB, React, and Vite.

---

## Architecture Overview

```
pulsemesh/
├── client/                     # Frontend (React + Vite + Tailwind/CSS + Socket.IO Client)
│   ├── public/
│   ├── src/
│   │   ├── App.jsx             # Main dashboard & live socket listeners
│   │   ├── App.css             # Dashboard styling
│   │   └── main.jsx
│   ├── .env.example            # Environment template for frontend
│   ├── vercel.json             # SPA routing rewrite for Vercel
│   └── package.json
│
├── server/                     # Backend (Node.js + Express + Socket.IO + MongoDB)
│   ├── models/                 # Mongoose schemas (Endpoint, Incident, PingResult)
│   ├── services/
│   │   └── pingService.js      # Automated ping engine & incident dispatcher
│   ├── index.js                # Express API & Socket.IO server
│   ├── .env.example            # Environment template for backend
│   └── package.json
│
├── package.json                # Root monorepo orchestration scripts
└── .gitignore                  # Global ignore rules
```

---

## Local Development

### 1. Install Dependencies
```bash
# From the root directory:
npm run install:all
```

### 2. Configure Environment Variables
- In `server/`: create `.env` from `.env.example`
  ```env
  PORT=5001
  MONGO_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/pulsemesh
  CLIENT_URL=http://localhost:5173
  ```
- In `client/`: create `.env` from `.env.example` (optional for local dev, defaults to `http://localhost:5001`)
  ```env
  VITE_API_URL=http://localhost:5001
  ```

### 3. Start Development Servers
In two separate terminals:
```bash
# Terminal 1: Backend
npm run dev:server

# Terminal 2: Frontend
npm run dev:client
```

---

## Deployment Options

### Option 1: Split Deployment (Recommended)
Deploy Frontend to **Vercel** and Backend to **Render** or **Railway**.

#### Backend (Render / Railway)
1. Create a new **Web Service** pointing to your repository `Jaypatel418/pulsemesh`.
2. Configure settings:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
3. Add Environment Variables:
   - `PORT`: (Auto-set by platform or `5001`)
   - `MONGO_URI`: Your MongoDB Atlas connection string
   - `CLIENT_URL`: `https://your-frontend.vercel.app` (your Vercel app URL)

#### Frontend (Vercel / Netlify)
1. Import repository `Jaypatel418/pulsemesh` into Vercel.
2. Configure settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Add Environment Variables:
   - `VITE_API_URL`: `https://your-backend.onrender.com` (your Render server URL without trailing slash)

---

### Option 2: Unified Monorepo Deployment (Single Service)
Express can serve the prebuilt React frontend directly from `client/dist`.

1. Deploy a **Web Service** on Render / Railway pointing to root `pulsemesh`.
2. Configure settings:
   - **Build Command**: `npm run install:all && npm run build`
   - **Start Command**: `npm start`
3. Add Environment Variables:
   - `MONGO_URI`: Your MongoDB connection string
   - `PORT`: Managed by platform
