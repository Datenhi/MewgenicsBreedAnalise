#!/usr/bin/env python3
"""Extract names via discovered rule + gender/class fields from cat blobs."""
import sqlite3, struct, re

con = sqlite3.connect('/home/z/my-project/upload/steamcampaign01.sav')
cur = con.cursor()

def extract_name(d):
    """name_len = byte@17; name at 22 + (byte@21 & 1), UTF-16LE."""
    nlen = d[17]
    off = 22 + (d[21] & 1)
    raw = d[off:off + nlen*2]
    try:
        name = raw.decode('utf-16-le')
    except Exception:
        name = repr(raw)
    return name, off, nlen

def ascii_runs(d, minlen=3):
    return [(m.start(), m.group().decode('ascii', 'replace')) for m in re.finditer(rb'[\x20-\x7e]{%d,}' % minlen, d)]

print("=== NAMES via rule ===")
cur.execute("SELECT key, data FROM cats ORDER BY key")
bad = 0
for k, d in cur.fetchall():
    try:
        name, off, nlen = extract_name(d)
        ok = all(32 <= ord(c) < 127 for c in name)
    except Exception as e:
        name, off, nlen, ok = f'ERR {e}', -1, -1, False
    if not ok or len(name) != nlen:
        bad += 1
        print(f"key={k}: name='{name}' @{off} nlen={nlen}  <<< CHECK")
print("bad:", bad)

print("\n=== ASCII runs in cat key=1 (Junkman) ===")
d = con.execute("SELECT data FROM cats WHERE key=1").fetchone()[0]
for off, s in ascii_runs(d, 3):
    print(f"  @{off}: '{s}'")

print("\n=== ASCII runs in cat key=2 (Hollie Nayn) ===")
d = con.execute("SELECT data FROM cats WHERE key=2").fetchone()[0]
for off, s in ascii_runs(d, 3):
    print(f"  @{off}: '{s}'")

print("\n=== gender check across all cats ===")
cur.execute("SELECT key, data FROM cats ORDER BY key")
from collections import Counter
gcnt = Counter()
for k, d in cur.fetchall():
    runs = [s for _, s in ascii_runs(d, 4)]
    g = 'unknown'
    for s in runs:
        if 'female' in s: g = 'female'; break
        if 'male' in s: g = 'male'; break
    gcnt[g] += 1
print(gcnt)

print("\n=== class (last ascii run) sample ===")
cur.execute("SELECT key, data FROM cats ORDER BY key LIMIT 20")
for k, d in cur.fetchall():
    runs = ascii_runs(d, 4)
    print(f"key={k:3d}: runs={[s for _, s in runs]}")
