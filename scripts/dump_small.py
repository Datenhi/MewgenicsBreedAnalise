#!/usr/bin/env python3
"""Dump small blobs to decode serialization primitives."""
import sqlite3

con = sqlite3.connect('/home/z/my-project/upload/steamcampaign01.sav')
cur = con.cursor()

def hexdump(data):
    for off in range(0, len(data), 16):
        chunk = data[off:off+16]
        hexs = ' '.join(f'{b:02x}' for b in chunk)
        asc = ''.join(chr(b) if 32 <= b < 127 else '.' for b in chunk)
        print(f'{off:6d}  {hexs:<48}  {asc}')

for key in ['inventory_backpack', 'house_unlocks', 'unlocks', 'tutorial_tokens']:
    cur.execute("SELECT data FROM files WHERE key=?", (key,))
    d = cur.fetchone()[0]
    print(f"\n===== {key} (len={len(d)}) =====")
    hexdump(d)

# one furniture blob
cur.execute("SELECT key, data FROM furniture ORDER BY key LIMIT 1")
k, d = cur.fetchone()
print(f"\n===== furniture key={k} (len={len(d)}) =====")
hexdump(d)
