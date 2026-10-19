# Cómo publicar Aurum Predictor en internet

Resultado: una dirección web (por ejemplo `https://aurum-predictor.pages.dev`) que abre en celular, tablet y laptop. Es gratis.

**Importante: se publica SOLO el Predictor.** El casino de prueba (`casino.html`) nunca se sube: no tiene licencia y ofrecer juegos online sin autorización del MINCETUR es ilegal en Perú. El empaquetador lo deja fuera y lo comprueba solo.

## Paso 0 · Prepara los datos y el paquete (una vez, en tu computador)

En la terminal, dentro de la carpeta del proyecto:

```bash
python3 tools/fetch_data.py && python3 tools/fetch_espn.py && node tools/backtest.js && node tools/backtest_multi.js
python3 tools/build_site.py
```

Se crean la carpeta `dist/` y el archivo `dist.zip` (unos 2 MB comprimido). El comando termina con «Auditoría OK». Si dice «AUDITORÍA FALLIDA», no publiques nada y avísame.

## Camino 1 · El más fácil (manual, sin cuentas técnicas)

Elige **uno**:

**A. Cloudflare Pages** (sin límite de visitas)
1. Crea una cuenta gratis en https://pages.cloudflare.com
2. «Workers y Pages» → «Crear» → «Pages» → «Cargar activos» (Direct Upload).
3. Ponle un nombre al proyecto y sube la carpeta `dist` (o `dist.zip`).
4. Te da una dirección `https://TU-NOMBRE.pages.dev`. Ábrela en tu celular.

**B. Netlify**
1. Entra a https://app.netlify.com/drop e inicia sesión (gratis).
2. Arrastra la carpeta `dist`. Te da una dirección `https://algo.netlify.app`.

> Los menús de estos servicios cambian de nombre de vez en cuando; si algo no coincide, busca «subir carpeta / direct upload».

**Para actualizar los datos:** repite el Paso 0 y vuelve a subir `dist`. Es manual.

## Camino 2 · Automático (se actualiza solo cada 8 horas)

Usa GitHub Pages con el archivo `.github/workflows/publicar.yml` que ya viene en el proyecto.

1. Crea una cuenta gratis en https://github.com y un repositorio nuevo. Para Pages gratis debe ser **público**.
2. Sube el contenido de esta carpeta (con GitHub Desktop, o con `git`). Importante:
   - **La rama debe llamarse `main`** (si `git init` creó `master`, renómbrala: `git branch -M main`). Si no, la publicación nunca se dispara.
   - El `.gitignore` ya deja fuera tu clave (`tools/.odds_api_key`), el casino de prueba (`casino.html`, `js/app.js`, `js/games/`), las cachés y los datos generados. **Antes de subir, revisa la lista de archivos (`git status`) y confirma que ninguno de esos aparece.** El código del casino sin licencia no debe quedar público.
