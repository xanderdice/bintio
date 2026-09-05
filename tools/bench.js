/* ==========================================================================
   Banco de medida del nucleo.  (node tools/bench.js [--contactos 500] [--mensajes 40])

   BINTIO no tiene servidor al que echarle la culpa: todo el coste lo paga el
   aparato del usuario, en el hilo de la interfaz, en JavaScript. Este banco
   mide las siete operaciones que deciden si la aplicacion es usable, y NO
   mide nada mas. El criterio para elegirlas es siempre el mismo: o el usuario
   las espera mirando la pantalla, o crecen con el numero de contactos.

     1. PBKDF2 con 150.000 iteraciones (vault.js:19). Es lo unico que hay
        entre el usuario y la aplicacion: se paga entera cada vez que se abre.
        Se miden los DOS caminos de kdf.js:67-90, porque el rapido solo
        existe en contexto seguro: por file:// o por http:// a una IP de la
        red local, crypto.subtle no esta definido y se cae al bucle propio.
     2. Alta de contacto (contacts.js:43). Se mide aparte del par de claves
        para ver cual de los dos es el coste real.
     3. contacts.secrets con la cache fria (contacts.js:34-41). K.bind la
        vacia en cada desbloqueo, y S.open la vuelve a llenar contacto por
        contacto: es un x25519 por cada uno, y todos caen sobre el primer
        sobre que entre. Es el peor numero de todo el codigo.
     4. Sellar y abrir un sobre (envelope.js). Es la unidad de trabajo de
        mandar y de recibir; todo lo demas son multiplos de esto.
     5. Emparejado de un sobre AJENO (session.js:116-158). Un sobre no dice
        a quien va, asi que hay que probar la etiqueta contacto por contacto.
        Es la unica operacion que crece con la lista, y por eso se mide con
        varios tamanos: la curva dice si es lineal o si hay algo peor dentro.
     6. writeNow completo (vault.js:163-182). No hay escritura incremental:
        cada mensaje reescribe, recifra y recodifica la boveda entera. Aqui
        interesa tanto el tiempo como el TAMANO, porque el techo de
        localStorage llega antes que el techo de la CPU.
     7. unlock (vault.js:112). Es 1 mas el coste de descifrar y parsear la
        boveda ya crecida: lo que el usuario espera de verdad al entrar.

   Lo que NO se mide, y por que: el DOM (aqui no hay navegador; para eso estan
   las recetas de consola del informe de interfaz), los transportes 4x (no se
   cargan sin navegador) y el coste propio de localStorage.setItem (en Node la
   boveda cae al respaldo en memoria, vault.js:45-52). Los tiempos de
   escritura de abajo son, por tanto, un suelo: en Chrome hay que sumarles el
   commit sincrono de LevelDB.

   Todo se repite hasta que el numero es estable y se ensenan el MINIMO, la
   mediana y la media junto al numero de vueltas. Una sola medida de algo que
   dura 0,05 ms no dice nada.

   Por que el minimo va el primero: un banco que corre varios minutos compite
   con lo que haya en la maquina, y la CPU ademas baja de frecuencia segun se
   calienta. Todo lo que le pase al proceso SUMA tiempo, nunca lo resta: no
   existe la interferencia que haga a un x25519 ir mas rapido de lo que puede.
   Asi que la mediana y la media miden la maquina cargada y el minimo mide la
   maquina; cuando los dos se separan, el bueno es el minimo. El bloque 4 lleva
   ademas una comprobacion de coherencia que remide la criptografia al final y
   avisa si los numeros publicados arriba ya no cuadran con ella.
   ========================================================================== */
var V = require('../test/load')('39');
var U = V.util, C = V.crypto, E = V.envelope, S = V.session, K = V.contacts;

/* Constantes leidas del codigo, no inventadas aqui. */
var ITERS = 150000;                  /* vault.js:19 */
var CUOTA_BYTES = 5 * 1024 * 1024;   /* cuota tipica de localStorage por origen */
var CLAVES_TRINQUETE = 2;            /* tope KEEP_RATCHET = 6 (session.js:28) */
var MAX_PER_CHAT = 400;              /* tope real del modelo, chat.js:17 */
var PASS = 'banco de medida bintio';

/* --------------------------------------------------------------------------
   Argumentos.  --clave valor y --clave=valor, igual que en tools/seed.js.

   Se validan de verdad y se aborta con un mensaje. La version anterior se
   tragaba cualquier cosa cayendo al valor por defecto, y con --contactos 0
   publicaba tablas de "NaN ms" antes de reventar sin decir por que.
   -------------------------------------------------------------------------- */
function leerArgs(argv) {
    var out = {}, i, a, eq, k, v;
    for (i = 0; i < argv.length; i++) {
        a = argv[i];
        if (a.substr(0, 2) !== '--') { continue; }
        eq = a.indexOf('=');
        if (eq > 0) {
            k = a.substring(2, eq);
            v = a.substring(eq + 1);
        } else {
            k = a.substr(2);
            v = (argv[i + 1] && argv[i + 1].substr(0, 2) !== '--') ? argv[++i] : '1';
        }
        out[k] = v;
    }
    return out;
}

var arg = leerArgs(process.argv.slice(2));

function abortar(msg) {
    console.log('bench: ' + msg);
    console.log('       node tools/bench.js --ayuda para ver las opciones y sus rangos.');
    process.exit(1);
}

if (arg.ayuda || arg.help || arg.h) {
    console.log('Uso: node tools/bench.js [--contactos 500] [--mensajes 40]');
    console.log('  --contactos  cuantos contactos monta el banco. Entero, minimo 1:');
    console.log('               sin contactos no hay a quien sellarle un sobre.');
    console.log('  --mensajes   mensajes por conversacion. Entero de 0 a ' + MAX_PER_CHAT + ',');
    console.log('               que es el tope por conversacion del modelo (chat.js:17).');
    process.exit(0);
}

/* Una opcion mal escrita no puede pasar en silencio: --contatos 50 correria
   el banco entero con los 500 por defecto y el informe no lo diria. */
var CONOCIDAS = { contactos: 1, mensajes: 1, ayuda: 1, help: 1, h: 1 };
var clave;
for (clave in arg) {
    if (Object.prototype.hasOwnProperty.call(arg, clave) && !CONOCIDAS[clave]) {
        abortar('no conozco la opcion --' + clave);
    }
}

