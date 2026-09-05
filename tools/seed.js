/* ==========================================================================
   Sembrador de datos de prueba.

   POR QUE EXISTE
   Con tres contactos y veinte mensajes BINTIO va sobrado. Los problemas
   aparecen con quinientos contactos y miles de mensajes: el barrido de
   etiquetas de session.open, la cache fria de secretos tras cada desbloqueo,
   la lista de conversaciones que se reconstruye entera en cada evento y la
   boveda que se reserializa y se recifra en cada save. Nada de eso se puede
   medir ni ensenar sin una boveda grande, y a mano no se llena. Este fichero
   la fabrica.

   POR QUE A TRAVES DE LA COPIA DE SEGURIDAD Y NO CON UNA PUERTA TRASERA
   Lo comodo seria anadir a la aplicacion un "modo demo" que se rellena solo.
   Seria una via de escritura al estado de la boveda que existe en el codigo
   publicado, es decir exactamente lo que un atacante quiere encontrar, y
   habria que confiar en que nunca se activa por accidente. BINTIO no tiene
   ninguna: la unica entrada de datos ajenos es Restaurar copia, y esa ya la
   usa cualquier usuario que cambia de aparato.

   Asi que esta herramienta no toca src/ ni dist/. Carga los mismos modulos
   que la aplicacion, construye el estado con las mismas funciones, y escupe
   el MISMO texto que produce vault.exportBackup(): "V1.sal.iteraciones.
   nonce.cifrado". La aplicacion no sabe ni tiene por que saber que esa copia
   la ha escrito una maquina. Y si el sembrador se equivoca en el formato, la
   aplicacion lo rechaza igual que rechazaria una copia corrompida, que es la
   propiedad que se quiere.

   QUE ES DE VERDAD Y QUE ESTA SIMPLIFICADO
   De verdad, sin atajos:
     - las claves publicas son pares X25519 reales, generados con crypto.
       keypair(); pasan la validacion de la curva y sirven para cifrar,
     - address y fingerprint salen de id.address() y id.fingerprint() sobre
       esa clave, no estan inventados, asi que cuadran si alguien los
       compara contra un QR,
     - la boveda se crea con vault.create(), con el mismo PBKDF2 de 150000
       iteraciones y el mismo ChaCha20; la contrasena que se pasa aqui es la
       que se teclea luego en la aplicacion,
     - el fichero de salida es byte a byte lo que devuelve exportBackup().

   Simplificado, y esto es lo que se degrada:
     - EL TRINQUETE ES DECORADO. Las claves de ratchet son pares reales pero
       nadie ha cifrado nada con ellas, y de la clave del otro lado solo
       tenemos la publica. Sirven para que el estado tenga el tamano y la
       forma que tendria despues de meses de conversacion (que es lo que se
       quiere medir), no para descifrar nada. Ningun mensaje sembrado se
       puede volver a abrir: ya esta en claro en la boveda.
     - LOS MENSAJES NO HAN VIAJADO. Se escriben directamente en el array del
       chat, no por chat.sendText(). Con los modulos cargados hasta el 36 no
       hay transporte, asi que sendText dejaria los quinientos chats llenos
       de mensajes en estado 'error'. Consecuencia: no hay sobres, no hay
       acuses reales y los identificadores de mensaje son aleatorios en vez
       de venir de session.newMid().
     - EL OTRO LADO NO EXISTE. Cada contacto es un par de claves cuya parte
       privada se tira nada mas usarla. Escribirles no dara error, pero no
       contestara nadie nunca.
     - SOLO ESTADOS TERMINALES. Nada queda en 'pendiente' ni en 'error' a
       proposito: chat.retryPending() recorre todos los chats en cada enlace
       nuevo y cada 60 s, y volveria a sellar y emitir miles de sobres hacia
       contactos inexistentes en cuanto la aplicacion viera un solo par.
     - LA BOLSA DE REENVIO VA VACIA (carrier: []). Fabricar sobres falsos
       ahi no es cosmetico: mesh.flushTo() los suelta en la malla real al
       primer par que aparezca. Basura sintetica inyectada a terceros.

   Lo que NO se degrada por nada de lo anterior: los tiempos. El coste de
   abrir la boveda, de pintar la lista, de guardar, y el del primer sobre con
   la cache fria son los reales, porque dependen del tamano y la forma del
   estado, y esos son autenticos.

   Uso:
     node tools/seed.js [--contactos 500] [--mensajes 40] [--pass carga1234]
                        [--salida bintio-semilla.txt]
   ========================================================================== */
var fs = require('fs');
var path = require('path');

var RAIZ = path.join(__dirname, '..');
var DIA = 86400000;
var HORA = 3600000;
var MAX_PER_CHAT = 400;      /* tope real del modelo, 36-chat.js:17 */
var CUOTA = 5 * 1024 * 1024; /* cuota tipica de localStorage, en bytes UTF-16 */

