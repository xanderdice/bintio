/* ==========================================================================
   Aleatoriedad y "caja" autenticada.

   AVISO DE SEGURIDAD: si el navegador no ofrece un generador aleatorio
   criptografico, la aplicacion NO arranca. Nunca se cae a Math.random:
   eso convertiria el cifrado en decoracion.
   ========================================================================== */
(function (V) {
    'use strict';
    var C = V.crypto, U = V.util;

    var src = null;
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        src = function (b) { crypto.getRandomValues(b); };
    } else if (typeof window !== 'undefined' && window.msCrypto && window.msCrypto.getRandomValues) {
        src = function (b) { window.msCrypto.getRandomValues(b); };
    }

    C.hasRandom = !!src;

    C.random = function (n) {
        if (!src) { throw new Error('Este navegador no tiene generador aleatorio seguro'); }
        var b = new Uint8Array(n);
        /* getRandomValues limita a 65536 bytes por llamada. */
        for (var off = 0; off < n; off += 65536) {
            src(b.subarray(off, Math.min(n, off + 65536)));
        }
        return b;
    };
    C.randomHex = function (n) { return U.toHex(C.random(n)); };

    C.NONCE = 12;
    C.TAG = 16;

    /* Cifra y autentica. Devuelve ct||tag. El nonce viaja fuera (en la
       cabecera del sobre) porque tambien entra en la autenticacion.
       De cada nonce se derivan subclaves nuevas, asi que dos mensajes nunca
       comparten el flujo aunque la clave maestra se repita. */
    C.seal = function (key32, nonce12, aad, plain) {
        var sub = C.hkdf(key32, nonce12, 'bintio/aead/v1', 64);
        var enc = sub.subarray(0, 32), mk = sub.subarray(32, 64);
        var ct = C.chacha20(enc, nonce12, plain);
        var tag = C.hmac(mk, U.concat([U.u32(aad ? aad.length : 0), aad || new Uint8Array(0), nonce12, ct]));
        U.wipe(sub);
        return U.concat([ct, tag.subarray(0, C.TAG)]);
    };

    /* Devuelve null si la autenticacion falla. Nunca lanza por datos
       manipulados: quien llama decide que hacer con un sobre invalido. */
    C.open = function (key32, nonce12, aad, sealed) {
        if (!sealed || sealed.length < C.TAG) { return null; }
        var ct = sealed.subarray(0, sealed.length - C.TAG);
        var tag = sealed.subarray(sealed.length - C.TAG);
        var sub = C.hkdf(key32, nonce12, 'bintio/aead/v1', 64);
        var enc = sub.subarray(0, 32), mk = sub.subarray(32, 64);
        var expect = C.hmac(mk, U.concat([U.u32(aad ? aad.length : 0), aad || new Uint8Array(0), nonce12, ct]));
        if (!U.equal(expect.subarray(0, C.TAG), tag)) { U.wipe(sub); return null; }
        var out = C.chacha20(enc, nonce12, ct);
        U.wipe(sub);
        return out;
    };
})(BINTIO);
