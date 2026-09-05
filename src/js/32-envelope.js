/* ==========================================================================
   El SOBRE: el unico formato que viaja por el cable.

   Un sobre no dice quien lo manda ni a quien va. Un nodo que lo reenvia solo
   ve bytes opacos, una caducidad y un contador de saltos. Solo el
   destinatario reconoce el sobre, porque solo el puede recalcular la
   etiqueta de 8 bytes a partir del secreto que comparte con cada contacto.

   Disposicion binaria (cabecera de 64 bytes + extras opcionales):

     0      'B'   familia: todo marco de BINTIO empieza por este byte
     1      'X'   clase: sobre (los de control de la malla llevan 'C')
     2      version del protocolo
     3      banderas   bit0: lleva clave de trinquete
                       bit1: usa una clave de trinquete del destinatario
     4      saltos restantes   <- MUTABLE en transito
     5      saltos dados       <- MUTABLE en transito
     6-11   caducidad, segundos unix (48 bits)
     12-43  clave efimera del remitente (32)
     44-51  etiqueta de reconocimiento (8)
     52-63  nonce (12)
     [64-95]   clave de trinquete del remitente, si bandera 0
     [+4]      identificador de la clave de trinquete usada, si bandera 1
     resto     texto cifrado + autenticador (16)

   Los bytes 4 y 5 cambian en cada salto y por eso NO entran en la firma:
   se autentica una copia de la cabecera con esos dos bytes a cero. Y son los
   UNICOS que no entran en el identificador del marco (E.idOf), por lo mismo:
   todo lo demas, la caducidad incluida, es inmutable en transito.

   Claves (todas por HKDF, nunca se reutiliza un secreto crudo):
     ss1 = X25519(efimera_del_remitente, estatica_del_destinatario)
     ss2 = X25519(estatica_del_remitente, estatica_del_destinatario)  [par]
     ss3 = X25519(trinquete_propio, trinquete_del_otro)               [opcional]
     clave = HKDF(ss1 || ss2 || ss3, sal = efimera, "bintio/env/v1")

   ss1 da frescura por mensaje, ss2 autentica al remitente (nadie mas puede
   producirlo), ss3 aporta secreto futuro: cuando la clave de trinquete
   antigua se borra, ese mensaje ya no se puede descifrar ni con la clave
   estatica en la mano.
   ========================================================================== */
