#!/usr/bin/env python3
"""Full pedigree dump: all int64 values with classification, to find section layout."""
import sqlite3, struct

con = sqlite3.connect('/home/z/my-project/upload/steamcampaign01.sav')
cur = con.cursor()
cur.execute("SELECT data FROM files WHERE key='pedigree'")
d = cur.fetchone()[0]
n = len(d) // 8

def cls(v):
    if v == -1: return 'X'      # none
    if 1 <= v <= 99: return f'{v}'
    f = struct.unpack('<d', struct.pack('<q', v))[0]
    if f == 0.0: return '.'
    if 0.001 <= abs(f) <= 2.0: return f'*{f:.5g}'
    return f'<{v & 0xffffffffffffffff:016x}>'

out = []
for i in range(n):
    v = struct.unpack('<q', d[i*8:i*8+8])[0]
    out.append(f'{i}:{cls(v)}')

for i in range(0, len(out), 8):
    print(' '.join(f'{x:<18}' for x in out[i:i+8]))