3. En el repositorio: Settings → Pages → «Source: GitHub Actions». Y en la pestaña Actions, si pide habilitar los workflows, acéptalo.
4. Actions → «Publicar Aurum Predictor» → «Run workflow». La primera vez GitHub puede pedirte aprobar el entorno `github-pages`. Tarda ~15-30 min. Confirma en esa primera corrida que ESPN y football-data no bloquean a GitHub (si falla, el paso lo dirá en rojo).
5. Tu web queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/` y se refresca sola cada 8 horas.
6. Mantenimiento: GitHub **desactiva las tareas programadas tras 60 días sin actividad** en un repositorio público. Si un día los datos dejan de actualizarse, entra a Actions y vuelve a activar el workflow (o haz cualquier cambio pequeño).
7. La «Auditoría OK» del comando `build_site.py` vale para tu `dist` local; en GitHub el mismo control corre dentro del workflow y publica solo lo permitido.

Opcional (en Settings → Secrets and variables → Actions):
- **Casas peruanas con The Odds API, actualizadas solas cada 8 horas** (Betsson, Coolbet, 1xBet…):
  1. En GitHub: Settings → Secrets and variables → Actions → pestaña **Secrets** → «New repository secret» → nombre `ODDS_API_KEY`, valor tu clave. (Pégala solo ahí, nunca en un chat ni en un archivo del repositorio.)
  2. Pestaña **Variables** → «New repository variable» → nombre `PUBLICAR_ODDS_API`, valor `true`.
  3. Opcional, solo si tu plan es de pago: variable `ODDS_API_CREDITS_PER_RUN` (por defecto `5`).
  4. Actions → «Publicar Aurum Predictor» → «Run workflow» para probarlo ya. Después corre solo (a las 00:17, 08:17 y 16:17 UTC, o sea 19:17, 03:17 y 11:17 en Lima; GitHub puede retrasarlo unos minutos).
  - **Cómo se cuidan tus créditos.** Pedir el calendario no gasta créditos (lo dice la documentación de The Odds API); pedir cuotas gasta 1 crédito por liga y región. La herramienta mira primero qué ligas tienen partidos en las próximas 36 h y pide cuotas solo de esas, hasta 5 créditos por corrida: 5 × 3 corridas al día × 30 días = 450 créditos al mes, dentro de los 500 del plan gratis (verifica el límite de tu plan en el panel de The Odds API, que también muestra tu consumo). Eso significa **unas 5 ligas por corrida**: las de mayor prioridad con partido cercano (MMA, NBA, MLB/NFL/NHL, ligas sudamericanas, Europa…). Con un plan de pago puedes subir `ODDS_API_CREDITS_PER_RUN`.
  - **Términos.** Según sus términos, mostrar sus datos en una web está permitido y no exigen atribución (la agradecen); lo que no permiten es revenderlos o redistribuirlos como un producto de datos independiente. Aquí se muestran dentro de la web; no ofrezcas el archivo `data/odds_api.js` como servicio de datos. Si sospechan un abuso pueden revocar tu clave.
  - **Camino 1 (manual):** `python3 tools/build_site.py --with-odds-api` antes de subir `dist`. Solo se actualiza cuando tú lo repites.
- Por defecto **no se publican las cuotas de DraftKings** (vienen de ESPN y no tienen licencia de redistribución): los pronósticos de las ligas que solo tenían esas cuotas salen del modelo estadístico y la web lo indica. Si algún día quieres incluirlas (bajo tu responsabilidad): variable `PUBLICAR_CON_DRAFTKINGS` = `true`, o en el Camino 1 `python3 tools/build_site.py --con-draftkings`.

## Qué cambia online frente a tu computador
- No hay botón «Actualizar datos» (necesita tu servidor local); los datos los refresca el Camino 2 o tú con el Paso 0.
- Las cabeceras de seguridad (`_headers`) solo las aplican Cloudflare y Netlify; GitHub Pages las ignora, por eso el HTML lleva además una política de seguridad (CSP) equivalente.
- Lo que cada visitante guarda (filtros, cuotas de su casa) queda solo en su navegador. No hay cuentas ni datos personales.
- Nunca se publica tu clave de The Odds API: se guarda en `tools/.odds_api_key`, que está excluido del paquete y de GitHub, y el empaquetador falla si la encuentra en lo que va a subir.

## Antes de compartirla: avisos legales (léelos)
Esto no es asesoría legal; consulta a un abogado de juegos y apuestas, sobre todo si vas a cobrar, poner anuncios o enlaces a casas.
1. **Publicidad de apuestas.** La Ley 31557 regula la publicidad de juegos y apuestas a distancia (entre otras cosas, exige la advertencia sobre ludopatía, que la web ya muestra). Pon enlaces o anuncios solo de operadores autorizados por el MINCETUR, y aun así consulta antes.
2. **Sin dinero ni apuestas.** La web no acepta apuestas, no mueve dinero y no ofrece pagos. Mantenla así: operar apuestas requiere licencia (ver `REQUISITOS-LEGALES.md`).
3. **Datos y términos de uso.** Los datos vienen de football-data.co.uk, de la API pública **no oficial** de ESPN (que incluye cuotas de DraftKings) y, opcionalmente, de The Odds API. Revisa sus términos antes de publicar datos de forma pública y atribuye la fuente (la web ya la cita). ESPN puede cambiar o bloquear su API sin aviso. Las cuotas de DraftKings llegan por ESPN y no tienen licencia de redistribución, por eso el paquete **no las incluye por defecto**. The Odds API puede restringir la redistribución de sus cuotas: por eso no se publican por defecto.
4. **Sin garantías.** La web ya dice que no garantiza ganancias y que el pronóstico más probable no es una buena apuesta. No lo quites.
5. **Casas autorizadas.** La marca «autorizada en Perú*» sale de una lista de terceros, no del registro oficial; la web pide verificarlo en apuestasdeportivas.mincetur.gob.pe.

## Costos y límites
- Cloudflare Pages / Netlify / GitHub Pages: gratis para este tamaño. Un dominio propio (por ejemplo `.pe`) es opcional y de pago.
- Cada visita descarga unos 2-3 MB (comprimido). GitHub Pages recomienda no superar ~100 GB/mes (≈ 30 000 visitas/mes); Cloudflare no limita el ancho de banda.
- El primer arranque en un celular lento puede tardar unos segundos (se ve «Cargando datos…») mientras descarga ~11 MB sin comprimir y calcula los pronósticos.
- **Privacidad:** el alojamiento web y Google Fonts (tipografías) pueden registrar la IP de cada visitante; la web no guarda datos personales.
- **Lenguaje:** el sitio usa términos como «valor» y «combinadas». Ábrelo a un abogado de juegos y apuestas antes de difundirlo: al ser público puede leerse como promoción de apuestas.
