/* ==========================================================================
   X25519 (RFC 7748) — acuerdo de claves Diffie-Hellman sobre Curve25519.
   Implementacion de campo con 16 miembros de 16 bits sobre Float64Array,
   la misma estructura que usa TweetNaCl: cabe en la mantissa de un double
   y por eso funciona igual en cualquier motor de JavaScript, viejo o nuevo.
   Verificado contra los vectores de la RFC en test/crypto.test.js.
   ========================================================================== */
(function (V) {
    'use strict';
    var C = V.crypto;

    function gf(init) {
        var r = new Float64Array(16);
        if (init) { for (var i = 0; i < init.length; i++) { r[i] = init[i]; } }
        return r;
    }
    var _121665 = gf([0xDB41, 1]);

    function car(o) {
        var i, v, c = 1;
        for (i = 0; i < 16; i++) {
            v = o[i] + c + 65535;
            c = Math.floor(v / 65536);
            o[i] = v - c * 65536;
        }
        o[0] += c - 1 + 37 * (c - 1);
    }
    /* Intercambio condicional sin ramas: el tiempo no depende del bit. */
    function sel(p, q, b) {
        var t, c = ~(b - 1);
        for (var i = 0; i < 16; i++) { t = c & (p[i] ^ q[i]); p[i] ^= t; q[i] ^= t; }
    }
    function pack(o, n) {
        var i, j, b, m = gf(), t = gf();
        for (i = 0; i < 16; i++) { t[i] = n[i]; }
        car(t); car(t); car(t);
        for (j = 0; j < 2; j++) {
            m[0] = t[0] - 0xffed;
            for (i = 1; i < 15; i++) {
                m[i] = t[i] - 0xffff - ((m[i - 1] >> 16) & 1);
                m[i - 1] &= 0xffff;
            }
            m[15] = t[15] - 0x7fff - ((m[14] >> 16) & 1);
            b = (m[15] >> 16) & 1;
            m[14] &= 0xffff;
            sel(t, m, 1 - b);
        }
        for (i = 0; i < 16; i++) { o[2 * i] = t[i] & 0xff; o[2 * i + 1] = t[i] >> 8; }
    }
    function unpack(o, n) {
        for (var i = 0; i < 16; i++) { o[i] = n[2 * i] + (n[2 * i + 1] << 8); }
        o[15] &= 0x7fff;
    }
    function A(o, a, b) { for (var i = 0; i < 16; i++) { o[i] = a[i] + b[i]; } }
    function Z(o, a, b) { for (var i = 0; i < 16; i++) { o[i] = a[i] - b[i]; } }
    function M(o, a, b) {
        var i, j, t = new Float64Array(31);
        for (i = 0; i < 16; i++) { for (j = 0; j < 16; j++) { t[i + j] += a[i] * b[j]; } }
        for (i = 0; i < 15; i++) { t[i] += 38 * t[i + 16]; }
        for (i = 0; i < 16; i++) { o[i] = t[i]; }
        car(o); car(o);
    }
    function S(o, a) { M(o, a, a); }
    function inv(o, i) {
        var c = gf(), a;
        for (a = 0; a < 16; a++) { c[a] = i[a]; }
        for (a = 253; a >= 0; a--) {
            S(c, c);
            if (a !== 2 && a !== 4) { M(c, c, i); }
        }
        for (a = 0; a < 16; a++) { o[a] = c[a]; }
    }

    function scalarmult(q, n, p) {
        var z = new Uint8Array(32), x = new Float64Array(80), r, i;
        var a = gf(), b = gf(), c = gf(), d = gf(), e = gf(), f = gf();
        for (i = 0; i < 31; i++) { z[i] = n[i]; }
        z[31] = (n[31] & 127) | 64;
        z[0] &= 248;
        unpack(x, p);
        for (i = 0; i < 16; i++) { b[i] = x[i]; d[i] = a[i] = c[i] = 0; }
        a[0] = d[0] = 1;
        for (i = 254; i >= 0; --i) {
            r = (z[i >>> 3] >>> (i & 7)) & 1;
            sel(a, b, r); sel(c, d, r);
            A(e, a, c); Z(a, a, c); A(c, b, d); Z(b, b, d);
            S(d, e); S(f, a); M(a, c, a); M(c, b, e);
            A(e, a, c); Z(a, a, c); S(b, a); Z(c, d, f);
            M(a, c, _121665); A(a, a, d); M(c, c, a); M(a, d, f);
            M(d, b, x); S(b, e);
            sel(a, b, r); sel(c, d, r);
        }
        for (i = 0; i < 16; i++) { x[i + 16] = a[i]; x[i + 32] = c[i]; x[i + 48] = b[i]; x[i + 64] = d[i]; }
        var x32 = x.subarray(32), x16 = x.subarray(16);
        inv(x32, x32);
        M(x16, x16, x32);
        pack(q, x16);
        return q;
    }

    var BASE = new Uint8Array(32); BASE[0] = 9;

    /* Clave privada -> clave publica. */
    C.x25519base = function (sk) { return scalarmult(new Uint8Array(32), sk, BASE); };

    /* Secreto compartido. Rechaza el resultado todo-ceros (punto de orden
       pequeno): si eso pasa, el otro extremo envio una clave invalida. */
    C.x25519 = function (sk, pk) {
        var out = scalarmult(new Uint8Array(32), sk, pk);
        var zero = 0;
        for (var i = 0; i < 32; i++) { zero |= out[i]; }
        if (zero === 0) { throw new Error('x25519: clave publica invalida'); }
        return out;
    };

    /* Genera un par de claves nuevo. El "clamping" lo aplica scalarmult. */
    C.keypair = function () {
        var sk = C.random(32);
        return { sk: sk, pk: C.x25519base(sk) };
    };
    C.keypairFromSeed = function (seed32) {
        var sk = new Uint8Array(seed32);
        sk[0] &= 248; sk[31] &= 127; sk[31] |= 64;
        return { sk: sk, pk: C.x25519base(sk) };
    };
})(BINTIO);