/* Ausente cae al valor por defecto; presente pero ilegible se rechaza. */
function entero(nombre, porDefecto) {
    var v = arg[nombre];
    if (v === undefined) { return porDefecto; }
    if (!/^-?\d+$/.test(String(v))) {
        abortar('--' + nombre + ' quiere un numero entero, y ha llegado "' + v + '"');
    }
    return parseInt(v, 10);
}

var N = entero('contactos', 500);
var M = entero('mensajes', 40);

if (N < 1) {
    /* Con cero contactos el bloque 4 le sella un sobre a contactos[0], que es
       undefined, y el fallo acaba dentro del ['catch'] de kdf.js:82, que
       lo confunde con un fallo de crypto.subtle y reejecuta PBKDF2 entero. */
    abortar('--contactos tiene que ser 1 o mas, y ha llegado ' + N);
}
if (M < 0) {
    abortar('--mensajes no puede ser negativo, y ha llegado ' + M);
}
if (M > MAX_PER_CHAT) {
    /* Medir por encima del tope publicaria un tamano de boveda que la
       aplicacion no alcanza nunca: el modelo va tirando los mensajes viejos
       en cuanto la conversacion pasa de MAX_PER_CHAT. */
    abortar('--mensajes no puede pasar de ' + MAX_PER_CHAT + ' (ha llegado ' + M
        + '): es el tope por conversacion del modelo, chat.js:17');
}

/* --------------------------------------------------------------------------
   Velocidad de referencia de la maquina.

   La comprobacion de coherencia del bloque 4 tiene un punto ciego conocido:
   si la maquina va lenta durante TODO el banco, las filas y el remedido bajan
   juntos, la comparacion cuadra y no salta nada. El minimo tampoco defiende de
   eso: un minimo tomado en una maquina al 60 % de su velocidad sigue siendo un
   60 %.

   Contra eso no hay truco interno posible, asi que se hace lo unico honesto:
   medir la operacion mas cara del proyecto (un x25519) al EMPEZAR y al
   TERMINAR, publicar las dos cifras, y avisar si el banco se ha ido frenando
   por el camino. Y como el numero se imprime siempre, dos ejecuciones se
   pueden comparar entre si: si hoy la referencia sale un 50 % mas alta que
   ayer, la maquina esta estrangulada y TODO el informe lo esta con ella.
   -------------------------------------------------------------------------- */
function referencia() {
    var a = C.keypair(), b = C.keypair(), i, t, mejor = Infinity;
    for (i = 0; i < 12; i++) {
        t = reloj();
        C.x25519(a.sk, b.pk);
        t = reloj() - t;
        if (t < mejor) { mejor = t; }
    }
    return mejor;
}

/* --------------------------------------------------------------------------
   Reloj y estadistica.
   process.hrtime da nanosegundos y no depende de la hora del sistema.
   -------------------------------------------------------------------------- */
function reloj() {
    var t = process.hrtime();
    return t[0] * 1000 + t[1] / 1000000;
}

function estad(muestras) {
    var s = muestras.slice().sort(function (a, b) { return a - b; });
    var n = s.length, suma = 0, i;
    for (i = 0; i < n; i++) { suma += s[i]; }
    return {
        reps: n,
        mediana: n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2,
        media: suma / n,
        min: s[0],
        max: s[n - 1]
    };
}

/* Repite mientras no se agote el presupuesto de tiempo, con un minimo de
   vueltas y un tope, para que lo barato tambien de un numero estable. */
function medir(fn, minReps, presupuestoMs, maxReps) {
    minReps = minReps || 5;
    presupuestoMs = presupuestoMs === undefined ? 300 : presupuestoMs;
    maxReps = maxReps || 5000;
    var muestras = [], gastado = 0, t0, d;
    while (muestras.length < maxReps &&
           (muestras.length < minReps || gastado < presupuestoMs)) {
        t0 = reloj();
        fn();
        d = reloj() - t0;
        muestras.push(d);
        gastado += d;
    }
    return estad(muestras);
}

/* La version asincrona: PBKDF2 y unlock terminan en una llamada de vuelta. */
function medirAsync(reps, correr, listo) {
    var muestras = [], i = 0;
    function vuelta() {
        if (i >= reps) { listo(estad(muestras)); return; }
        var t0 = reloj();
        correr(function () {
            muestras.push(reloj() - t0);
            i++;
            vuelta();
        });
    }
    vuelta();
}

/* --------------------------------------------------------------------------
   Salida en texto
   -------------------------------------------------------------------------- */
function log(s) { process.stdout.write(s + '\n'); }
function rep(ch, n) { var s = ''; while (s.length < n) { s += ch; } return s; }
function pad(s, n, derecha) {
    s = String(s);
    var hueco = rep(' ', Math.max(0, n - s.length));
    return derecha ? hueco + s : s + hueco;
}

/* Numeros a la espanola: punto para los miles, coma para los decimales.

   Lo primero es la defensa: una division por un contador vacio da NaN o
   Infinity, y el separador de miles de abajo recorre "Infinity" letra a letra
   y lo publica como "In.fin.ity". Un numero que no existe se dice con
   palabras; asi se ve en la tabla que ahi no hay medida. */
function num(n, dec) {
    dec = dec === undefined ? 2 : dec;
    if (typeof n !== 'number' || isNaN(n)) { return 'n/d'; }
    if (!isFinite(n)) { return n > 0 ? 'infinito' : '-infinito'; }
    var neg = n < 0;
    if (neg) { n = -n; }
    var p = n.toFixed(dec).split('.');
    var ent = p[0], out = '', c = 0, i;
    for (i = ent.length - 1; i >= 0; i--) {
        out = ent.charAt(i) + out;
        c++;
        if (c % 3 === 0 && i > 0) { out = '.' + out; }
    }
    return (neg ? '-' : '') + out + (p[1] ? ',' + p[1] : '');
}

/* Decimales segun la magnitud: 0,05 ms con dos decimales seria "0,05" y con
   cuatro es "0,0512". Lo pequeno necesita mas cifras para significar algo, y
   por debajo de la microsegunda ya no hay ms que ensenar: se cambia de unidad
   (us = microsegundos). */
function ms(v) {
    if (typeof v !== 'number' || !isFinite(v)) { return num(v, 0); }
    if (v < 0.001) { return num(v * 1000, v < 0.0001 ? 3 : 2) + ' us'; }
    var dec = v < 0.01 ? 4 : (v < 1 ? 3 : (v < 100 ? 2 : 1));
    return num(v, dec) + ' ms';
}

