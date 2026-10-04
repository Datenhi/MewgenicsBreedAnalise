#!/usr/bin/env python3
"""Analyze Mewgenics save blob structure."""
import sqlite3, struct, sys

con = sqlite3.connect('/home/z/my-project/upload/steamcampaign01.sav')
cur = con.cursor()

def hexdump(data, start=0, end=None, width=16):
    if end is None: end = len(data)
    for off in range(0, len(data), width):
        chunk = data[off:off+width]
        if off >= end or off + width <= start or off > end or (start and off + width <= start):
            if not (start <= off <= end): continue
        hexs = ' '.join(f'{b:02x}' for b in chunk)
        asc = ''.join(chr(b) if 32 <= b < 127 else '.' for b in chunk)
        print(f'{off:6d}  {hexs:<{width*3}}  {asc}')

# Dump first 3 cats fully
cur.execute("SELECT key, data FROM cats ORDER BY key LIMIT 3")
for k, d in cur.fetchall():
    print(f"\n{'='*70}\nCAT key={k}  len={len(d)}\n{'='*70}")
    hexdump(d)
