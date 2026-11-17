import json, re, sys

d = sys.argv[1]


def lit(src, name):
    i = src.index('var ' + name)
    s = src.index('=', i) + 1
    while src[s] not in '{[':
        s += 1
    depth = 0
    j = s
    instr = None
    while True:
        c = src[j]
        if instr:
            if c == '\\':
                j += 1
            elif c == instr:
                instr = None
        elif c in '"\'':
            instr = c
        elif c in '{[':
            depth += 1
        elif c in '}]':
            depth -= 1
            if depth == 0:
                break
        j += 1
    t = src[s:j + 1]
    t = re.sub(r'^\s*//.*$', '', t, flags=re.M)
    t = re.sub(r"'([^'\"]*)'", r'"\1"', t)
    t = re.sub(r'([{,]\s*)(source|result|sources)\s*:', r'\1"\2":', t)
    t = re.sub(r'\+(\d)', r'\1', t)
    t = re.sub(r',(\s*[}\]])', r'\1', t)
    return json.loads(t)


a = open(d + '/PersonaDataRoyal.js', encoding='utf8').read()
b = open(d + '/Data5Royal.js', encoding='utf8').read()
pm = lit(a, 'personaMapRoyal')
P = {}
for n, p in pm.items():
    q = {'l': p['level'], 'a': p['arcana'], 's': p['stats'], 'e': p['elems'],
         't': p.get('trait', ''), 'k': p.get('skills', {}), 'i': p.get('inherits', '')}
    for f, k in [('special', 'special'), ('rare', 'rare'), ('dlc', 'dlc'), ('max', 'mx')]:
        if p.get(f):
            q[k] = 1
    P[n] = q
rare = lit(b, 'rarePersonaeRoyal')
rc = lit(b, 'rareCombosRoyal')
arc = lit(b, 'arcana2CombosRoyal')
sp = lit(b, 'specialCombosRoyal')
for c in sp:
    for s in c['sources'] + [c['result']]:
        if s not in P:
            print('MISSING', s)
for r in rare:
    if r not in P:
        print('MISSING rare', r)
out = {'P': P, 'rare': rare, 'rareC': rc, 'arc': [x['source'] + [x['result']] for x in arc],
       'sp': [[c['result'], c['sources']] for c in sp]}
json.dump(out, open(sys.argv[2], 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print(len(P), 'personas', len(arc), 'arcana combos', len(sp), 'special')
print(sorted(set(p['a'] for p in P.values())))
