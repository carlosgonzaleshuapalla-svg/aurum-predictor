/* Aurum Predictor · textos propios (metodología, acerca de, contacto y guías). Los usa tools/build_seo.js.
   Todo lo que afirma el modelo sale de st = { nResults, nLeagues, goals:{n,hit,acc}, sports:[{name,n,acc,base}] } calculado
   con los mismos datos publicados; no hay cifras escritas a mano que puedan quedar desactualizadas. */
const REPO_ISSUES = 'https://github.com/carlosgonzaleshuapalla-svg/aurum-predictor/issues';
const UPDATED = 'noviembre de 2026';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const dmy = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return d + ' de ' + MESES[m - 1] + ' de ' + y; };
const pc = (x, d) => (x * 100).toFixed(d == null ? 0 : d).replace('.', ',') + ' %';
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// Guías: slug, título, resumen y cuerpo (HTML). `rel` enlaza a otras guías por slug.
const GUIAS = [
  {
    slug: 'que-es-la-cuota-justa', title: 'Qué es la cuota justa y por qué importa más que el favorito',
    desc: 'La cuota justa es 1 dividido entre la probabilidad real de un resultado. Aprende a calcularla y a usarla para saber si una casa paga lo suficiente.',
    rel: ['como-leer-cuotas-decimales', 'margen-de-la-casa'],
    body: () => `
<p>Cuando alguien dice «este equipo es un favorito seguro», casi nunca dice cuánto paga la casa por apostar a él. Y esa es la pregunta que decide si una jugada tiene sentido. La herramienta para responderla es la <b>cuota justa</b>.</p>
<h2>La definición</h2>
<p>La cuota justa es el número por el que se multiplicaría tu dinero si el resultado se pagara sin ninguna ventaja para nadie. Se calcula así:</p>
<p><b>cuota justa = 1 ÷ probabilidad</b></p>
<p>Si un equipo tiene un 50 % de ganar, su cuota justa es 2,00. Si tiene un 25 %, es 4,00. Si tiene un 80 %, es 1,25.</p>
<h2>Un ejemplo con números</h2>
<p>Supón que tu estimación para un partido es: local 55 %, empate 25 %, visita 20 %. Las cuotas justas son 1,82 · 4,00 · 5,00. Ahora mira lo que ofrece una casa: local 1,75 · empate 3,50 · visita 4,40. Las tres están <b>por debajo</b> de la justa. No es casualidad: la casa recorta cada cuota para quedarse con un margen (lo explicamos en la guía del margen de la casa).</p>
<table class="tbl"><thead><tr><th>Resultado</th><th class="r">Probabilidad</th><th class="r">Cuota justa</th><th class="r">Cuota de la casa</th></tr></thead><tbody>
<tr><td>Local</td><td class="r">55 %</td><td class="r">1,82</td><td class="r">1,75</td></tr>
<tr><td>Empate</td><td class="r">25 %</td><td class="r">4,00</td><td class="r">3,50</td></tr>
<tr><td>Visita</td><td class="r">20 %</td><td class="r">5,00</td><td class="r">4,40</td></tr></tbody></table>
<h2>Cómo se usa</h2>
<ul>
<li><b>Si la casa paga menos que la cuota justa</b>, estás cobrando menos de lo que arriesgas: a largo plazo pierdes dinero con esa jugada.</li>
<li><b>Si la casa paga más</b>, la jugada tiene «valor» según tu estimación. Pero ojo: tu estimación puede estar equivocada, y elegir siempre la mejor cuota entre muchas tiende a exagerar la ventaja.</li>
<li><b>Un favorito puede ser una mala jugada</b> y un equipo débil una buena, según el precio. Lo que importa es la distancia entre lo que se paga y lo que debería pagarse.</li>
</ul>
<h2>Cómo lo muestra Aurum Predictor</h2>
<p>En cada partido verás la probabilidad de cada resultado y su cuota justa. Es una referencia: <b>una casa tiene que pagar más que eso para que la jugada compense</b>. Ninguna cuota justa garantiza que el resultado ocurra; un 70 % significa que de cada 10 partidos parecidos, unos 3 terminan de otra forma.</p>`,
  },
  {
    slug: 'como-leer-cuotas-decimales', title: 'Cómo leer las cuotas decimales y convertirlas en probabilidad',
    desc: 'Las casas peruanas usan cuotas decimales. Aprende a convertirlas en probabilidad implícita, a calcular ganancias y a no confundir cuota alta con probabilidad alta.',
    rel: ['que-es-la-cuota-justa', 'margen-de-la-casa'],
    body: () => `
<p>La mayoría de casas que operan para Perú muestran cuotas en formato <b>decimal</b>: 1,50 · 2,10 · 3,75. Es el formato más simple, y una vez que lo entiendes puedes traducirlo a probabilidad en segundos.</p>
<h2>Cuánto cobras</h2>
<p>La cuota decimal es el total que recibes por cada sol apostado, incluyendo tu apuesta. Con una cuota de 2,10 y S/ 50 apostados, si aciertas recibes S/ 105: S/ 55 de ganancia y S/ 50 de tu apuesta devuelta. Si fallas, pierdes los S/ 50.</p>
<p><b>Ganancia = apuesta × (cuota − 1)</b></p>
<h2>La probabilidad implícita</h2>
<p>La casa también te dice, sin decirlo, qué probabilidad le asigna a cada resultado: <b>1 ÷ cuota</b>.</p>
<ul>
<li>Cuota 1,50 → 1 ÷ 1,50 = 66,7 %</li>
<li>Cuota 2,00 → 50 %</li>
<li>Cuota 4,00 → 25 %</li>
<li>Cuota 10,00 → 10 %</li>
</ul>
<p>Ese porcentaje <b>incluye el margen de la casa</b>. Por eso, si sumas las probabilidades implícitas de todos los resultados de un partido, el total pasa de 100 %. Con cuotas 2,10 · 3,40 · 3,60 suma 104,8 %; ese 4,8 % de más es el margen.</p>
<h2>Errores comunes</h2>
<ul>
<li><b>Confundir cuota alta con «más posibilidades de ganar».</b> Una cuota alta significa que la casa cree que es poco probable. Cuanto más alta, menos probable.</li>
<li><b>Mirar solo la ganancia.</b> Una cuota de 1,20 parece segura, pero equivale a un 83 %: pierdes 1 de cada 6 veces y tu ganancia es pequeña.</li>
<li><b>Comparar cuotas entre mercados distintos.</b> Un mercado de 2 resultados (quién gana) y uno de 3 (con empate) no se pueden mezclar.</li>
</ul>
<h2>Una regla práctica</h2>
<p>Antes de apostar, convierte la cuota en porcentaje y pregúntate: «¿de verdad creo que esto ocurre más veces de las que dice la cuota?». Si no tienes una razón concreta para creerlo, probablemente no hay valor. Aurum Predictor te da una estimación y la cuota justa para que puedas comparar.</p>`,
  },
  {
    slug: 'margen-de-la-casa', title: 'El margen de la casa: por qué la mayoría pierde a largo plazo',
    desc: 'Toda casa de apuestas recorta las cuotas para asegurar su ganancia. Aprende a calcular el margen y por qué se multiplica en las combinadas.',
    rel: ['que-es-la-cuota-justa', 'combinadas-como-se-multiplica-el-riesgo'],
    body: () => `
<p>Una casa de apuestas no necesita adivinar los resultados. Le basta con <b>cobrar un pequeño porcentaje en cada mercado</b>. Ese porcentaje se llama margen (o «overround»), y es la razón de fondo por la que la mayoría de apostadores pierde con el tiempo.</p>
<h2>Cómo se ve el margen</h2>
<p>Imagina una moneda justa: 50 % cara, 50 % sello. La cuota justa de cada lado es 2,00. Una casa podría ofrecer 1,90 en ambos. Las probabilidades implícitas son 52,6 % + 52,6 % = 105,3 %. Ese 5,3 % de más es lo que la casa se queda, en promedio, de todo el dinero apostado.</p>
<p><b>margen ≈ (suma de 1 ÷ cuota de todos los resultados) − 1</b></p>
<h2>Qué significa para ti</h2>
<p>Con cuotas de 1,90, si apostaras mil veces S/ 10 a cara y la moneda fuera perfectamente justa, aciertas unas 500 veces. Cobras 500 × S/ 19 = S/ 9.500 y has puesto S/ 10.000. Pierdes S/ 500 <i>aunque acertaste exactamente la mitad</i>. Para ganar tendrías que acertar más del 52,6 %.</p>
<h2>Los márgenes varían</h2>
<ul>
<li>En el resultado final (1X2) de ligas grandes, suele estar cerca del 3 % al 6 %.</li>
<li>En ligas pequeñas, mercados de goles o mercados exóticos puede ser bastante mayor.</li>
<li>Las bolsas de apuestas (exchanges) cobran una comisión en lugar de un margen, y por eso no las comparamos con las casas.</li>
</ul>
<h2>Cómo se lo quita Aurum Predictor a las cuotas</h2>
<p>Para estimar la probabilidad real que implica un mercado, hay que quitarle el margen. Usamos el método de la potencia: busca el exponente que hace que las probabilidades sumen 100 % sin repartir el margen por igual (los favoritos suelen llevar menos recorte que los resultados improbables). Así comparamos la cuota de la casa con la cuota justa y sabemos si paga más o menos.</p>
<h2>La conclusión honesta</h2>
<p>Para tener ventaja necesitas estimar mejor que el mercado <b>y</b> superar el margen. Los mercados de las ligas grandes son muy eficientes, y casi nadie lo consigue de forma sostenida. Por eso en este sitio no prometemos ganancias: damos información y una referencia de precio, y repetimos que el juego se hace solo con dinero que puedes permitirte perder.</p>`,
  },
  {
    slug: 'combinadas-como-se-multiplica-el-riesgo', title: 'Combinadas: cómo se multiplica el riesgo (y el margen)',
    desc: 'Una combinada multiplica las cuotas, pero también las probabilidades de fallar y el margen de la casa. Entiende los números antes de armar una.',
    rel: ['mas-de-1-5-goles-por-que-paga-poco', 'margen-de-la-casa'],
    body: () => `
<p>Una combinada (o «parlay») junta varias selecciones en una sola apuesta. Para cobrar, <b>todas</b> tienen que cumplirse. Las cuotas se multiplican, y por eso el premio crece rápido, pero lo mismo pasa con la probabilidad de fallar.</p>
<h2>La probabilidad se multiplica hacia abajo</h2>
<p>Si las selecciones son independientes (partidos distintos), la probabilidad conjunta es el producto de las individuales:</p>
<table class="tbl"><thead><tr><th>Selecciones</th><th class="r">Prob. de cada una</th><th class="r">Prob. de acertar todas</th></tr></thead><tbody>
<tr><td>2</td><td class="r">90 %</td><td class="r">81 %</td></tr>
<tr><td>3</td><td class="r">80 %</td><td class="r">51 %</td></tr>
<tr><td>4</td><td class="r">80 %</td><td class="r">41 %</td></tr>
<tr><td>4</td><td class="r">90 %</td><td class="r">66 %</td></tr>
<tr><td>6</td><td class="r">80 %</td><td class="r">26 %</td></tr></tbody></table>
<p>Tres selecciones «bastante seguras» (80 % cada una) aciertan juntas solo la mitad de las veces.</p>
<h2>El margen también se multiplica</h2>
<p>Cada selección lleva el margen de la casa. Si cada pata tiene un 5 % de margen, una combinada de cuatro patas se queda cerca del 19 % (1 − 0,95⁴). Es la razón por la que las combinadas son el producto favorito de las casas.</p>
<h2>Y los errores del modelo también</h2>
<p>Si tu estimación de cada selección se equivoca un 3 %, en tres patas el error acumulado ronda el 9 %. Además, al escoger las mejores combinaciones entre muchas posibles, el valor esperado que ves tiende a estar inflado (la «maldición del ganador»).</p>
<h2>Cuota justa de una combinada</h2>
<p>La cuota justa conjunta es 1 ÷ probabilidad conjunta. Cuatro selecciones de 90 % dan 66 % conjunto y una cuota justa de 1,52. Si tu casa paga menos que eso, la combinada no compensa.</p>
<h2>Reglas que aplicamos en Aurum Predictor</h2>
<ul>
<li>Nunca juntamos dos selecciones del mismo partido, porque no son independientes.</li>
<li>Una combinada solo existe dentro de una misma casa.</li>
<li>En la «Combinada probable del día» mostramos la probabilidad conjunta, el riesgo y la cuota justa, no una promesa de ganancia.</li>
</ul>`,
  },
  {
    slug: 'mas-de-1-5-goles-por-que-paga-poco', title: 'Más de 1.5 goles: por qué casi siempre se cumple y paga poco',
    desc: 'La línea de más de 1.5 goles se cumple en alrededor de tres de cada cuatro partidos de fútbol. Por eso su cuota es baja. Te explicamos cómo leer estas líneas.',
    rel: ['como-se-calculan-los-goles-con-poisson', 'combinadas-como-se-multiplica-el-riesgo'],
    body: (st) => `
<p>Los mercados de goles totales («más de» y «menos de») piden contar los goles de ambos equipos y comparar con una línea. Las líneas más usadas son 1.5, 2.5 y 3.5. El «.5» sirve para que nunca haya empate en la apuesta.</p>
<h2>Qué significa cada línea</h2>
<ul>
<li><b>Más de 1.5:</b> se cumple si hay 2 goles o más en el partido (pierde solo con 0-0, 1-0 o 0-1).</li>
<li><b>Más de 2.5:</b> se cumple con 3 goles o más.</li>
<li><b>Más de 3.5:</b> se cumple con 4 goles o más.</li>
<li>«Menos de» es lo contrario: son complementarios y suman 100 %.</li>
</ul>
<h2>Por qué «más de 1.5» parece tan seguro</h2>
<p>En el fútbol se marcan en promedio entre 2,5 y 2,8 goles por partido. Con ese promedio, que haya 0 o 1 gol es poco frecuente, así que «más de 1.5» se cumple en torno a tres de cada cuatro partidos, y en partidos de equipos ofensivos puede acercarse al 85 %.</p>
<p>Lo mismo ocurre del otro lado: «menos de 3.5» se cumple casi siempre, porque pocos partidos tienen 4 goles o más.</p>
<h2>El problema: pagan poco</h2>
<p>Una probabilidad de 80 % tiene cuota justa 1,25. Si una casa paga 1,22, ganas S/ 2,20 por cada S/ 10 apostados, pero pierdes los S/ 10 una de cada cinco veces. Tienes que acertar muchas veces seguidas para compensar un solo fallo.</p>
<h2>Lo que mide Aurum Predictor</h2>
<p>El mercado de goles más probable de cada partido (calibrado con el histórico del modelo) acertó ${pc(st.goals.acc)} de ${fmt(st.goals.n)} partidos de fútbol en nuestra prueba. Es un número alto precisamente porque incluye líneas «fáciles» como más de 1.5 y menos de 3.5. <b>Acertar mucho con cuotas bajas no es lo mismo que ganar dinero.</b></p>
<h2>Cómo usarlo con cabeza</h2>
<ul>
<li>Compara siempre con la cuota justa que mostramos: la casa debe pagar más.</li>
<li>Desconfía de las combinadas de muchas líneas fáciles: cada fallo borra todo (mira la guía de combinadas).</li>
<li>Recuerda que un partido puede quedar 1-0 y arruinar la jugada «segura».</li>
</ul>`,
  },
  {
    slug: 'como-se-calculan-los-goles-con-poisson', title: 'Cómo se calculan «más de 2.5» y «ambos marcan» con el modelo de Poisson',
    desc: 'Explicamos con un ejemplo numérico cómo el modelo de Poisson convierte los goles esperados de cada equipo en probabilidades de totales y ambos marcan.',
    rel: ['mas-de-1-5-goles-por-que-paga-poco', 'calibracion-por-que-un-modelo-sobreestima'],
    body: () => `
<p>Los goles son eventos raros e independientes en el tiempo, y por eso la distribución de Poisson describe bastante bien cuántos marca un equipo. Es la base de casi todos los modelos de goles y también de este sitio.</p>
<h2>Paso 1: los goles esperados</h2>
<p>Para cada equipo se estima cuántos goles se espera que marque en ese partido. Depende de su ataque, de la defensa del rival, del promedio de goles de la liga y de la ventaja de jugar de local. Digamos que para un partido el local espera <b>1,5</b> goles y la visita <b>1,1</b>.</p>
<h2>Paso 2: la probabilidad de cada marcador</h2>
<p>Con la fórmula de Poisson, la probabilidad de que un equipo con media λ marque exactamente k goles es e<sup>−λ</sup>·λ<sup>k</sup> ÷ k!. Para el local (λ = 1,5): 0 goles 22,3 %, 1 gol 33,5 %, 2 goles 25,1 %, 3 goles 12,6 %. Para la visita (λ = 1,1): 0 goles 33,3 %, 1 gol 36,6 %, 2 goles 20,1 %.</p>
<h2>Paso 3: de los marcadores a los mercados</h2>
<ul>
<li><b>Ambos marcan:</b> probabilidad de que el local marque al menos uno × probabilidad de que la visita también = (1 − 0,223) × (1 − 0,333) ≈ <b>51,8 %</b>.</li>
<li><b>Total de goles:</b> la suma de dos Poisson independientes es otra Poisson con λ = 1,5 + 1,1 = 2,6. Entonces: 0 goles 7,4 %, 1 gol 19,3 %, 2 goles 25,1 %. «Más de 1.5» = 1 − 7,4 % − 19,3 % ≈ <b>73,3 %</b>. «Más de 2.5» = 1 − 7,4 % − 19,3 % − 25,1 % ≈ <b>48,2 %</b>.</li>
</ul>
<h2>Lo que el modelo hace además</h2>
<ul>
<li>Da más peso a los partidos recientes: un partido pierde la mitad de su peso a los 12 meses.</li>
<li>Corrige los marcadores bajos (0-0, 1-1), donde el Poisson puro falla (ajuste de Dixon y Coles).</li>
<li>En ligas con ventaja local extra, como la Liga 1 de Perú con la altura, incluye ese efecto.</li>
<li>Recalibra las probabilidades finales con el histórico, porque el Poisson tiende a exagerar los extremos.</li>
</ul>
<h2>Sus límites</h2>
<p>El modelo no sabe de lesiones, sanciones, rotaciones ni del estado de ánimo del equipo. Parte de resultados pasados. Por eso lo presentamos como una referencia y no como una garantía.</p>`,
  },
  {
    slug: 'calibracion-por-que-un-modelo-sobreestima', title: 'Calibración: por qué un modelo que dice 90 % puede acertar solo 80 %',
    desc: 'Un modelo está calibrado cuando sus porcentajes coinciden con la frecuencia real. Explicamos cómo lo medimos y cómo corregimos el exceso de confianza.',
    rel: ['como-se-calculan-los-goles-con-poisson', 'que-es-la-cuota-justa'],
    body: (st) => `
<p>Cuando un modelo dice que algo pasa el 80 % de las veces, debería pasar 80 de cada 100 veces. Si pasa solo 70, el modelo está <b>sobreconfiado</b>; si pasa 90, está <b>subconfiado</b>. Esa coincidencia entre lo que se dice y lo que ocurre se llama <b>calibración</b>, y es tan importante como acertar.</p>
<h2>Por qué importa</h2>
<p>Las cuotas justas salen de las probabilidades. Si el modelo dice 95 % y la realidad es 85 %, la cuota justa que ves (1,05) es demasiado baja y puedes creer que una cuota de 1,10 tiene valor cuando no lo tiene.</p>
<h2>Cómo la medimos</h2>
<p>Hacemos una prueba «hacia adelante»: para cada liga, el modelo predice partidos sin conocer su resultado, usando solo lo que se sabía hasta ese día. Después se agrupan las predicciones por tramos (70-80 %, 80-90 %…) y se compara el porcentaje prometido con el porcentaje real.</p>
<table class="tbl"><thead><tr><th>El modelo decía</th><th class="r">Debe cumplirse</th></tr></thead><tbody>
<tr><td>Entre 70 % y 80 %</td><td class="r">entre el 70 % y el 80 % de las veces</td></tr>
<tr><td>Entre 80 % y 90 %</td><td class="r">entre el 80 % y el 90 % de las veces</td></tr></tbody></table>
<h2>Cómo corregimos el exceso de confianza</h2>
<p>El modelo de goles tiende a exagerar las probabilidades extremas. Por eso ajustamos cada mercado (más de 1.5, más de 2.5, más de 3.5 y ambos marcan) con una regresión logística: una curva que «aprieta» las probabilidades hacia el centro lo justo. El ajuste se calcula con la mitad de los partidos y se verifica en la otra mitad; <b>solo se usa si mejora fuera de muestra</b>. En la última prueba abarcó ${fmt(st.goals.n)} partidos.</p>
<h2>Lo que no resuelve</h2>
<p>Estar calibrado no significa tener ventaja sobre las casas. Un modelo puede estar perfectamente calibrado y aun así no superar al mercado. Es una condición necesaria de la honestidad, no una garantía de rentabilidad.</p>`,
  },
  {
    slug: 'altitud-liga-1-peru-efecto-local', title: 'La altura en la Liga 1 de Perú: cuánto cambia los goles',
    desc: 'Jugar en Cusco, Huancayo o Juliaca cambia los resultados. Explicamos cómo se incorpora la altitud de la sede local al pronóstico de goles.',
    rel: ['como-se-calculan-los-goles-con-poisson', 'calibracion-por-que-un-modelo-sobreestima'],
    body: () => `
<p>En el fútbol peruano hay un factor que casi no existe en otras ligas: <b>la altitud</b>. Entre la costa, a nivel del mar, y ciudades como Juliaca, Cusco o Huancayo hay más de 3 000 metros de diferencia, y eso se nota en el juego.</p>
<h2>Qué ocurre en la práctica</h2>
<p>Un equipo de llanura que visita una sede alta tiene menos oxígeno disponible, se fatiga antes y rinde por debajo de su nivel. El equipo local, aclimatado, mantiene el ritmo. En nuestros datos, con unos 3 km de diferencia de altitud, los goles del local suben alrededor de un 28 % y los de la visita bajan cerca de un 13 %. No son reglas fijas, sino la estimación que sale de los resultados pasados.</p>
<h2>Cómo lo usa el modelo</h2>
<ul>
<li>Cada equipo de la Liga 1 tiene la altitud aproximada de su ciudad sede.</li>
<li>El efecto se aplica solo cuando el local juega más alto que el visitante; no se castiga al revés.</li>
<li>Si falta la altitud de algún equipo, no se aplica ningún efecto: preferimos no inventar.</li>
<li>El ajuste se validó con varios cortes del histórico antes de usarlo.</li>
</ul>
<h2>Qué cambia en los mercados</h2>
<p>Con el efecto de altura, el modelo suele dar más goles esperados para el local, menos para el visitante y una probabilidad mayor de victoria local. Para los totales de goles el impacto es menor, porque lo que se gana de un lado se pierde del otro.</p>
<h2>Cuidado</h2>
<ul>
<li>La altura no garantiza nada: hay visitantes que ganan en Cusco y locales que pierden en casa.</li>
<li>Los equipos de altura que visitan la costa no reciben ninguna ventaja.</li>
<li>Una cuota baja por «efecto altura» tampoco es un regalo: la casa también lo sabe.</li>
</ul>
<p>En cada partido de Liga 1 donde la diferencia de altura supera los 0,5 km, la página del partido lo indica.</p>`,
  },
  {
    slug: 'juego-responsable-senales-y-ayuda', title: 'Juego responsable: límites, señales de alerta y dónde buscar ayuda',
    desc: 'Guía práctica de juego responsable en Perú: cómo poner límites, qué señales indican un problema y dónde pedir ayuda.',
    rel: ['margen-de-la-casa', 'combinadas-como-se-multiplica-el-riesgo'],
    body: () => `
<p>Las apuestas deportivas son un producto de entretenimiento con riesgo real. En Perú son solo para mayores de 18 años y deben hacerse en casas autorizadas por el MINCETUR. Esta guía no sustituye la ayuda profesional, pero reúne lo básico.</p>
<h2>Antes de apostar</h2>
<ul>
<li><b>Define un presupuesto</b> que puedas perder sin afectar tus gastos (comida, alquiler, deudas). Considera ese dinero gastado.</li>
<li><b>Fija un límite de tiempo.</b> Apostar sin pausa es una señal de riesgo.</li>
<li><b>Nunca apuestes con dinero prestado</b> ni con el de las cuentas de la casa o los estudios.</li>
<li><b>No intentes recuperar pérdidas.</b> Subir la apuesta después de perder es el camino más rápido al problema.</li>
<li><b>Usa las herramientas de tu casa</b>: límites de depósito, pausas y autoexclusión.</li>
</ul>
<h2>Señales de alerta</h2>
<ul>
<li>Apostar más dinero o más tiempo del que pensabas.</li>
<li>Pensar en apuestas casi todo el día.</li>
<li>Mentir sobre cuánto apuestas.</li>
<li>Apostar para escapar de la ansiedad, la tristeza o los problemas.</li>
<li>Pedir dinero prestado o vender cosas para apostar.</li>
<li>Irritación al intentar reducirlo.</li>
</ul>
<h2>Si reconoces alguna</h2>
<ul>
<li>Pide la <b>autoexclusión</b> en tu casa de apuestas.</li>
<li>Habla con alguien de confianza.</li>
<li>Busca un profesional de salud mental. En Perú, la <b>Línea 113 del MINSA</b> (opción de salud mental) ofrece orientación.</li>
</ul>
<h2>Lo que este sitio no hace</h2>
<p>Aurum Predictor no acepta apuestas ni mueve dinero. Sus pronósticos son estimaciones y <b>no garantizan resultados</b>. La mayoría de personas que apuestan pierde a largo plazo por el margen de las casas; entiéndelo antes de empezar.</p>`,
  },
  {
    slug: 'handicap-asiatico-que-significa', published: '2026-11-05', title: 'Hándicap asiático: qué significa −0,5, −1 y −0,25 (con ejemplos)',
    desc: 'El hándicap asiático reparte ventaja entre favorito y rival para igualar el partido. Entiende cómo se paga cada línea, incluida la devolución y las medias líneas.',
    rel: ['que-es-la-cuota-justa', 'como-leer-cuotas-decimales'],
    body: () => `
<p>El hándicap asiático es un mercado que «quita el empate» y reparte una ventaja o una desventaja de goles entre los dos equipos. La idea es igualar el partido: si un equipo es muy favorito, empieza perdiendo por un gol (o por medio gol) para que pagar por él tenga más sentido.</p>
<h2>Las líneas enteras y las de medio gol</h2>
<ul>
<li><b>−0,5</b> al favorito: el favorito tiene que ganar. Si empata o pierde, pierdes la apuesta. Es como apostar a «gana», pero sin el empate como opción de la casa.</li>
<li><b>+0,5</b> al rival: gana si el rival gana o empata. Solo pierdes si el favorito gana.</li>
<li><b>−1</b> al favorito: si gana por dos goles o más, ganas. Si gana por <b>exactamente un gol</b>, te devuelven la apuesta (ni ganas ni pierdes). Si empata o pierde, pierdes.</li>
<li><b>+1</b> al rival: si pierde por un gol, te devuelven la apuesta; si empata o gana, ganas; si pierde por dos o más, pierdes.</li>
<li><b>0 (empate no válido)</b>: si el equipo gana, ganas; si empata, te devuelven la apuesta; si pierde, pierdes.</li>
</ul>
<h2>Las líneas de cuarto: −0,25 y +0,25</h2>
<p>Parecen raras, pero son sencillas: la apuesta se parte en dos mitades iguales en las líneas vecinas.</p>
<ul>
<li><b>−0,25</b> = mitad en 0 y mitad en −0,5. Si el equipo gana, ganas las dos mitades. Si empata, la mitad en 0 se devuelve y la mitad en −0,5 se pierde: pierdes media apuesta. Si pierde, pierdes todo.</li>
<li><b>+0,25</b> = mitad en 0 y mitad en +0,5. Si el equipo gana, ganas todo. Si empata, la mitad en 0 se devuelve y la mitad en +0,5 gana: cobras media ganancia. Si pierde, pierdes todo.</li>
<li>Con <b>−0,75</b> y <b>+0,75</b> pasa lo mismo con −0,5/−1 y +0,5/+1: con −0,75, ganar por un solo gol da media ganancia; con +0,75, perder por un solo gol da media pérdida.</li>
</ul>
<h2>Un ejemplo con números</h2>
<p>Apuestas S/ 100 a un favorito con hándicap −1 y cuota 2,00. Resultados posibles:</p>
<table class="tbl"><thead><tr><th>El favorito…</th><th class="r">Resultado de tu apuesta</th></tr></thead><tbody>
<tr><td>gana 3-0</td><td class="r">ganas S/ 100</td></tr>
<tr><td>gana 1-0</td><td class="r">te devuelven S/ 100</td></tr>
<tr><td>empata</td><td class="r">pierdes S/ 100</td></tr>
<tr><td>pierde</td><td class="r">pierdes S/ 100</td></tr></tbody></table>
<h2>Por qué se usa</h2>
<ul>
<li>Reduce el peso del empate y deja un mercado casi de dos resultados.</li>
<li>Los márgenes suelen ser menores que en el 1X2 de las ligas grandes.</li>
<li>La devolución protege parte de la apuesta, pero <b>no cambia el margen de la casa</b>: sigue mandando la cuota justa.</li>
</ul>
<h2>Cómo pensarlo con probabilidades</h2>
<p>Cada línea es un mercado distinto, con su propia probabilidad. «Favorito −1» es menos probable que «favorito gana», porque exige más. Con las probabilidades que ves en el sitio puedes estimar la cuota justa de cada línea: la probabilidad de ganar por dos o más es menor que la de ganar, y su cuota justa sube en la misma proporción. Hoy Aurum Predictor no pronostica el hándicap; usa esta guía solo para entender cómo lo muestran las casas.</p>`,
  },
  {
    slug: 'por-que-fallan-los-favoritos-azar-y-deportes', published: '2026-11-12', title: 'Por qué fallan los favoritos: el azar pesa distinto en cada deporte',
    desc: 'En baloncesto el favorito gana mucho más que en fútbol o béisbol. Explicamos por qué y mostramos cuánto acierta nuestro modelo en cada deporte.',
    rel: ['calibracion-por-que-un-modelo-sobreestima', 'mas-de-1-5-goles-por-que-paga-poco'],
    body: (st) => {
      const by = Object.fromEntries(st.sports.map((s) => [s.name, s]));
      const f = (n) => (by[n] ? pc(by[n].acc, 1) : 'sin datos');
      return `
<p>Todos conocemos partidos en los que el equipo débil ganó. Pero no todos los deportes dan la misma cantidad de sorpresas. Entender por qué ayuda a no sobreestimar a los favoritos.</p>
<h2>La regla: más acciones, menos azar</h2>
<p>Un resultado deportivo mezcla habilidad y suerte. Cada vez que se anota, el equipo mejor tiene una oportunidad de imponerse; si se anota muchas veces, las pequeñas rachas de suerte se compensan y gana el que tiene más calidad. Si se anota pocas veces, un solo gol afortunado, un rebote o un error arbitral decide el partido.</p>
<ul>
<li><b>Baloncesto:</b> decenas de canastas por partido. El mejor equipo gana casi siempre.</li>
<li><b>Fútbol:</b> unos 2,5 goles por partido. Un solo gol cambia todo, y además existe el empate.</li>
<li><b>Béisbol y hockey:</b> pocas carreras o goles y mucha incertidumbre en cada jugada, incluso entre equipos de nivel distinto.</li>
</ul>
<h2>Lo que mide nuestro modelo</h2>
<p>En la prueba larga (siempre prediciendo sin conocer el resultado), el resultado más probable acertó:</p>
<table class="tbl"><thead><tr><th>Deporte</th><th class="r">Acierto del modelo</th><th class="r">Referencia simple</th></tr></thead><tbody>
${st.sports.map((s) => `<tr><td>${s.name}</td><td class="r"><b>${pc(s.acc, 1)}</b></td><td class="r muted">${pc(s.base, 1)}</td></tr>`).join('')}</tbody></table>
<p class="hint">Referencia simple: «gana siempre el local» o, en tenis y MMA, lanzar una moneda.</p>
<p>En fútbol el acierto es de ${f('Fútbol')}, porque hay tres resultados posibles y el empate es frecuente; en baloncesto sube a ${f('Baloncesto')}. No es que el modelo sea «mejor» en baloncesto: es que el deporte es menos aleatorio.</p>
<h2>Qué cambia para ti</h2>
<ul>
<li><b>No confundas acierto con ventaja.</b> Que un deporte se pueda predecir más no significa que se pueda ganar dinero apostando: las cuotas ya lo reflejan.</li>
<li><b>Un favorito de 80 % falla 2 de cada 10 veces.</b> En una combinada de varios favoritos, esas fallas se acumulan (mira la guía de combinadas).</li>
<li><b>Desconfía de las rachas.</b> Acertar cinco seguidas con favoritos de 80 % ocurre solo en un tercio de los casos; fallar una no es señal de nada.</li>
<li><b>El empate no es un resultado raro.</b> En fútbol, es normal que aproximadamente uno de cada cuatro partidos termine empatado y que el favorito no gane.</li>
</ul>
<h2>Cada semana lo comprobamos</h2>
<p>En los <a href="../../informes/" style="text-decoration:underline">informes semanales</a> verás cuántos partidos acertó el modelo esa semana y qué favoritos de más del 75 % fallaron.</p>`;
    },
  },
  {
    slug: 'como-comparar-casas-de-apuestas-peru', published: '2026-11-19', title: 'Cómo comparar casas de apuestas en Perú: qué mirar además de la cuota',
    desc: 'Autorización del MINCETUR, margen, límites, retiros y herramientas de control: una lista práctica para comparar casas de apuestas antes de abrir una cuenta.',
    rel: ['margen-de-la-casa', 'juego-responsable-senales-y-ayuda'],
    body: () => `
<p>Dos casas pueden mostrar la misma cuota y ser muy distintas. Antes de depositar dinero, conviene comparar algo más que el número. Esta guía reúne los puntos que revisaríamos nosotros, sin recomendar ninguna casa.</p>
<h2>1. Que esté autorizada</h2>
<p>En Perú las apuestas deportivas a distancia están reguladas (Ley 31557 y su reglamento) y el MINCETUR publica el registro de operadores autorizados. Antes de abrir una cuenta:</p>
<ul>
<li>Busca el nombre y el <b>dominio exacto</b> de la casa en el registro oficial (apuestasdeportivas.mincetur.gob.pe).</li>
<li>Desconfía de dominios parecidos al de una casa conocida, de cuentas ofrecidas por redes sociales o de «agentes» que cobran por fuera.</li>
<li>Las listas de terceros pueden estar desactualizadas: el registro oficial manda.</li>
</ul>
<h2>2. El margen real</h2>
<p>La cuota alta de un partido no dice nada si el resto de mercados tiene márgenes altos. Compara el margen en los mercados que sueles usar (mira la guía del margen de la casa). Una casa con 1,90 en ambos lados de una moneda justa se queda 5,3 %; otra con 1,80 se queda 11,1 %.</p>
<h2>3. Depósitos y retiros</h2>
<ul>
<li>Qué métodos acepta, cuánto cobra y cuánto demora en acreditar.</li>
<li>Cuánto tarda el <b>retiro</b> y qué documentos pide (identidad, cuenta a tu nombre).</li>
<li>Si exige apostar varias veces un bono antes de dejarte retirar.</li>
</ul>
<h2>4. Bonos: lee la letra pequeña</h2>
<p>Un bono de bienvenida casi nunca es gratis: suele exigir apostar varias veces el monto con cuotas mínimas y plazos. Pregúntate cuánto tendrías que apostar para retirar. Un bono puede empujarte a jugar más de lo previsto.</p>
<h2>5. Límites y herramientas de control</h2>
<ul>
<li>Límites de depósito, de pérdida y de tiempo que puedas fijar tú.</li>
<li>Autoexclusión temporal o permanente, fácil de activar.</li>
<li>Avisos de juego responsable visibles y un historial claro de tus movimientos.</li>
</ul>
<h2>6. Atención al cliente y reclamos</h2>
<p>Revisa si hay atención en español, horarios y vías de reclamo. Guarda capturas de tus apuestas y de los términos aceptados. Si una casa autorizada no resuelve un reclamo, puedes acudir a las autoridades competentes, como el MINCETUR.</p>
<h2>7. Mercados que realmente usas</h2>
<p>Si solo apuestas a la Liga 1 o a la Champions, importa más la cobertura de esos mercados que el catálogo total. Comprueba si ofrece las líneas que te interesan (1X2, goles, hándicap).</p>
<h2>Una lista corta antes de abrir cuenta</h2>
<ol>
<li>¿Está en el registro del MINCETUR, con el dominio exacto?</li>
<li>¿Entiendo cómo y cuándo puedo retirar?</li>
<li>¿Puedo poner límites y autoexcluirme?</li>
<li>¿El margen de sus mercados es razonable?</li>
<li>¿Entiendo las condiciones de cualquier bono?</li>
</ol>
<p>Aurum Predictor no tiene afiliación con ninguna casa ni cobra por aparecer. Si apuestas, hazlo solo con dinero que puedas permitirte perder y si eres mayor de 18 años.</p>`,
  },
  {
    slug: 'como-usar-aurum-predictor-paso-a-paso', published: '2026-11-26', title: 'Cómo usar Aurum Predictor paso a paso: de la probabilidad a la cuota justa',
    desc: 'Recorrido por las pestañas del sitio: pronósticos, goles, combinada del día, mis cuotas y backtest. Aprende a leer cada dato y a no sacar conclusiones de más.',
    rel: ['que-es-la-cuota-justa', 'combinadas-como-se-multiplica-el-riesgo'],
    body: () => `
<p>Aurum Predictor no te dice «apuesta aquí». Te da probabilidades, cuotas justas y una medición honesta de cuánto ha acertado el modelo. Esta guía explica cómo leer cada parte.</p>
<h2>1. Pronósticos: la pantalla principal</h2>
<ul>
<li>Usa las listas desplegables de <b>Deporte</b>, <b>Liga</b> y <b>Cuándo</b> para acotar. «Por probabilidad» pone arriba los partidos con favorito más claro.</li>
<li>En cada tarjeta ves el resultado más probable, su porcentaje y una etiqueta: «favorito claro», «ventaja moderada» o «pareja / poco fiable».</li>
<li>Si aparece «cuota muy baja: casi no compensa», el favorito es tan probable que su cuota justa es menor de 1,20.</li>
<li>La línea «Goles» muestra el mercado de goles más probable de ese partido (fútbol).</li>
</ul>
<h2>2. El detalle de un partido</h2>
<p>Toca un partido para abrir la ventana con el detalle: probabilidades de cada resultado (mercado y modelo), goles esperados, la tabla de goles con más/menos de 1.5, 2.5 y 3.5 y ambos marcan, últimos resultados de cada equipo y, si hay datos, cuotas de varias casas.</p>
<h2>3. La cuota justa</h2>
<p>La <b>cuota justa</b> es 1 ÷ probabilidad. Es el mínimo que una casa debería pagar para que la jugada compense. Si tu casa paga menos, no conviene; si paga más, la ventaja es solo una estimación. Más en la <a href="../que-es-la-cuota-justa/" style="text-decoration:underline">guía de la cuota justa</a>.</p>
<h2>4. Mis cuotas: compara con tu casa</h2>
<p>Las casas peruanas no ofrecen datos abiertos. En el detalle del partido, o en la pestaña «Mis cuotas», puedes escribir la cuota que ves en tu casa. El sitio la compara con la cuota justa y calcula el valor esperado (EV). Se guarda solo en tu navegador.</p>
<h2>5. La combinada probable del día</h2>
<p>Arriba de la pantalla principal verás la combinada de goles más probable del día, con la probabilidad conjunta, el riesgo y la cuota justa. Puedes elegir entre 2 y 5 selecciones. Recuerda que las probabilidades se multiplican: mira la <a href="../combinadas-como-se-multiplica-el-riesgo/" style="text-decoration:underline">guía de combinadas</a>.</p>
<h2>6. Valor, Partidos y Combinadas</h2>
<ul>
<li><b>Valor:</b> selecciones donde la cuota de una casa supera la cuota justa del modelo o del mercado.</li>
<li><b>Partidos:</b> la cuota más alta de cada resultado entre las casas disponibles.</li>
<li><b>Combinadas:</b> combinaciones de 2 o 3 selecciones, siempre de una sola casa y nunca del mismo partido.</li>
</ul>
<p>Estas pantallas dependen de que haya cuotas de casas; en semanas con pocos partidos pueden aparecer vacías.</p>
<h2>7. Modelo y backtest: cuánto ha acertado</h2>
<p>La pestaña «Modelo y backtest» explica el método y muestra el acierto por liga y deporte en una prueba sin mirar el futuro. Si el modelo acierta poco en una liga, el sitio lo muestra tal cual. Complementa con la <a href="../../metodologia/" style="text-decoration:underline">metodología</a> y los <a href="../../informes/" style="text-decoration:underline">informes semanales</a>.</p>
<h2>8. Lo que no debes concluir</h2>
<ul>
<li>Una probabilidad alta no es una promesa.</li>
<li>Un valor esperado positivo es una estimación, no una ganancia asegurada.</li>
<li>Un modelo que acierta bien no implica que supere a las casas.</li>
<li>Ninguna herramienta evita las pérdidas: el juego es solo para mayores de 18 años, con dinero que puedas perder.</li>
</ul>`,
  },
];

