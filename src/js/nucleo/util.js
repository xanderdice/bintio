/* ==========================================================================
   Utilidades de bytes y texto. Sin dependencias, sin DOM.
   Todo lo que entra y sale de la criptografia es Uint8Array.
   ========================================================================== */
(function (V) {
    'use strict';
    var U = V.util;

    U.bytes = function (n) { return new Uint8Array(n); };

    U.concat = function (list) {
        var i, n = 0;
        for (i = 0; i < list.length; i++) { n += list[i].length; }
        var out = new Uint8Array(n), off = 0;
        for (i = 0; i < list.length; i++) { out.set(list[i], off); off += list[i].length; }
        return out;
    };

    U.slice = function (a, from, to) {
        return a.subarray(from, to === undefined ? a.length : to);
    };

    /* Comparacion en tiempo constante: nunca uses === sobre MACs. */
    U.equal = function (a, b) {
        if (!a || !b || a.length !== b.length) { return false; }
        var d = 0;
        for (var i = 0; i < a.length; i++) { d |= a[i] ^ b[i]; }
        return d === 0;
    };

    U.wipe = function (a) {
        if (a) { for (var i = 0; i < a.length; i++) { a[i] = 0; } }
        return a;
    };

    /* ---------- UTF-8 (implementado a mano: TextEncoder no existe en viejos) */
    U.fromString = function (str) {
        var out = [], i, c;
        for (i = 0; i < str.length; i++) {
            c = str.charCodeAt(i);
            if (c < 0x80) { out.push(c); }
            else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
            else if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
                var c2 = str.charCodeAt(i + 1);
                if (c2 >= 0xdc00 && c2 < 0xe000) {
                    var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
                    out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
                    i++;
                } else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
            } else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
        }
        return new Uint8Array(out);
    };

    U.toString = function (b) {
        var s = '', i = 0, c, c2, c3, c4, cp;
        while (i < b.length) {
            c = b[i++];
            if (c < 0x80) { s += String.fromCharCode(c); }
            else if (c < 0xe0) { c2 = b[i++]; s += String.fromCharCode(((c & 31) << 6) | (c2 & 63)); }
            else if (c < 0xf0) {
                c2 = b[i++]; c3 = b[i++];
                s += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
            } else {
                c2 = b[i++]; c3 = b[i++]; c4 = b[i++];
                cp = (((c & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63)) - 0x10000;
                s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023));
            }
        }
        return s;
    };

    /* ---------- HEX ---------- */
    var HEX = '0123456789abcdef';
    U.toHex = function (b) {
        var s = '';
        for (var i = 0; i < b.length; i++) { s += HEX.charAt(b[i] >> 4) + HEX.charAt(b[i] & 15); }
        return s;
    };
    U.fromHex = function (s) {
        var out = new Uint8Array(s.length >> 1);
        for (var i = 0; i < out.length; i++) { out[i] = parseInt(s.substr(i * 2, 2), 16); }
        return out;
    };

    /* ---------- BASE64URL (sin '=' ni caracteres que rompan una URL) ------- */
    var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    U.toB64 = function (b) {
        var s = '', i;
        for (i = 0; i + 2 < b.length; i += 3) {
            s += B64.charAt(b[i] >> 2);
            s += B64.charAt(((b[i] & 3) << 4) | (b[i + 1] >> 4));
            s += B64.charAt(((b[i + 1] & 15) << 2) | (b[i + 2] >> 6));
            s += B64.charAt(b[i + 2] & 63);
        }
        var rem = b.length - i;
        if (rem === 1) {
            s += B64.charAt(b[i] >> 2) + B64.charAt((b[i] & 3) << 4);
        } else if (rem === 2) {
            s += B64.charAt(b[i] >> 2);
            s += B64.charAt(((b[i] & 3) << 4) | (b[i + 1] >> 4));
            s += B64.charAt((b[i + 1] & 15) << 2);
        }
        return s;
    };
    var B64R = null;
    U.fromB64 = function (s) {
        if (!B64R) {
            B64R = {};
            for (var k = 0; k < B64.length; k++) { B64R[B64.charAt(k)] = k; }
            B64R['+'] = 62; B64R['/'] = 63; /* tolera base64 clasico */
        }
        s = s.replace(/[=\s]/g, '');
        var n = s.length, out = new Uint8Array(Math.floor(n * 3 / 4)), o = 0, i, a, b, c, d;
        for (i = 0; i + 3 < n; i += 4) {
            a = B64R[s.charAt(i)]; b = B64R[s.charAt(i + 1)];
            c = B64R[s.charAt(i + 2)]; d = B64R[s.charAt(i + 3)];
            out[o++] = (a << 2) | (b >> 4);
            out[o++] = ((b & 15) << 4) | (c >> 2);
            out[o++] = ((c & 3) << 6) | d;
        }
        var rem = n - i;
        if (rem === 2) {
            a = B64R[s.charAt(i)]; b = B64R[s.charAt(i + 1)];
            out[o++] = (a << 2) | (b >> 4);
        } else if (rem === 3) {
            a = B64R[s.charAt(i)]; b = B64R[s.charAt(i + 1)]; c = B64R[s.charAt(i + 2)];
            out[o++] = (a << 2) | (b >> 4);
            out[o++] = ((b & 15) << 4) | (c >> 2);
        }
        return out.subarray(0, o);
    };

    /* ---------- BASE32 Crockford: para codigos que un humano lee en voz alta.
       Sin I, L, O, U -> no se confunden con 1, 0 ni con palabrotas.        --- */
    var B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    U.toB32 = function (b) {
        var s = '', bits = 0, val = 0;
        for (var i = 0; i < b.length; i++) {
            val = (val << 8) | b[i]; bits += 8;
            while (bits >= 5) { s += B32.charAt((val >>> (bits - 5)) & 31); bits -= 5; }
        }
        if (bits > 0) { s += B32.charAt((val << (5 - bits)) & 31); }
        return s;
    };
    U.fromB32 = function (s) {
        s = s.toUpperCase().replace(/[^0-9A-Z]/g, '')
             .replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
        var out = [], bits = 0, val = 0;
        for (var i = 0; i < s.length; i++) {
            var v = B32.indexOf(s.charAt(i));
            if (v < 0) { continue; }
            val = (val << 5) | v; bits += 5;
            if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
        }
        return new Uint8Array(out);
    };

    /* Agrupa un texto largo en bloques legibles: XXXX-XXXX-XXXX */
    U.group = function (s, size, sep) {
        size = size || 4; sep = sep || '-';
        var out = [];
        for (var i = 0; i < s.length; i += size) { out.push(s.substr(i, size)); }
        return out.join(sep);
    };

    /* ---------- Enteros big-endian ---------- */
    U.u32 = function (n) {
        return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
    };
    U.readU32 = function (b, off) {
        return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
    };
    /* Milisegundos no caben en 32 bits: guardamos segundos. */
    U.u48 = function (n) {
        var out = new Uint8Array(6);
        for (var i = 5; i >= 0; i--) { out[i] = n % 256; n = Math.floor(n / 256); }
        return out;
    };
    U.readU48 = function (b, off) {
        var n = 0;
        for (var i = 0; i < 6; i++) { n = n * 256 + b[off + i]; }
        return n;
    };

    U.now = function () { return Date.now(); };

    /* Identificador local corto y legible, no criptografico. */
    U.rid = function () {
        return V.crypto.randomHex(8);
    };
})(BINTIO);
