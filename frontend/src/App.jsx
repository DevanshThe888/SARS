import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import {
  Play, Loader2, X, AlertTriangle, Cpu, FileText,
  List, Terminal, Activity, Zap, Database, StepForward, StepBack, FastForward, Sun, Moon
} from 'lucide-react';

// ── Default sample program ──────────────────────────────────────────────────
const SAMPLE = `; SARS Stack Machine — Sample Program
; Computes 5 + 10, stores and reloads result

start:  ldc 5       ; A = 5
        adc 10      ; A = A + 10 = 15
        stl 0       ; mem[SP+0] = A, A = B
        ldl 0       ; B = A, A = mem[SP+0]
        HALT        ; stop execution
`;

// ── Opcode name lookup ───────────────────────────────────────────────────────
const OPCODE_NAMES = [
  'ldc','adc','ldl','stl','ldnl','stnl',
  'add','sub','shl','shr','adj','a2sp',
  'sp2a','call','return','brz','brlz','br','HALT'
];

function toHex(n, pad = 8) {
  const u = (n >>> 0).toString(16).toUpperCase();
  return u.padStart(pad, '0');
}

// ── Register Dashboard ───────────────────────────────────────────────────────
const REG_NAMES = ['A', 'B', 'PC', 'SP'];

function RegisterDashboard({ regs, prevRegs }) {
  return (
    <div className="reg-grid">
      {REG_NAMES.map((name, i) => {
        const val = regs[name] ?? 0;
        const prev = prevRegs[name] ?? 0;
        const changed = val !== prev;
        return (
          <div key={name} className={`reg-card ${changed ? 'changed' : ''}`}>
            <div className="reg-name">{name}</div>
            <div className="reg-val">{val}</div>
            <div className="reg-hex">0x{toHex(val, 4)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Trace Panel ────────────────────────────────────────────────────────────
function TracePanel({ trace, activeStep, onStepClick }) {
  const tbodyRef = useRef(null);

  useEffect(() => {
    if (tbodyRef.current && activeStep >= 0) {
      const row = tbodyRef.current.querySelector(`[data-step="${activeStep}"]`);
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeStep]);

  if (!trace) return (
    <div className="empty-state">
      <Activity size={36} />
      <p>Execution trace will appear here</p>
    </div>
  );

  const steps = trace.steps || [];

  return (
    <div style={{ overflow: 'auto', height: '100%' }}>
      <table className="trace-table">
        <thead>
          <tr>
            <th>PC</th>
            <th>Mnemonic</th>
            <th>Operand</th>
            <th>A</th>
            <th>B</th>
            <th>SP</th>
          </tr>
        </thead>
        <tbody ref={tbodyRef}>
          {steps.map((s) => {
            const opcode = s.instr & 0xFF;
            const operand = s.instr >> 8;
            const mnemonic = OPCODE_NAMES[opcode] ?? `OP${opcode}`;
            const hasNoOp = ['add','sub','shl','shr','a2sp','sp2a','return','HALT'].includes(mnemonic);
            return (
              <tr
                key={s.step}
                data-step={s.step}
                className={activeStep === s.step ? 'active' : ''}
                onClick={() => onStepClick(s.step)}
                style={{ cursor: 'pointer' }}
              >
                <td className="mono">{toHex(s.pc, 4)}</td>
                <td className="mono" style={{ color: 'var(--color-mnemonic)' }}>{mnemonic}</td>
                <td className="mono" style={{ color: 'var(--color-operand)' }}>
                  {hasNoOp ? '—' : operand}
                </td>
                <td className="mono">{s.regs.A}</td>
                <td className="mono">{s.regs.B}</td>
                <td className="mono">{s.regs.SP}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {trace.truncated && (
        <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--warning)', background: 'rgba(245,158,11,0.08)', borderTop: '1px solid rgba(245,158,11,0.2)' }}>
          ⚠ Trace truncated at {trace.total_steps} steps (max reached)
        </div>
      )}
    </div>
  );
}

// ── Memory Panel ─────────────────────────────────────────────────────────────
function MemoryPanel({ trace, activeStep }) {
  const [page, setPage] = useState(0);
  const initMem = trace?.metadata?.initial_memory;
  if (!trace || !initMem) return (
    <div className="empty-state">
      <Database size={36} />
      <p>Memory state will appear here after assembly</p>
    </div>
  );

  const memSize = trace?.metadata?.memory_size || 65536;
  const WORDS_PER_PAGE = 512;
  const totalPages = Math.ceil(memSize / WORDS_PER_PAGE);

  const memState = new Map();
  (initMem || []).forEach((val, i) => memState.set(i, val));

  let lastWritten = new Set();
  const steps = trace.steps || [];
  
  for (let i = 0; i < activeStep && i < steps.length; i++) {
    const writes = steps[i].memWrites || [];
    if (i === activeStep - 1) lastWritten.clear(); // highlight what changed in the just-executed step
    for (const w of writes) {
      memState.set(w.addr, w.new);
      if (i === activeStep - 1) lastWritten.add(w.addr);
    }
  }

  const displayMem = [];
  const startAddr = page * WORDS_PER_PAGE;
  const endAddr = Math.min(startAddr + WORDS_PER_PAGE, memSize);
  
  for (let addr = startAddr; addr < endAddr; addr++) {
    displayMem.push([addr, memState.get(addr) || 0]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Memory Toolbar for Pagination */}
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', borderBottom: '1px solid var(--border-solid)', alignItems: 'center', flexShrink: 0 }}>
         <button onClick={() => setPage(0)} className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 11 }}>Code (0x0000)</button>
         <button onClick={() => setPage(Math.floor((memSize - 1) / WORDS_PER_PAGE))} className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 11 }}>Stack (0xFFFF)</button>
         <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
           <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn btn-ghost" style={{ padding: '4px 8px' }}>&lt;</button>
           <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Page {page + 1} / {totalPages}</span>
           <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="btn btn-ghost" style={{ padding: '4px 8px' }}>&gt;</button>
         </div>
      </div>

      <div style={{ overflow: 'auto', flex: 1 }}>
        <div className="memory-grid">
          {displayMem.map(([addr, val]) => {
            const changed = lastWritten.has(addr);
            const inUse = val !== 0 || addr < (initMem?.length || 0);
            return (
              <div key={addr} className={`memory-cell ${changed ? 'changed' : ''} ${inUse ? 'in-use' : ''}`}>
                <span className="addr">0x{toHex(addr, 4)}</span>
                <span className="val">0x{toHex(val, 8)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Error Toast ──────────────────────────────────────────────────────────────
function ErrorToast({ message, onClose }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setLeaving(true);
      setTimeout(onClose, 220);
    }, 9000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`error-toast ${leaving ? 'leaving' : ''}`}>
      <div className="toast-icon">
        <AlertTriangle size={16} color="#ef4444" />
      </div>
      <div className="toast-body">
        <div className="toast-title">Assembler Error</div>
        <div className="toast-msg">{message}</div>
      </div>
      <button className="toast-close" onClick={() => { setLeaving(true); setTimeout(onClose, 220); }}>
        <X size={14} />
      </button>
    </div>
  );
}

// ── Monaco SARS Language ──────────────────────────────────────────────────
function defineSarsLanguage(monaco) {
  monaco.languages.register({ id: 'sars' });
  monaco.languages.setMonarchTokensProvider('sars', {
    keywords: [
      'ldc','adc','ldl','stl','ldnl','stnl',
      'add','sub','shl','shr','adj','a2sp',
      'sp2a','call','return','brz','brlz','br','HALT',
      'data','SET'
    ],
    tokenizer: {
      root: [
        [/;.*$/, 'comment'],
        [/\b(ldc|adc|ldl|stl|ldnl|stnl|add|sub|shl|shr|adj|a2sp|sp2a|call|return|brz|brlz|br|HALT|data|SET)\b/, 'keyword'],
        [/[a-zA-Z_][a-zA-Z0-9_]*(?=\s*:)/, 'type'],
        [/0x[0-9a-fA-F]+/, 'number.hex'],
        [/-?\d+/, 'number'],
        [/[a-zA-Z_][a-zA-Z0-9_]*/, 'identifier'],
      ],
    },
  });

  monaco.editor.defineTheme('sars-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment',    foreground: '5c6370', fontStyle: 'italic' },
      { token: 'keyword',    foreground: 'c792ea', fontStyle: 'bold' },
      { token: 'type',       foreground: '89ddff' },   // labels → cyan
      { token: 'number',     foreground: 'f78c6c' },
      { token: 'number.hex', foreground: 'f78c6c' },
      { token: 'identifier', foreground: 'd4d4d4' },
    ],
    colors: {
      'editor.background':           '#09090b',
      'editor.foreground':           '#d4d4d4',
      'editorLineNumber.foreground': '#4b5563',
      'editorLineNumber.activeForeground': '#9ca3af',
      'editor.lineHighlightBackground': '#18181b',
      'editorCursor.foreground':     '#6366f1',
      'editor.selectionBackground':  '#3f3f5560',
      'editorBracketMatch.background': '#6366f130',
      'scrollbar.shadow':            '#00000000',
    },
  });

  monaco.editor.defineTheme('sars-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment',    foreground: 'abb0b6', fontStyle: 'italic' },
      { token: 'keyword',    foreground: 'fa8d3e', fontStyle: 'bold' },
      { token: 'type',       foreground: '399ee6' },   // labels
      { token: 'number',     foreground: 'a37acc' },
      { token: 'number.hex', foreground: 'a37acc' },
      { token: 'identifier', foreground: '5c6166' },
    ],
    colors: {
      'editor.background':           '#fafafa',
      'editor.foreground':           '#5c6166',
      'editorLineNumber.foreground': '#abb0b6',
      'editorLineNumber.activeForeground': '#5c6166',
      'editor.lineHighlightBackground': '#f3f4f5',
      'editorCursor.foreground':     '#ff9940',
      'editor.selectionBackground':  '#e6e6e6',
      'editorBracketMatch.background': '#ed936640',
      'scrollbar.shadow':            '#00000000',
    },
  });
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [code, setCode]                 = useState(SAMPLE);
  const [trace, setTrace]               = useState(null);
  const [activeStep, setActiveStep]     = useState(-1);
  const [running, setRunning]           = useState(false);
  const [error, setError]               = useState(null);
  const [leftTab, setLeftTab]           = useState('editor'); // 'editor' | 'trace'
  const [cursorInfo, setCursorInfo]     = useState('Ln 1, Col 1');
  const [emuLog, setEmuLog]             = useState('');
  const [stepCount, setStepCount]       = useState(0);
  const [theme, setTheme]               = useState('dark');
  const editorRef = useRef(null);

  useEffect(() => {
    if (theme === 'light') document.body.classList.add('light-theme');
    else document.body.classList.remove('light-theme');
  }, [theme]);

  const { currentRegs, previousRegs } = useMemo(() => {
    const defaultRegs = { A: 0, B: 0, PC: 0, SP: 65535 };
    if (!trace || !trace.steps || activeStep < 0) {
      return { currentRegs: defaultRegs, previousRegs: defaultRegs };
    }
    const steps = trace.steps;
    
    if (activeStep < steps.length) {
      // About to execute activeStep: show state BEFORE it runs
      const curr = { ...steps[activeStep].regs };
      const prev = activeStep > 0 ? { ...steps[activeStep - 1].regs } : defaultRegs;
      return { currentRegs: curr, previousRegs: prev };
    } else {
      // Execution finished: show state AFTER the very last step
      const lastStep = steps[steps.length - 1];
      const curr = { ...lastStep.regs };
      for (const rw of (lastStep.regWrites || [])) {
        const names = ['A', 'B', 'PC', 'SP'];
        if (rw.reg < 4) curr[names[rw.reg]] = rw.new;
      }
      const prev = { ...lastStep.regs };
      return { currentRegs: curr, previousRegs: prev };
    }
  }, [trace, activeStep]);

  const handleEditorMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    // Theme is applied via the theme prop on <Editor>, but language must be forced here sometimes
    editor.updateOptions({ language: 'sars' });

    editor.onDidChangeCursorPosition((e) => {
      setCursorInfo(`Ln ${e.position.lineNumber}, Col ${e.position.column}`);
    });
  }, []);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setError(null);

    try {
      const res = await fetch('/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setRunning(false);
        return;
      }

      setEmuLog(data.emuLog || '');

      if (data.trace) {
        setTrace(data.trace);
        const steps = data.trace.steps || [];
        setStepCount(steps.length);
        setActiveStep(steps.length > 0 ? 0 : -1);
      }

      // Switch to relevant tab
      setLeftTab('trace');
    } catch (e) {
      setError(`Network error: ${e.message}`);
    } finally {
      setRunning(false);
    }
  }, [code]);

  // Keyboard shortcut: F5 or Ctrl+Enter
  useEffect(() => {
    const handler = (e) => {
      if ((e.key === 'F5') || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault();
        if (!running) handleRun();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [running, handleRun]);

  return (
    <div className="ide-root">

      {/* ── Toolbar ── */}
      <header className="ide-toolbar">
        <div className="logo">
          <Zap size={18} fill="currentColor" />
          SARS
        </div>

        <div className="toolbar-sep" />

        <button
          className="btn btn-primary"
          onClick={handleRun}
          disabled={running}
          title="Assemble & Load (F5 or Ctrl+Enter)"
        >
          {running
            ? <><Loader2 size={14} className="spinner" /> Assembling…</>
            : <><Play size={14} fill="white" /> Assemble &amp; Load</>
          }
        </button>

        <button 
          className="btn btn-ghost" 
          onClick={() => setActiveStep(prev => Math.max(0, prev - 1))} 
          disabled={running || !trace || activeStep <= 0} 
          title="Step Backward"
        >
          <StepBack size={14} /> Step Back
        </button>

        <button 
          className="btn btn-ghost" 
          onClick={() => setActiveStep(prev => Math.min((trace?.steps?.length || 0), prev + 1))} 
          disabled={running || !trace || activeStep >= (trace?.steps?.length || 0)} 
          title="Step Forward"
        >
          Step Fwd <StepForward size={14} />
        </button>

        <button 
          className="btn btn-ghost" 
          onClick={() => setActiveStep(trace?.steps?.length || 0)} 
          disabled={running || !trace || activeStep >= (trace?.steps?.length || 0)} 
          title="Run All Instructions"
        >
          Run All <FastForward size={14} />
        </button>

        <div className="toolbar-sep" />
        
        <button className="btn btn-ghost" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="Toggle Theme (Light/Dark)">
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          {emuLog && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {emuLog}
            </span>
          )}
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="ide-content">

        {/* LEFT: Editor & Trace */}
        <div className="panel" style={{ minHeight: 0 }}>
          <div className="panel-header" style={{ paddingRight: 8 }}>
            <div className="dot" style={{ background: leftTab === 'editor' ? '#f59e0b' : '#10b981' }} />
            {leftTab === 'editor' ? <Terminal size={12} /> : <List size={12} />}
            {leftTab === 'editor' ? 'editor — temp.asm' : 'Execution Trace'}
            {leftTab === 'editor' && (
              <span style={{ marginLeft: 16, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 400 }}>
                {cursorInfo}
              </span>
            )}
            <div className="tab-bar" style={{ marginLeft: 'auto' }}>
              <button className={`tab ${leftTab === 'editor' ? 'active' : ''}`} onClick={() => setLeftTab('editor')}>
                Editor
              </button>
              <button className={`tab ${leftTab === 'trace' ? 'active' : ''}`} onClick={() => setLeftTab('trace')}>
                Trace {trace ? `(${(trace.steps || []).length})` : ''}
              </button>
            </div>
          </div>
          <div className="panel-body" style={{ padding: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: leftTab === 'editor' ? 'block' : 'none', flex: 1, minHeight: 0 }}>
            <Editor
              height="100%"
              defaultLanguage="sars"
              language="sars"
              theme={theme === 'light' ? 'sars-light' : 'sars-dark'}
              value={code}
              onChange={(v) => setCode(v ?? '')}
              beforeMount={defineSarsLanguage}
              onMount={handleEditorMount}
              options={{
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
                fontLigatures: true,
                lineNumbers: 'on',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                renderLineHighlight: 'line',
                cursorBlinking: 'phase',
                cursorSmoothCaretAnimation: 'on',
                smoothScrolling: true,
                padding: { top: 12, bottom: 12 },
                tabSize: 8,
                wordWrap: 'off',
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                scrollbar: {
                  vertical: 'auto',
                  horizontal: 'auto',
                  verticalScrollbarSize: 6,
                  horizontalScrollbarSize: 6,
                },
              }}
            />
            </div>
            {leftTab === 'trace' && (
              <TracePanel trace={trace} activeStep={activeStep} onStepClick={setActiveStep} />
            )}
          </div>
        </div>

        {/* RIGHT: Listing + Trace */}
        <div className="right-col">

          {/* Registers */}
          <div className="panel" style={{ flex: 'none' }}>
            <div className="panel-header">
              <div className="dot" style={{ background: '#6366f1' }} />
              <Cpu size={12} />
              Registers
              {stepCount > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>
                  {stepCount} steps executed
                </span>
              )}
            </div>
            <RegisterDashboard regs={currentRegs} prevRegs={previousRegs} />
          </div>

          {/* Memory Panel */}
          <div className="panel" style={{ flex: 1, minHeight: 0 }}>
            <div className="panel-header">
              <div className="dot" style={{ background: '#3b82f6' }} />
              <Database size={12} />
              Memory View
            </div>
            <div className="panel-body" style={{ padding: 0 }}>
              <MemoryPanel trace={trace} activeStep={activeStep} />
            </div>
          </div>

        </div>
      </main>

      {/* ── Status Bar ── */}
      <footer className="ide-statusbar">
        <span className="statusbar-item"><Zap size={10} fill="white" /> SARS</span>
        <span className="statusbar-item">SARS Assembly</span>
        {trace && <span className="statusbar-item">✓ Assembled</span>}
        {trace && <span className="statusbar-item">{stepCount} steps</span>}
        <span style={{ marginLeft: 'auto' }} className="statusbar-item">{cursorInfo}</span>
      </footer>

      {/* ── Error Toast ── */}
      {error && <ErrorToast message={error} onClose={() => setError(null)} />}

    </div>
  );
}
