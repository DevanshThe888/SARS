; --- data_demo.asm ---
    ldc 100        ; Load 100 into accumulator
    ldc VAR_ADDR   ; Get the address of our data
    ldnl 0         ; Load the value AT that address (should be 42)
    add            ; 100 + 42 = 142
    HALT           ; Stop

VAR_ADDR: SET 5        ; Alias for the address of our data
my_storage: data 42    ; This is our variable at PC 5