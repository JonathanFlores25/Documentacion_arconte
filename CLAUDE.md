# DocumentacionCV_Celestial — Contexto para Claude

Plataforma interna **informativa** (sin seguimiento de tareas) del equipo de CV trabajando en **Arconte Retail** y proyectos relacionados. Documenta el estado de la infraestructura: proyectos, roadmaps historicos (solo lectura), metricas de modelos, organigrama, vision, evidencias de avances y **el librito**: la documentacion tecnica de cada modelo de vision (README + CONTRATO) leida del repo de modelos. El seguimiento activo de tareas se lleva en otra herramienta.

## Stack tecnologico

- **Backend:** FastAPI + Uvicorn, Python 3
- **Frontend:** Paginas HTML/CSS/JS vanilla multipagina, sin frameworks ni build step
- **Datos:** JSON (`projects.json` es la fuente de verdad)
- **Puerto:** 8090, binding 0.0.0.0 (accesible en red local)

## Archivos clave

| Archivo | Rol |
|---|---|
| `main.py` | Servidor FastAPI completo |
| `inicio.html` | Dashboard general (pagina raiz `/`) |
| `organigrama.html`, `vision.html` | Paginas estaticas informativas |
| `proyectos.html` | Roadmaps, metricas, modelos y evidencias por proyecto |
| `infraestructura.html` | Servidores, servicios, despliegues y camaras (editable por admin) |
| `documentacion.html` | **El librito**: documentacion de los modelos de vision (portada, capitulos, lector) |
| `requerimientos.html` | **Requerimientos**: el machote de pre-ingenieria presentado con el estilo del sitio |
| `assets/docs.js` | Logica del librito + renderer de markdown propio (solo se carga en `documentacion.html`) |
| `assets/reqs.js` | Logica de Requerimientos (solo se carga en `requerimientos.html`) |
| `requisitos/PREINGENIERIA_MACHOTE.html` | Machote de pre-ingenieria: se sirve tal cual para llenar e imprimir |
| `assets/app.js` | Logica compartida de todas las paginas (~2100 lineas) |
| `assets/app.css` | Estilos compartidos |
| `assets/chrome.html` | Header + nav + modales (inyectado por `injectChrome()`) |
| `config.json` | Usuarios y tokens (NUNCA se sirve por HTTP) |
| `projects.json` | Datos de proyectos: fases, tareas historicas, acuerdos, modelos, metricas |
| `solutions_meta.json` | Indice de evidencias: `task_key → [{url, filename, uploaded_by, uploaded_at}]` |
| `solutions/` | Archivos de evidencia (reportes HTML, videos) |
| `fullcv_cache.json` | Cache del catalogo de Full_CV (dato vivo generado, ignorado por git) |
| `infra.json` | Datos de infraestructura: servers[], deployments[], cameras[] (dato vivo) |
| `docs_cache.json` | Snapshot del librito (dato vivo generado, ignorado por git) |
| `requisitos_cache.json` | Snapshot del machote parseado (dato vivo generado, ignorado por git) |

**IMPORTANTE:** los HTML y `assets/*` se editan a mano (el antiguo `build_pages.py` fue eliminado; era un script de migracion one-shot).

## API endpoints

- `GET /api/projects` — datos de proyectos
- `POST /api/projects` — guardar proyectos (requiere `token` valido en el body)
- `POST /api/verify-token` — autenticacion de usuario
- `GET /api/solutions` — indice de evidencias
- `GET /api/fullcv/catalog?refresh=0|1` — snapshot del catalogo de modelos de Full_CV (con cache)
- `GET /api/infra` — datos de infraestructura · `POST /api/infra` — guardar (requiere token)
- `GET /api/docs/catalog?refresh=0|1` — el librito completo (capitulos, markdown de cada doc y ficha tecnica leida del codigo)
- `GET /api/requisitos?refresh=0|1` — el machote de pre-ingenieria parseado a bloques
- `GET /requisitos/{archivo}` — el machote original (estatico, para llenar e imprimir)
- `GET /solutions/{archivo}` — sirve archivos de evidencia
- `GET /` y catch-all — sirve `inicio.html` y estaticos

## Autenticacion

Token-based. Tokens en `config.json` bajo `users`; token admin fallback: `"cv2026"`. El sitio es de lectura publica; el login (modal en `chrome.html`, `_adminToken` en `app.js`) habilita la edicion de **contenido informativo**: crear/editar/borrar proyectos, metricas, modelos y camaras. No existe marcado/edicion de tareas: los checkboxes y estados `done` en `projects.json` son datos historicos congelados que se muestran read-only.

## Modelo de datos (projects.json)

