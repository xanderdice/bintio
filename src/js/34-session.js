/* ==========================================================================
   Sesion: convierte "quiero decirle esto a Ana" en un sobre, y un sobre
   recibido en "esto lo dijo Ana".

   Aqui vive el trinquete (ratchet): cada contacto tiene un par de claves
   rotatorio. Cuando llega un mensaje con una clave de trinquete nueva del
   otro lado, generamos una propia nueva. Las viejas se conservan solo unas
   pocas rotaciones y luego se borran; a partir de ahi esos mensajes no se
   pueden descifrar ni robando la clave estatica del aparato. Eso es el
   secreto futuro, y es la razon de existir de este fichero.

   Contenido descifrado de un sobre:
     0      tipo
     1-6    marca de tiempo (segundos unix)
     7-14   identificador de mensaje (8 bytes elegidos por el remitente)
     15..   cuerpo
   ========================================================================== */
(function (V) {
    'use strict';
    var C = V.crypto, U = V.util, E = V.envelope, K = V.contacts, S = V.session = {};

    S.T_TEXT = 1;
    S.T_RECEIPT = 2;
    S.T_PROFILE = 3;
    S.T_FILE = 4;
    S.T_PRESENCE = 5;
    S.T_TYPING = 6;      /* "esta escribiendo": caduca en segundos */
    S.T_GTEXT = 7;       /* mensaje de grupo; el cuerpo lleva la ficha */

    /* Un tipo desconocido NO es un error: una version mas nueva puede mandar
       cosas que esta no entiende, y el sobre se abre igual porque el cifrado
       no depende del tipo. Quien lo recibe simplemente no hace nada con el.
       Por eso los numeros solo crecen y ninguno se reutiliza. */

    var KEEP_RATCHET = 6;   /* cuantas claves viejas se guardan por contacto */

    function ratchetId(pk) {
        return C.sha256(U.fromString('bintio/rk/v1'), pk).subarray(0, 4);
    }

    function newRatchetKey() {
        var kp = C.keypair();
        return {
            sk: U.toHex(kp.sk),
            pk: U.toHex(kp.pk),
            id: U.toHex(ratchetId(kp.pk)),
            at: U.now()
        };
    }

    /* Par de trinquete propio actual para ese contacto (lo crea si falta). */
    function myRatchet(contact) {
        if (!contact.ratchet) { contact.ratchet = { mine: [], theirs: null }; }
        if (!contact.ratchet.mine.length) {
            contact.ratchet.mine.unshift(newRatchetKey());
            V.vault.save();
        }
        return contact.ratchet.mine[0];
    }

    function findMyRatchet(contact, idHex) {
        var m = (contact.ratchet && contact.ratchet.mine) || [];
        for (var i = 0; i < m.length; i++) {
            if (m[i].id === idHex) { return m[i]; }
        }
        return null;
    }

    /* Giro del trinquete: solo cuando el otro publica una clave distinta a la
       que teniamos. Las mas viejas se caen del final del array y desaparecen. */
    function rotateOnNewPeerKey(contact, peerPkHex) {
        if (!contact.ratchet) { contact.ratchet = { mine: [], theirs: null }; }
        var t = contact.ratchet.theirs;
        if (t && t.pk === peerPkHex) { return false; }
        contact.ratchet.theirs = { pk: peerPkHex, at: U.now() };
        contact.ratchet.mine.unshift(newRatchetKey());
        while (contact.ratchet.mine.length > KEEP_RATCHET) { contact.ratchet.mine.pop(); }
        return true;
    }

    function pack(type, mid, body) {
        var head = new Uint8Array(15);
        head[0] = type;
        head.set(U.u48(Math.floor(U.now() / 1000)), 1);
        head.set(mid, 7);
        return U.concat([head, body || new Uint8Array(0)]);
    }

    S.newMid = function () { return C.random(8); };

    /* -----------------------------------------------------------------
       Cerrar un mensaje para un contacto.
       ----------------------------------------------------------------- */
    S.seal = function (contact, type, body, mid, ttl, vida) {
        var sec = K.secrets(contact);
        var eph = C.keypair();
        var mineKey = myRatchet(contact);
        var opts = {
            ephSk: eph.sk,
            ephPk: eph.pk,
            recipPk: U.fromHex(contact.pk),
            pairSecret: sec.pair,
            payload: pack(type, mid || S.newMid(), body),
            ttl: ttl === undefined ? E.DEFAULT_TTL : ttl,
            /* Casi todo vive las 72 h de serie. Lo que solo vale AHORA -el
               "esta escribiendo"- pide una vida de segundos: asi el que lo
               reciba tarde lo tira sin mirarlo y no ocupa sitio en ninguna
               mochila del camino. */
            lifeSeconds: vida,
            myRatchetPk: U.fromHex(mineKey.pk)
        };
        var theirs = contact.ratchet && contact.ratchet.theirs;
        if (theirs) {
            opts.theirRatchetId = ratchetId(U.fromHex(theirs.pk));
            opts.ratchetSecret = C.x25519(U.fromHex(mineKey.sk), U.fromHex(theirs.pk));
        }
        var out = E.seal(opts);
        U.wipe(eph.sk);
        return out;
    };

    /* -----------------------------------------------------------------
       Intentar abrir un sobre con cada contacto conocido. La etiqueta de 8
       bytes descarta el 99,99% sin hacer criptografia cara: solo cuando
       coincide se intenta descifrar de verdad.
       Devuelve {contact, type, ts, mid, body} o null si no es para nosotros.
       ----------------------------------------------------------------- */
    S.open = function (env) {
        var list = K.all();
        for (var i = 0; i < list.length; i++) {
            var contact = list[i];
            var sec;
            try { sec = K.secrets(contact); } catch (e) { continue; }
            if (!U.equal(E.tagFor(sec.tagKey, env.eph), env.tag)) { continue; }

            var ratchetSecret = null;
            if (env.ratchetPk && env.ratchetId) {
                var mineKey = findMyRatchet(contact, U.toHex(env.ratchetId));
                if (mineKey) {
                    try { ratchetSecret = C.x25519(U.fromHex(mineKey.sk), env.ratchetPk); }
                    catch (e) { ratchetSecret = null; }
                }
            }
            var plain = E.open(env, {
                mySk: K.me().sk,
                pairSecret: sec.pair,
                ratchetSecret: ratchetSecret
            });
            /* Un sobre puede llegar por dos caminos con y sin trinquete util;
               si con el secreto de trinquete no abre, se prueba sin el. */
            if (!plain && ratchetSecret) {
                plain = E.open(env, { mySk: K.me().sk, pairSecret: sec.pair, ratchetSecret: null });
            }
            if (!plain) { continue; }
            if (plain.length < 15) { continue; }

            if (env.ratchetPk) {
                if (rotateOnNewPeerKey(contact, U.toHex(env.ratchetPk))) { V.vault.save(); }
            }
            /* "Visto" es la hora que trae el sobre, no la de ahora.

               Un sobre se puede abrir horas despues de llegar: estaba en la
               mochila y no se reconocia hasta dar de alta a esa persona. Con
               U.now() ese repaso pintaba el punto verde de "en linea" a
               alguien que escribio anoche y lleva desde entonces desconectado.
               Se limita a ahora -nadie se conecta en el futuro- y no puede ir
               hacia atras, para que un sobre viejo que llega tarde no borre
               una conexion mas reciente. */
            var visto = U.readU48(plain, 1) * 1000;
            if (!visto || visto > U.now()) { visto = U.now(); }
            if (visto > (contact.lastSeen || 0)) { contact.lastSeen = visto; }
            /* Ha llegado algo suyo y se ha podido abrir. Eso demuestra dos
               cosas a la vez: que esta persona nos tiene dados de alta (si no,
               no habria sabido a quien sellar) y que hay camino. Hasta que
               pasa, la conversacion lo dice, porque un contacto anadido a
               medias no recibe nada y no hay forma de adivinarlo. */
            contact.mutuo = true;

            return {
                contact: contact,
                type: plain[0],
                ts: U.readU48(plain, 1) * 1000,
                mid: U.toHex(plain.subarray(7, 15)),
                body: plain.subarray(15)
            };
        }
        return null;
    };
})(BINTIO);
