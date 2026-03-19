#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include <map>
#include <set>
#include <iomanip>
#include <cstdint>
#include <algorithm>

using namespace std;

// Opcode map
map<string, int> opcodes = {
    {"ldc", 0}, {"adc", 1}, {"ldl", 2}, {"stl", 3}, {"ldnl", 4}, {"stnl", 5},
    {"add", 6}, {"sub", 7}, {"shl", 8}, {"shr", 9}, {"adj", 10}, {"a2sp", 11},
    {"sp2a", 12}, {"call", 13}, {"return", 14}, {"brz", 15}, {"brlz", 16},
    {"br", 17}, {"HALT", 18}
};

set<string> no_operand = {"add", "sub", "shl", "shr", "a2sp", "sp2a", "return", "HALT"};

struct SourceLine {
    int line_number;
    string original_text;
    string label;
    string mnemonic;
    string operand_str;
    int pc; // PC address (only valid if it generates code)
    bool has_instruction;
};

// Converts string (dec, hex, oct, or label) to integer value
bool parseValue(const string& str, map<string, int>& symbol_table, int& out_val, int pc = 0, bool is_relative = false) {
    if (str.empty()) return false;
    
    // Check if it's a number
    char* end;
    long val = strtol(str.c_str(), &end, 0); // Handles 0x, 0, and normal dec
    if (*end == '\0') {
        out_val = static_cast<int>(val);
        return true;
    }
    
    // Check if it's a label
    if (symbol_table.count(str)) {
        if (is_relative) {
            out_val = symbol_table[str] - (pc + 1);
        } else {
            out_val = symbol_table[str];
        }
        return true;
    }
    return false;
}

