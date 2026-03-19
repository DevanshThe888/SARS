const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

function runExe(exe, args, cwd) {
  return new Promise((resolve) => {
    execFile(exe, args, { cwd, timeout: 8000, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ err, stdout, stderr });
    });
  });
}

(async () => {
  const BIN_DIR = __dirname;
  const ASM_EXE = path.join(BIN_DIR, 'asm.exe');
  const EMU_EXE = path.join(BIN_DIR, 'emu.exe');
  
  console.log('--- ASM ---');
  const asmRes = await runExe(ASM_EXE, ['test.asm', 'test.o', 'test.lst'], BIN_DIR);
  console.log(asmRes);
  console.log('test.o exists:', fs.existsSync(path.join(BIN_DIR, 'test.o')));

  console.log('\n--- EMU ---');
  const emuRes = await runExe(EMU_EXE, ['test.o', 'test.trace.json'], BIN_DIR);
  console.log(emuRes);
  console.log('test.trace.json exists:', fs.existsSync(path.join(BIN_DIR, 'test.trace.json')));
})();