function tabla(cabeceras, filas) {
    var anchos = [], i, j, v;
    for (j = 0; j < cabeceras.length; j++) { anchos[j] = cabeceras[j].length; }
    for (i = 0; i < filas.length; i++) {
        for (j = 0; j < cabeceras.length; j++) {
            v = String(filas[i][j] === undefined ? '' : filas[i][j]);
            if (v.length > anchos[j]) { anchos[j] = v.length; }
        }
    }
    function fila(celdas) {
        var out = [];
        for (var k = 0; k < anchos.length; k++) {
            out.push(pad(celdas[k] === undefined ? '' : celdas[k], anchos[k], k > 0));
        }
        log('  ' + out.join('   '));
    }
    fila(cabeceras);
    var sep = [];
    for (j = 0; j < anchos.length; j++) { sep.push(rep('-', anchos[j])); }
    log('  ' + sep.join('   '));
    for (i = 0; i < filas.length; i++) { fila(filas[i]); }
}

function bloque(n, titulo) {
    log('');
    log(rep('=', 78));
    log(n + '. ' + titulo);
    log(rep('=', 78));
}

function veredicto(txt) { log(''); log('  VEREDICTO: ' + txt); }
function nota(txt) { log('  ' + txt); }
function aviso(txt) { log(''); log('  AVISO: ' + txt); }

/* Las columnas de siempre, para que todas las tablas de tiempos digan lo
   mismo en el mismo orden. El minimo va el primero porque es el unico que no
   se lleva por delante lo que este haciendo la maquina a la vez. */
var COLS_T = ['minimo', 'mediana', 'media', 'maximo', 'reps'];
function filaDe(etiqueta, r) {
    return [etiqueta, ms(r.min), ms(r.mediana), ms(r.media), ms(r.max), r.reps];
}

/* Cuanto se separan la mediana y el minimo, en tanto por uno. Es la medida de
   lo sucia que estaba la maquina durante esa serie. */
function contaminacion(r) { return r.min > 0 ? (r.mediana - r.min) / r.min : 0; }

/* --------------------------------------------------------------------------
   Material de siembra
   -------------------------------------------------------------------------- */

/* Frases de unos 60 caracteres: es el mensaje tipico que se mide en el
   informe de la boveda, y el tamano del texto es lo unico que aporta a la
   cuenta final. */
var FRASES = [
    'Te confirmo que llego el paquete esta manana sin novedad.',
    'Nos vemos manana a las siete en el sitio de siempre, creo.',
    'He dejado la llave debajo de la maceta como quedamos ayer.',
    'Mandame la direccion cuando puedas y salgo para alla ya.',
    'El tren sale a las seis y diez, no llegues tarde otra vez.',
    'Ya esta todo listo por aqui, solo falta que confirmes tu.',
    'No he podido llamarte antes, tenia el aparato sin bateria.',
    'Dime algo cuando lo leas, aunque sea un mensaje muy corto.'
];

function idFalso(n) {
    var s = n.toString(16);
    while (s.length < 16) { s = '0' + s; }
    return s;
}

/* Un banco pequeno de pares de trinquete reales que se reparte entre todos
   los contactos. En la boveda ocupa exactamente lo mismo (128 caracteres de
   hexadecimal por clave, session.js:37-38) y ahorra generar mil pares de
   verdad, que serian seis segundos midiendo lo que ya mide el bloque 2. */
function bancoTrinquete(cuantos) {
    var out = [], i, kp;
    for (i = 0; i < cuantos; i++) {
        kp = C.keypair();
        out.push({
            sk: U.toHex(kp.sk),
            pk: U.toHex(kp.pk),
            id: U.toHex(C.sha256(U.fromString('bintio/rk/v1'), kp.pk).subarray(0, 4))
        });
    }
    return out;
}

function sembrarTrinquete(contactos, banco, cuantas) {
    var i, k, c, mine;
    for (i = 0; i < contactos.length; i++) {
        c = contactos[i];
        mine = [];
        for (k = 0; k < cuantas; k++) {
            var r = banco[(i + k) % banco.length];
            mine.push({ sk: r.sk, pk: r.pk, id: r.id, at: c.added - k * 86400000 });
        }
        c.ratchet = {
            mine: mine,
            theirs: { pk: banco[(i + cuantas) % banco.length].pk, at: c.added }
        };
    }
}

/* Los mensajes se escriben DIRECTAMENTE en el estado. Nunca con chat.sendText:
   sin transportes cargados todos acabarian en estado 'error' (chat.js:81-88)
   y ademas 'pendiente' y 'error' son estados vivos que Chat.retryPending
   volveria a emitir (chat.js:96-112). Solo estados terminales. */
function sembrarMensajes(contactos, porChat) {
    var st = V.vault.state, total = 0, k = 0, i, j, msgs, ts, saliente;
    var base = U.now();
    for (i = 0; i < contactos.length; i++) {
        msgs = [];
        ts = base - porChat * 60000;
        for (j = 0; j < porChat; j++) {
            ts += 60000;
            saliente = (j % 2) === 0;
            msgs.push({
                id: idFalso(k++),
                dir: saliente ? 'out' : 'in',
                kind: 'text',
                text: FRASES[(i + j) % FRASES.length],
                ts: ts,
                state: saliente ? 'leido' : 'recibido'
            });
            total++;
        }
        st.chats[contactos[i].pk] = {
            messages: msgs,
            unread: 0,
            updated: msgs.length ? msgs[msgs.length - 1].ts : 0,
            draft: ''
        };
    }
    return total;
}

/* --------------------------------------------------------------------------
   Estado compartido entre bloques
   -------------------------------------------------------------------------- */
var yo = null;           /* identidad propia */
var pares = [];          /* los pares de claves de los contactos: hacen falta
                            las privadas para poder abrir un sobre en el 4 */
var contactos = [];
var res = {};            /* resultados que usa el resumen final */

/* --------------------------------------------------------------------------
   1. Abrir la aplicacion: PBKDF2
   -------------------------------------------------------------------------- */