/* --------------------------------------------------------------------------
   Argumentos. --clave valor y --clave=valor, nada mas.
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

if (arg.ayuda || arg.help || arg.h) {
    console.log('Uso: node tools/seed.js [--contactos 500] [--mensajes 40] ' +
                '[--pass carga1234] [--salida bintio-semilla.txt]');
    console.log('  --contactos  cuantos contactos sembrar');
    console.log('  --mensajes   tope de mensajes por conversacion (el numero real es al azar)');
    console.log('  --pass       contrasena de la boveda; la misma que se teclea en la aplicacion');
    console.log('  --salida     fichero de salida, relativo a la raiz del proyecto');
    process.exit(0);
}

var N_CONTACTOS = parseInt(arg.contactos, 10);
var N_MENSAJES = parseInt(arg.mensajes, 10);
var PASS = arg.pass === undefined ? 'carga1234' : String(arg.pass);
var SALIDA = path.resolve(RAIZ, arg.salida === undefined ? 'bintio-semilla.txt' : String(arg.salida));

if (isNaN(N_CONTACTOS)) { N_CONTACTOS = 500; }
if (isNaN(N_MENSAJES)) { N_MENSAJES = 40; }

function abortar(msg) {
    console.log('seed: ' + msg);
    process.exit(1);
}

if (N_CONTACTOS < 1) { abortar('--contactos tiene que ser al menos 1'); }
if (N_MENSAJES < 0) { abortar('--mensajes no puede ser negativo'); }
if (N_MENSAJES > MAX_PER_CHAT) {
    /* Sembrar mas de 400 no anade nada: el modelo los va tirando de uno en
       uno en cuanto llegue el primer mensaje nuevo (36-chat.js:56). */
    abortar('--mensajes no puede pasar de ' + MAX_PER_CHAT + ', que es el tope por chat del modelo');
}
if (PASS.length < 8) {
    /* No es capricho: la pantalla de recuperar exige ocho (63-ui-lock.js:96).
       Con menos, este fichero saldria bien y la aplicacion no lo aceptaria. */
    abortar('la contrasena necesita ocho caracteres o la aplicacion no dejara restaurar la copia');
}

/* --------------------------------------------------------------------------
   Bancos de texto. Sin dependencias: dos listas y una combinacion.
   suggestName() no sirve para esto: son 16 adjetivos por 16 sustantivos, 256
   combinaciones, y con 500 contactos salen unos 280 nombres repetidos. Se
   deja para una minoria, que es justo cuando aparece en la aplicacion de
   verdad: contactos anadidos por QR que todavia no han mandado su perfil.
   -------------------------------------------------------------------------- */
/* El fichero es ASCII, como todo el codigo del proyecto, pero los nombres que
   se ven en pantalla no tienen por que serlo: los acentos y la enye van con
   escape \u. Ademas de quedar creibles, obligan a que el texto pase por el
   codificador UTF-8 escrito a mano de 10-util.js, que es justo lo que la
   aplicacion hara al guardar y al leer. */
var NOMBRES = [
    'Ana', 'Pablo', 'Marta', 'Sergio', 'Elena', 'Diego', 'Laura', 'Iv\u00e1n',
    'Carmen', 'Hugo', 'Nuria', '\u00c1lvaro', 'Sara', 'Bruno', 'Irene', 'Marcos',
    'Julia', 'Adri\u00e1n', 'Clara', '\u00d3scar', 'Luc\u00eda', 'Gonzalo', 'Alba', 'Rafa',
    'Teresa', 'Nicol\u00e1s', 'Miriam', 'Emilio', 'Roc\u00edo', 'Andr\u00e9s', 'Silvia',
    'Jorge', 'In\u00e9s', 'Rub\u00e9n', 'Berta', 'Tom\u00e1s', 'Olga', 'Manuel', 'Vera',
    'Ignacio', 'Paula', 'Ferm\u00edn', 'Ada', 'Leandro', 'Noa', 'Crist\u00f3bal'
];
var APELLIDOS = [
    'Serrano', 'Ferrer', 'Ortega', 'Cabrera', 'Vidal', 'Peral', 'Aguirre',
    'Bosch', 'Rold\u00e1n', 'Cifuentes', 'Duran', 'Escudero', 'Fuentes', 'Gallego',
    'Herrero', 'Izaguirre', 'Jurado', 'Lozano', 'Mar\u00edn', 'Nogal', 'Olmedo',
    'Pardo', 'Quintana', 'Rivas', 'Salgado', 'Trueba', 'Urbina', 'Vald\u00e9s',
    'Zamora', 'Barrios', 'Casal', 'Delgado', 'Esp\u00edn', 'Fabra', 'Garrido',
    'Hidalgo', 'Ibarra', 'Larrea', 'Medina', 'Novoa', 'Prieto', 'Rey',
    'Sendra', 'Tejada', 'Ure\u00f1a', 'Vega', 'N\u00fa\u00f1ez', 'Mart\u00ednez',
    'Garc\u00eda', 'Rodr\u00edguez'
];