const guiaBySlug = Object.fromEntries(GUIAS.map((g) => [g.slug, g]));

// páginas informativas
function acerca() {
  return `
<h1>Acerca de Aurum Predictor</h1>
<p class="muted">Última actualización: ${UPDATED}</p>
<p>Aurum Predictor es un proyecto independiente, hecho en Perú, que estima la probabilidad de los resultados de partidos de muchos deportes y la compara con las cuotas de las casas. Nació de una pregunta simple: <b>¿cuánto debería pagar una cuota para que valga la pena?</b></p>
<h2>Qué hacemos</h2>
<ul>
<li>Calculamos la probabilidad de cada resultado y su <a href="../guias/que-es-la-cuota-justa/" style="text-decoration:underline">cuota justa</a>.</li>
<li>Pronosticamos goles en fútbol (más/menos de 1.5, 2.5 y 3.5, y ambos marcan) y armamos una combinada probable del día.</li>
<li>Comparamos cuotas de casas autorizadas en Perú cuando hay datos.</li>
<li>Medimos con honestidad cuánto ha acertado el modelo en el pasado (ver <a href="../metodologia/" style="text-decoration:underline">Metodología</a>).</li>
<li>Explicamos cómo funcionan las cuotas en nuestras <a href="../guias/" style="text-decoration:underline">guías</a>.</li>
</ul>
<h2>Qué no hacemos</h2>
<ul>
<li>No aceptamos apuestas ni movemos dinero.</li>
<li>No vendemos «fijas» ni garantizamos resultados.</li>
<li>Ninguna casa de apuestas paga por aparecer ni por mejorar su posición.</li>
<li>No pedimos cuenta ni datos personales.</li>
</ul>
<h2>Nuestros principios</h2>
<ol>
<li><b>No inventar datos.</b> Si no hay información suficiente para un partido, el sitio lo dice y no muestra un pronóstico.</li>
<li><b>Mostrar los errores.</b> Publicamos el acierto histórico por liga, incluso donde el modelo es mediocre.</li>
<li><b>Recordar el riesgo.</b> Un pronóstico alto no es una promesa y la mayoría pierde a largo plazo (ver <a href="../guias/margen-de-la-casa/" style="text-decoration:underline">el margen de la casa</a>).</li>
</ol>
<h2>De dónde vienen los datos</h2>
<p>Resultados y cuotas de football-data.co.uk, calendarios y resultados de la API pública no oficial de ESPN y, de forma opcional, cuotas de The Odds API. Son datos de terceros, sin garantía y sin afiliación con esas fuentes. Los escudos de equipos pertenecen a sus clubes y se cargan desde los servidores de ESPN.</p>
<h2>Publicidad</h2>
<p>El sitio puede mostrar anuncios de Google AdSense, solo con tu permiso. Los anuncios los elige Google y no son recomendaciones nuestras. Más detalles en <a href="../privacidad.html" style="text-decoration:underline">Privacidad y cookies</a>.</p>
<h2>Contacto</h2>
<p>Si encuentras un error o quieres proponer una mejora, escribe desde la página de <a href="../contacto/" style="text-decoration:underline">Contacto</a>.</p>`;
}