function paso1(hecho) {
    bloque(1, 'Abrir la aplicacion: PBKDF2 con ' + num(ITERS, 0) + ' iteraciones');
    nota('Lo unico que hay entre el usuario y la aplicacion. Se paga entera en');
    nota('cada arranque, y otra vez en cada importacion de copia.');
    log('');

    var sal = C.random(16);
    var filas = [];

    /* pbkdf2Slow cuesta cerca de un segundo por vuelta, asi que sube solo lo
       justo para que el minimo signifique algo; los otros dos son baratos. */
    medirAsync(15, function (fin) {
        C.pbkdf2Async(PASS, sal, ITERS, 32, null, function () { fin(); });
    }, function (rapido) {
        res.kdfRapido = rapido;
        medirAsync(5, function (fin) {
            C.pbkdf2Slow(PASS, sal, ITERS, 32, null, function () { fin(); });
        }, function (lento) {
            res.kdfLento = lento;
            medirAsync(9, function (fin) {
                V.vault.create(PASS, null, function () { fin(); });
            }, function (crear) {
                filas.push(filaDe('pbkdf2Async con crypto.subtle (kdf.js:73)', rapido));
                filas.push(filaDe('pbkdf2Slow en JavaScript puro (kdf.js:93)', lento));
                filas.push(filaDe('vault.create completo (vault.js:101)', crear));
                tabla(['operacion'].concat(COLS_T), filas);

                var factor = lento.min / rapido.min;
                veredicto('con crypto.subtle son ' + ms(rapido.min) + ', sin el son '
                    + ms(lento.min) + ': factor ' + num(factor, 0) + 'x (minimos).');
                nota('           El camino lento es el que toca por file:// o por http:// a una IP');
                nota('           de la red local, donde crypto.subtle no existe (kdf.js:68). En un');
                nota('           movil modesto hay que multiplicar por entre 3 y 10.');
                hecho();
            });
        });
    });
}

/* --------------------------------------------------------------------------
   2. Anadir N contactos
   -------------------------------------------------------------------------- */
function paso2(hecho) {
    bloque(2, 'Anadir ' + num(N, 0) + ' contactos');
    nota('El par de claves se mide aparte del alta: uno es criptografia y el otro');
    nota('es contabilidad, y conviene ver cual de los dos manda.');
    log('');

    yo = V.id.create();
    V.vault.state.identity = { seed: U.toHex(yo.seed), name: 'Banco de medida' };
    K.bind(yo);

    log('  (generando ' + num(N, 0) + ' pares de claves reales, esto tarda)');
    /* Se cronometra cada par por separado: la propia siembra ya da N muestras,
       asi que no hace falta repetirla para tener una mediana. */
    var muestras = [], t0 = reloj(), t1, i;
    for (i = 0; i < N; i++) {
        t1 = reloj();
        pares.push(C.keypair());
        muestras.push(reloj() - t1);
    }
    var totalClaves = reloj() - t0;
    var claves = estad(muestras);

    var nombres = [], hex = [];
    for (i = 0; i < N; i++) {
        hex.push(U.toHex(pares[i].pk));
        nombres.push('Contacto ' + (i + 1));
    }

    /* Se repite el alta entera vaciando la lista: asi el numero no depende de
       una sola pasada. K.add hace un barrido lineal para descartar repetidos
       (contacts.js:46), asi que dar de alta N contactos es O(N^2).
       Con presupuesto de tiempo en vez de tres vueltas fijas: el alta es
       barata, y con tres muestras el minimo no vale para nada. */
    var alta = medir(function () {
        V.vault.state.contacts = [];
        for (var j = 0; j < N; j++) { K.add(hex[j], nombres[j]); }
    }, 9, 800, 60);

    contactos = K.all();
    V.vault.saveNow();

    res.alta = alta;
    res.claves = claves;

    tabla(['operacion', 'minimo', 'mediana', 'media', 'maximo', 'reps'], [
        filaDe('C.keypair(), UNO (x25519.js:117)', claves),
        filaDe('contacts.add(), los ' + num(N, 0) + ' (contacts.js:43)', alta)
    ]);

    log('');
    log('  los ' + num(N, 0) + ' pares de claves de la siembra: ' + ms(totalClaves)
        + ' en total, ' + ms(claves.min) + ' por par (minimo de '
        + num(claves.reps, 0) + ' muestras)');
    log('  el alta por contacto: ' + ms(alta.min / N) + ' (minimo de '
        + num(alta.reps, 0) + ' muestras)');

    veredicto('el alta cuesta ' + ms(alta.min / N) + ' por contacto, el par de claves '
        + ms(claves.min) + ' (minimos).');
    nota('           Dar de alta es gratis; lo que se paga es la curva. En la aplicacion');
    nota('           real esa clave ya viene del QR del otro, asi que el alta no se nota.');
    log('  contactos en la boveda: ' + num(contactos.length, 0));
    hecho();
}

/* --------------------------------------------------------------------------
   3. Derivar los secretos de los N contactos
   -------------------------------------------------------------------------- */
function paso3(hecho) {
    bloque(3, 'Derivar los secretos de los ' + num(N, 0) + ' contactos (contacts.secrets)');
    nota('K.bind vacia la cache en cada desbloqueo (contacts.js:16-19) y S.open la');
    nota('rellena contacto a contacto. Todo esto cae de golpe sobre el primer sobre.');
    log('');

    /* Esta es la cifra mas cara del banco: son N x25519 seguidos, o sea
       SEGUNDOS por muestra en cuanto hay contactos de verdad. No se pueden
       pedir veinte vueltas, asi que se pide un presupuesto: con pocos
       contactos salen muchas muestras y con muchos se para en el minimo de
       tres. Por eso de aqui se publica el MINIMO y el numero de muestras, y no
       la mediana: con tres vueltas la mediana es la del medio de tres, que es
       tanto como decir una medida al azar de las tres. */
    var frio = medir(function () {
        K.bind(yo);                       /* vacia la cache a proposito */
        for (var i = 0; i < contactos.length; i++) { K.secrets(contactos[i]); }
    }, 3, 8000, 12);

    /* Y ahora con la cache caliente: es un acceso a un objeto y nada mas. */
    var caliente = medir(function () {
        for (var i = 0; i < contactos.length; i++) { K.secrets(contactos[i]); }
    }, 30, 300);

    res.frio = frio;
    res.caliente = caliente;

    tabla(['operacion', 'minimo', 'mediana', 'media', 'maximo', 'reps'], [
        filaDe('cache fria: ' + num(N, 0) + ' x x25519 (contacts.js:37)', frio),
        filaDe('cache caliente: ' + num(N, 0) + ' lecturas', caliente)
    ]);

    log('');
    log('  >>> CACHE FRIA, MINIMO de ' + num(frio.reps, 0) + ' muestras: ' + ms(frio.min)
        + '  (' + ms(frio.min / N) + ' por contacto)');
    log('      Es la cifra que alimenta la linea del RESUMEN. Se usa el minimo y no la');
    log('      mediana porque cada muestra cuesta ' + ms(frio.min) + ' y solo caben '
        + num(frio.reps, 0) + ': con');
    log('      tan pocas no hay serie que promediar, y todo lo que le pase a la maquina');
    log('      mientras tanto solo puede sumar tiempo, nunca restarlo.');
    if (contaminacion(frio) > 0.15) {
        log('      La mediana se va un ' + num(contaminacion(frio) * 100, 0)
            + ' % por encima del minimo: la maquina no estaba quieta.');
    }

    veredicto('llenar la cache entera cuesta ' + ms(frio.min) + ' en el hilo principal.');
    nota('           Es el precio de hablar por primera vez con cada contacto tras abrir');
    nota('           la boveda, y hoy no se paga en el arranque sino en el primer sobre');
    nota('           que entre, con la aplicacion ya pintada. Con la cache caliente el');
    nota('           mismo trabajo son ' + ms(caliente.min) + ': el problema es la cache vacia,');
    nota('           no la derivacion.');
    hecho();
}

