# LEDGER · Aurum Predictor (pivote a análisis de apuestas deportivas)

**Objetivo:** reunir cuotas de varias casas, estimar probabilidades con histórico, detectar value bets y mejores combinadas. NO apuesta ni mueve dinero. Honestidad: ningún modelo garantiza ganancias; las casas cobran margen y el mercado es eficiente.
**Perfil:** ESTÁNDAR · Equipos: DATOS (Python, `tools/`, `data/`) · MODELO+UI (JS, `js/`, `css/`, `index.html`, `tests/`) · Revisor aparte.
**Fuentes reales verificadas (HTTP 200, 17-oct-2026):**
- Histórico + cuotas: `https://football-data.co.uk/mmz4281/<SSYY>/<DIV>.csv` (ej. 2526/E0.csv). Seguir redirecciones; trae BOM.
- Próximos partidos + cuotas: `https://football-data.co.uk/fixtures.csv` (columnas B365H/D/A, BFD*, BV*, BW*, PP* (Pinnacle), SKB*, BFE*, Max*, Avg*, B365>2.5/<2.5, AHh…). Fechas dd/mm/yyyy.
- Opcional con clave: The Odds API v4 (`ODDS_API_KEY` en entorno) para más casas/ligas.
- Casas peruanas (Inkabet, Betsson, Apuesta Total, Doradobet…): no hay fuente gratuita fiable → entrada manual en la UI (el equipo de datos NO las scrapea: ToS).

## Contrato de datos (lo escribe el equipo DATOS; lo consume el equipo MODELO)
Todos los archivos en `casino-aurum/data/`. Cada JSON se escribe también como `.js` para abrir sin servidor:
`history.js` → `window.AURUM_HISTORY = {...};`  ·  `fixtures.js` → `window.AURUM_FIXTURES = {...};`

**history.json**
```
{"generated":"ISO","source":"football-data.co.uk",
 "matches":[{"d":"2025-08-16","lg":"E0","h":"Liverpool","a":"Bournemouth","hg":4,"ag":2,
   "hs":15,"as":7,"hst":6,"ast":3,           // tiros/tiros a puerta si existen, si no omitir
   "o":{"Bet365":[1.3,5.5,9.5],"Pinnacle":[...],"Avg":[...],"Max":[...]},   // 1X2 [local,empate,visita] pre-partido
   "ou":{"Bet365":[1.9,1.95],"Avg":[..]}}]}                                   // [más de 2.5, menos de 2.5]
```
Orden ascendente por fecha. Ligas: E0,E1,SP1,D1,I1,F1,N1,P1,T1,SC0. Temporadas: 2223,2324,2425,2526,2627 (las que existan). Omitir filas sin resultado o con cuotas ≤1.0. Nombres de casa normalizados: B365→Bet365, PS/PP→Pinnacle, BW→Bwin, BV→BetVictor, BFD→Betfair, BFE→BetfairExchange, SKB→SkyBet, Max→Max, Avg→Avg.

**fixtures.json**
```
{"generated":"ISO","source":"football-data.co.uk[+the-odds-api]",
 "events":[{"id":"E0|2026-10-17|Arsenal|Chelsea","lg":"E0","lgName":"Premier League","ko":"2026-10-17T16:00",
   "h":"Arsenal","a":"Chelsea",
   "books":{"Bet365":{"1x2":[2.1,3.4,3.6],"ou25":[1.9,1.95]},"Pinnacle":{...}}}]}
```
`id` estable. `ko` hora local del CSV sin zona. Solo partidos futuros (≥ hoy) con al menos una casa con 1X2.
`team_aliases.json`: `{"canonical": ["alias1","alias2"]}` para unir nombres entre fuentes (Man United/Manchester Utd, etc.); el histórico y los fixtures deben usar el MISMO nombre canónico.

**Herramienta:** `python3 tools/fetch_data.py [--seasons 2526,2627] [--leagues E0,SP1] [--odds-key KEY]`, solo librería estándar, escritura atómica, imprime conteos. Tests: `python3 tools/test_fetch.py` (sin red, con CSV de muestra embebido).

## Contrato del modelo (equipo MODELO, `js/model.js`, puro, testeado en Node)
devig (proporcional y de potencia), Elo con ventaja de local, Poisson/Dixon-Coles simple de goles, matriz de marcadores → 1X2, over/under 2.5 y ambos marcan; mezcla modelo+mercado; EV = p·cuota−1; Kelly fraccionado (¼) con tope; mejor cuota por mercado entre casas; combinadas (parlays) con correlación ignorada y advertida; backtest walk-forward sin fuga de datos (Brier, log-loss, calibración, ROI simulado de value bets).

## Estado
| Fase | Estado |
|---|---|
| 1 Contrato | hecho |
| 2a Datos (agente) | hecho: 14 690 partidos, 34 eventos, 0 equipos sin histórico |
| 2b Modelo + UI | hecho |
| 3 Gate 0 + backtest | OK (`node tests/gate.js`, `node tools/backtest.js`) |
| 4 QA fresco | vuelta 1: PASS condicional 71/100 → corregidos 1,2,5,6,7,11,12,14,16,17 y parte de 3 (horas/partidos empezados) |
| 5 Aceptación final | pendiente |

