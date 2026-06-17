# -*- coding: utf-8 -*-
"""
main_v2.py — Servidor de la NUEVA versión (multipágina: una página por sección).

Reutiliza el mismo `app` de main.py (todos los /api/* y la lógica son idénticos),
pero la raíz "/" sirve `inicio.html` (la nueva versión) en lugar de `index.html`.
Las demás páginas (organigrama.html, vision.html, proyectos.html, tareas.html,
planificador.html, bitacora.html) y los compartidos /assets/* los sirve el
catch-all de archivos estáticos de main.py.

No toca main.py ni index.html. Se ejecuta en su propio puerto para poder convivir
con el servidor original:

    python main_v2.py        ->  http://localhost:8090   (inicio.html / nueva versión)
    python main.py           ->  http://localhost:8080   (index.html / versión actual)
"""

from fastapi.routing import APIRoute
from fastapi.responses import FileResponse

# Importa la app ya construida (rutas /api/*, estáticos, etc.).
# Importar NO arranca el servidor: el uvicorn.run de main.py está bajo __main__.
from main import app, BASE_DIR, NO_CACHE_HEADERS

PORT = 8090


def serve_main():
    """Raíz de la nueva versión: sirve inicio.html."""
    return FileResponse(BASE_DIR / "inicio.html", headers=NO_CACHE_HEADERS)


# Quita la ruta "/" original (que servía index.html) e inserta la nueva al frente,
# antes del catch-all "/{path:path}", para que tenga prioridad. Se muta la lista
# en sitio (más robusto entre versiones de FastAPI que reasignar la propiedad).
for _r in [r for r in app.router.routes if getattr(r, "path", None) == "/"]:
    app.router.routes.remove(_r)
app.router.routes.insert(0, APIRoute("/", serve_main, methods=["GET"]))


if __name__ == "__main__":
    import socket
    import uvicorn

    print("── CV Celestial Docs Server (v2 — dashboard como inicio) ──")
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = "127.0.0.1"

    print(f"  Local  : http://localhost:{PORT}")
    print(f"  Red    : http://{local_ip}:{PORT}")
    print("  Sirve  : inicio.html + páginas/assets  (index.html sigue en main.py:8080)")
    print("──────────────────────────────────────────────────────────")

    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