/* --------------------------------------------------------------------------
   4. Cifrar y descifrar un sobre
   -------------------------------------------------------------------------- */
function paso4(hecho) {
    bloque(4, 'Cifrar y descifrar un sobre');
    nota('La unidad de trabajo de mandar y de recibir. Se mide el descifrado con el');
    nota('contacto ya acertado: el coste de acertarlo es el bloque 5.');
    log('');

    if (!contactos.length) {
        log('  FALLA: no hay ningun contacto al que sellarle un sobre.');
        process.exit(1);
    }

    var destino = contactos[0];
    var suSk = pares[0].sk;
    var cuerpo = U.fromString(FRASES[0]);

    /* Una pasada en blanco: la primera vez S.seal crea la clave de trinquete
       del contacto (session.js:47-50) y eso es un par de claves extra que
       no se paga en los mensajes siguientes. */
    S.seal(destino, S.T_TEXT, cuerpo, null);

    var sobre = null;
    var sellar = medir(function () {
        sobre = S.seal(destino, S.T_TEXT, cuerpo, null);
    }, 20, 400);

    var env = E.parse(sobre);
    var sec = K.secrets(destino);
    var abierto = E.open(env, { mySk: suSk, pairSecret: sec.pair, ratchetSecret: null });
    if (!abierto) {
        log('  FALLA: el sobre sellado no se puede abrir. La medida no vale.');
        process.exit(1);
    }

    var analizar = medir(function () { E.parse(sobre); }, 200, 200);
    var abrir = medir(function () {
        E.open(env, { mySk: suSk, pairSecret: sec.pair, ratchetSecret: null });
    }, 20, 400);

    res.sellar = sellar;
    res.abrir = abrir;

    tabla(['operacion', 'minimo', 'mediana', 'media', 'maximo', 'reps'], [
        filaDe('session.seal, sobre completo (session.js:87)', sellar),
        filaDe('envelope.parse, cabecera + id (envelope.js:132)', analizar),
        filaDe('envelope.open, descifrado (envelope.js:174)', abrir)
    ]);

    log('');
    log('  tamano del sobre: ' + num(sobre.length, 0) + ' bytes para '
        + num(cuerpo.length, 0) + ' bytes de texto');

    /* ------------------------------------------------------------------
       COMPROBACION DE COHERENCIA.

       Estas dos operaciones se sabe de antemano en que se descomponen:

         seal = C.keypair() + C.x25519()   (session.js:87-108, y el x25519
                                            del sobre en envelope.js:118)
         open = C.x25519()                 (envelope.js:177)

       El resto -hkdf, chacha20 sobre unas decenas de bytes, pasar cuatro
       claves de hexadecimal a bytes- no llega al ruido al lado de una curva.
       Asi que aqui se remide la criptografia AHORA MISMO, al final del
       bloque, y se compara con lo que se acaba de publicar arriba. Si no
       cuadran es que el proceso se ha ido degradando mientras se median las
       filas de arriba -otra cosa en la maquina, o la CPU bajando de
       frecuencia- y hay que decirlo, porque un banco que se calla eso
       publica el numero contaminado como si fuera el bueno.

       Lo que esta comprobacion NO caza: una carga que dure todo el bloque
       degrada por igual las filas de arriba y este remedido, los dos numeros
       suben juntos y la comparacion cuadra. Por eso hay dos redes y no una:
       esta compara con la criptografia, y la de al lado compara cada serie
       con su propio minimo. La columna MINIMO de todas las tablas es la que
       sobrevive a las dos cosas, y es la que se lleva al RESUMEN.
       ------------------------------------------------------------------ */
    var refKp = medir(function () { C.keypair(); }, 20, 400);
    var uno = C.keypair(), otro = C.keypair();
    var refX = medir(function () { C.x25519(uno.sk, otro.pk); }, 20, 400);

    var refSellar = refKp.mediana + refX.mediana;
    var refSellarMin = refKp.min + refX.min;
    var desvSellar = (sellar.mediana - refSellar) / refSellar;
    var desvAbrir = (abrir.mediana - refX.mediana) / refX.mediana;
    var TOLERANCIA = 0.20;

    log('');
    log('  coherencia: seal y open remedidos contra sus piezas, en este mismo instante');
    tabla(['pieza', 'minimo', 'mediana', 'media', 'maximo', 'reps'], [
        filaDe('C.keypair() (x25519.js:117)', refKp),
        filaDe('C.x25519() (x25519.js:108)', refX)
    ]);
    log('');
    log('  seal publicado ' + ms(sellar.mediana) + ' contra keypair+x25519 '
        + ms(refSellar) + '  ->  desvio ' + num(desvSellar * 100, 0) + ' %');
    log('  open publicado ' + ms(abrir.mediana) + ' contra x25519 '
        + ms(refX.mediana) + '  ->  desvio ' + num(desvAbrir * 100, 0) + ' %');

    var descuadra = Math.abs(desvSellar) > TOLERANCIA || Math.abs(desvAbrir) > TOLERANCIA;
    /* La otra cara de lo mismo: aunque la comparacion de arriba cuadre, si
       dentro de la propia serie la mediana se ha ido muy por encima de su
       minimo es que a esas vueltas les paso algo. */
    var disperso = contaminacion(sellar) > TOLERANCIA || contaminacion(abrir) > TOLERANCIA;

    function fiable() {
        nota('       El NUMERO FIABLE ES EL MINIMO, porque nada de lo que le pase a la');
        nota('       maquina puede hacer que un x25519 vaya mas rapido de lo que puede:');
        nota('         seal ' + ms(sellar.min) + '   (sus piezas, en minimos: ' + ms(refSellarMin) + ')');
        nota('         open ' + ms(abrir.min) + '   (su pieza, en minimos: ' + ms(refX.min) + ')');
        nota('       Repite el banco con la maquina en reposo si necesitas la mediana.');
    }

    if (descuadra) {
        aviso('LAS MEDIANAS DE ARRIBA NO SON DE FIAR. seal y open no cuadran con lo');
        nota('       que cuestan sus propias piezas medidas ahora mismo, y la diferencia');
        nota('       pasa del ' + num(TOLERANCIA * 100, 0)
            + ' % de tolerancia. LA MAQUINA ESTABA CARGADA mientras se');
        nota('       median esas filas: contencion con otro proceso, o la CPU bajando');
        nota('       de frecuencia segun avanzaba el banco.');
        fiable();
    } else if (disperso) {
        aviso('seal y open cuadran con sus piezas, pero dentro de sus propias series');
        nota('       la mediana se va mas de un ' + num(TOLERANCIA * 100, 0)
            + ' % por encima del minimo: seal '
            + num(contaminacion(sellar) * 100, 0) + ' %, open '
            + num(contaminacion(abrir) * 100, 0) + ' %.');
        nota('       LA MAQUINA ESTABA CARGADA a ratos mientras se median.');
        fiable();
    } else {
        log('  cuadra dentro del ' + num(TOLERANCIA * 100, 0)
            + ' %, y las series estan apretadas: la maquina estaba tranquila.');
    }

    veredicto('sellar ' + ms(sellar.min) + ', abrir ' + ms(abrir.min)
        + ' (minimos). Casi todo son las curvas:');
    nota('           sellar hace un par efimero mas un x25519, abrir hace un x25519.');
    nota('           El texto no influye: chacha20 sobre unas decenas de bytes no se mide.');
    V.vault.saveNow();
    hecho();
}