```
{pid}: {title, meta{status, description, tech, ...}, cameras_tested,
        phases[]: {id, title, status, start_iso, end_iso, depends_on[], shift_log[],
                   tasks[]: {id, title/description, area, responsible, done, done_note, shift_log[]}},
        acuerdos[]: {session, iso_date, display, items[]: {text, responsible, status}},
        models[]: {id, name, status, metrics..., fullcv_id?, linked_by?, linked_at?},
        sprint_tasks{}: historico del antiguo planificador}
```

**Areas:** PM, Infra, AI Eng, Datos, Frontend · **Status fases:** active, done, paused, continuous · **Status acuerdos:** COMPLETADO, EN PROCESO, PENDIENTE, CANCELADO

## Integracion Full_CV (catalogo de modelos vivo)

Full_CV (repo hermano, FastAPI puerto 8000, mismo servidor) expone `GET /api/models` (publico). El backend de la doc lo consulta server-side (Full_CV no tiene CORS) y cachea el snapshot en `fullcv_cache.json` (atomico, TTL configurable) para que la doc funcione aunque Full_CV este apagado. Los bench profiles (VRAM) se leen de `data/profiles/*.json` via `profiles_dir` o por HTTP con login programatico (credenciales en `config.json.fullcv`; la sesion muere al reiniciar Full_CV → re-login automatico).

Config: bloque `fullcv` en `config.json` (`url`, `username`, `password`, `profiles_dir`, `sync_ttl_seconds`). La URL se puede sobrescribir con la env var `FULLCV_URL` (en Docker: `http://host.docker.internal:8000`).

Vinculo: un modelo en `projects.json` con `fullcv_id` muestra nombre/version/descripcion/metricas/bench **en vivo** desde el snapshot (merge solo en render, nunca se persiste; desvincular restaura lo manual). `status`, `responsible`, `notes` y `tech` siguen siendo manuales. Full_CV **nunca se modifica** desde este proyecto.

## El librito (documentacion de modelos de vision)

`documentacion.html` presenta como un libro los `.md` que viven **junto al codigo** de
cada modelo en el repo hermano `ArconteDetection_DebugTools/Models/`: la **guia**
(`README*.md`, `DOCUMENTACION*.md` — como funciona por dentro) y el **contrato**
(`CONTRATO_*.md` — que consume y que produce, para integrarlo sin leer el codigo).

**Solo lectura.** La fuente de verdad es el repo de modelos; la doc nunca escribe ahi.
Para corregir el contenido de un capitulo se edita el `.md` en el repo de modelos y se
pulsa *Actualizar* (o se espera el TTL).

- **Lectura viva:** `resolve_docs_dir()` prueba `models_docs.dir` de `config.json`, la env
  var `MODELS_DOCS_DIR` y luego `/models_docs` y `../ArconteDetection_DebugTools/Models`.
  En Docker llega por un volumen **read-only** (`docker-compose.yml`).
- **Snapshot:** cada lectura exitosa se guarda completa en `docs_cache.json` (escritura
  atomica). Si el repo no esta montado, el endpoint responde con ese snapshot y
  `ok:false`, y el frontend avisa que los datos pueden estar desactualizados.
- **Curaduria en `main.py`:** `BOOK_CHAPTERS` (capitulos, en orden de lectura) y
  `MODEL_CARDS` (la "receta" de cada modelo: titulo, tagline, que detecta, ingredientes,
  entradas, salidas, `stage`). Un modelo sin ficha aparece igual, en el capitulo `otros`.
  Una carpeta de modelo sin ningun `.md` se lista como *documentacion pendiente*.
  **Al agregar o renombrar un modelo en el repo de modelos, actualizar `MODEL_CARDS`.**
### Ficha tecnica (tercer capitulo de cada modelo)

Ademas de la guia y el contrato, cada modelo tiene una **ficha tecnica generada
leyendo su codigo** con `ast` (el codigo NUNCA se ejecuta ni se importa). Responde
"que modelo/pesos usa, como procesa los frames y con que umbrales decide" sin que
nadie tenga que escribirlo a mano: si el codigo cambia, la ficha cambia.

- `extract_script_specs()` saca de cada script: **constantes MAYUSCULAS** (nivel de
  modulo y atributos de clase) y los **flags de `parser.add_argument()`** con tipo,
  default, `choices` y `help`. Los detectores montados sobre `Base/` no declaran
  constantes: exponen todo por CLI — sin leer argparse las fichas salian vacias.
- `build_model_spec()` elige hasta 2 scripts por modelo con `_script_rank()`:
  Production > panel web > resto > debug, y **dentro de cada grupo la version mas
  alta** (`_v(\d+)`), si no la ficha mostraba scripts viejos abandonados.
  `detect_model_stack()` corre solo sobre esos scripts (mirando toda la carpeta se
  colaban librerias de versiones muertas).
- Cada parametro se clasifica con `_spec_group()` en `SPEC_GROUPS`: modelos/pesos,
  video y frames, umbrales y geometria, interruptores, visualizacion, otros.
