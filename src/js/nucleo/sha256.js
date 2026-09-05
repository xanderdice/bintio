/* ==========================================================================
   SHA-256 en JavaScript puro (FIPS 180-4).
   Sincrono a proposito: WebCrypto es asincrono y no existe en file:// en
   algunos navegadores. Aqui la velocidad no importa (mensajes de texto).
   Verificado contra los vectores de FIPS en test/crypto.test.js.
   ========================================================================== */
(function (V) {
    'use strict';

    var K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    function Sha256() {
        this.h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        this.buf = new Uint8Array(64);
        this.n = 0;      /* bytes en buf */
        this.len = 0;    /* total procesado */
        this.w = new Int32Array(64);
    }

    Sha256.prototype.block = function (p, off) {
        var w = this.w, h = this.h, i, t1, t2, s0, s1, ch, maj;
        for (i = 0; i < 16; i++) {
            w[i] = (p[off + i * 4] << 24) | (p[off + i * 4 + 1] << 16) | (p[off + i * 4 + 2] << 8) | p[off + i * 4 + 3];
        }
        for (i = 16; i < 64; i++) {
            var x = w[i - 15], y = w[i - 2];
            s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
            s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
        for (i = 0; i < 64; i++) {
            s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            ch = (e & f) ^ (~e & g);
            t1 = (hh + s1 + ch + K[i] + w[i]) | 0;
            s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            maj = (a & b) ^ (a & c) ^ (b & c);
            t2 = (s0 + maj) | 0;
            hh = g; g = f; f = e; e = (d + t1) | 0;
            d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
        h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    };

    Sha256.prototype.update = function (data) {
        var i = 0;
        this.len += data.length;
        if (this.n > 0) {
            while (i < data.length && this.n < 64) { this.buf[this.n++] = data[i++]; }
            if (this.n === 64) { this.block(this.buf, 0); this.n = 0; }
        }
        while (i + 64 <= data.length) { this.block(data, i); i += 64; }
        while (i < data.length) { this.buf[this.n++] = data[i++]; }
        return this;
    };

    Sha256.prototype.digest = function () {
        var bits = this.len * 8;
        var pad = new Uint8Array(this.n < 56 ? 64 - this.n : 128 - this.n);
        pad[0] = 0x80;
        /* longitud en 64 bits big-endian; usamos aritmetica de coma flotante
           porque los mensajes nunca llegan a 2^53 bits. */
        var hi = Math.floor(bits / 4294967296), lo = bits >>> 0;
        var p = pad.length;
        pad[p - 8] = (hi >>> 24) & 255; pad[p - 7] = (hi >>> 16) & 255;
        pad[p - 6] = (hi >>> 8) & 255;  pad[p - 5] = hi & 255;
        pad[p - 4] = (lo >>> 24) & 255; pad[p - 3] = (lo >>> 16) & 255;
        pad[p - 2] = (lo >>> 8) & 255;  pad[p - 1] = lo & 255;
        var saved = this.len;
        this.update(pad);
        this.len = saved;
        var out = new Uint8Array(32);
        for (var i = 0; i < 8; i++) {
            out[i * 4] = (this.h[i] >>> 24) & 255;
            out[i * 4 + 1] = (this.h[i] >>> 16) & 255;
            out[i * 4 + 2] = (this.h[i] >>> 8) & 255;
            out[i * 4 + 3] = this.h[i] & 255;
        }
        return out;
    };

    V.crypto.Sha256 = Sha256;

    /* sha256(a, b, c...) concatena los argumentos sin copiarlos primero. */
    V.crypto.sha256 = function () {
        var h = new Sha256();
        for (var i = 0; i < arguments.length; i++) {
            if (arguments[i]) { h.update(arguments[i]); }
        }
        return h.digest();
    };
})(BINTIO);
