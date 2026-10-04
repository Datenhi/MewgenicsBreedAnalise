#!/usr/bin/env python3
"""Collect cat IDs from cats table; scan pedigree blob as int64/double stream."""
import sqlite3, struct

con = sqlite3.connect('/home/z/my-project/upload/steamcampaign01.sav')
cur = con.cursor()

print("=== CAT IDs (first int32 of blob) vs key ===")
ids = []
cur.execute("SELECT key, data FROM cats ORDER BY key")
for k, d in cur.fetchall():
    cid = struct.unpack('<i', d[0:4])[0]
    ver = struct.unpack('<i', d[4:8])[0]
    ids.append((k, cid, ver, len(d)))
for row in ids:
    print(row)

print("\n=== pedigree as int64 stream (first 400 values) ===")
cur.execute("SELECT data FROM files WHERE key='pedigree'")
d = cur.fetchone()[0]
print("len:", len(d), "= ", len(d)//8, "int64s (+", len(d)%8, "bytes remainder)")

vals = []
for off in range(0, len(d) - 7, 8):
    i64 = struct.unpack('<q', d[off:off+8])[0]
    f64 = struct.unpack('<d', d[off:off+8])[0]
    vals.append((off, i64, f64))

for off, i64, f64 in vals[:400]:
    note = ''
    # annotate doubles in [0,2] range
    if 0.0 <= abs(f64) <= 2.0 and abs(f64) > 1e-10:
        note = f'  <-- double {f64:.4f}'
    print(f'{off:6d}  i64={i64:<20}{note}')
