# Lists every English string the screens pass through t("...") plus the error fix lines, to /tmp-like output file given as argv[1] (JSON array). Used to build assets/ui-hi.json.
import re, glob, json, sys
DQ = re.compile(r'\bt\(\s*"((?:[^"\\]|\\.)*)"\s*\)')
SQ = re.compile(r"\bt\(\s*'((?:[^'\\]|\\.)*)'\s*\)")
VAL = re.compile(r':\s*"((?:[^"\\]|\\.)*)"')
strs = set()
for f in glob.glob('apps/api/public/assets/*.js'):
    if f.endswith(('verifier.js', 'qr.js', 'fixes.js')):
        continue
    s = open(f, encoding='utf8').read()
    for m in DQ.finditer(s):
        strs.add(json.loads('"' + m.group(1) + '"'))
    for m in SQ.finditer(s):
        strs.add(m.group(1))
f = open('apps/api/public/assets/fixes.js', encoding='utf8').read()
for m in VAL.finditer(f):
    strs.add(json.loads('"' + m.group(1) + '"'))
out = sorted(x for x in strs if len(x) > 1)
json.dump(out, open(sys.argv[1], 'w', encoding='utf8'), ensure_ascii=False, indent=0)
print(len(out), sum(len(x) for x in out))
