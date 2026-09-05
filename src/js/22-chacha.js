/* ==========================================================================
   ChaCha20 (RFC 8439) — cifrado de flujo.
   Se usa junto a HMAC-SHA256 en modo "cifrar y despues autenticar"
   (Encrypt-then-MAC). Esa combinacion se eligio en lugar de Poly1305 porque
   con las dos primitivas que ya tenemos verificadas contra vectores oficiales
   cubrimos el mismo objetivo con la mitad de codigo que mantener.
   ========================================================================== */
(function (V) {
    'use strict';
    var C = V.crypto;

    /* Genera un bloque de 64 bytes de flujo. state: Int32Array(16). */
    function core(out, key, nonce, counter) {
        var x = new Int32Array(16), i;
        x[0] = 0x61707865; x[1] = 0x3320646e; x[2] = 0x79622d32; x[3] = 0x6b206574;
        for (i = 0; i < 8; i++) {
            x[4 + i] = key[i * 4] | (key[i * 4 + 1] << 8) | (key[i * 4 + 2] << 16) | (key[i * 4 + 3] << 24);
        }
        x[12] = counter | 0;
        for (i = 0; i < 3; i++) {
            x[13 + i] = nonce[i * 4] | (nonce[i * 4 + 1] << 8) | (nonce[i * 4 + 2] << 16) | (nonce[i * 4 + 3] << 24);
        }
        var w = new Int32Array(16);
        for (i = 0; i < 16; i++) { w[i] = x[i]; }

        function qr(a, b, c, d) {
            w[a] = (w[a] + w[b]) | 0; w[d] ^= w[a]; w[d] = (w[d] << 16) | (w[d] >>> 16);
            w[c] = (w[c] + w[d]) | 0; w[b] ^= w[c]; w[b] = (w[b] << 12) | (w[b] >>> 20);
            w[a] = (w[a] + w[b]) | 0; w[d] ^= w[a]; w[d] = (w[d] << 8) | (w[d] >>> 24);
            w[c] = (w[c] + w[d]) | 0; w[b] ^= w[c]; w[b] = (w[b] << 7) | (w[b] >>> 25);
        }
        for (i = 0; i < 10; i++) {
            qr(0, 4, 8, 12); qr(1, 5, 9, 13); qr(2, 6, 10, 14); qr(3, 7, 11, 15);
            qr(0, 5, 10, 15); qr(1, 6, 11, 12); qr(2, 7, 8, 13); qr(3, 4, 9, 14);
        }
        for (i = 0; i < 16; i++) {
            var v = (w[i] + x[i]) | 0;
            out[i * 4] = v & 255; out[i * 4 + 1] = (v >>> 8) & 255;
            out[i * 4 + 2] = (v >>> 16) & 255; out[i * 4 + 3] = (v >>> 24) & 255;
        }
    }

    /* XOR del mensaje con el flujo. Cifrar y descifrar son la misma funcion. */
    C.chacha20 = function (key, nonce, data, counter) {
        var out = new Uint8Array(data.length);
        var block = new Uint8Array(64);
        var c = counter === undefined ? 1 : counter;
        for (var off = 0; off < data.length; off += 64) {
            core(block, key, nonce, c++);
            var n = Math.min(64, data.length - off);
            for (var i = 0; i < n; i++) { out[off + i] = data[off + i] ^ block[i]; }
        }
        V.util.wipe(block);
        return out;
    };

    C.chachaBlock = function (key, nonce, counter) {
        var b = new Uint8Array(64);
        core(b, key, nonce, counter);
        return b;
    };
})(BINTIO);
