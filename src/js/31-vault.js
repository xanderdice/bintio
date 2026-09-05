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
    var ITERS = 150000;      /* coste por intento de fuerza bruta */
    var SAVE_DELAY = 400;    /* ms de espera antes de escribir en disco */

    var backend = null;
    var key = null;          /* clave de cifrado en memoria, nunca en disco */
    var saveTimer = null;

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
        return { salt: U.fromB64(p[1]), iters: parseInt(p[2], 10), nonce: U.fromB64(p[3]), ct: U.fromB64(p[4]) };
    }

    function emptyState() {
        return {
            identity: null,          /* {seed en hex, name} */
            contacts: [],
            chats: {},               /* pk hex -> {messages:[], unread:0, ...} */
            carrier: [],             /* sobres ajenos en transito (bolsa) */
            /* Presentaciones de desconocidos, a la espera de que el usuario
               las acepte o las descarte (37-presenta.js). Van DENTRO de la
               boveda cifrada porque una solicitud que llega con la aplicacion
               cerrada y desaparece al abrirla seria justo el fallo que la
               presentacion viene a arreglar. Las bovedas creadas antes de que
               esto existiera no tienen el campo, y todo el codigo que lo lee
               tiene que tolerarlo, igual que hace M.init con carrier. */
            requests: [],
            settings: {
                /* El tema de casa. Si aqui pone otra cosa, la boveda recien
                   creada arrancaria con un tema distinto del que se ve en la
                   pantalla de acceso, y el cambio de color al entrar parece
                   un fallo. Vive aqui y en 61-ui-theme.js: los dos tienen
                   que decir lo mismo. */
                theme: 'bintio',
                bloom: 'on',
                relay: true,         /* ayudar a otros reenviando sus sobres */
                receipts: true,
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
                openInbox: false,
                lang: 'es'
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
            Vault.state = emptyState();
            Vault.state.saltHint = U.toB64(salt);
            writeNow(salt);
            cb(null, Vault.state);
        });
    };

    Vault.unlock = function (pass, onProgress, cb) {
        var rec = decode(be().get(STORE_KEY));
        if (!rec) { cb(new Error('No hay ninguna boveda en este dispositivo')); return; }
        C.pbkdf2Async(pass, rec.salt, rec.iters, 32, onProgress, function (k) {
            var plain = C.open(k, rec.nonce, U.fromString('bintio/vault/v1'), rec.ct);
            if (!plain) { U.wipe(k); cb(new Error('Contrase\u00f1a incorrecta')); return; }
            var obj;
            try { obj = JSON.parse(U.toString(plain)); }
            catch (e) { U.wipe(k); cb(new Error('La boveda esta danada')); return; }
            U.wipe(plain);
            key = k;
            Vault.state = obj;
            Vault.state.saltHint = U.toB64(rec.salt);
            cb(null, Vault.state);
        });
    };

    Vault.lock = function () {
        Vault.saveNow();
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
            var rec = decode(be().get(STORE_KEY));
            if (!rec) { return false; }
            var kk = U.fromB64(k);
            var plain = C.open(kk, rec.nonce, U.fromString('bintio/vault/v1'), rec.ct);
            if (!plain) { return false; }
            key = kk;
            Vault.state = JSON.parse(U.toString(plain));
            Vault.state.saltHint = U.toB64(rec.salt);
            return true;
        } catch (e) { return false; }
    };

    /* ---------------------------------------------------------------------
       Escritura. save() agrupa rafagas de cambios; saveNow() fuerza.
       --------------------------------------------------------------------- */
    function writeNow(saltOverride) {
        if (!key || !Vault.state) { return; }
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
            be().set(STORE_KEY, encode(salt, ITERS, nonce, ct));
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

    /* ---------------------------------------------------------------------
       Copia de seguridad: el mismo blob cifrado, en texto. Se puede pegar en
       un correo o guardar en un USB sin miedo: sin la contrasena no es nada.
       --------------------------------------------------------------------- */
    Vault.exportBackup = function () {
        Vault.saveNow();
        return be().get(STORE_KEY) || '';
    };
    Vault.importBackup = function (text, pass, onProgress, cb) {
        var rec = decode(text.replace(/\s+/g, ''));
        if (!rec) { cb(new Error('Ese texto no es una copia de BINTIO')); return; }
        C.pbkdf2Async(pass, rec.salt, rec.iters, 32, onProgress, function (k) {
            var plain = C.open(k, rec.nonce, U.fromString('bintio/vault/v1'), rec.ct);
            if (!plain) { U.wipe(k); cb(new Error('Contrase\u00f1a incorrecta para esa copia')); return; }
            try {
                be().set(STORE_KEY, text.replace(/\s+/g, ''));
                key = k;
                Vault.state = JSON.parse(U.toString(plain));
                Vault.state.saltHint = U.toB64(rec.salt);
                cb(null, Vault.state);
            } catch (e) { cb(e); }
        });
    };

    /* Borrado de panico: deja el aparato como si BINTIO nunca hubiera estado. */
    Vault.destroy = function () {
        try { be().del(STORE_KEY); } catch (e) {}
        try { if (typeof sessionStorage !== 'undefined') { sessionStorage.removeItem(SESSION_KEY); } } catch (e) {}
        if (key) { U.wipe(key); }
        key = null;
        Vault.state = null;
    };

    /* Tamano aproximado en disco, para avisar antes de llenar la cuota. */
    Vault.sizeBytes = function () {
        var s = be().get(STORE_KEY);
        return s ? s.length : 0;
    };
})(BINTIO);
