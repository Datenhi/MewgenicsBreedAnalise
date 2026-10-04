#!/usr/bin/env python3
"""Extract gender, digits-after-gender, class; check correlations."""
import sqlite3, struct, re

con = sqlite3.connect('/home/z/my-project/upload/steamcampaign01.sav')
cur = con.cursor()

def utf16_name(d):
    # find first printable UTF-16LE run >= 2 chars starting in bytes 20..30
    best = None
    for start in range(20, 31):
        chars = []
        o = start
        while o + 1 < len(d):
            c = d[o] | (d[o+1] << 8)
            if 32 <= c < 127:
                chars.append(chr(c)); o += 2
            else:
                break
        if len(chars) >= 2 and (best is None or len(chars) > len(best[1])):
            pass
        if len(chars) >= 2:
            return start, ''.join(chars)
    return -1, '???'

rows = []
cur.execute("SELECT key, data FROM cats ORDER BY key")
for k, d in cur.fetchall():
    off, name = utf16_name(d)
    # gender: find 'male' ascii
    g, digits = '?', ''
    m = re.search(rb'female', d)
    if m: g = 'F'
    else:
        m = re.search(rb'male', d)
        if m: g = 'M'
    if m:
        p = m.end()
        mm = re.match(rb'[0-9]{1,4}', d[p:p+4])
        if mm: digits = mm.group().decode()
    # class: ascii runs, take ones that look like class names
    runs = [x.decode('ascii','replace') for x in re.findall(rb'[A-Z][A-Za-z]{3,}', d)]
    rows.append((k, off, name, g, digits, runs))

from collections import Counter
print("gender counts:", Counter(r[3] for r in rows))
print("\nkey | name | g | digits | class-ish runs")
for k, off, name, g, digits, runs in rows:
    # filter out known noise
    noise = {'DefaultMove','None','male','female'}
    interesting = [r for r in runs if r not in noise][:8]
    print(f"{k:3d} | {name!r:28s} | {g} | {digits:>4s} | {interesting}")
