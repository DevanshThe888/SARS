const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

// Directory where asm.exe and emu.exe live
const BIN_DIR = __dirname;

const TEMP_ASM   = path.join(BIN_DIR, 'temp.asm');
const TEMP_OBJ   = path.join(BIN_DIR, 'temp.o');
const TEMP_LST   = path.join(BIN_DIR, 'temp.lst');
const TEMP_TRACE = path.join(BIN_DIR, 'temp.trace.json');
const isWindows = process.platform === 'win32';
const ASM_EXE    = path.join(BIN_DIR, isWindows ? 'asm.exe' : 'asm');
const EMU_EXE    = path.join(BIN_DIR, isWindows ? 'emu.exe' : 'emu');

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function cleanup() {
  for (const f of [TEMP_ASM, TEMP_OBJ, TEMP_LST, TEMP_TRACE]) {
    try { fs.unlinkSync(f); } catch (_) {}
  }
}

function runExe(exe, args, cwd, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    execFile(exe, args, { cwd, timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ err, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

app.post('/run', async (req, res) => {
  const { code } = req.body;
  if (typeof code !== 'string' || !code.trim()) {
    return res.status(400).json({ error: 'No assembly code provided.' });
  }

  cleanup();

  // Step 1: Write assembly to temp file
  try {
    fs.writeFileSync(TEMP_ASM, code, 'utf8');
  } catch (e) {
    return res.status(500).json({ error: `Failed to write temp file: ${e.message}` });
  }

  // Step 2: Run assembler
  const asmResult = await runExe(ASM_EXE, ['temp.asm', 'temp.o', 'temp.lst'], BIN_DIR);

  if (asmResult.stderr.trim()) {
    cleanup();
    return res.json({
      error: asmResult.stderr.trim(),
      listing: '',
      trace: null,
      asmLog: asmResult.stdout.trim(),
    });
  }

  if (asmResult.err && !fs.existsSync(TEMP_OBJ)) {
    cleanup();
    return res.json({
      error: asmResult.err.message || 'Assembler failed with unknown error.',
      listing: '',
      trace: null,
    });
  }

  // Step 3: Read listing file
  let listing = '';
  try {
    listing = fs.readFileSync(TEMP_LST, 'utf8');
  } catch (_) {
    listing = '(listing file not generated)';
  }

  // Step 4: Run emulator
  const emuResult = await runExe(EMU_EXE, ['temp.o', 'temp.trace.json'], BIN_DIR);

  let trace = null;
  let emuLog = emuResult.stdout.trim();
  let emuError = emuResult.stderr.trim();

  if (fs.existsSync(TEMP_TRACE)) {
    try {
      const raw = fs.readFileSync(TEMP_TRACE, 'utf8');
      trace = JSON.parse(raw);
    } catch (e) {
      emuError += ` | Failed to parse trace: ${e.message}`;
    }
  }

  cleanup();

  res.json({
    error: emuError || null,
    listing,
    trace,
    asmLog: asmResult.stdout.trim(),
    emuLog,
  });
});

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', binDir: BIN_DIR }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Catch-all to serve index.html for React client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SIMPLEX IDE backend running on http://localhost:${PORT}`);
  console.log(`Binary directory: ${BIN_DIR}`);
});
