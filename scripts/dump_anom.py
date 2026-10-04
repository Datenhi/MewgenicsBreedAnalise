#!/usr/bin/env python3
"""Dump raw bytes around name area for anomalous cats."""
import sqlite3

con = sqlite3.connect('/home/z/my-project/upload/steamcampaign01.sav')
cur = con.cursor()

def hd(d, start, end):
    for off in range(start, end, 16):
        chunk = d[off:off+16]
        hexs = ' '.join(f'{b:02x}' for b in chunk)
        asc = ''.join(chr(b) if 32 <= b < 127 else '.' for b in chunk)
        print(f'{off:5d}  {hexs:<48}  {asc}')

for k in [2, 7, 20, 26, 28, 43, 11]:
    d = con.execute("SELECT data FROM cats WHERE key=?", (k,)).fetchone()[0]
    print(f"\n===== key={k} (len={len(d)}) bytes 0-70 =====")
    hd(d, 0, 70)