/* --------------------------------------------------------------------------
   5. Emparejado de un sobre que NO es mio
   -------------------------------------------------------------------------- */
function paso5(hecho) {
    bloque(5, 'Emparejar un sobre AJENO: la curva con el numero de contactos');
    nota('Un sobre no dice a quien va (envelope.js:4-7), asi que hay que probar la');
    nota('etiqueta con cada contacto. Si el sobre no es nuestro se prueban TODOS, y');
    nota('eso pasa en cada sobre que solo se reenvia. Es el peor caso y el habitual.');
    log('');

    /* Un sobre entre dos desconocidos: no puede coincidir con nadie de la
       lista, asi que fuerza el barrido completo. */
    var a = C.keypair(), b = C.keypair();
    var eph = C.keypair();
    var ajeno = E.seal({
        ephSk: eph.sk, ephPk: eph.pk, recipPk: b.pk,
        pairSecret: C.x25519(a.sk, b.pk),
        payload: U.concat([new Uint8Array(15), U.fromString(FRASES[1])]),
        ttl: 6
    });
    var env = E.parse(ajeno);

    /* Cache caliente: se mide el barrido de etiquetas, no la derivacion, que
       ya tiene su bloque. */
    var i;
    for (i = 0; i < contactos.length; i++) { K.secrets(contactos[i]); }

    var tamanos = [], candidatos = [10, 50, 100, 250, 500];
    for (i = 0; i < candidatos.length; i++) {
        if (candidatos[i] <= N) { tamanos.push(candidatos[i]); }
    }
    if (!tamanos.length || tamanos[tamanos.length - 1] !== N) { tamanos.push(N); }

    var todos = contactos, filas = [], puntos = [];
    for (i = 0; i < tamanos.length; i++) {
        V.vault.state.contacts = todos.slice(0, tamanos[i]);
        var r = medir(function () { S.open(env); }, 30, 300);
        puntos.push({ n: tamanos[i], min: r.min });
        filas.push([
            num(tamanos[i], 0),
            ms(r.min),
            ms(r.mediana),
            ms(r.media),
            ms(r.max),
            ms(r.min / tamanos[i] * 100),
            num(1000 / r.min, 0),
            r.reps
        ]);
    }
    V.vault.state.contacts = todos;
    contactos = K.all();

    tabla(['contactos', 'minimo', 'mediana', 'media', 'maximo',
        'por 100 (min)', 'sobres/s (min)', 'reps'], filas);

    var p0 = puntos[0], p1 = puntos[puntos.length - 1];
    /* La pendiente se saca de los minimos: comparar dos medianas tomadas en
       momentos distintos mezcla la curva con lo que estuviera haciendo la
       maquina en cada una, y eso no es la curva. */
    var crecimiento = (p1.min / p0.min) / (p1.n / p0.n);
    res.emparejado = p1;

    log('');
    log('  crecimiento observado (minimos): x' + num(p1.min / p0.min, 2) + ' de tiempo por x'
        + num(p1.n / p0.n, 2) + ' de contactos  ->  pendiente ' + num(crecimiento, 2)
        + ' (1,00 seria lineal perfecto)');

    veredicto('con ' + num(p1.n, 0) + ' contactos, ' + ms(p1.min) + ' por sobre ajeno -> '
        + (p1.min < 5 ? 'imperceptible de uno en uno,' : 'ya se nota,'));
    nota('           pero son ' + num(1000 / p1.min, 0)
        + ' sobres/s: ese es el techo de la malla en este equipo.');
    nota('           La curva es lineal y no se puede arreglar: la etiqueta que viaja');
    nota('           depende de la clave efimera del sobre, distinta en cada mensaje, asi');
    nota('           que no hay tabla que indexar. Ese O(n) es exactamente lo que se');
    nota('           compra a cambio de que el sobre no diga a quien va.');
    hecho();
}

/* --------------------------------------------------------------------------
   6. Serializar y cifrar la boveda entera
   -------------------------------------------------------------------------- */