function contacto() {
  return `
<h1>Contacto</h1>
<p class="muted">Última actualización: ${UPDATED}</p>
<p>Si encuentras un dato equivocado, un partido mal pronosticado por un error nuestro, o quieres sugerir una liga o una mejora, avísanos. Leemos todo.</p>
<h2>Cómo escribirnos</h2>
<p>Abre un mensaje público en el <a href="${REPO_ISSUES}" rel="noopener noreferrer" style="text-decoration:underline">espacio de reportes del proyecto en GitHub</a> (necesitas una cuenta gratuita de GitHub). Indica:</p>
<ul>
<li>la dirección de la página donde viste el problema;</li>
<li>qué esperabas ver y qué viste;</li>
<li>una captura de pantalla, si puedes.</li>
</ul>
<p>Por ser un espacio público, no escribas datos personales ni financieros.</p>
<h2>Qué no podemos hacer</h2>
<ul>
<li>No damos «fijas», ni pronósticos personalizados, ni asesoría de apuestas o inversión.</li>
<li>No gestionamos apuestas, depósitos ni retiros: no somos una casa de apuestas. Para reclamos sobre una casa, contacta a esa casa o al MINCETUR.</li>
</ul>
<h2>Derechos sobre tus datos</h2>
<p>Esta web no guarda datos personales en servidores propios. Los detalles están en <a href="../privacidad.html" style="text-decoration:underline">Privacidad y cookies</a>.</p>`;
}

