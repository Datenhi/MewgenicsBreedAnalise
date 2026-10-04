#!/usr/bin/env python3
"""Scan pedigree blob; classify int64 values; find structure."""
import sqlite3, struct

con = sqlite3.connect('/home/z/my-project/upload/steamcampaign01.sav')
cur = con.cursor()
cur.execute("SELECT data FROM files WHERE key='pedigree'")
d = cur.fetchone()[0]

n = len(d) // 8
print(f"len={len(d)}, int64 count={n}")

# Print values from offset 160 onward, compact, 6 per line, annotated
def classify(i64):
    if i64 == -1: return 'NONE'
    if 0 <= i64 <= 200: return f'ID?({i64})'
    # check if it's a double in [0, 2]
    f = struct.unpack('<d', struct.pack('<q', i64))[0]
    if 0.0 < abs(f) <= 4.0: return f'dbl({f:.4g})'
    return 'BIG'

out = []
for off in range(160, len(d) - 7, 8):
    i64 = struct.unpack('<q', d[off:off+8])[0]
    out.append(f'{off}:{classify(i64)}')

# print 5 per line
for i in range(0, len(out), 5):
    print('  '.join(f'{x:<16}' for x in out[i:i+5]))
