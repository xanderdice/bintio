/* ==========================================================================
   HMAC-SHA256 (RFC 2104), HKDF (RFC 5869) y PBKDF2 (RFC 8018).
   PBKDF2 se usa solo para la contrasena de la boveda local.
   ========================================================================== */
(function (V) {
    'use strict';
    var C = V.crypto, U = V.util;

    C.hmac = function (key, msg) {
        var i, block = new Uint8Array(64);
        if (key.length > 64) { block.set(C.sha256(key)); }
        else { block.set(key); }
        var ipad = new Uint8Array(64), opad = new Uint8Array(64);
        for (i = 0; i < 64; i++) { ipad[i] = block[i] ^ 0x36; opad[i] = block[i] ^ 0x5c; }
        var inner = new C.Sha256().update(ipad).update(msg).digest();
        var out = new C.Sha256().update(opad).update(inner).digest();
        U.wipe(block); U.wipe(ipad); U.wipe(opad);
        return out;
    };

    /* HKDF completo: extract + expand. info identifica el uso de la clave,
       y por eso NUNCA se reutiliza la misma cadena para dos cosas distintas. */
    C.hkdf = function (ikm, salt, info, length) {
        var prk = C.hmac(salt || new Uint8Array(32), ikm);
        var infoB = typeof info === 'string' ? U.fromString(info) : info;
        var out = new Uint8Array(length), t = new Uint8Array(0), off = 0, i = 1;
        while (off < length) {
            t = C.hmac(prk, U.concat([t, infoB, new Uint8Array([i])]));
            var take = Math.min(32, length - off);
            out.set(t.subarray(0, take), off);
            off += take; i++;
        }
        U.wipe(prk);
        return out;
    };

    /* PBKDF2-HMAC-SHA256 sincrono. Con 150.000 iteraciones tarda ~1s en un
       movil modesto; es intencionado: encarece el ataque por fuerza bruta
       contra la contrasena. onProgress permite pintar una barra. */
    C.pbkdf2 = function (password, salt, iterations, length, onProgress) {
        var pw = typeof password === 'string' ? U.fromString(password) : password;
        var blocks = Math.ceil(length / 32), out = new Uint8Array(blocks * 32);
        for (var b = 1; b <= blocks; b++) {
            var u = C.hmac(pw, U.concat([salt, U.u32(b)]));
            var acc = new Uint8Array(u);
            for (var it = 1; it < iterations; it++) {
                u = C.hmac(pw, u);
                for (var k = 0; k < 32; k++) { acc[k] ^= u[k]; }
                if (onProgress && (it & 8191) === 0) {
                    onProgress(((b - 1) * iterations + it) / (blocks * iterations));
                }
            }
            out.set(acc, (b - 1) * 32);
        }
        return out.subarray(0, length);
    };

    /* La misma derivacion, sin bloquear la interfaz.

       Primero se intenta con WebCrypto, que la hace el navegador en codigo
       nativo: 150.000 vueltas pasan de siete segundos a menos de uno. Es el
       mismo algoritmo estandar, asi que da exactamente la misma clave que el
       camino de abajo (hay una prueba que lo comprueba).

       Si no hay WebCrypto se cae al bucle propio, troceado para que la
       pantalla siga respondiendo. */
    C.pbkdf2Async = function (password, salt, iterations, length, onProgress, done) {
        var subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;
        if (subtle && subtle.importKey && subtle.deriveBits) {
            var pwBytes = typeof password === 'string' ? U.fromString(password) : password;
            var saltCopy = new Uint8Array(salt);
            try {
                var promise = subtle.importKey('raw', new Uint8Array(pwBytes), { name: 'PBKDF2' }, false, ['deriveBits']);
                if (promise && promise.then) {
                    promise.then(function (key) {
                        return subtle.deriveBits(
                            { name: 'PBKDF2', salt: saltCopy, iterations: iterations, hash: 'SHA-256' },
                            key, length * 8);
                    }).then(function (bits) {
                        if (onProgress) { onProgress(1); }
                        done(new Uint8Array(bits));
                    })['catch'](function () { slowPath(); });
                    return;
                }
            } catch (e) { /* sigue por el camino lento */ }
        }
        slowPath();

        function slowPath() { C.pbkdf2Slow(password, salt, iterations, length, onProgress, done); }
    };

    /* El camino lento, expuesto aparte para poder compararlo con el rapido. */
    C.pbkdf2Slow = function (password, salt, iterations, length, onProgress, done) {
        var pw = typeof password === 'string' ? U.fromString(password) : password;
        var blocks = Math.ceil(length / 32);
        var out = new Uint8Array(blocks * 32);
        var b = 1, it = 0, u = null, acc = null;
        /* Iteraciones por tanda. Sube esto y la interfaz se traba; bajalo y
           tarda una eternidad, porque un navegador con la pestana de fondo
           estrangula setTimeout a una vez por segundo. 6000 deja tandas de
           unos 40 ms: no se nota al escribir y son solo 25 tandas. */
        var SLICE = 6000;

        function step() {
            if (u === null) {
                u = C.hmac(pw, U.concat([salt, U.u32(b)]));
                acc = new Uint8Array(u);
                it = 1;
            }
            var end = Math.min(iterations, it + SLICE);
            for (; it < end; it++) {
                u = C.hmac(pw, u);
                for (var k = 0; k < 32; k++) { acc[k] ^= u[k]; }
            }
            if (onProgress) { onProgress(((b - 1) * iterations + it) / (blocks * iterations)); }
            if (it >= iterations) {
                out.set(acc, (b - 1) * 32);
                b++; u = null;
                if (b > blocks) { done(out.subarray(0, length)); return; }
            }
            setTimeout(step, 0);
        }
        setTimeout(step, 0);
    };
})(BINTIO);