/* Frases de longitudes muy distintas a proposito: el ancho de la burbuja y
   el corte del texto en la lista son parte de lo que se quiere mirar. */
var FRASES = [
    'vale',
    'ok',
    'ahora te digo',
    's\u00ed',
    'ya voy',
    'no me cuadra',
    'perfecto, gracias',
    'te llamo en diez minutos',
    'lo miro esta tarde y te cuento',
    'me acaba de llegar, gracias',
    'estoy en el metro, sin cobertura casi',
    '\u00bfqu\u00e9 tal fue al final?',
    'me lo apunto',
    'no lo he visto todav\u00eda',
    'ma\u00f1ana sin falta',
    '\u00bfquedamos donde siempre?',
    'creo que se me ha olvidado el cargador en tu casa',
    'no puedo hablar ahora, luego te escribo',
    'ya est\u00e1 hecho, no hac\u00eda falta tanto',
    'me parece bien pero prefiero verlo antes de decidir nada',
    'lo he probado con el otro aparato y funciona igual, as\u00ed que no es del tel\u00e9fono',
    'perdona el retraso, se me ha ido la ma\u00f1ana entera con lo de siempre',
    'te dejo el sitio apuntado, es la calle de detr\u00e1s del mercado, segundo portal',
    'no te preocupes, de verdad',
    'qu\u00e9 raro',
    'yo lo veo claro: si no contesta hoy, lo damos por cerrado y a otra cosa',
    'gracias por avisar',
    'estoy llegando',
    'me he quedado sin bater\u00eda antes, por eso no contest\u00e9',
    'lo hablamos con calma cuando nos veamos, por aqu\u00ed no me apetece',
    'confirmado',
    'a las siete me viene mejor',
    '\u00bfhas visto lo que ha pasado?',
    'te reenv\u00edo lo que me mandaron, a ver qu\u00e9 opinas',
    'nada, ya lo he resuelto',
    'sigo esperando respuesta',
    'esto no hay quien lo entienda',
    'buenas, perdona la hora',
    'cuando puedas me dices algo',
    'hecho'
];

/* --------------------------------------------------------------------------
   Utilidades locales
   -------------------------------------------------------------------------- */
function ri(n) { return Math.floor(Math.random() * n); }
function elige(a) { return a[ri(a.length)]; }

/* Reloj de precision. Date.now() tiene grano de milisegundo y aqui se suman
   miles de operaciones de seis milisegundos: se acumularia error. */
function reloj() {
    var t = process.hrtime();
    return t[0] * 1000 + t[1] / 1e6;
}
/* Decimales a la espanola, con coma. El informe se lee en castellano, asi que
   todos los numeros con parte decimal salen por aqui y ninguno por un toFixed
   suelto: mezclar "3,5 ms" y "3.5 ms" en la misma pantalla es lo que hace
   dudar de si el punto era decimal o de millar. */
function dec(x, n) { return x.toFixed(n).replace('.', ','); }
function ms(x) { return dec(x, 0) + ' ms'; }
function mib(bytes) { return dec(bytes / 1048576, 2) + ' MiB'; }
/* Alinea las columnas del informe a mano: aqui no hay printf ni ganas de
   traerlo de fuera. */
function pad(s, n) {
    s = String(s);
    while (s.length < n) { s = ' ' + s; }
    return s;
}

/* --------------------------------------------------------------------------
   Cuanto de la cuota se lleva cada cosa.

   Avisar de que la copia ocupa el 83% no sirve de nada si no se dice con que
   numero hay que repetir. Para decirlo hay que separar lo fijo (contactos y
   trinquete, que no bajan) de lo variable (los mensajes), y eso se mide
   serializando el estado dos veces: entero y con las conversaciones vacias.
   Cuestan dos JSON.stringify y ahorran una tanda de prueba y error.

   La cadena de multiplicadores, que no es evidente:
     1 byte de JSON -> 4/3 caracteres de base64 (ChaCha20 es de flujo, el
     cifrado mide lo mismo que el plano mas 16 bytes de autenticador)
     1 caracter -> 2 bytes de cuota, porque Chrome, Firefox y Safari cuentan
     localStorage en unidades de codigo UTF-16 aunque el texto sea ASCII.
   Total: 8/3 bytes de cuota por byte de JSON.
   -------------------------------------------------------------------------- */