(function (V) {
    'use strict';
    var C = V.crypto, U = V.util, E = V.envelope;

    /* Los dos primeros bytes de todo lo que sale al cable.

       El byte 0 es la FAMILIA y vale por el nombre del proyecto: cualquier
       marco que no empiece por 'B' se tira antes de mirar nada mas. Eso es lo
       que hace de senal de incompatibilidad: la version anterior de esto se
       llamaba de otra forma y estampaba otra letra, y como el renombrado
       cambio ademas las etiquetas HKDF, sus sobres no los puede abrir nadie.
       Rechazarlos en el byte 0 es mejor que aceptarlos, reenviarlos y
       cargarlos en la bolsa durante tres dias para nada.

       El byte 1 es la CLASE de marco: 'X' un sobre, 'P' una presentacion,
       'C' control de la malla. El de control se arma en 35-mesh.js y la
       presentacion en 37-presenta.js, pero el byte 0 lo sacan de aqui: la
       familia se escribe UNA vez o acaba diciendo cosas distintas segun quien
       la escriba. Las tres clases son ASCII imprimible a proposito, para que
       se lean de un vistazo en un volcado hexadecimal.

       Por que la presentacion es una CLASE y no un bit de las banderas de un
       sobre: bajo 'X', el campo de la posicion 44 es una etiqueta que solo el
       par puede recalcular, y en una presentacion no puede serlo (no hay par
       todavia). Ademas su clave se deriva de otros secretos, asi que E.open
       tendria que ramificar por un bit para decidir que mezcla. Repartir por
       el byte por el que la malla YA reparte cuesta un if y deja E.seal y
       E.open sin tocar. */
    E.MAGIC0 = 0x42; /* B, la familia */
    E.MAGIC1 = 0x58; /* X, un sobre  */
    E.MAGIC_PRES = 0x50; /* P, una presentacion (37-presenta.js) */
    E.HEAD = 64;
    E.F_RATCHET_MINE = 1;
    E.F_RATCHET_THEIRS = 2;
    E.MAX_TTL = 12;
    E.DEFAULT_TTL = 6;
    E.DEFAULT_LIFE = 72 * 3600; /* segundos que un sobre puede vagar por la malla */
    /* Lo maximo que se acepta al parsear: la vida normal mas un dia de holgura,
       porque los relojes de dos aparatos no coinciden y no se puede tirar un
       sobre honrado por eso. Mismo numero que P.MAX_LIFE, y por lo mismo. */
    E.MAX_LIFE = 96 * 3600;

    /* Clave de etiqueta: depende solo del secreto del par, asi que remitente
       y destinatario la calculan igual, y nadie mas puede. */
    E.tagKey = function (pairSecret) {
        return C.hkdf(pairSecret, U.fromString('bintio/tag/v1'), 'tag', 32);
    };
    E.tagFor = function (tagKey, ephPub) {
        return C.hmac(tagKey, ephPub).subarray(0, 8);
    };

    function aadOf(head) {
        var a = new Uint8Array(head.length);
        a.set(head);
        a[4] = 0; a[5] = 0;   /* los saltos no se autentican: cambian por el camino */
        return a;
    }

    /* -----------------------------------------------------------------
       Cerrar. opts:
         ephSk, ephPk     par efimero recien creado (uno por mensaje)
         pairSecret       X25519(mi estatica, su estatica)
         recipPk          clave publica estatica del destinatario
         myRatchetPk      clave de trinquete propia a publicar (opcional)
         ratchetSecret    ss3 ya calculado (opcional)
         theirRatchetId   4 bytes que identifican la clave suya usada (opcional)
         payload          bytes ya empaquetados por la capa de sesion
         ttl, lifeSeconds
       ----------------------------------------------------------------- */
    E.seal = function (opts) {
        var flags = 0;
        var extra = [];
        if (opts.myRatchetPk) { flags |= E.F_RATCHET_MINE; extra.push(opts.myRatchetPk); }
        if (opts.theirRatchetId) { flags |= E.F_RATCHET_THEIRS; extra.push(opts.theirRatchetId); }

        var nonce = C.random(C.NONCE);
        var exp = Math.floor(U.now() / 1000) + (opts.lifeSeconds || E.DEFAULT_LIFE);
        var tagKey = E.tagKey(opts.pairSecret);
        var tag = E.tagFor(tagKey, opts.ephPk);

        var head = new Uint8Array(E.HEAD);
        head[0] = E.MAGIC0; head[1] = E.MAGIC1;
        head[2] = V.PROTO;
        head[3] = flags;
        head[4] = opts.ttl === undefined ? E.DEFAULT_TTL : opts.ttl;
        head[5] = 0;
        head.set(U.u48(exp), 6);
        head.set(opts.ephPk, 12);
        head.set(tag, 44);
        head.set(nonce, 52);

        var full = U.concat([head].concat(extra));
        var ikm = U.concat([
            C.x25519(opts.ephSk, opts.recipPk),
            opts.pairSecret,
            opts.ratchetSecret || new Uint8Array(0)
        ]);
        var k = C.hkdf(ikm, opts.ephPk, 'bintio/env/v1', 32);
        U.wipe(ikm);
        var body = C.seal(k, nonce, aadOf(full), opts.payload);
        U.wipe(k);
        return U.concat([full, body]);
    };

    /* -----------------------------------------------------------------
       Leer la cabecera sin descifrar nada. Devuelve null si no es un sobre.
       ----------------------------------------------------------------- */
    E.parse = function (b) {
        if (!b || b.length < E.HEAD + C.TAG + 1) { return null; }
        if (b[0] !== E.MAGIC0 || b[1] !== E.MAGIC1) { return null; }

        /* Tres topes que cuestan tres comparaciones y sin los cuales la mochila
           de cualquier nodo se puede inutilizar PARA SIEMPRE con catorce
           milisegundos de trabajo:

             version    un marco de una version que no entendemos no se
                        transporta: no sabemos si sus campos significan lo mismo.
             saltos     E.MAX_TTL era una regla escrita y no aplicada. Los bytes
                        4 y 5 van fuera del cifrado y fuera del identificador
                        -tienen que ir, son los que cambian en cada salto-, asi
                        que cualquiera repone el contador a 255 sin tocar el id.
             caducidad  esta es la grave. M.prune sacrifica primero lo que antes
                        caduca, o sea que lo que caduca MAS TARDE es lo ultimo
                        en morir. Un marco con la caducidad al maximo (ocho
                        millones de anos) es inmortal en todas las mochilas por
                        las que pase: cuatrocientos de esos, ochenta y un bytes
                        cada uno y sin una sola operacion de criptografia,
                        llenan las trescientas piezas y a partir de ahi el nodo
                        no vuelve a poder llevar un sobre honrado, porque la
                        poda lo echa en la misma llamada que lo mete. Sobrevive
                        al reinicio y solo lo cura vaciar la mochila a mano.

           37-presenta.js ya hacia las tres para su clase de marco, con el
           comentario que describe este mismo ataque. Aqui faltaban. */
        if (b[2] !== V.PROTO) { return null; }
        if (b[4] > E.MAX_TTL) { return null; }
        if (U.readU48(b, 6) > Math.floor(U.now() / 1000) + E.MAX_LIFE) { return null; }

        var flags = b[3];
        var off = E.HEAD;
        var ratchetPk = null, ratchetId = null;
        if (flags & E.F_RATCHET_MINE) {
            if (b.length < off + 32) { return null; }
            ratchetPk = b.subarray(off, off + 32); off += 32;
        }
        if (flags & E.F_RATCHET_THEIRS) {
            if (b.length < off + 4) { return null; }
            ratchetId = b.subarray(off, off + 4); off += 4;
        }
        if (b.length <= off + C.TAG) { return null; }
        return {
            raw: b,
            version: b[2],
            flags: flags,
            ttl: b[4],
            hops: b[5],
            expires: U.readU48(b, 6),
            eph: b.subarray(12, 44),
            tag: b.subarray(44, 52),
            nonce: b.subarray(52, 64),
            ratchetPk: ratchetPk,
            ratchetId: ratchetId,
            headerEnd: off,
            body: b.subarray(off),
            id: E.idOf(b)
        };
    };

    /* Identificador para descartar duplicados en la malla. Se calcula sobre
       TODO el marco menos los dos unicos bytes que cambian por el camino, el
       4 y el 5 (los saltos): dos copias del mismo sobre con distinto contador
       de saltos siguen dando el mismo id, y cualquier otro cambio da uno
       distinto.

       Antes cubria solo b[12..64] y el cuerpo, y eso dejaba fuera la caducidad
       (6-11), las banderas (3), la version (2) y las claves de trinquete que
       van detras de la cabecera. Esos bytes SI entran en el AEAD, asi que un
       relevo que tocara uno producia un marco con el MISMO identificador que ya
       no se puede abrir: al propagarse, cada nodo lo daba por visto y tiraba el
       bueno cuando llegaba despues. Cambiar la caducidad no cuesta nada -no hay
       nada que volver a calcular- asi que era la forma mas barata que existe de
       suprimir un mensaje ajeno. La regla, de una vez: lo que no es mutable
       entra en el identificador.

       Ya no hace falta decirle donde empieza el cuerpo: todo lo que va detras
       del byte 6 entra, empiece donde empiece. */
    E.idOf = function (b) {
        var h = C.sha256(b.subarray(0, 4), b.subarray(6));
        return U.toHex(h.subarray(0, 12));
    };

    /* Abrir. opts: mySk, pairSecret, ratchetSecret (ya calculado o nulo). */
    E.open = function (env, opts) {
        var ikm;
        try {
            ikm = U.concat([
                C.x25519(opts.mySk, env.eph),
                opts.pairSecret,
                opts.ratchetSecret || new Uint8Array(0)
            ]);
        } catch (e) { return null; }
        var k = C.hkdf(ikm, env.eph, 'bintio/env/v1', 32);
        U.wipe(ikm);
        var head = env.raw.subarray(0, env.headerEnd);
        var out = C.open(k, env.nonce, aadOf(head), env.body);
        U.wipe(k);
        return out;
    };

    /* Marca de un salto mas. Devuelve false si el sobre ya no debe seguir. */
    E.hop = function (b) {
        if (b[4] === 0) { return false; }
        b[4] = b[4] - 1;
        b[5] = Math.min(255, b[5] + 1);
        return b[4] > 0;
    };

    E.isExpired = function (env, nowSeconds) {
        return env.expires < (nowSeconds || Math.floor(U.now() / 1000));
    };
})(BINTIO);
