# -*- coding: utf-8 -*-
"""
Construye main.html = app.html + dashboard.html integrado como pantalla de inicio.
- CSS del dashboard con scope bajo #sec-dashboard (evita colisiones).
- JS del dashboard envuelto en IIFE (evita colisiones de globals/funciones).
- #root -> #dash-root.
- No toca index.html ni app.html.
"""
import io, re

def read(p):
    with io.open(p, 'r', encoding='utf-8') as f:
        return f.read()

def write(p, s):
    with io.open(p, 'w', encoding='utf-8', newline='\n') as f:
        f.write(s)

app  = read('app.html')
dash = read('dashboard.html')

# ── extraer bloques <style> y <script> del dashboard ──────────────────────
dash_css = dash[dash.index('<style>')+len('<style>'): dash.index('</style>')]
dash_js  = dash[dash.index('<script>')+len('<script>'): dash.rindex('</script>')]

# ── CSS scoper ────────────────────────────────────────────────────────────
def strip_comments(css):
    out=[]; i=0; n=len(css)
    while i<n:
        if css[i:i+2]=='/*':
            j=css.find('*/', i+2)
            i = n if j<0 else j+2
        else:
            out.append(css[i]); i+=1
    return ''.join(out)

def split_blocks(css):
    blocks=[]; i=0; n=len(css)
    while i<n:
        brace=css.find('{', i)
        if brace<0: break
        prelude=css[i:brace]
        d=1; j=brace+1
        while j<n and d>0:
            c=css[j]
            if c=='{': d+=1
            elif c=='}': d-=1
            j+=1
        block=css[brace+1:j-1]
        blocks.append((prelude.strip(), block))
        i=j
    return blocks

def scope_sel(sel):
    sel=sel.strip()
    if not sel: return None
    if sel==':root': return ':root'
    if sel=='html':  return None            # se descarta
    if sel=='body':  return '#sec-dashboard'
    return '#sec-dashboard ' + sel

def scope_prelude(prelude):
    parts=[scope_sel(s) for s in prelude.split(',')]
    parts=[p for p in parts if p]
    return ', '.join(parts)

def scope_css(css):
    css=strip_comments(css)
    out=[]
    for prelude, block in split_blocks(css):
        p=prelude.strip()
        if p.startswith('@keyframes') or p.startswith('@font-face') or p.startswith('@-'):
            out.append(prelude+' {'+block+'}')
        elif p.startswith('@media') or p.startswith('@supports'):
            out.append(prelude+' {\n'+scope_css(block)+'\n}')
        elif p.startswith('@'):
            out.append(prelude+' {'+block+'}')
        else:
            sp=scope_prelude(prelude)
            if sp:
                out.append(sp+' {'+block+'}')
    return '\n'.join(out)

scoped_css = scope_css(dash_css)

# ── JS: renombrar root -> dash-root y envolver en IIFE ────────────────────
js = dash_js.replace("getElementById('root')", "getElementById('dash-root')")
wrapped_js = "\n(function(){\n" + js + "\n})();\n"

# ══════════════════════════════════════════════════════════════════════════
#  Ensamblar main.html a partir de app.html
# ══════════════════════════════════════════════════════════════════════════
out = app

# 1) titulo
out = out.replace('<title>CV Celestial — App</title>',
                  '<title>CV Celestial — Inicio</title>')

# 2) inyectar CSS scopeado antes de </style>
css_block = ("\n\n    /* ═══════════ DASHBOARD (integrado como inicio) — estilos con scope ═══════════ */\n"
             + scoped_css + "\n")
assert out.count('</style>') >= 1
out = out.replace('</style>', css_block + '\n  </style>', 1)

# 3) nav: agregar "Inicio" como primer item y quitar el enlace externo al dashboard
out = out.replace(
    '<nav class="page-nav" id="page-nav">\n    <a href="#sec-organigrama">Organigrama</a>',
    '<nav class="page-nav" id="page-nav">\n'
    '    <a href="#sec-dashboard">Inicio</a>\n'
    '    <a href="#sec-organigrama">Organigrama</a>', 1)

out = re.sub(r'\n\s*<a href="/dashboard\.html"[^>]*>.*?</a>', '', out, count=1)

# 4) seccion home (dashboard) como primera dentro de .container
home = '''
    <!-- ═══════════════════ SECCIÓN 0: DASHBOARD (inicio) ═══════════════════ -->
    <div class="section" id="sec-dashboard">
      <div class="section-title">
        00 — Dashboard
        <span class="pill" id="last-update" style="margin-left:auto;text-transform:none;letter-spacing:0;">—</span>
      </div>
      <div id="dash-root" class="wrap" style="padding-left:0;padding-right:0;max-width:none;">
        <div class="loading"><div class="spinner"></div>Cargando datos del equipo…</div>
      </div>
      <div class="foot">Vista de solo lectura · generada desde los mismos datos · <span id="foot-stamp"></span></div>
    </div>
'''
anchor = '  <div class="container">\n'
assert anchor in out
out = out.replace(anchor, anchor + home, 1)

# 5) registrar la seccion en el scrollspy de la app
out = out.replace(
    "const SEC_IDS = ['sec-organigrama','sec-vision','sec-proyectos','sec-tareas','sec-planificador'];",
    "const SEC_IDS = ['sec-dashboard','sec-organigrama','sec-vision','sec-proyectos','sec-tareas','sec-planificador'];",
    1)

# 6) inyectar JS del dashboard (IIFE) antes de </body>
dash_script = ('\n  <!-- ═══ Dashboard (solo lectura) — JS aislado en IIFE, monta en #dash-root ═══ -->\n'
               '  <script>' + wrapped_js + '  </script>\n')
out = out.replace('</body>', dash_script + '</body>', 1)

write('main.html', out)
print('main.html generado:', len(out), 'bytes')
print('  - bloques CSS scopeados:', scoped_css.count('#sec-dashboard'))
print('  - #dash-root presente :', '#dash-root' in out, '| id=dash-root:', 'id="dash-root"' in out)
print('  - nav Inicio          :', '<a href="#sec-dashboard">Inicio</a>' in out)
print('  - enlace externo dash :', '/dashboard.html' in out)
print('  - IIFE wrap           :', "(function(){\n" in out)
