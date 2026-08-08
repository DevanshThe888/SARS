# SARS : SIMPLEX Assembler and Runtime Simulator
The project architecture is divided into two main environments: the Node.js backend wrapper and the C++ core engine.
<p>
  <img src="./assets/demo.gif" width="700" alt="SARS IDE Demo" />
</p>

## Tech Stack

### Frontend
* **Core Framework:** React 18.3.1 (`react`, `react-dom`)
* **Build Tool & Bundler:** Vite 5.4.21 (`vite`, `@vitejs/plugin-react`)
* **Code Editor Component:** Monaco Editor (`@monaco-editor/react`, `monaco-editor`)
* **Icons:** Lucide React (`lucide-react`)
* **Styling:** Custom CSS3 with dynamic theme support (Dark/Light zinc palettes)

### Backend & Core Engine
* **API Server Framework:** Node.js with Express 4.22.1 (`express`)
* **Middleware:** CORS (`cors`)
* **Process Management:** Node.js `child_process` (`execFile`, `execSync`) for building and executing native binaries
* **Core Assembler & Emulator:** C++17 (compiled via `g++` with static linking flags)

## Getting Started

### 1 — Install dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 2 — Run in development mode

Open **two terminals**:

```bash
cd backend
npm run dev
# → http://localhost:3001

cd frontend
npm run dev
# → http://localhost:5173
```

### 3 — Run in production mode

```bash
cd frontend
npm run build

cd ../backend
npm start
# → http://localhost:3001
```

### 4 — Recompile C++ binaries (optional)

```bash
cd backend
npm run compile

---

## Usage

1. Open `http://localhost:3001` (production) or `http://localhost:5173` (dev) in your browser.
2. Write or edit SIMPLEX assembly in the **Monaco editor** on the left.
3. Click **Run (▶)** to assemble and emulate.
4. Inspect results across the four panels:
   - **Registers** — A, B, PC, SP in decimal and hex; changed registers are highlighted.
   - **Trace** — every executed instruction with its operand and before/after register state.
   - **Listing** — the assembled listing file (`address  machine-word  source`).
   - **Memory Writes** — each store operation with old → new values.
5. Use **Step ▶ / ◀** to walk through the trace one instruction at a time, or **Fast-forward** to jump to the end.
6. Toggle **dark / light** theme with the sun/moon button.