function paso6(hecho) {
    bloque(6, 'Guardar la boveda: ' + num(N, 0) + ' contactos y ' + num(M, 0)
        + ' mensajes por conversacion');
    nota('No hay escritura incremental en ninguna parte (vault.js:163-182): cada');
    nota('mensaje reescribe, recifra y recodifica la boveda entera, con nonce nuevo.');
    log('');

    sembrarTrinquete(contactos, bancoTrinquete(8), CLAVES_TRINQUETE);
    var sinMsg = medir(function () { V.vault.saveNow(); }, 9, 600, 200);
    var charsSin = V.vault.sizeBytes();

    var total = sembrarMensajes(contactos, M);
    var conMsg = medir(function () { V.vault.saveNow(); }, 9, 1200, 200);
    var charsCon = V.vault.sizeBytes();

    /* El tamano del JSON en claro, para ver el factor de expansion real. */
    var copia = {}, k;
    for (k in V.vault.state) {
        if (Object.prototype.hasOwnProperty.call(V.vault.state, k) && k !== 'saltHint') {
            copia[k] = V.vault.state[k];
        }
    }
    var json = JSON.stringify(copia);
    var bytesJson = U.fromString(json).length;

    /* localStorage cuenta la cuota en unidades de codigo UTF-16: el blob es
       ASCII puro, asi que cada caracter cuesta 2 bytes de cuota. */
    var cuotaSin = charsSin * 2, cuotaCon = charsCon * 2;
    var pct = cuotaCon / CUOTA_BYTES * 100;

    res.guardar = conMsg;
    res.cuotaPct = pct;
    res.charsCon = charsCon;
    res.mensajesTotales = total;

    /* Dos tablas y no una: los tiempos quieren las cinco columnas de siempre y
       los tamanos no tienen minimo ni mediana, son un numero y ya esta. */
    tabla(['vault.saveNow() con la boveda...', 'minimo', 'mediana', 'media', 'maximo', 'reps'], [
        filaDe('...con ' + num(N, 0) + ' contactos y 0 mensajes', sinMsg),
        filaDe('...con ' + num(N, 0) + ' contactos y ' + num(total, 0) + ' mensajes', conMsg)
    ]);

    log('');
    tabla(['estado de la boveda', 'blob', 'cuota UTF-16', '% de 5 MiB'], [
        [num(N, 0) + ' contactos, 0 mensajes',
            num(charsSin / 1024, 1) + ' KB',
            num(cuotaSin / 1048576, 2) + ' MiB',
            num(cuotaSin / CUOTA_BYTES * 100, 1) + ' %'],
        [num(N, 0) + ' contactos, ' + num(total, 0) + ' mensajes',
            num(charsCon / 1024, 1) + ' KB',
            num(cuotaCon / 1048576, 2) + ' MiB',
            num(pct, 1) + ' %']
    ]);

    log('');
    log('  JSON en claro: ' + num(bytesJson, 0) + ' bytes  ->  blob de '
        + num(charsCon, 0) + ' caracteres  ->  factor '
        + num(charsCon / bytesJson, 4) + ' (asintota 4/3 en base64)');

    var porMsg = total ? (charsCon - charsSin) / total : 0;
    if (total) {
        log('  coste marginal: ' + num(porMsg, 2) + ' caracteres de blob por mensaje = '
            + num(porMsg * 2, 0) + ' bytes de cuota para '
            + num(FRASES[0].length, 0) + ' de texto (factor ' + num(porMsg * 2 / FRASES[0].length, 1) + 'x)');
    }

    var techoChars = CUOTA_BYTES / 2;
    var margen = techoChars - charsSin;
    var cabenTotal = porMsg > 0 ? Math.floor(margen / porMsg) : 0;
    var cabenPorChat = Math.max(0, Math.floor(cabenTotal / N));

    /* El techo real es el primero de los dos que llegue. Publicar solo el de
       la cuota diria un numero de mensajes por conversacion que la aplicacion
       no deja acumular, igual que aceptar --mensajes por encima del tope. */
    var mandaModelo = cabenPorChat > MAX_PER_CHAT;

    veredicto('la boveda ocupa ' + num(cuotaCon / 1048576, 2) + ' MiB de cuota de los 5 MiB');
    nota('           tipicos (' + num(pct, 0) + ' %) -> '
        + (pct < 100 ? 'cabe, y el techo esta en ' : 'NO cabe; el techo esta en ')
        + num(mandaModelo ? MAX_PER_CHAT : cabenPorChat, 0) + ' mensajes por contacto');
    if (mandaModelo) {
        nota('           -y lo pone el modelo, no la cuota: el tope por conversacion son');
        nota('           ' + num(MAX_PER_CHAT, 0) + ' mensajes (chat.js:17). Por cuota cabrian '
            + num(cabenPorChat, 0) + ', pero esos');
        nota('           no llegan a existir porque los viejos se van tirando.');
    } else {
        nota('           -y lo pone la cuota, que llega antes que los '
            + num(MAX_PER_CHAT, 0) + ' del modelo (chat.js:17).');
    }
    nota('           Guardar UN mensaje cuesta ' + ms(conMsg.min)
        + ' (minimo) de hilo principal, porque reescribe los');
    nota('           ' + num(total, 0) + ' mensajes y las ' + num(N * CLAVES_TRINQUETE, 0)
        + ' claves de trinquete enteros.');
    nota('           Faltan dos cosas por sumar: la bolsa de reenvio, que aqui va vacia y');
    nota('           a tope anade 1,2 MB de base64 al mismo JSON (mesh.js:35), y el');
    nota('           localStorage.setItem, que en Node no existe (la boveda vive en');
    nota('           memoria) y en Chrome es sincrono y cae en el commit de LevelDB.');
    hecho();
}

/* --------------------------------------------------------------------------
   7. Abrir esa boveda
   -------------------------------------------------------------------------- */
