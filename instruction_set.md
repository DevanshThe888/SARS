# Assembly Language Specification

## Overview

This assembly language is designed for a machine with **four registers**:

| Register | Description |
|----------|-------------|
| `A` | Accumulator (top of internal stack) |
| `B` | Second register (internal stack) |
| `PC` | Program Counter |
| `SP` | Stack Pointer |

> All registers are **32 bits** in size.

---

## Instruction Encoding

- Instructions have either **no operands** or a **single operand**.
- The operand is a **signed 2's complement** value.
- Encoding layout:

| Bits | Field |
|------|-------|
| `[7:0]` (bottom 8 bits) | Opcode |
| `[31:8]` (upper 24 bits) | Operand |

---

## Source File Format

This is a **line-based** assembly language — one statement per line.

### Syntax Rules

| Element | Rule |
|---------|------|
| Comments | Begin with `;` — everything after `;` on the line is ignored |
| Blank lines | Permitted and ignored |
| Whitespace | Spaces and tabs at the start of a line are permitted and ignored |
| Label definition | `labelname:` followed by an optional statement |
| Label use | Just the label name |
| Branch labels | Calculate the **branch displacement** |
| Non-branch labels | Use the **label value** directly |
| Valid label name | Alphanumeric string **beginning with a letter** |
| Operand | A label or a number (decimal, hex, or octal) |

### Example Permitted Lines

```asm
; a comment
; another comment
label1:           ; a label on its own
ldc 5             ; an instruction
label2: ldc 5     ; a label and an instruction
adc 5             ; an instruction
label3:ldc label3 ; look — no space between label and mnemonic
```

---

## Instruction Set

> **Note:** The instruction semantics below do **not** show the implicit incrementing of the PC. The PC is incremented to the next instruction before any instruction's actions are performed.

| Mnemonic | Opcode | Operand | Formal Specification | Description |
|----------|--------|---------|----------------------|-------------|
| `data`   | —      | value   | *(reserved)*         | Reserve a memory location, initialized to the value specified |
| `ldc`    | 0      | value   | `B := A; A := value` | Load accumulator with the value specified |
| `adc`    | 1      | value   | `A := A + value` | Add the value specified to the accumulator |
| `ldl`    | 2      | offset  | `B := A; A := memory[SP + offset]` | Load local |
| `stl`    | 3      | offset  | `memory[SP + offset] := A; A := B` | Store local |
| `ldnl`   | 4      | offset  | `A := memory[A + offset]` | Load non-local |
| `stnl`   | 5      | offset  | `memory[A + offset] := B` | Store non-local |
| `add`    | 6      | —       | `A := B + A` | Addition |
| `sub`    | 7      | —       | `A := B - A` | Subtraction |
| `shl`    | 8      | —       | `A := B << A` | Shift left |
| `shr`    | 9      | —       | `A := B >> A` | Shift right |
| `adj`    | 10     | value   | `SP := SP + value` | Adjust SP |
| `a2sp`   | 11     | —       | `SP := A; A := B` | Transfer A to SP |
| `sp2a`   | 12     | —       | `B := A; A := SP` | Transfer SP to A |
| `call`   | 13     | offset  | `B := A; A := PC; PC := PC + offset` | Call procedure |
| `return` | 14     | —       | `PC := A; A := B` | Return from procedure |
| `brz`    | 15     | offset  | `if A == 0 then PC := PC + offset` | Branch to offset if accumulator is zero |
| `brlz`   | 16     | offset  | `if A < 0 then PC := PC + offset` | Branch to offset if accumulator is less than zero |
| `br`     | 17     | offset  | `PC := PC + offset` | Branch to specified offset |
| `HALT`   | 18     | —       | *(stop)*             | Stop the emulator *(not a real instruction)* |
| `SET`    | —      | value   | *(pseudo)*           | Set the label on this line to the specified value (rather than the PC). **Optional extension.** |

---

## Listing File Format

The listing file is produced by the assembler — a human-readable file showing what value is stored at each address.

**Format:** Address followed by zero or one 32-bit values (as 8 hex characters).

### Minimal Format (one value per line)

```
00000000 00000111
00000001 00005AB4
00000002 00006500
00000003 00009D01
```

### Compact Format (four locations per line)

```
00000000 00000111 00005AB4 00006500 00009D01
```

### Preferred Format (with labels and mnemonics)

```
00000000 00000111 br start
00000001 00005AB4 data 0x5ab4
00000002 start:
00000002 00006500 ldc 0x65
00000003 00009D01 adc 0x9d
```

---

## Example Programs

### test1.asm — Valid (no errors expected)

```asm
; test1.asm
label:        ; an unused label
ldc 0
ldc -5
ldc +5
loop: br loop ; an infinite loop
br next       ; offset should be zero
next:
ldc loop      ; load code address
ldc var1      ; forward ref
var1: data 0  ; a variable
```

---

### test2.asm — Error Cases

> Your assembler should detect **all** of the following errors.

```asm
; test2.asm
; Test error handling
label:
label:          ; duplicate label definition
br nonesuch     ; no such label
ldc 08ge        ; not a number
ldc             ; missing operand
add 5           ; unexpected operand
ldc 5, 6        ; extra on end of line
0def:           ; bogus label name
fibble          ; bogus mnemonic
0def            ; bogus mnemonic
```

| Line | Error Type |
|------|------------|
| `label:` (second time) | Duplicate label definition |
| `br nonesuch` | Undefined label |
| `ldc 08ge` | Invalid number literal |
| `ldc` | Missing operand |
| `add 5` | Unexpected operand |
| `ldc 5, 6` | Extra tokens at end of line |
| `0def:` | Invalid label name (starts with digit) |
| `fibble` | Unknown mnemonic |
| `0def` | Unknown mnemonic / invalid label |

---

### test3.asm — SET Pseudo-Instruction

```asm
; test3.asm
; Test SET
val:  SET 75
ldc val
adc val2
val2: SET 66
```

---

### Printing Label Values in Listings

When listing an instruction with a PC-relative operand (e.g. `br`):

1. Calculate the **target address** from the current PC + offset.
2. Search the **label table** for a label at that target address.
3. If found, print the label name; otherwise, print the raw offset.

```
; Source:           br start
; Listing output:   00000000 00000111 br start
; Also acceptable:  00000000 00000111 br 75
```

> You do **not** need to verify that the target address corresponds to a valid instruction — that is the assembly programmer's responsibility.

---

### `ldc result` Explained

```asm
ldc result    ; loads the *address* of the result label as a constant
ldnl 0        ; dereferences: reads memory[result + 0]
```

`ldc` with a label operand loads the **address** of the label as a constant into the accumulator — the assembler simply substitutes the label's numeric value into the operand field.

---

### Errors vs. Warnings

| Type | Definition | Example |
|------|-----------|---------|
| **Error** | Incorrect — prevents assembly completion | Undefined label, duplicate label, invalid number |
| **Warning** | Dubious but valid — assembly still completes | Unused label |

> An unused label is not incorrect, but may indicate a typo or logic error (e.g., a misspelled label reference that silently resolved to a different label). Name your labels clearly and distinctly — avoid names like `var1`, `var2`, `var3`.
