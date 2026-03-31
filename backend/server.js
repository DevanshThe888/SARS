const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

// Directory where assembler.exe / emulator.exe live
const BIN_DIR = __dirname;

const TEMP_ASM   = path.join(BIN_DIR, 'temp.asm');
const TEMP_OBJ   = path.join(BIN_DIR, 'temp.o');
const TEMP_LST   = path.join(BIN_DIR, 'temp.lst');
const TEMP_TRACE = path.join(BIN_DIR, 'temp.trace.json');
const isWindows  = process.platform === 'win32';
const ASM_EXE    = path.join(BIN_DIR, isWindows ? 'assembler.exe' : 'assembler');
const EMU_EXE    = path.join(BIN_DIR, isWindows ? 'emulator.exe'  : 'emulator');

// Auto-compile C++ binaries at startup if they are missing
{
  const { execSync } = require('child_process');
  try {
    if (!fs.existsSync(ASM_EXE)) {
      console.log('Compiling assembler.cpp  →  ' + path.basename(ASM_EXE) + ' ...');
      if (isWindows) {
        execSync('g++ assembler.cpp -o assembler.exe -static-libgcc -static-libstdc++ -static', { cwd: BIN_DIR, stdio: 'inherit' });
      } else {
        execSync('g++ assembler.cpp -o assembler -static-libgcc -static-libstdc++',             { cwd: BIN_DIR, stdio: 'inherit' });
      }
      console.log('assembler compiled successfully.');
    }
    if (!fs.existsSync(EMU_EXE)) {
      console.log('Compiling emulator.cpp  →  ' + path.basename(EMU_EXE) + ' ...');
      if (isWindows) {
        execSync('g++ emulator.cpp -o emulator.exe -static-libgcc -static-libstdc++ -static', { cwd: BIN_DIR, stdio: 'inherit' });
      } else {
        execSync('g++ emulator.cpp -o emulator -static-libgcc -static-libstdc++',             { cwd: BIN_DIR, stdio: 'inherit' });
      }
      console.log('emulator compiled successfully.');
    }
    if (!isWindows) {
      execSync('chmod +x assembler emulator', { cwd: BIN_DIR });
    }
  } catch (err) {
    console.error('\n⚠  Failed to compile C++ binaries:', err.message);
    console.error('   Make sure g++ is installed and on your PATH (e.g. via MSYS2/MinGW or WSL).\n');
  }
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function cleanup() {
  for (const f of [TEMP_ASM, TEMP_OBJ, TEMP_LST, TEMP_TRACE]) {
    try { fs.unlinkSync(f); } catch (_) { }
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
  console.log('\n─── /run ────────────────────────────────────');
  console.log('[1] Writing temp.asm ...');
  try {
    fs.writeFileSync(TEMP_ASM, code, 'utf8');
    console.log('    temp.asm written (' + code.length + ' bytes)');
  } catch (e) {
    console.error('    FAILED:', e.message);
    return res.status(500).json({ error: `Failed to write temp file: ${e.message}` });
  }

  // Step 2: Run assembler  (use ABSOLUTE paths so there is zero ambiguity)
  console.log('[2] Running assembler:', ASM_EXE);
  const asmResult = await runExe(ASM_EXE, [TEMP_ASM, TEMP_OBJ, TEMP_LST], BIN_DIR);
  console.log('    stdout:', asmResult.stdout.trim() || '(empty)');
  console.log('    stderr:', asmResult.stderr.trim() || '(empty)');
  console.log('    err:   ', asmResult.err ? asmResult.err.message : 'null');
  console.log('    temp.o exists:', fs.existsSync(TEMP_OBJ));

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
    console.log('[3] temp.lst read (' + listing.length + ' chars)');
  } catch (_) {
    listing = '(listing file not generated)';
    console.warn('[3] temp.lst not found');
  }

  // Step 4: Run emulator  (use ABSOLUTE paths)
  console.log('[4] Running emulator:', EMU_EXE);
  const emuResult = await runExe(EMU_EXE, [TEMP_OBJ, TEMP_TRACE], BIN_DIR);
  console.log('    stdout:', emuResult.stdout.trim() || '(empty)');
  console.log('    stderr:', emuResult.stderr.trim() || '(empty)');
  console.log('    err:   ', emuResult.err ? emuResult.err.message : 'null');
  console.log('    temp.trace.json exists:', fs.existsSync(TEMP_TRACE));

  let trace = null;
  let emuLog = emuResult.stdout.trim();
  let emuError = emuResult.stderr.trim();

  // Surface emulator process errors (e.g. binary not found, timeout)
  if (emuResult.err && !emuError) {
    emuError = emuResult.err.message;
  }

  if (fs.existsSync(TEMP_TRACE)) {
    try {
      const raw = fs.readFileSync(TEMP_TRACE, 'utf8');
      trace = JSON.parse(raw);
      console.log('[5] Trace parsed OK —', (trace.steps || []).length, 'steps');
    } catch (e) {
      emuError += ` | Failed to parse trace: ${e.message}`;
      console.error('[5] Trace parse error:', e.message);
    }
  } else if (!emuError) {
    // Emulator ran without error but produced no trace file — surface this
    emuError = 'Emulator did not produce a trace file. Check that the object file is valid.';
    console.error('[5] temp.trace.json missing and no emulator error reported');
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
