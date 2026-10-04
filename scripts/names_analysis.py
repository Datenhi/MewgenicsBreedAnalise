#!/usr/bin/env python3
"""Comprehensive analysis: cat names + pedigree record structure."""
import sqlite3, struct, re

con = sqlite3.connect('/home/z/my-project/upload/steamcampaign01.sav')
cur = con.cursor()

def utf16_strings(d, minlen=3):
    """Find UTF-16LE printable runs with their offsets."""
    out = []
    i = 0
    while i < len(d) - 1:
        j = i
        chars = []
        while j + 1 < len(d):
            ch = d[j] | (d[j+1] << 8)
            if 0x20 <= ch < 0x7f:
                chars.append(chr(ch)); j += 2
            else:
                break
        if len(chars) >= minlen:
            out.append((i, ''.join(chars)))
            i = j
        else:
            i += 1
    return out

print("=== CAT NAMES: first UTF-16 string + header bytes ===")
cur.execute("SELECT key, data FROM cats ORDER BY key")
mismatch = 0
for k, d in cur.fetchall():
    strs = utf16_strings(d, 3)
    first = strs[0] if strs else (-1, '???')
    b16 = d[16]; i17 = struct.unpack('<h', d[17:19])[0]; b21 = d[21]
    namelen = first[1].count('') - 1
    flag = '' if i17 == namelen else '  <<< MISMATCH'
    if flag: mismatch += 1
    if k <= 12 or flag:
        print(f"key={k:3d} b16={b16:3d} i16@17={i17:3d} b21={b21:02x} name@{first[0]}='{first[1]}' len={namelen}{flag}")
print("total mismatches:", mismatch)

print("\n=== ALL UTF-16 strings in cat key=1 ===")
for off, s in utf16_strings(con.execute("SELECT data FROM cats WHERE key=1").fetchone()[0], 2):
    print(f"  @{off}: '{s}'")

print("\n=== save_file_cat blob ===")
cur.execute("SELECT data FROM files WHERE key='save_file_cat'")
d = cur.fetchone()[0]
print("len:", len(d))
for off, s in utf16_strings(d, 2):
    print(f"  u16@{off}: '{s}'")
# ascii strings
for m in re.finditer(rb'[\x20-\x7e]{4,}', d):
    print(f"  asc@{m.start()}: '{m.group().decode()}'")