function medirCuota(st, totalMensajes) {
    var propia = Object.prototype.hasOwnProperty;
    var copia = {}, k, pk;
    for (k in st) {
        if (propia.call(st, k) && k !== 'saltHint') { copia[k] = st[k]; }
    }
    var pleno = Buffer.byteLength(JSON.stringify(copia), 'utf8');

    var guardadas = {};
    for (pk in st.chats) {
        if (propia.call(st.chats, pk)) {
            guardadas[pk] = st.chats[pk].messages;
            st.chats[pk].messages = [];
        }
    }
    var base = Buffer.byteLength(JSON.stringify(copia), 'utf8');
    for (pk in guardadas) {
        if (propia.call(guardadas, pk)) { st.chats[pk].messages = guardadas[pk]; }
    }

    /* Mayor JSON que cabe: se despeja de  cuota = 2 * (50 + 4/3 * (P + 16)),
       descontando los 15 caracteres del nombre de la clave, que Chrome cuenta. */
    var maxJson = ((CUOTA / 2) - 50 - 15) * 3 / 4 - 16;
    var porMensaje = totalMensajes ? (pleno - base) / totalMensajes : 0;
    return {
        base: base,
        pleno: pleno,
        porMensaje: porMensaje,
        cuotaBase: base * 8 / 3,
        cuotaPorMensaje: porMensaje * 8 / 3,
        caben: porMensaje > 0 ? Math.floor((maxJson - base) / porMensaje) : 0
    };
}

function nombreHumano(usados) {
    var intentos = 0, n;
    while (intentos < 60) {
        n = elige(NOMBRES) + ' ' + elige(APELLIDOS);
        if (intentos > 2) { n += ' ' + elige(APELLIDOS); }   /* dos apellidos: 40 veces mas combinaciones */
        if (!usados[n]) { usados[n] = true; return n; }
        intentos++;
    }
    n = elige(NOMBRES) + ' ' + elige(APELLIDOS) + ' ' + usados.__n;
    usados.__n = (usados.__n || 0) + 1;
    usados[n] = true;
    return n;
}

/* --------------------------------------------------------------------------
   Siembra
   -------------------------------------------------------------------------- */
var tCarga = reloj();
var V = require('../test/load')('39');
tCarga = reloj() - tCarga;

var U = V.util, C = V.crypto;
var AHORA = Date.now();

console.log('');
console.log('BINTIO - sembrador de datos de prueba');
console.log('  contactos ' + N_CONTACTOS + ' | hasta ' + N_MENSAJES + ' mensajes por chat | ' +
            'contrasena "' + PASS + '"');
console.log('  modulos 00..36 cargados en ' + ms(tCarga));
console.log('');