function paso7(hecho) {
    bloque(7, 'Abrir la boveda ya crecida (vault.unlock)');
    nota('Lo que el usuario espera en cada sesion: PBKDF2 mas descifrar, decodificar');
    nota('y parsear el blob entero. Lo de abajo usa crypto.subtle para el PBKDF2.');
    log('');

    var fallo = null, cargados = 0;
    /* Nueve vueltas y no tres: unlock son unas decenas de milisegundos y una
       serie de tres no da minimo que valga. */
    medirAsync(9, function (fin) {
        V.vault.unlock(PASS, null, function (err, st) {
            if (err) { fallo = err; }
            else { cargados = st.contacts.length; }
            fin();
        });
    }, function (r) {
        if (fallo) {
            log('  FALLA al abrir: ' + fallo.message);
            process.exit(1);
        }
        res.unlock = r;
        tabla(['operacion', 'minimo', 'mediana', 'media', 'maximo', 'reps'], [
            filaDe('vault.unlock con blob de ' + num(res.charsCon / 1024, 0) + ' KB', r)
        ]);
        log('');
        log('  contactos recuperados: ' + num(cargados, 0));

        /* Las dos piezas se restan entre minimos: mezclar un minimo con una
           mediana daria un "descifrar y parsear" que no ha medido nadie. */
        var extra = r.min - res.kdfRapido.min;
        veredicto('abrir cuesta ' + ms(r.min) + ': ' + ms(res.kdfRapido.min)
            + ' de PBKDF2 y ' + ms(extra) + ' de descifrar y parsear (minimos).');
        nota('           Sin crypto.subtle (file:// o http:// a una IP local) esa primera');
        nota('           parte se convierte en ' + ms(res.kdfLento.min) + ', o sea '
            + ms(res.kdfLento.min + extra) + ' en total');
        nota('           en este escritorio, y del orden de ' + num((res.kdfLento.min + extra) * 5 / 1000, 1)
            + ' s en un movil modesto.');
        hecho();
    });
}

/* --------------------------------------------------------------------------
   Resumen
   -------------------------------------------------------------------------- */
function resumen() {
    log('');
    log(rep('=', 78));
    log('RESUMEN');
    log(rep('=', 78));

    /* La misma medida de referencia que se tomo al empezar. Si el banco ha
       tardado minutos y la maquina se ha ido frenando por el camino, aqui se
       ve, y afecta a todas las tablas y no solo al bloque 4. */
    var refFinal = referencia();
    var deriva = REF_INICIO > 0 ? (refFinal - REF_INICIO) / REF_INICIO : 0;
    log('  referencia: ' + ms(REF_INICIO) + ' al empezar, ' + ms(refFinal) + ' al terminar ('
        + (deriva >= 0 ? '+' : '') + num(deriva * 100, 0) + ' %)');
    if (deriva > 0.20) {
        aviso('LA MAQUINA SE HA FRENADO UN ' + num(deriva * 100, 0) + ' % DURANTE EL BANCO.\n'
            + '         Lo mas caro del proyecto, un x25519, costaba ' + ms(REF_INICIO)
            + ' al empezar\n         y ' + ms(refFinal) + ' al terminar. Los bloques del final estan medidos\n'
            + '         en una maquina mas lenta que los del principio, asi que NO son\n'
            + '         comparables entre si. Cierra lo que este comiendo la CPU (o deja\n'
            + '         que se enfrie el portatil) y repite.');
    }
    log('');

    /* Todas estas cifras son MINIMOS. Es lo unico defendible cuando el banco
       tarda minutos: la mediana y la media de cada serie llevan dentro lo que
       hiciera la maquina a la vez, y eso no es BINTIO. Las series completas,
       con su mediana y su maximo al lado, estan en las tablas de arriba. */
    var cabe = res.cuotaPct < 100;
    var primerSobre = res.frio.min + res.emparejado.min;
    var lento = res.kdfLento.min + (res.unlock.min - res.kdfRapido.min);

    log('  todas las cifras de abajo son MINIMOS de sus series (ver las tablas).');
    log('');

    function linea(etiqueta, valor) {
        log('  ' + etiqueta + ' ' + rep('.', Math.max(3, 34 - etiqueta.length)) + ' ' + valor);
    }
    linea('abrir la boveda', ms(res.unlock.min) + '   (' + ms(lento) + ' sin crypto.subtle)');
    linea('primer sobre tras desbloquear', ms(primerSobre) + '   (cache de secretos fria, minimo de '
        + num(res.frio.reps, 0) + ' muestras)');
    linea('cada sobre ajeno despues', ms(res.emparejado.min));
    linea('guardar un mensaje', ms(res.guardar.min));
    linea('ocupacion en disco', num(res.charsCon * 2 / 1048576, 2) + ' MiB de 5 MiB   ('
        + num(res.cuotaPct, 0) + ' %)');
    log('');

    /* El veredicto de una linea. Se elige el primer freno que se pasa de la
       raya, en el orden en que el usuario los sufre: si no cabe en disco da
       igual lo rapido que sea, y una congelacion de un segundo pesa mas que
       unos milisegundos por mensaje. */
    var freno = null;
    if (!cabe) { freno = 'la cuota de localStorage, al ' + num(res.cuotaPct, 0) + ' % de los 5 MiB'; }
    else if (primerSobre > 1000) { freno = 'la cache de secretos fria, ' + ms(primerSobre) + ' de congelacion en el primer sobre'; }
    else if (res.guardar.min > 150) { freno = 'reescribir la boveda entera, ' + ms(res.guardar.min) + ' por mensaje'; }

    log(num(N, 0) + ' contactos con ' + num(res.mensajesTotales, 0) + ' mensajes en esta maquina: '
        + (freno ? 'NO VIABLE, el freno es ' + freno : 'VIABLE, nada llega al umbral perceptible')
        + '.');
    log('');
}

/* --------------------------------------------------------------------------
   Orden de ejecucion. Cada paso llama al siguiente porque PBKDF2 y unlock
   terminan en una llamada de vuelta y no se pueden encadenar de otra forma
   sin salirse de ES5.
   -------------------------------------------------------------------------- */
log('');
log(rep('=', 78));
log('  BINTIO - banco de medida del nucleo');
log(rep('=', 78));
log('  maquina    : ' + process.platform + ' ' + process.arch + ', node ' + process.version);
log('  escenario  : ' + num(N, 0) + ' contactos, ' + num(M, 0) + ' mensajes por conversacion, '
    + num(CLAVES_TRINQUETE, 0) + ' claves de trinquete cada uno');
log('  sin medir  : DOM, transportes 4x y localStorage (aqui la boveda cae a memoria)');

var REF_INICIO = referencia();
log('  referencia : x25519 en ' + ms(REF_INICIO) + ' (lo mas caro del proyecto). Comparala');
log('               con la de otras ejecuciones: si sube, la maquina esta frenada');
log('               y todo lo que hay debajo lo esta con ella.');

var pasos = [paso1, paso2, paso3, paso4, paso5, paso6, paso7];
function siguiente() {
    var f = pasos.shift();
    if (!f) { resumen(); return; }
    f(siguiente);
}
siguiente();