- `_spec_value()` **redacta** cualquier valor cuyo nombre parezca credencial
  (KEY/TOKEN/SECRET/PASSWORD): la ficha se publica sola, no debe filtrar secretos.
- El frontend inserta la ficha como un doc mas del modelo (`spec:<dir>`), asi las
  pestanas, el indice, el paginador y la busqueda funcionan igual que con los `.md`
  (buscar `yolo11x-pose` o `--imgsz` encuentra las fichas).
- Un modelo sin `.md` pero con codigo igual tiene ficha; se marca *guia pendiente*.
- `hardware` en `MODEL_CARDS` es el unico dato curado a mano de la ficha (FPS/VRAM
  medidos que solo estan en prosa en los docs).

- **Renderer de markdown propio** (`assets/docs.js`, sin dependencias): encabezados,
  tablas, code fences, listas anidadas, blockquotes, enfasis y links relativos entre docs
  del librito (los que no estan en el librito apuntan a GitHub). Los indices de busqueda
  usan `fold()`, que quita acentos **sin cambiar la longitud** — no cambiar eso a
  `normalize('NFD')` suelto: desplaza el resaltado.
- **Rutas por hash:** `#doc/<id>` (documento, con `::ancla` opcional) · `#buscar/<termino>`
  (resultados enlazables) · sin hash, la portada.
- Ojo con los `<a>` anidados al tocar `renderModelRow`/`renderIdxModel`: un enlace dentro
  de otro es HTML invalido y el parser parte el elemento (rompe el layout). Las filas de
  modelo usan un div con enlace extendido (`.bk-model-link::after`).

## Requerimientos (machote de pre-ingenieria)

`requerimientos.html` muestra el **cuestionario de pre-ingenieria**: la informacion
que hay que pedirle al cliente antes de comprometer alcance (umbrales por caso de
uso, criterios de aceptacion, material requerido, precisiones que acotan el
alcance). Viene del machote `requisitos/PREINGENIERIA_MACHOTE.html`, copiado del
repo Full_CV.

- **Dos vistas, un solo archivo.** El machote se sirve **tal cual** (`/requisitos/…`)
  para llenarlo e imprimirlo — conserva su diseno de papel claro y sus campos. La
  seccion de la plataforma lo muestra **de consulta**, con el estilo del sitio:
  ahi los campos aparecen como huecos marcados, no como formulario.
- **Parseo generico:** `MachoteParser` (stdlib `html.parser`) convierte el HTML en
  bloques (`heading`, `p`, `table`, `aviso`, `nota`, `instrucciones`, `list`).
  Si el machote cambia de contenido, la seccion lo refleja sin tocar codigo.
  Solo se conservan etiquetas inline propias (`RQ_INLINE`); el resto se descarta.
- **Rol de cada tabla** por sus encabezados (`RQ_TABLE_ROLES`): preguntas,
  criterio, casos, estados, material, camaras, acuse… El frontend las presenta
  distinto segun el rol.
- **Puente con el librito:** `REQ_CASE_MODELS` mapea cada caso de uso del machote
  a los modelos que lo implementan; la tabla *Umbrales por caso de uso* enlaza a
  `documentacion.html#modelo/<dir>` (ruta agregada en `docs.js`).
  **Al agregar un caso de uso al machote, agregarlo tambien a `REQ_CASE_MODELS`.**
- Fuente configurable con `requisitos.file` (config.json) o `REQUISITOS_FILE`; si
  no, se usa la copia local y luego `../Full_CV/PREINGENIERIA_MACHOTE.html`.
  Para actualizar el machote se reemplaza el archivo de `requisitos/`.
- Snapshot en `requisitos_cache.json` con el mismo patron que el librito: si el
  archivo no esta, la seccion sigue viva con `ok:false`.

**Ojo con Python 3.11:** el contenedor corre 3.11 y **no** admite backslashes
dentro de una expresion f-string (`f'{f" x=\"{v}\"" if v else ""}'` explota al
importar, aunque 3.12+ lo acepte). Compilar con
`docker run --rm -v "$PWD:/app:z" -w /app <imagen> python -c "import py_compile;
py_compile.compile('main.py', doraise=True)"` antes de reiniciar.

## Persistencia

Sin base de datos. Todo en JSON con escritura atomica (patron .tmp → rename). Los datos vivos en disco (`projects.json`, `solutions_meta.json`, `solutions/`) pueden diferir de git — **nunca hacer `git checkout` sobre ellos**. Respaldo: `bash backup.sh` → `backups/` (ignorado por git).

En este equipo `docker` es un alias de podman rootless: `docker compose restart` y el
recreate fallan con `rootless netns: kill network process: permission denied`. Para
aplicar cambios de `main.py`: `docker compose down && docker compose up -d`.

## Iniciar el servidor

```bash
python main.py            # local, puerto 8090
docker compose up -d      # produccion (servicio cv-docs)
```
