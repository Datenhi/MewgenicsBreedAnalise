#!/usr/bin/env python3
"""Verify pedigree record structure: (child, p1, p2, inbreeding)."""
import sqlite3, struct

con = sqlite3.connect('/home/z/my-project/upload/steamcampaign01.sav')
cur = con.cursor()
cur.execute("SELECT data FROM files WHERE key='pedigree'")
d = cur.fetchone()[0]

n = len(d) // 8
vals = [struct.unpack('<q', d[i*8:i*8+8])[0] for i in range(n)]

def is_double_like(v):
    f = struct.unpack('<d', struct.pack('<q', v))[0]
    return v == 0 or (0.0 <= f <= 1000.0 and abs(f) < 1e10 and (f == 0 or abs(f) >= 1e-3 or True))

# Walk from offset 168 (index 21): records of 4 slots
i = 21
records = []
meta = []
errors = []
while i + 3 < n:
    a, b, c, dd = vals[i], vals[i+1], vals[i+2], vals[i+3]
    ok_a = (1 <= a <= 99)
    ok_b = (b == -1 or 1 <= b <= 99)
    ok_c = (c == -1 or 1 <= c <= 99)
    if ok_a and ok_b and ok_c:
        f = struct.unpack('<d', struct.pack('<q', dd))[0]
        records.append((i*8, a, b, c, f))
        i += 4
    else:
        meta.append((i*8, a, b, c, dd))
        i += 1

print(f"records parsed: {len(records)}, meta slots: {len(meta)}")
kids = [r[1] for r in records]
print("children covered:", sorted(kids))
missing = [k for k in range(1, 100) if k not in kids]
print("missing keys 1-99:", missing)
dups = [k for k in set(kids) if kids.count(k) > 1]
print("duplicate children:", dups)

print("\n=== META slots (non-record int64s) ===")
seen = set()
for off, a, b, c, dd in meta[:60]:
    raw = d[off:off+8]
    print(f"@{off:6d}: {raw.hex()}  (i64={struct.unpack('<q', raw)[0]})")

print("\n=== tail of blob (last 160 bytes) ===")
tail = d[-160:]
for off in range(0, len(tail), 16):
    chunk = tail[off:off+16]
    print(f'{len(d)-160+off:6d}  ' + ' '.join(f'{b:02x}' for b in chunk))

print("\n=== sample records ===")
for r in records[:15]:
    print(r)
print("...")
for r in records[-10:]:
    print(r)
