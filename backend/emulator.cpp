#include <iostream>
#include <fstream>
#include <vector>
#include <map>
#include <string>
#include <iomanip>
#include <cstdint>
#include <sstream>

using namespace std;

// Generate JSON string from a vector of writes
struct WriteDelta {
    int index;
    uint32_t old_val;
    uint32_t new_val;
    
    string toJson() const {
        return "{\"addr\":" + to_string(index) + ",\"old\":" + to_string(old_val) + ",\"new\":" + to_string(new_val) + "}";
    }
    
    string toJsonReg() const {
        return "{\"reg\":" + to_string(index) + ",\"old\":" + to_string((int)old_val) + ",\"new\":" + to_string((int)new_val) + "}";
    }
};

string escapeJson(const string &s) {
    ostringstream o;
    for (auto c = s.cbegin(); c != s.cend(); c++) {
        if (*c == '"' || *c == '\\' || ('\x00' <= *c && *c <= '\x1f')) {
            o << "\\u"
              << hex << setw(4) << setfill('0') << (int)*c;
        } else {
            o << *c;
        }
    }
    return o.str();
}

int main(int argc, char* argv[]) {
    int max_steps = 5000;
    int memory_size = 65536;
    int checkpoint_interval = 100;
    string objfile = "";
    string tracefile = "";
    
    for (int i = 1; i < argc; i++) {
        string arg = argv[i];
        if (arg == "--max-steps" && i + 1 < argc) {
            max_steps = stoi(argv[++i]);
        } else if (arg == "--memory-size" && i + 1 < argc) {
            memory_size = stoi(argv[++i]);
        } else if (arg == "--checkpoint" && i + 1 < argc) {
            checkpoint_interval = stoi(argv[++i]);
        } else if (objfile.empty()) {
            objfile = arg;
        } else if (tracefile.empty()) {
            tracefile = arg;
        }
    }
    
    if (objfile.empty() || tracefile.empty()) {
        cout << "Usage: " << argv[0] << " [--max-steps N] [--memory-size N] <input.o> <output_trace.json>\n";
        return 1;
    }
    
    vector<int32_t> mem(memory_size, 0);
    int32_t A = 0, B = 0, PC = 0, SP = memory_size - 1;
    
    ifstream fin(objfile, ios::binary);
    if (!fin) {
        cerr << "Error: Could not open " << objfile << "\n";
        return 1;
    }
    
    // Load program into memory
    int code_size = 0;
    while (!fin.eof() && code_size < memory_size) {
        uint8_t bytes[4];
        fin.read(reinterpret_cast<char*>(bytes), 4);
        if (fin.gcount() == 4) {
            int32_t instr = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
            mem[code_size++] = instr;
        }
    }
    
    ofstream fout(tracefile);
    if (!fout) {
        cerr << "Error: Could not open output trace " << tracefile << "\n";
        return 1;
    }
    
    int steps = 0;
    bool halted = false;
    bool truncated = false;
    
    fout << "{\"metadata\":{\"memory_size\":" << memory_size << ",\"word_size\":4,\"entry_pc\":0,\"max_steps\":" << max_steps << ", \"initial_memory\": [";
    for (int i = 0; i < code_size; i++) {
        fout << mem[i] << (i + 1 < code_size ? "," : "");
    }
    fout << "]}, \"steps\": [\n";
    
    vector<string> step_jsons;
    
    while (!halted && steps < max_steps) {
        if (PC < 0 || PC >= memory_size) {
            cerr << "PC out of bounds\n";
            halted = true;
            break;
        }
        
        int32_t instr = mem[PC];
        int opcode = instr & 0xFF;
        int32_t value = instr >> 8;
        
        // Snapshot regs
        int32_t old_A = A, old_B = B, old_PC = PC, old_SP = SP;
        
        vector<WriteDelta> regWrites;
        vector<WriteDelta> memWrites;
        
        auto writeReg = [&](int r, int32_t old_val, int32_t new_val) {
            if (old_val != new_val) {
                regWrites.push_back({r, (uint32_t)old_val, (uint32_t)new_val});
            }
        };
        
        int next_pc = PC + 1;
        PC = next_pc; // Pre-increment
        
        switch (opcode) {
            case 0: // ldc
                B = A; A = value; 
                break;
            case 1: // adc
                A += value; 
                break;
            case 2: // ldl
                B = A; A = mem[SP + value]; 
                break;
            case 3: // stl
                memWrites.push_back({SP + value, (uint32_t)mem[SP + value], (uint32_t)A});
                mem[SP + value] = A; A = B; 
                break;
            case 4: // ldnl
                A = mem[A + value]; 
                break;
            case 5: // stnl
                memWrites.push_back({A + value, (uint32_t)mem[A + value], (uint32_t)B});
                mem[A + value] = B; 
                break;
            case 6: // add
                A = B + A; 
                break;
            case 7: // sub
                A = B - A; 
                break;
            case 8: // shl
                A = B << A; 
                break;
            case 9: // shr
                A = B >> A; 
                break;
            case 10: // adj
                SP = SP + value; 
                break;
            case 11: // a2sp
                SP = A; A = B; 
                break;
            case 12: // sp2a
                B = A; A = SP; 
                break;
            case 13: // call
                B = A; A = PC; PC += value; 
                break;
            case 14: // return
                PC = A; A = B; 
                break;
            case 15: // brz
                if (A == 0) PC += value; 
                break;
            case 16: // brlz
                if (A < 0) PC += value; 
                break;
            case 17: // br
                PC += value; 
                break;
            case 18: // halt
                halted = true; 
                break;
            default:
                cerr << "Unknown opcode: " << opcode << " at PC " << old_PC << "\n";
                halted = true;
                break;
        }
        
        writeReg(0, old_A, A);
        writeReg(1, old_B, B);
        writeReg(2, old_PC, PC);
        writeReg(3, old_SP, SP);
        
        // Output trace step
        ostringstream step_os;
        step_os << "  {\"step\":" << steps << ",\"pc\":" << old_PC << ",\"instr\":" << instr 
                << ",\"regs\":{\"A\":" << old_A << ",\"B\":" << old_B << ",\"PC\":" << old_PC << ",\"SP\":" << old_SP << "}";
                
        step_os << ",\"regWrites\":[";
        for (size_t i = 0; i < regWrites.size(); ++i) {
            step_os << regWrites[i].toJsonReg() << (i + 1 < regWrites.size() ? "," : "");
        }
        step_os << "],\"memWrites\":[";
        for (size_t i = 0; i < memWrites.size(); ++i) {
            step_os << memWrites[i].toJson() << (i + 1 < memWrites.size() ? "," : "");
        }
        step_os << "]}";
        
        step_jsons.push_back(step_os.str());
        
        steps++;
        if (steps >= max_steps && !halted) {
            truncated = true;
        }
    }
    
    for (size_t i = 0; i < step_jsons.size(); ++i) {
        fout << step_jsons[i] << (i + 1 < step_jsons.size() ? ",\n" : "\n");
    }
    
    // Inject truncated flag into metadata (actually we close the list, then we can append the final object keys)
    fout << "],\n\"truncated\":" << (truncated ? "true" : "false") << ",\n\"total_steps\":" << steps << "\n}\n";
    
    if (truncated) {
        cout << "Execution truncated after " << steps << " steps.\n";
    } else {
        cout << "Execution finished successfully in " << steps << " steps.\n";
    }
    
    return 0;
}