var tBoveda = reloj();
V.vault.create(PASS, null, function (err) {
    if (err) { abortar('no se ha podido crear la boveda: ' + err.message); }
    tBoveda = reloj() - tBoveda;

    var st = V.vault.state;
    var usados = {};

    /* Identidad propia. Una semilla de 32 bytes: de ahi salen la clave
       estatica, la direccion y la huella, todas recalculadas al arrancar. */
    var yo = V.id.create();
    var miNombre = nombreHumano(usados);
    st.identity = { seed: U.toHex(yo.seed), name: miNombre };
    V.contacts.bind(yo);      /* obligatorio antes de contacts.add */

    var tClaves = 0, tRelleno = 0;
    var totalMensajes = 0, totalClaves = 0, conChat = 0, sinLeer = 0, nQR = 0, nQRrepes = 0;
    var vistosQR = {};
    var enLinea = Math.min(4, N_CONTACTOS);   /* punto verde: un punado, no quinientos */
    var masAntiguo = AHORA;
    var t0, i, j, k;

    for (i = 0; i < N_CONTACTOS; i++) {

        /* --- fase claves ------------------------------------------------ */
        /* El reloj envuelve SOLO C.keypair(): lo que se publica luego es un
           coste por par, y todo lo que se cuele aqui dentro lo infla. */
        t0 = reloj();
        var kp = C.keypair();
        tClaves += reloj() - t0;
        totalClaves++;

        /* --- fase relleno ----------------------------------------------- */
        t0 = reloj();
        /* Uno de cada doce se queda con el nombre que propone la aplicacion,
           que es lo que se ve cuando alguien se anade por QR y todavia no ha
           mandado su perfil. El resto lleva nombre humano y nameLocked, como
           si el usuario los hubiera renombrado a mano. */
        var porQR = (i % 12) === 0;
        var r = V.contacts.add(U.toHex(kp.pk), porQR ? null : nombreHumano(usados));
        if (r.error || r.existed) {
            /* Con pares reales no deberia pasar nunca; si pasa, mejor saberlo
               que acabar con menos contactos de los pedidos sin enterarse. */
            tRelleno += reloj() - t0;
            console.log('  aviso: contacto ' + i + ' descartado (' + (r.error || 'repetido') + ')');
            continue;
        }
        var c = r.contact;
        if (porQR) {
            /* Los nombres humanos se fuerzan a ser unicos; estos no, porque
               suggestName solo tiene 16x16 combinaciones y las repeticiones
               son justo lo que se quiere poder ver en la lista. */
            nQR++;
            if (vistosQR[c.name]) { nQRrepes++; }
            vistosQR[c.name] = true;
        } else {
            c.nameLocked = true;
        }
        c.verified = Math.random() < 0.25;

        /* Cuantos mensajes tiene esta conversacion. Un octavo de los
           contactos no ha escrito nunca: en un roster real eso existe y es
           el unico caso en que la lista pinta la direccion corta. */
        var nm = (Math.random() < 0.12) ? 0 : (1 + ri(N_MENSAJES));
        if (N_MENSAJES === 0) { nm = 0; }

        var msgs = [], ts;
        if (nm > 0) {
            /* Se camina hacia atras desde la ultima actividad. Asi el roster
               queda repartido de verdad: unos pocos chats de hace un rato,
               algunos de esta semana y el resto viejos. */
            var recencia = Math.random();
            var ultimo = recencia < 0.06 ? AHORA - ri(2 * HORA)
                       : recencia < 0.30 ? AHORA - ri(3 * DIA)
                       : AHORA - ri(70 * DIA);
            ts = ultimo;
            for (j = 0; j < nm; j++) {
                var saliente = Math.random() < 0.5;
                msgs.unshift({
                    id: C.randomHex(8),
                    dir: saliente ? 'out' : 'in',
                    kind: 'text',
                    text: elige(FRASES),
                    ts: ts,
                    /* Solo estados terminales. Ver la cabecera: 'pendiente' y
                       'error' hacen que retryPending emita sobres de verdad. */
                    state: saliente ? (Math.random() < 0.7 ? 'leido' : 'entregado') : 'recibido'
                });
                ts -= 60000 + ri(8 * HORA);
            }
            c.added = msgs[0].ts - (1 + ri(20)) * DIA;
            conChat++;
        } else {
            c.added = AHORA - ri(365) * DIA;
        }
        if (c.added < masAntiguo) { masAntiguo = c.added; }
        totalMensajes += msgs.length;

        /* lastSeen es cuando se le oyo por ultima vez, o sea el ultimo
           mensaje entrante (34-session.js:148). Un punado va "en linea". */
        var ultimoIn = 0;
        for (j = msgs.length - 1; j >= 0; j--) {
            if (msgs[j].dir === 'in') { ultimoIn = msgs[j].ts; break; }
        }
        c.lastSeen = ultimoIn;
        if (enLinea > 0 && ultimoIn) { c.lastSeen = AHORA - ri(90000); enLinea--; }

        /* Sin leer: solo si la conversacion termina en mensajes entrantes, y
           solo en una minoria de chats. Un roster con 500 globos rojos no se
           parece a nada. */
        var pendientes = 0;
        for (j = msgs.length - 1; j >= 0 && msgs[j].dir === 'in'; j--) { pendientes++; }
        var unread = (pendientes && Math.random() < 0.15) ? pendientes : 0;
        if (unread) { sinLeer++; }

        st.chats[c.pk] = {
            messages: msgs,
            unread: unread,
            updated: msgs.length ? msgs[msgs.length - 1].ts : 0,
            draft: ''
        };
        tRelleno += reloj() - t0;

        /* --- fase claves: el trinquete ---------------------------------- */
        /* Otra vez: en tClaves entra el C.keypair() y nada mas. Los dos toHex
           de 32 bytes, el sha256 del identificador y el objeto que los junta
           son relleno y se apuntan como relleno; metidos en tClaves inflaban
           el coste por par entre un 15 y un 20%, y de ese numero cuelga
           ademas el aviso del bloqueo del primer sobre. */
        if (msgs.length) {
            var mine = [], nrk = 1 + ri(3), rk, trk = null;
            for (k = 0; k < nrk; k++) {
                t0 = reloj();
                rk = C.keypair();
                tClaves += reloj() - t0;
                totalClaves++;

                t0 = reloj();
                mine.push({
                    sk: U.toHex(rk.sk),
                    pk: U.toHex(rk.pk),
                    id: U.toHex(C.sha256(U.fromString('bintio/rk/v1'), rk.pk).subarray(0, 4)),
                    /* mine[0] es la mas nueva: session.js hace unshift. */
                    at: msgs[msgs.length - 1].ts - k * 3 * DIA
                });
                tRelleno += reloj() - t0;
            }
            if (ultimoIn) {
                t0 = reloj();
                trk = C.keypair();
                tClaves += reloj() - t0;
                totalClaves++;
            }
            t0 = reloj();
            c.ratchet = {
                mine: mine,
                theirs: trk ? { pk: U.toHex(trk.pk), at: ultimoIn } : null
            };
            tRelleno += reloj() - t0;
        }
    }

    st.createdAt = masAntiguo - 10 * DIA;
    st.carrier = [];     /* ver la cabecera: sobres falsos acaban en la malla real */

    /* Cuanto cuesta calentar la cache de secretos, por contacto. No es el
       coste de un par de claves: contacts.secrets hace el x25519 Y ADEMAS el
       HKDF de la clave de etiqueta (33-contacts.js:38), y ese HKDF es la
       diferencia entre el aviso del final y lo que tarda de verdad. Asi que
       se mide la derivacion entera, con el codigo real, sobre unos cuantos
       contactos y se promedia. Son dieciseis y no una porque el numero se
       multiplica luego por todos los contactos, y una sola medida de seis
       milisegundos lleva dentro el ruido del planificador. La cache es solo
       de memoria, no se exporta: esto no toca el estado que se ha sembrado. */
    var tDeriv = 0, nDeriv = Math.min(16, st.contacts.length);
    for (i = 0; i < nDeriv; i++) {
        t0 = reloj();
        V.contacts.secrets(st.contacts[i]);
        tDeriv += reloj() - t0;
    }
    tDeriv = nDeriv ? tDeriv / nDeriv : 0;

    var reparto = medirCuota(st, totalMensajes);

    /* --- fase cifrado -------------------------------------------------- */
    var tCifrado = reloj();
    var copia = V.vault.exportBackup();
    tCifrado = reloj() - tCifrado;

    var tEscritura = reloj();
    fs.writeFileSync(SALIDA, copia, 'utf8');
    tEscritura = reloj() - tEscritura;

    /* --- comprobacion: lo que hay EN DISCO, se vuelve a abrir ----------- */
    /* Se relee el fichero en vez de reusar la cadena que se tiene en memoria.
       Con la cadena en memoria la comprobacion pasaria igual aunque
       writeFileSync hubiera truncado el fichero o lo hubiera escrito en otra
       codificacion, que es justo el fallo que aqui hay que cazar: lo que la
       aplicacion va a leer es el fichero, no la variable. */
    var enDisco = fs.readFileSync(SALIDA);
    var esperado = Buffer.from(copia, 'utf8');
    if (!enDisco.equals(esperado)) {
        abortar('el fichero escrito no coincide byte a byte con la copia: se querian ' +
                esperado.length + ' bytes y en disco hay ' + enDisco.length);
    }

    /* La carga de los 15 modulos en un contexto vm queda FUERA del reloj: son
       unos milisegundos de leer ficheros y evaluarlos que no tienen nada que
       ver con reabrir la copia, y sumados dentro mentian sobre el coste real
       de un desbloqueo. */
    var V2 = require('../test/load')('39');

    var tVerif = reloj();
    V2.vault.importBackup(enDisco.toString('utf8'), PASS, null, function (err2, st2) {
        tVerif = reloj() - tVerif;
        if (err2) { abortar('la copia escrita no se puede reabrir: ' + err2.message); }

        var yo2 = V2.id.fromSeed(V2.util.fromHex(st2.identity.seed));
        V2.contacts.bind(yo2);
        var filas = V2.chat.list();

        /* Dos cosas distintas se comprueban aqui.

           Una, que address y fingerprint guardados coinciden con los que
           saldrian de recalcularlos: la lista y la ficha los pintan tal cual,
           sin recalcular, asi que un error solo se notaria el dia que alguien
           compare la huella en persona.

           Y dos, que los nombres con acentos y enyes vuelven identicos. BINTIO
           codifica UTF-8 a mano (10-util.js:37-71) porque TextEncoder no
           existe en los navegadores viejos; si ese codigo tuviera un fallo,
           esta es la comprobacion que lo caza. */
        var malas = 0, textos = 0, noAscii = 0, m;
        for (m = 0; m < st2.contacts.length; m++) {
            var pkb = V2.util.fromHex(st2.contacts[m].pk);
            if (V2.id.address(pkb) !== st2.contacts[m].address) { malas++; }
            if (V2.id.fingerprint(pkb) !== st2.contacts[m].fingerprint) { malas++; }
            if (st2.contacts[m].name !== st.contacts[m].name) { textos++; }
            if (/[^\x00-\x7F]/.test(st2.contacts[m].name)) { noAscii++; }
        }
        if (st2.identity.name !== st.identity.name) { textos++; }

        informe(copia, {
            tBoveda: tBoveda, tClaves: tClaves, tRelleno: tRelleno,
            tCifrado: tCifrado, tEscritura: tEscritura, tVerif: tVerif,
            tDeriv: tDeriv, nDeriv: nDeriv,
            totalMensajes: totalMensajes, totalClaves: totalClaves,
            conChat: conChat, sinLeer: sinLeer, nQR: nQR, nQRrepes: nQRrepes,
            contactos: st.contacts.length, nombre: miNombre,
            filas: filas.length, unread: V2.chat.totalUnread(),
            incoherentes: malas, textos: textos, noAscii: noAscii,
            chats: Object.keys(st2.chats).length, reparto: reparto
        });
    });
});