## Hallazgo central (honesto)
Con 3 301 partidos de prueba, el mercado predice mejor que el modelo (log-loss 0,980 vs 0,997). La estrategia de la pantalla Valor da ROI −0,9 % ± 8 pts (EV≥0) y −14,8 % ± 28 pts (EV≥3 %): indistinguible de cero. No hay ventaja demostrada.

## Pendiente conocido
- #4/#8 `generated` con caché vieja y cuotas de The Odds API sin marca de tiempo por casa; #15 `ko` sin hora; #18 User-Agent identificable y pausa entre descargas, revisar redistribución de football-data; #19 pruebas más fuertes; #13 ρ fijo; #10 `bestW` elegido en la misma muestra.
- Rama con ODDS_API_KEY sin probar (falta clave).

---
# FASE 2 · Multi-deporte (ESPN) — contrato

**Pedido:** todos los deportes (UFC, fútbol, béisbol…), selección por deporte, la mayor cantidad de ligas, especialmente la peruana, y un pronóstico concreto por evento.
**Honestidad:** "pronóstico" = resultado más probable con su probabilidad; NO es una apuesta segura. El mercado supera al modelo en fútbol (backtest); para el resto se mide el acierto histórico del modelo y se muestra.
**Fuente nueva:** API pública no oficial de ESPN `https://site.api.espn.com/apis/site/v2/sports/<deporte>/<liga>/scoreboard[?dates=YYYYMMDD-YYYYMMDD&limit=1000]` (verificado 200: soccer/per.1, mma/ufc, baseball/mlb, basketball/nba, football/nfl, tennis/atp, soccer/conmebol.libertadores). Trae calendario, resultados y cuotas de DraftKings (moneyline americano; en fútbol drawOdds; totales y spread). Las cuotas son de DraftKings (EE. UU.): no están disponibles en Perú; sirven como referencia de mercado.

## data/multi.json y data/multi.js (`window.AURUM_MULTI = {...}`)
```
{"generated":"ISO","source":"espn",
 "leagues":[{"id":"soccer/per.1","sport":"soccer","sportName":"Fútbol","name":"Liga 1 (Perú)","country":"PE","draw":true}],
 "events":[{"id":"401...","lg":"soccer/per.1","ko":"2026-10-18T16:00Z","h":"Sporting Cristal","a":"Comerciantes Unidos",
    "status":"pre|in|post","neutral":false,
    "odds":{"DraftKings":{"ml":[1.31,5.0,8.5],"total":{"line":2.5,"over":1.53,"under":2.35},"spread":{"line":-1.5,"home":1.91,"away":1.77}}}}],
 "results":[{"lg":"soccer/per.1","d":"2025-04-05","h":"..","a":"..","hs":2,"as":1,"w":"h|a|d","neutral":false}]}
```
- `ml` = [local, empate|null, visita] en cuota DECIMAL (convertir americano: +150→2.5, −150→1.667). `odds` = null si no hay.
- Solo `events` con status pre o in en los próximos 8 días (y los de hoy ya empezados marcados `in`). `results` = partidos terminados (hs/as pueden ser null en MMA/tenis; `w` siempre).
- MMA/tenis: h/a = competidor 1 y 2 en el orden de ESPN, neutral = true.
- Los nombres de equipo salen de ESPN en TODO (eventos y resultados): coinciden entre sí.
- Herramienta: `python3 tools/fetch_espn.py [--leagues ...] [--months 24] [--refresh]`, stdlib, caché en `data/raw_espn/`, pausa ≥0.25 s entre llamadas, User-Agent identificable, certifi/ssl como en fetch_data.py, tests sin red en `tools/test_espn.py`.

## Estado Fase 2
- Datos ESPN: 88 ligas, 60 794 resultados (tenis unificado ATP+WTA y deduplicado), 831 eventos próximos (384 con cuotas DraftKings).
- QA fresco vuelta 1: FAIL 64/100 → corregidos 1-13, 15-17, 19 (tenis duplicado, atribución ESPN, sede neutral, mercado 2 vías en fútbol, EV solo con cuota manual, calibración fuera de muestra y sin agudizar, prórroga/penales, pretemporada MLB, regresión Elo en predicción, validación de cuotas manuales, «Hoy» = día de Lima).
- Pendiente: #14 parcial (TTL de error ya 5 min para fallos transitorios), #18 rendimiento (multi.js 7,9 MB), duplicados de un equipo entre liga y copa (ratings separados), NBA con pretemporada, segunda revisión independiente.

## Estado final Fase 2 (2.ª revisión)
- Detalle de evento: cuotas por casa (ESPN/DraftKings + football-data hasta 9 casas unidas por nombre + las del usuario) frente a la cuota justa del pronóstico, EV por celda, mejor cuota, margen y total de goles.
- 2.ª revisión: FAIL 71/100 → corregidos 1-5, 7-10, 12-18, 20 (caché no se pisa con fallos; ajuste global decidido por comparación pareada: no mejora significativamente → desactivado; homónimos por país; copas domésticas = cruzadas; servidor con lista blanca, Host en GET y enfriamiento de 2 min; avisos de casas de referencia; sin stake; teclado; escritura atómica en Node; frescura = fuente más antigua).
- Pendiente conocido: #6 calibración con split temporal real, #19 neutral/prórroga en el entrenamiento de fútbol y ligas descartadas (HTTP 400) sin mostrar en la UI; sin tercera revisión.