function metodologia(st) {
  const rows = st.sports.map((s) => `<tr><td>${s.name}</td><td class="r">${fmt(s.n)}</td><td class="r"><b>${pc(s.acc, 1)}</b></td><td class="r muted">${pc(s.base, 1)}</td></tr>`).join('');
  return `
<h1>Metodología: cómo se calculan los pronósticos</h1>
<p class="muted">Última actualización: ${UPDATED} · cifras calculadas con los datos publicados</p>
<p>Aurum Predictor estima, para cada evento, la probabilidad de cada resultado. De ahí salen la cuota justa y los pronósticos de goles. Esta página explica cómo, con qué datos y con qué errores. No hay «magia»: es estadística con las limitaciones de cualquier modelo.</p>
<h2>1. Datos</h2>
<p>Usamos ${fmt(st.nResults)} resultados históricos de ${fmt(st.nLeagues)} competiciones de varios deportes. Las fuentes son football-data.co.uk (resultados y cuotas de ligas europeas), la API pública no oficial de ESPN (calendarios, resultados y cuotas de referencia) y, de forma opcional, The Odds API. Los datos se actualizan cada 8 horas. Son datos de terceros: pueden tener errores o cambiar.</p>
<h2>2. Fútbol: modelo de goles</h2>
<p>Cada equipo recibe una fuerza de ataque y otra de defensa, estimadas con sus resultados, dando más peso a los partidos recientes (un partido pierde la mitad de su peso en unos 12 meses). Los goles esperados de cada equipo alimentan una distribución de Poisson, con una corrección para los marcadores bajos (Dixon y Coles). Se incluye la ventaja de local y, en la Liga 1 de Perú, el efecto de la altitud de la sede. De los marcadores sale la probabilidad de victoria, empate, derrota, más/menos de 1.5, 2.5 y 3.5, y ambos marcan.</p>
<h2>3. Otros deportes: Elo</h2>
<p>En baloncesto, béisbol, fútbol americano, hockey, tenis y MMA se usa un sistema Elo: cada equipo o competidor tiene un puntaje que sube al ganar y baja al perder, más cuanto más sorprendente es el resultado y mayor el margen. Se aplica una ventaja de local según el deporte y, si hay pocos partidos, la probabilidad se acerca al 50 % y se marca como poco fiable.</p>
<h2>4. Cuotas del mercado</h2>
<p>Cuando hay cuotas, se les quita el margen de la casa (método de la potencia) para obtener la probabilidad que implica el mercado. En el resultado final, el sitio usa esa probabilidad como referencia, porque los mercados de las ligas grandes suelen estimar mejor que cualquier modelo propio. El modelo se usa cuando no hay cuotas fiables.</p>
<h2>5. Calibración</h2>
<p>Los modelos tienden a exagerar. Cada mercado de goles se ajusta con una curva logística calculada con el histórico, y el resultado final de cada deporte se suaviza si eso mejora el error fuera de muestra. Un ajuste solo se aplica si mejora en datos que no se usaron para calcularlo. Mira la guía de <a href="../guias/calibracion-por-que-un-modelo-sobreestima/" style="text-decoration:underline">calibración</a>.</p>
<h2>6. Cuánto ha acertado</h2>
<p>La prueba es «hacia adelante»: para cada liga se predice la segunda mitad de su historia usando solo lo conocido hasta cada fecha, sin mirar el futuro. Esto es lo que el pick del resultado final acertó:</p>
<table class="tbl"><thead><tr><th>Deporte</th><th class="r">Partidos</th><th class="r">Acierto del modelo</th><th class="r">Referencia simple</th></tr></thead><tbody>${rows}</tbody></table>
<p class="hint">La referencia simple es «gana siempre el local» (fútbol y deportes de equipo) o lanzar una moneda (tenis y MMA).</p>
<p>En los mercados de goles de fútbol, el mercado más probable de cada partido acertó <b>${pc(st.goals.acc, 1)}</b> en ${fmt(st.goals.n)} partidos (${fmt(st.goals.hit)} aciertos). Esa cifra es alta porque incluye líneas fáciles, como más de 1.5 o menos de 3.5, que se cumplen casi siempre y pagan poco. Más detalle en <a href="../guias/mas-de-1-5-goles-por-que-paga-poco/" style="text-decoration:underline">esta guía</a>.</p>
<h2>7. Límites que debes conocer</h2>
<ul>
<li>No conocemos lesiones, sanciones, alineaciones, clima ni motivación.</li>
<li>Los equipos con pocos partidos tienen pronósticos poco fiables, y se marcan como tales.</li>
<li>Un buen acierto histórico no garantiza el futuro.</li>
<li>La «combinada probable» supone partidos independientes y multiplica las probabilidades; mira la guía de <a href="../guias/combinadas-como-se-multiplica-el-riesgo/" style="text-decoration:underline">combinadas</a>.</li>
<li>Los mercados suelen ser mejores que cualquier modelo. Por eso no prometemos ganancias.</li>
</ul>
<p>Este sitio es solo informativo. <b>No acepta apuestas, no mueve dinero y no es una recomendación.</b></p>`;
}

module.exports = { dmy, GUIAS, guiaBySlug, acerca, contacto, metodologia, UPDATED, REPO_ISSUES };