/* --------------------------------------------------------------------------
   Informe
   -------------------------------------------------------------------------- */
/* Con que --mensajes habria que repetir para dejar la boveda al 65% y que la
   aplicacion tenga sitio para escribir. El reparto real por mensaje ya esta
   medido, asi que esto es una regla de tres, no una corazonada. */
function sugerido(d, r) {
    if (!d.totalMensajes || r.caben <= 0) { return 1; }
    var objetivo = Math.floor(r.caben * 0.65);
    return Math.max(1, Math.floor(N_MENSAJES * objetivo / d.totalMensajes));
}

function informe(copia, d) {
    var r = d.reparto;
    var bytesArchivo = Buffer.byteLength(copia, 'utf8');
    /* Los navegadores cuentan la cuota de localStorage en unidades de codigo
       UTF-16: dos bytes por caracter. El blob es ASCII puro, asi que ocupa el
       doble de lo que mide el fichero. La clave 'bintio.vault.v1' tambien
       cuenta. */
    var cuota = 2 * (copia.length + 'bintio.vault.v1'.length);
    var pct = (cuota / CUOTA) * 100;
    var media = d.contactos ? (d.totalMensajes / d.contactos) : 0;

    console.log('SEMBRADO');
    console.log('  identidad          ' + d.nombre);
    console.log('  contactos          ' + d.contactos + ' (' + d.conChat + ' con conversacion, ' +
                (d.contactos - d.conChat) + ' sin un solo mensaje)');
    console.log('  nombres            ' + (d.contactos - d.nQR) + ' humanos con nameLocked, ' +
                d.nQR + ' con el que propone suggestName');
    if (d.nQRrepes) {
        /* No es un fallo del sembrador: suggestName son 16 adjetivos por 16
           sustantivos y se repite solo. Se dice aqui para que nadie lo
           confunda con un error al ver dos filas iguales en la lista. */
        console.log('                     de esos ' + d.nQR + ', ' + d.nQRrepes +
                    (d.nQRrepes === 1 ? ' sale repetido' : ' salen repetidos') +
                    ': suggestName solo da 256 nombres');
    }
    console.log('  mensajes           ' + d.totalMensajes + ' (media de ' + dec(media, 1) +
                ' por contacto, tope pedido ' + N_MENSAJES + ')');
    console.log('  chats sin leer     ' + d.sinLeer);
    console.log('  pares X25519       ' + d.totalClaves + ' (1 por contacto + los del trinquete)');
    console.log('');
    console.log('TIEMPOS');
    console.log('  crear boveda      ' + pad(ms(d.tBoveda), 9) + '   PBKDF2, 150000 iteraciones');
    console.log('  generar claves    ' + pad(ms(d.tClaves), 9) + '   ' + d.totalClaves + ' pares a ' +
                dec(d.tClaves / Math.max(1, d.totalClaves), 2) + ' ms, solo C.keypair()');
    console.log('  rellenar          ' + pad(ms(d.tRelleno), 9) +
                '   contactos, mensajes, hex y estado');
    console.log('  cifrar la copia   ' + pad(ms(d.tCifrado), 9) +
                '   stringify + UTF-8 + ChaCha20 + base64');
    console.log('  escribir fichero  ' + pad(ms(d.tEscritura), 9));
    console.log('  reabrir y validar ' + pad(ms(d.tVerif), 9) + '   PBKDF2 otra vez + descifrar + parsear');
    console.log('                                (sin la carga de modulos, que va aparte)');
    console.log('');
    console.log('COMPROBACION (el fichero se ha releido de disco, byte a byte igual a lo');
    console.log('escrito, y se ha reimportado con el codigo real)');
    console.log('  chat.list devuelve ' + d.filas + ' filas | ' + d.chats + ' chats | ' +
                d.unread + ' mensajes sin leer');
    console.log('  address y fingerprint incoherentes: ' + d.incoherentes +
                (d.incoherentes ? '   <-- MAL' : ''));
    console.log('  nombres que no vuelven identicos:   ' + d.textos +
                (d.textos ? '   <-- MAL' : '   (' + d.noAscii + ' llevan acento o enye)'));
    console.log('');
    console.log('FICHERO');
    console.log('  ' + SALIDA);
    console.log('  ' + copia.length + ' caracteres, ' + mib(bytesArchivo) + ' en disco');
    console.log('  ocupara ' + mib(cuota) + ' de localStorage, el ' + dec(pct, 0) +
                '% de la cuota tipica de 5 MiB.');
    console.log('  Es el doble de lo que mide el fichero: los navegadores cuentan la cuota');
    console.log('  en unidades de codigo UTF-16, dos bytes por caracter aunque sea ASCII.');
    console.log('');
    console.log('  REPARTO DE ESA CUOTA (medido serializando el estado con y sin mensajes)');
    console.log('    ' + pad(mib(r.cuotaBase), 9) + '  contactos, trinquete y ajustes, sin un solo mensaje' +
                ' (' + dec((r.cuotaBase / CUOTA) * 100, 0) + '%)');
    console.log('    ' + pad(mib(cuota - r.cuotaBase), 9) + '  los ' + d.totalMensajes + ' mensajes, a ' +
                dec(r.cuotaPorMensaje, 0) + ' bytes de cuota cada uno');
    console.log('    con estos ' + d.contactos + ' contactos caben ' + r.caben +
                ' mensajes en total antes de reventar');
    if (pct >= 100) {
        console.log('');
        console.log('  ATENCION: NO CABE. be().set lanzara QuotaExceededError, 31-vault.js:177 se lo');
        console.log('  traga y nadie mira Vault.lastError: la aplicacion parecera ir bien y no');
        console.log('  guardara nada. Al recargar habran desaparecido los cambios, sin aviso.');
        console.log('  Repite con  --mensajes ' + sugerido(d, r) + '  o con menos contactos.');
    } else if (pct >= 80) {
        console.log('');
        console.log('  ATENCION: queda poco margen. Escribir en la aplicacion consume el resto');
        console.log('  enseguida, y cuando se agote la boveda dejara de persistir en silencio');
        console.log('  (31-vault.js:174-181). Para dejar sitio:  --mensajes ' + sugerido(d, r));
    }
    console.log('');
    console.log('QUE HACER CON EL FICHERO');
    console.log('  1. Levanta la aplicacion:  npm start   (o abre dist/index.html)');
    console.log('  2. Si es un navegador limpio, pulsa "Ya tengo una" en la pantalla de');
    console.log('     acceso. Si ya hay una boveda en ese origen, pulsa "Restaurar copia".');
    console.log('  3. Abre ' + path.basename(SALIDA) + ', copia TODO el texto de una sola linea');
    console.log('     y pegalo en "Llave de Recuperacion, o copia de seguridad completa".');
    console.log('  4. Escribe la contrasena: ' + PASS);
    console.log('  5. Pulsa "Recuperar".');
    console.log('');
    /* El coste del primer sobre tras desbloquear, por contacto, no es un
       x25519 pelado: contacts.secrets calcula el secreto del par Y ADEMAS el
       HKDF de la clave de etiqueta (33-contacts.js:38), y solo cachea en
       memoria, asi que contacts.bind lo tira todo en cada desbloqueo.
       Estimarlo con el coste de un par de claves dejaba fuera ese HKDF y se
       quedaba corto en mas de un 10%. Aqui se multiplica por una derivacion
       COMPLETA medida arriba con el codigo real. */
    var frio = d.contactos * d.tDeriv;
    console.log('ANTES DE HACERLO, DOS AVISOS');
    console.log('  - Restaurar SOBREESCRIBE la boveda que hubiera en ese origen, sin');
    console.log('    preguntar. Si tienes algo real ahi, guardalo antes desde Ajustes >');
    console.log('    "Descargar copia cifrada", o hazlo en otro perfil del navegador.');
    console.log('  - Con ' + d.contactos + ' contactos, el primer sobre que llegue tras cada desbloqueo');
    console.log('    bloqueara el hilo unos ' + ms(frio) + ' en un escritorio como este: son ' + d.contactos);
    console.log('    derivaciones seguidas para calentar la cache de secretos, x25519 mas el');
    console.log('    HKDF de la etiqueta, a ' + dec(d.tDeriv, 2) + ' ms cada una medidos aqui sobre ' +
                d.nDeriv + ' contactos');
    console.log('    reales. En un movil, entre tres y seis veces mas. No lo causa la copia');
    console.log('    sembrada; es el coste real que estos datos hacen visible por primera vez.');
    console.log('');
    console.log('DATOS SINTETICOS: el trinquete es decorado, los mensajes no han viajado y');
    console.log('los contactos no existen. Sirven para medir tamano y tiempos, no para');
    console.log('probar el cifrado de punta a punta. La cabecera de este fichero lo detalla.');
    console.log('');
}
