/* ==========================================================================
   Boveda local.

   Todo lo que BINTIO guarda en el aparato (identidad, contactos, mensajes,
   bolsa de reenvio) vive dentro de UN unico blob cifrado con una clave que
   solo sale de la contrasena del usuario.

   El desarrollador no puede descifrarla. No hay clave maestra, no hay
   "recuperar cuenta", no hay copia en la nube. Si se pierde la contrasena y la
   Llave de Recuperacion, los datos son ruido para siempre. Eso es el
   producto, no un defecto.
   ========================================================================== */
(function (V) {
    'use strict';
    var C = V.crypto, U = V.util, Vault = V.vault;

    var STORE_KEY = 'bintio.vault.v1';
    var SESSION_KEY = 'bintio.session.v1';
    var OWNER_KEY = 'bintio.owner.v1';
    var ITERS = 150000;      /* coste por intento de fuerza bruta */
    var SAVE_DELAY = 400;    /* ms de espera antes de escribir en disco */
    var OWNER_STALE = 90000; /* ms: un arriendo mas viejo que esto se da por muerto */

    var backend = null;
    var key = null;          /* clave de cifrado en memoria, nunca en disco */
    var keyIters = ITERS;    /* con cuantas vueltas se derivo la clave que hay en memoria */
    var saveTimer = null;

    /* Limites de sensatez para las vueltas que declara un blob. Sin ellos se
       confiaba en el numero a ciegas: una copia con un numero distinto de
       150000 se abria bien -se deriva con el numero del blob- pero el primer
       guardado la reescribia diciendo 150000, y al volver a abrir ya no
       cuadraba: perdida total con la contrasena correcta y sin un aviso. Se
       arregla guardando las vueltas de verdad (keyIters) y usandolas al
       escribir; esto es la red de debajo contra un blob absurdo. */
    var MIN_ITERS = 10000, MAX_ITERS = 10000000;

    /* Lo que ocupa el blob en disco, apuntado en vez de medido.

       Medirlo era leerlo entero: sizeBytes() hacia un get() de localStorage,
       que devuelve la boveda completa -cientos de kilobytes cuando hay
       conversaciones- para quedarse solo con .length y tirar la cadena. Eso lo
       llama la barra de estado, y la barra de estado se repasa cada cuatro
       segundos: novecientas lecturas completas por hora, sincronas y en el
       hilo de la interfaz.

       La longitud solo cambia cuando escribimos nosotros, asi que se apunta al
       escribir y se devuelve de memoria. -1 es "todavia no se ha mirado". */
    var tamano = -1;

    function apuntar(blob) { tamano = blob ? blob.length : 0; }

    Vault.state = null;      /* objeto plano; lo lee y escribe el resto de la app */

    /* ---------------------------------------------------------------------
       Almacen fisico. localStorage funciona en http, https y file: en casi
       todos los navegadores. Si no hay, seguimos en memoria y avisamos.
       --------------------------------------------------------------------- */
    function pickBackend() {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('bintio.probe', '1');
                localStorage.removeItem('bintio.probe');
                return {
                    persistent: true,
                    get: function (k) { return localStorage.getItem(k); },
                    set: function (k, v) { localStorage.setItem(k, v); },
                    del: function (k) { localStorage.removeItem(k); }
                };
            }
        } catch (e) { /* modo privado de Safari, cuota agotada, etc. */ }
        var mem = {};
        return {
            persistent: false,
            get: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
            set: function (k, v) { mem[k] = v; },
            del: function (k) { delete mem[k]; }
        };
    }

    function be() {
        if (!backend) { backend = pickBackend(); }
        return backend;
    }

    /* ---------------------------------------------------------------------
       Varias pestanas del mismo navegador comparten el MISMO localStorage.
       Sin coordinacion pasaban tres cosas, las tres demostradas:

         - "Borrar todo" en una pestana borraba el disco, pero la otra, con la
           boveda todavia en memoria, la volvia a escribir al minuto siguiente.
           El borrado de panico -la promesa mas fuerte- no borraba.
         - Dos pestanas guardando por turnos: la ultima en escribir pisaba lo
           que hizo la otra. Contactos y mensajes desaparecian del disco.

       Se arregla con dos cosas de aqui abajo:

         GUARDA ANTI-RESURRECCION: antes de escribir se mira si el blob sigue en
         disco. Si habia uno y ha desaparecido, alguien lo borro (otra pestana,
         o el panico): NO se vuelve a escribir, se avisa (onWiped) y punto.

         ARRIENDO DE ESCRITURA: un testigo con el nombre de esta pestana y la
         hora. La escritura de MANTENIMIENTO -el reloj de un minuto, que no lleva
         cambios del usuario- cede si otra pestana tiene el arriendo fresco: asi
         una pestana inactiva no pisa lo que hace la que se esta usando. Las
         escrituras de un CAMBIO real siempre escriben y renuevan el arriendo.
       --------------------------------------------------------------------- */
    var ownerToken = null;
    function token() {
        if (!ownerToken) { ownerToken = U.toHex(C.random(8)); }
        return ownerToken;
    }
    function tomarArriendo() {
        try { be().set(OWNER_KEY, token() + '|' + U.now()); } catch (e) {}
    }
    function soltarArriendo() {
        try { if (be().get(OWNER_KEY) && be().get(OWNER_KEY).split('|')[0] === token()) { be().del(OWNER_KEY); } } catch (e) {}
    }
    /* True si el arriendo es nuestro o esta muerto: en los dos casos podemos
       escribir. Solo cede ante un arriendo AJENO y FRESCO. */
    function tenemosVia() {
        var v;
        try { v = be().get(OWNER_KEY); } catch (e) { return true; }
        if (!v) { return true; }
        var p = v.split('|');
        if (p[0] === token()) { return true; }
        return (U.now() - (parseInt(p[1], 10) || 0)) > OWNER_STALE;
    }

    Vault.isPersistent = function () { return be().persistent; };
    Vault.exists = function () { return !!be().get(STORE_KEY); };
    Vault.isOpen = function () { return !!key; };

    /* ---------------------------------------------------------------------
       Serializacion:  V1.salt.iteraciones.nonce.cifrado   (todo base64url)
       --------------------------------------------------------------------- */
    function encode(salt, iters, nonce, ct) {
        return 'V1.' + U.toB64(salt) + '.' + iters + '.' + U.toB64(nonce) + '.' + U.toB64(ct);
    }
    function decode(text) {
        var p = String(text).split('.');
        if (p.length !== 5 || p[0] !== 'V1') { return null; }
        var iters = parseInt(p[2], 10);
        if (!(iters >= MIN_ITERS && iters <= MAX_ITERS)) { return null; }
        return { salt: U.fromB64(p[1]), iters: iters, nonce: U.fromB64(p[3]), ct: U.fromB64(p[4]) };
    }

    function emptyState() {
        return {
            identity: null,          /* {seed en hex, name} */
            contacts: [],
            chats: {},               /* pk hex -> {messages:[], unread:0, ...} */
            carrier: [],             /* sobres ajenos en transito (bolsa) */
            /* Presentaciones de desconocidos, a la espera de que el usuario
               las acepte o las descarte (presenta.js). Van DENTRO de la
               boveda cifrada porque una solicitud que llega con la aplicacion
               cerrada y desaparece al abrirla seria justo el fallo que la
               presentacion viene a arreglar. Las bovedas creadas antes de que
               esto existiera no tienen el campo, y todo el codigo que lo lee
               tiene que tolerarlo, igual que hace M.init con carrier. */
            requests: [],
            /* Grupos: id -> { id, name, members, rev, created }. Igual que
               requests, una boveda de antes no lo tiene y groups.js lo crea
               al vuelo la primera vez que se mira. */
            groups: {},
            settings: {
                /* El tema de casa. Si aqui pone otra cosa, la boveda recien
                   creada arrancaria con un tema distinto del que se ve en la
                   pantalla de acceso, y el cambio de color al entrar parece
                   un fallo. Vive aqui y en theme.js: los dos tienen
                   que decir lo mismo. */
                theme: 'bintio',
                bloom: 'on',
                relay: true,         /* ayudar a otros reenviando sus sobres */
                receipts: true,
                /* "Esta escribiendo". Interruptor propio y no colgado de los
                   acuses: un acuse dice "me llego" una vez por mensaje, y esto
                   dice "esta aqui, tecleando" cada cuatro segundos. Es mas
                   trafico y es mas presencia; que cada uno elija. Encendido de
                   serie, como los acuses, y las bovedas de antes lo leen
                   encendido porque solo el false explicito lo apaga. */
                typing: true,
                /* Pantalla protegida. Encendida de serie: tapa al perder el
                   foco y quita el menu del boton derecho. Lo que NO hace -y
                   no puede hacer nadie desde una pagina- es impedir una
                   captura; el interruptor lo dice y privacidad.js lo
                   explica entero. */
                shield: true,
                notify: true,
                /* Buzon abierto: que alguien pueda escribirte teniendo solo tu
                   codigo, sin que tu le hayas dado de alta antes.

                   FALSO de serie, y no es timidez. Abrirlo significa que
                   cualquiera con tu codigo puede llamar a tu puerta, y ese
                   primer mensaje no va autenticado: hasta que no compruebas la
                   huella, el nombre lo pone quien escribe. Eso puede quererse,
                   pero se elige; no se hereda por instalar la aplicacion. Una
                   boveda que ya existia y no tiene esta clave se lee como
                   cerrada, que es lo que hacia antes de que esto existiera. */
                openInbox: false
            },
            createdAt: U.now()
        };
    }

    /* ---------------------------------------------------------------------
       Crear, abrir, cerrar
       --------------------------------------------------------------------- */
    Vault.create = function (pass, onProgress, cb) {
        var salt = C.random(16);
        C.pbkdf2Async(pass, salt, ITERS, 32, onProgress, function (k) {
            key = k;
            keyIters = ITERS;
            Vault.state = emptyState();
            Vault.state.saltHint = U.toB64(salt);
            writeNow(salt);
            cb(null, Vault.state);
        });
    };

    Vault.unlock = function (pass, onProgress, cb) {
        var crudo = be().get(STORE_KEY);
        apuntar(crudo);
        var rec = decode(crudo);
        if (!rec) { cb(new Error('No hay ninguna boveda en este dispositivo')); return; }
        C.pbkdf2Async(pass, rec.salt, rec.iters, 32, onProgress, function (k) {
            var plain = C.open(k, rec.nonce, U.fromString('bintio/vault/v1'), rec.ct);
            if (!plain) { U.wipe(k); cb(new Error('Contrase\u00f1a incorrecta')); return; }
            var obj;
            try { obj = JSON.parse(U.toString(plain)); }
            catch (e) { U.wipe(k); cb(new Error('La boveda esta danada')); return; }
            U.wipe(plain);
            key = k;
            keyIters = rec.iters;   /* con las que se derivo: writeNow las respeta */
            Vault.state = obj;
            Vault.state.saltHint = U.toB64(rec.salt);
            cb(null, Vault.state);
        });
    };

    Vault.lock = function () {
        Vault.saveNow();
        soltarArriendo();   /* que otra pestana pueda escribir sin esperar 90 s */
        if (key) { U.wipe(key); }
        key = null;
        Vault.state = null;
        try { if (typeof sessionStorage !== 'undefined') { sessionStorage.removeItem(SESSION_KEY); } } catch (e) {}
    };

    /* Desbloqueo rapido dentro de la MISMA pestana: la clave se guarda en
       sessionStorage, que muere al cerrar la pestana. Es una comodidad con
       coste, por eso es opcional y esta apagada por defecto. */
    Vault.rememberForSession = function () {
        try { sessionStorage.setItem(SESSION_KEY, U.toB64(key)); return true; }
        catch (e) { return false; }
    };
    Vault.resumeSession = function () {
        try {
            var k = sessionStorage.getItem(SESSION_KEY);
            if (!k) { return false; }
            var crudo = be().get(STORE_KEY);
            apuntar(crudo);
            var rec = decode(crudo);
            if (!rec) { return false; }
            var kk = U.fromB64(k);
            var plain = C.open(kk, rec.nonce, U.fromString('bintio/vault/v1'), rec.ct);
            if (!plain) { return false; }
            key = kk;
            keyIters = rec.iters;
            Vault.state = JSON.parse(U.toString(plain));
            Vault.state.saltHint = U.toB64(rec.salt);
            return true;
        } catch (e) { return false; }
    };

    /* ---------------------------------------------------------------------
       Escritura. save() agrupa rafagas de cambios; saveNow() fuerza.
       --------------------------------------------------------------------- */
    function writeNow(saltOverride, mantenimiento) {
        if (!key || !Vault.state) { return; }
        /* Guarda anti-resurreccion: si ya habia un blob y ha desaparecido del
           disco, alguien lo borro. No se resucita. tamano>0 significa que en
           algun momento de esta sesion escribimos o abrimos algo; en el primer
           writeNow de Vault.create el disco esta vacio a proposito y tamano es
           -1, asi que esa primera escritura no la corta esta guarda. */
        if (tamano > 0 && be().get(STORE_KEY) === null) {
            key = null; Vault.state = null;
            if (Vault.onWiped) { Vault.onWiped(); }
            return;
        }
        /* La escritura de mantenimiento cede ante otra pestana con el arriendo
           fresco; la de un cambio real, no: toma el arriendo y escribe. */
        if (mantenimiento && !tenemosVia()) { return; }
        tomarArriendo();
        var salt = saltOverride || U.fromB64(Vault.state.saltHint);
        var nonce = C.random(12);
        var copy = {};
        for (var k in Vault.state) {
            if (Object.prototype.hasOwnProperty.call(Vault.state, k) && k !== 'saltHint') { copy[k] = Vault.state[k]; }
        }
        var plain = U.fromString(JSON.stringify(copy));
        var ct = C.seal(key, nonce, U.fromString('bintio/vault/v1'), plain);
        U.wipe(plain);
        try {
            /* Con keyIters, NO con la constante: si la clave en memoria se
               derivo con otro numero de vueltas (una copia de otra version),
               escribir 150000 la dejaria inabrible al recargar. */
            var blob = encode(salt, keyIters, nonce, ct);
            be().set(STORE_KEY, blob);
            apuntar(blob);
            Vault.lastError = null;
        } catch (e) {
            /* Cuota agotada: el llamante decide si podar historial. */
            Vault.lastError = e;
            if (Vault.onQuotaError) { Vault.onQuotaError(e); }
        }
    }

    Vault.save = function () {
        if (saveTimer) { clearTimeout(saveTimer); }
        saveTimer = setTimeout(function () { saveTimer = null; writeNow(null); }, SAVE_DELAY);
    };
    Vault.saveNow = function () {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        writeNow(null);
    };
    /* La escritura del reloj de mantenimiento (app.js). Va aparte porque es la
       unica que puede CEDER: no lleva ningun cambio del usuario, asi que si otra
       pestana esta trabajando, mejor no pisarla. */
    Vault.saveMaintenance = function () {
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        writeNow(null, true);
    };

    /* ---------------------------------------------------------------------
       Copia de seguridad: el mismo blob cifrado, en texto. Se puede pegar en
       un correo o guardar en un USB sin miedo: sin la contrasena no es nada.
       --------------------------------------------------------------------- */
    Vault.exportBackup = function () {
        Vault.saveNow();
        return be().get(STORE_KEY) || '';
    };
    Vault.importBackup = function (text, pass, onProgress, cb) {
        var limpio = text.replace(/\s+/g, '');
        var rec = decode(limpio);
        if (!rec) { cb(new Error('Ese texto no es una copia de BINTIO')); return; }
        C.pbkdf2Async(pass, rec.salt, rec.iters, 32, onProgress, function (k) {
            var plain = C.open(k, rec.nonce, U.fromString('bintio/vault/v1'), rec.ct);
            if (!plain) { U.wipe(k); cb(new Error('Contrase\u00f1a incorrecta para esa copia')); return; }
            try {
                be().set(STORE_KEY, limpio);
                apuntar(limpio);
                key = k;
                keyIters = rec.iters;
                Vault.state = JSON.parse(U.toString(plain));
                Vault.state.saltHint = U.toB64(rec.salt);
                cb(null, Vault.state);
            } catch (e) { cb(e); }
        });
    };

    /* Borrado de panico: deja el aparato como si BINTIO nunca hubiera estado.

       Se barre TODO lo que empiece por "bintio.", no solo la boveda. Borrando
       unicamente la boveda quedaba atras "bintio.bus.v1", el buzon que usan
       las pestanas del mismo navegador para pasarse sobres (41-transport-
       local.js). Dentro no hay nada legible -son sobres cifrados-, pero la
       clave en si es una huella: dice que aqui se uso BINTIO. Y esta funcion
       promete justo lo contrario.

       Se barre por prefijo y no por una lista de claves a proposito: una lista
       hay que acordarse de actualizarla, y el primero que no se acordo fue
       este mismo fichero. Ademas asi vault.js no tiene que conocer las
       claves de los transportes, que estan dos capas por encima. */
    function barrer(almacen) {
        if (!almacen) { return; }
        var fuera = [], i, k;
        for (i = 0; i < almacen.length; i++) {
            k = almacen.key(i);
            if (k && k.substr(0, 7) === 'bintio.') { fuera.push(k); }
        }
        /* Se recogen primero y se borran despues: quitar mientras se recorre
           mueve los indices y deja la mitad sin tocar. */
        for (i = 0; i < fuera.length; i++) { almacen.removeItem(fuera[i]); }
    }

    Vault.destroy = function () {
        try { be().del(STORE_KEY); apuntar(null); } catch (e) {}
        try { if (typeof localStorage !== 'undefined') { barrer(localStorage); } } catch (e) {}
        try { if (typeof sessionStorage !== 'undefined') { barrer(sessionStorage); } } catch (e) {}
        if (key) { U.wipe(key); }
        key = null;
        Vault.state = null;
        backend = null;   /* que el siguiente arranque elija de nuevo, en limpio */
    };

    /* Tamano aproximado en disco, para avisar antes de llenar la cuota. Sale
       de lo apuntado al escribir; solo la primera vez hay que ir a mirarlo. */
    Vault.sizeBytes = function () {
        if (tamano < 0) { apuntar(be().get(STORE_KEY)); }
        return tamano;
    };
})(BINTIO);