int main(int argc, char* argv[]) {
    if (argc < 4) {
        cout << "Usage: " << argv[0] << " <input.asm> <output.o> <output.lst>\n";
        return 1;
    }
    
    string infile = argv[1];
    string objfile = argv[2];
    string lstfile = argv[3];
    
    ifstream fin(infile);
    if (!fin) {
        cerr << "Error: Cannot open input file " << infile << "\n";
        return 1;
    }
    
    vector<SourceLine> lines;
    map<string, int> symbol_table;
    int pc = 0;
    
    string raw_line;
    int line_num = 1;
    
    // Pass 1: Parse syntax, build symbol table
    vector<string> errors;
    
    while (getline(fin, raw_line)) {
        SourceLine sl;
        sl.line_number = line_num++;
        sl.original_text = raw_line;
        sl.pc = pc;
        sl.has_instruction = false;
        
        // Remove comments
        string clean = raw_line;
        size_t semi = clean.find(';');
        if (semi != string::npos) {
            clean = clean.substr(0, semi);
        }
        
        // Trim whitespace
        clean.erase(0, clean.find_first_not_of(" \t\r\n"));
        clean.erase(clean.find_last_not_of(" \t\r\n") + 1);
        
        if (clean.empty()) {
            lines.push_back(sl);
            continue;
        }
        
        string remaining = clean;
        
        // Extract label
        size_t colon = remaining.find(':');
        string label_str = "";
        if (colon != string::npos) {
            label_str = remaining.substr(0, colon);
            stringstream ls(label_str);
            string lbl;
            ls >> lbl;
            
            // Validation
            if (lbl.empty() || !isalpha(lbl[0])) {
                errors.push_back("Line " + to_string(sl.line_number) + ": Invalid label name: " + label_str);
            } else if (symbol_table.count(lbl)) {
                errors.push_back("Line " + to_string(sl.line_number) + ": Duplicate label: " + lbl);
            } else {
                sl.label = lbl;
                symbol_table[lbl] = pc;
            }
            
            remaining = remaining.substr(colon + 1);
            remaining.erase(0, remaining.find_first_not_of(" \t\r\n"));
        }
        
        // Extract instruction
        if (!remaining.empty()) {
            stringstream is(remaining);
            string mnemonic, operand;
            is >> mnemonic;
            
            if (mnemonic == "SET") {
                string val_str;
                if (is >> val_str) {
                    int val = 0;
                    if (parseValue(val_str, symbol_table, val)) {
                        if (!sl.label.empty()) {
                            symbol_table[sl.label] = val; // override pc
                        } else {
                            errors.push_back("Line " + to_string(sl.line_number) + ": SET without label");
                        }
                    } else {
                        errors.push_back("Line " + to_string(sl.line_number) + ": Invalid SET value: " + val_str);
                    }
                } else {
                    errors.push_back("Line " + to_string(sl.line_number) + ": Missing operand for SET");
                }
            } else if (mnemonic == "data") {
                if (is >> operand) {
                    sl.mnemonic = mnemonic;
                    sl.operand_str = operand;
                    sl.has_instruction = true;
                    pc++;
                } else {
                    errors.push_back("Line " + to_string(sl.line_number) + ": Missing operand for data");
                }
            } else if (opcodes.count(mnemonic)) {
                sl.mnemonic = mnemonic;
                sl.has_instruction = true;
                if (!no_operand.count(mnemonic)) {
                    if (is >> operand) {
                        sl.operand_str = operand;
                    } else {
                        errors.push_back("Line " + to_string(sl.line_number) + ": Missing operand for " + mnemonic);
                    }
                }
                pc++;
            } else {
                errors.push_back("Line " + to_string(sl.line_number) + ": Unknown mnemonic: " + mnemonic);
            }
            
            // Check for extra tokens
            string extra;
            if (is >> extra) {
                errors.push_back("Line " + to_string(sl.line_number) + ": Unexpected extra token: " + extra);
            }
        }
        lines.push_back(sl);
    }
    
    if (!errors.empty()) {
        for (const string& err : errors) {
            cerr << err << "\n";
        }
        return 1;
    }
    
    // Pass 2: Generate code
    ofstream fout_obj(objfile, ios::binary);
    ofstream fout_lst(lstfile);
    
    if (!fout_obj || !fout_lst) {
        cerr << "Error: Cannot open output files\n";
        return 1;
    }
    
    for (const auto& sl : lines) {
        if (!sl.has_instruction) {
            // Write listing without machine code
            fout_lst << setw(8) << " " << " " << setw(8) << " " << " " << sl.original_text << "\n";
            continue;
        }
        
        int32_t machine_code = 0;
        
        if (sl.mnemonic == "data") {
            int val = 0;
            if (parseValue(sl.operand_str, symbol_table, val)) {
                machine_code = val;
            } else {
                cerr << "Error on line " << sl.line_number << ": Invalid operand '" << sl.operand_str << "'\n";
                return 1;
            }
        } else {
            int opcode = opcodes[sl.mnemonic];
            int operand_val = 0;
            
            if (!no_operand.count(sl.mnemonic)) {
                bool is_relative = (sl.mnemonic == "call" || sl.mnemonic == "brz" || sl.mnemonic == "brlz" || sl.mnemonic == "br");
                if (!parseValue(sl.operand_str, symbol_table, operand_val, sl.pc, is_relative)) {
                    cerr << "Error on line " << sl.line_number << ": Cannot resolve operand '" << sl.operand_str << "'\n";
                    return 1;
                }
            }
            
            machine_code = (operand_val << 8) | (opcode & 0xFF);
        }
        
        // Write listing
        fout_lst << hex << uppercase << setfill('0') << setw(8) << sl.pc << " " 
                 << setw(8) << static_cast<uint32_t>(machine_code) << " "
                 << sl.original_text << "\n";
                 
        // Write object file in little-endian explicitly
        uint8_t bytes[4];
        bytes[0] = machine_code & 0xFF;
        bytes[1] = (machine_code >> 8) & 0xFF;
        bytes[2] = (machine_code >> 16) & 0xFF;
        bytes[3] = (machine_code >> 24) & 0xFF;
        fout_obj.write(reinterpret_cast<char*>(bytes), 4);
    }
    
    cout << "Assembly successful.\n";
    return 0;
}