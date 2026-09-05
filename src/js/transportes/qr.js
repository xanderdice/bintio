/* ==========================================================================
   Generador de codigos QR (modo binario, versiones 1 a 40).

   Esta aqui porque dos moviles tienen que poder quedar conectados mirandose
   la pantalla: sin nube, sin cable y sin escribir nada. WebRTC necesita
   oferta Y respuesta, asi que un codigo que viaja en un solo sentido no
   basta; hacen falta dos, uno con la invitacion y otro con la respuesta. Ese
   es el minimo fisico y no se puede bajar de ahi.

   Llega hasta la version 40 porque una invitacion no es una tarjeta. La
   tarjeta de contacto ronda los 90 bytes y cabia de sobra en la version 10.
   La invitacion lleva ademas la descripcion de sesion entera: unos 530 bytes,
   que piden version 16 en nivel L o 18 en nivel M. Mientras la tabla se
   quedaba en la version 10 el generador se negaba a pintar justo lo unico que
   hacia falta pintar, y el usuario acababa copiando texto a mano.

   Solo modo binario. No hay modo numerico ni alfanumerico y no hacen falta:
   los codigos de BINTIO llevan minusculas, y el modo binario acepta
   cualquier texto UTF-8. Cuesta algun modulo de mas frente a un codificador
   que parte el texto en tramos, y a cambio este fichero cabe en una cabeza.

   Devuelve una matriz de ceros y unos. Pintarla es cosa de la interfaz.
   Comprobado modulo a modulo contra una implementacion de referencia en
   test/qr.test.js, en las cuarenta versiones y en los cuatro niveles.
   ========================================================================== */
(function (V) {
    'use strict';
    var Q = V.qr;

    var MAX_VERSION = 40;

    /* ---------------------------------------------------------------------
       Aritmetica del campo de Galois GF(256), polinomio 0x11d.
       --------------------------------------------------------------------- */
    var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
    (function () {
        var x = 1;
        for (var i = 0; i < 255; i++) {
            EXP[i] = x;
            LOG[x] = i;
            x <<= 1;
            if (x & 0x100) { x ^= 0x11d; }
        }
        for (var j = 255; j < 512; j++) { EXP[j] = EXP[j - 255]; }
    })();

    function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

    /* Polinomio generador de n palabras de correccion: el producto de
       (x - alfa^i). Se guarda del coeficiente de mayor grado al menor, y el
       primero vale siempre 1; la division de abajo cuenta con ello. */
    function generator(n) {
        var poly = [1];
        for (var i = 0; i < n; i++) {
            var next = new Array(poly.length + 1);
            for (var j = 0; j < next.length; j++) { next[j] = 0; }
            for (var k = 0; k < poly.length; k++) {
                next[k] ^= poly[k];                      /* multiplicar por x */
                next[k + 1] ^= mul(poly[k], EXP[i]);     /* y por alfa^i */
            }
            poly = next;
        }
        return poly;
    }

    /* Los generadores se reutilizan mucho: una version 40 pide el mismo
       polinomio una vez por bloque, y hay hasta 81 bloques. */
    var GEN_CACHE = {};
    function generatorFor(n) {
        if (!GEN_CACHE[n]) { GEN_CACHE[n] = generator(n); }
        return GEN_CACHE[n];
    }

    function ecCodewords(data, n) {
        var gen = generatorFor(n);
        var res = new Array(data.length + n);
        var i;
        for (i = 0; i < data.length; i++) { res[i] = data[i]; }
        for (i = data.length; i < res.length; i++) { res[i] = 0; }
        for (i = 0; i < data.length; i++) {
            var factor = res[i];
            if (factor === 0) { continue; }
            for (var j = 0; j < gen.length; j++) { res[i + j] ^= mul(gen[j], factor); }
        }
        return res.slice(data.length);
    }

    /* ---------------------------------------------------------------------
       Tablas del estandar ISO/IEC 18004, tabla 9. Estan enteras, las cuarenta
       versiones y los cuatro niveles, porque una invitacion no cabe en las
       primeras y porque el nivel se elige segun el tamano del codigo.

       Cada fila: [palabras de correccion por bloque,
                   bloques grupo 1, datos por bloque grupo 1,
                   bloques grupo 2, datos por bloque grupo 2]
       El grupo 2, cuando existe, lleva exactamente un dato mas por bloque:
       el estandar reparte los datos entre los bloques lo mas parejo posible.
       Equivocarse en un solo numero cambia la matriz entera, y la prueba lo
       canta al compararla con la referencia.
       --------------------------------------------------------------------- */
    var BLOCKS = {
        L: [null,
            [7, 1, 19, 0, 0], [10, 1, 34, 0, 0], [15, 1, 55, 0, 0], [20, 1, 80, 0, 0],
            [26, 1, 108, 0, 0], [18, 2, 68, 0, 0], [20, 2, 78, 0, 0], [24, 2, 97, 0, 0],
            [30, 2, 116, 0, 0], [18, 2, 68, 2, 69],
            [20, 4, 81, 0, 0], [24, 2, 92, 2, 93], [26, 4, 107, 0, 0], [30, 3, 115, 1, 116],
            [22, 5, 87, 1, 88], [24, 5, 98, 1, 99], [28, 1, 107, 5, 108], [30, 5, 120, 1, 121],
            [28, 3, 113, 4, 114], [28, 3, 107, 5, 108],
            [28, 4, 116, 4, 117], [28, 2, 111, 7, 112], [30, 4, 121, 5, 122], [30, 6, 117, 4, 118],
            [26, 8, 106, 4, 107], [28, 10, 114, 2, 115], [30, 8, 122, 4, 123], [30, 3, 117, 10, 118],
            [30, 7, 116, 7, 117], [30, 5, 115, 10, 116],
            [30, 13, 115, 3, 116], [30, 17, 115, 0, 0], [30, 17, 115, 1, 116], [30, 13, 115, 6, 116],
            [30, 12, 121, 7, 122], [30, 6, 121, 14, 122], [30, 17, 122, 4, 123], [30, 4, 122, 18, 123],
            [30, 20, 117, 4, 118], [30, 19, 118, 6, 119]],
        M: [null,
            [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0],
            [24, 2, 43, 0, 0], [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39],
            [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
            [30, 1, 50, 4, 51], [22, 6, 36, 2, 37], [22, 8, 37, 1, 38], [24, 4, 40, 5, 41],
            [24, 5, 41, 5, 42], [28, 7, 45, 3, 46], [28, 10, 46, 1, 47], [26, 9, 43, 4, 44],
            [26, 3, 44, 11, 45], [26, 3, 41, 13, 42],
            [26, 17, 42, 0, 0], [28, 17, 46, 0, 0], [28, 4, 47, 14, 48], [28, 6, 45, 14, 46],
            [28, 8, 47, 13, 48], [28, 19, 46, 4, 47], [28, 22, 45, 3, 46], [28, 3, 45, 23, 46],
            [28, 21, 45, 7, 46], [28, 19, 47, 10, 48],
            [28, 2, 46, 29, 47], [28, 10, 46, 23, 47], [28, 14, 46, 21, 47], [28, 14, 46, 23, 47],
            [28, 12, 47, 26, 48], [28, 6, 47, 34, 48], [28, 29, 46, 14, 47], [28, 13, 46, 32, 47],
            [28, 40, 47, 7, 48], [28, 18, 47, 31, 48]],
        Q: [null,
            [13, 1, 13, 0, 0], [22, 1, 22, 0, 0], [18, 2, 17, 0, 0], [26, 2, 24, 0, 0],
            [18, 2, 15, 2, 16], [24, 4, 19, 0, 0], [18, 2, 14, 4, 15], [22, 4, 18, 2, 19],
            [20, 4, 16, 4, 17], [24, 6, 19, 2, 20],
            [28, 4, 22, 4, 23], [26, 4, 20, 6, 21], [24, 8, 20, 4, 21], [20, 11, 16, 5, 17],
            [30, 5, 24, 7, 25], [24, 15, 19, 2, 20], [28, 1, 22, 15, 23], [28, 17, 22, 1, 23],
            [26, 17, 21, 4, 22], [30, 15, 24, 5, 25],
            [28, 17, 22, 6, 23], [30, 7, 24, 16, 25], [30, 11, 24, 14, 25], [30, 11, 24, 16, 25],
            [30, 7, 24, 22, 25], [28, 28, 22, 6, 23], [30, 8, 23, 26, 24], [30, 4, 24, 31, 25],
            [30, 1, 23, 37, 24], [30, 15, 24, 25, 25],
            [30, 42, 24, 1, 25], [30, 10, 24, 35, 25], [30, 29, 24, 19, 25], [30, 44, 24, 7, 25],
            [30, 39, 24, 14, 25], [30, 46, 24, 10, 25], [30, 49, 24, 10, 25], [30, 48, 24, 14, 25],
            [30, 43, 24, 22, 25], [30, 34, 24, 34, 25]],
        H: [null,
            [17, 1, 9, 0, 0], [28, 1, 16, 0, 0], [22, 2, 13, 0, 0], [16, 4, 9, 0, 0],
            [22, 2, 11, 2, 12], [28, 4, 15, 0, 0], [26, 4, 13, 1, 14], [26, 4, 14, 2, 15],
            [24, 4, 12, 4, 13], [28, 6, 15, 2, 16],
            [24, 3, 12, 8, 13], [28, 7, 14, 4, 15], [22, 12, 11, 4, 12], [24, 11, 12, 5, 13],
            [24, 11, 12, 7, 13], [30, 3, 15, 13, 16], [28, 2, 14, 17, 15], [28, 2, 14, 19, 15],
            [26, 9, 13, 16, 14], [28, 15, 15, 10, 16],
            [30, 19, 16, 6, 17], [24, 34, 13, 0, 0], [30, 16, 15, 14, 16], [30, 30, 16, 2, 17],
            [30, 22, 15, 13, 16], [30, 33, 16, 4, 17], [30, 12, 15, 28, 16], [30, 11, 15, 31, 16],
            [30, 19, 15, 26, 16], [30, 23, 15, 25, 16],
            [30, 23, 15, 28, 16], [30, 19, 15, 35, 16], [30, 11, 15, 46, 16], [30, 59, 16, 1, 17],
            [30, 22, 15, 41, 16], [30, 2, 15, 64, 16], [30, 24, 15, 46, 16], [30, 42, 15, 32, 16],
            [30, 10, 15, 67, 16], [30, 20, 15, 61, 16]]
    };

    /* Centros de los patrones de alineacion. Son coordenadas de fila y de
       columna a la vez: el patron va en cada cruce, menos en los tres que
       pisan un patron de busqueda, que se saltan solos porque esa casilla ya
       no esta vacia. */
    var ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
        [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
        [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66],
        [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82],
        [6, 30, 58, 86], [6, 34, 62, 90],
        [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114],
        [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126],
        [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146], [6, 30, 54, 78, 102, 126, 150],
        [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158],
        [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170]];

    var EC_BITS = { L: 1, M: 0, Q: 3, H: 2 };

    function capacityBytes(version, level) {
        var b = BLOCKS[level][version];
        return b[1] * b[2] + b[3] * b[4];
    }

    /* Ancho del contador de caracteres en modo binario: 8 bits hasta la
       version 9 y 16 de la 10 en adelante. No cambia mas arriba; en modo
       binario el estandar solo tiene esos dos tramos. */
    function countBits(version) { return version < 10 ? 8 : 16; }

    /* Cuantos bytes de texto admite una version en un nivel: su capacidad
       menos los 4 bits de modo y los del contador. Sin version, la mas alta,
       que es el techo del generador entero. */
    function maxBytes(level, version) {
        var v = version || MAX_VERSION;
        return Math.floor((capacityBytes(v, level) * 8 - 4 - countBits(v)) / 8);
    }

    /* El error dice el techo real, no un numero fijo: si manana cambia la
       tabla, el mensaje cambia solo. */
    function noCabe(n, level, version) {
        return new Error('El texto no cabe en un QR: ocupa ' + n +
                         ' bytes y en la version ' + version + ' de nivel ' +
                         level + ' caben ' + maxBytes(level, version));
    }

    /* ---------------------------------------------------------------------
       Codificacion de los datos en modo binario.
       --------------------------------------------------------------------- */
    function bitBuffer() {
        return {
            bits: [],
            put: function (value, length) {
                for (var i = length - 1; i >= 0; i--) { this.bits.push((value >> i) & 1); }
            }
        };
    }

    function encodeData(bytes, version, level) {
        var buf = bitBuffer();
        buf.put(4, 4);                                   /* modo binario */
        buf.put(bytes.length, countBits(version));       /* cuenta de caracteres */
        for (var i = 0; i < bytes.length; i++) { buf.put(bytes[i], 8); }

        var total = capacityBytes(version, level) * 8;
        var pad = Math.min(4, total - buf.bits.length);
        buf.put(0, pad);                                 /* terminador */
        while (buf.bits.length % 8 !== 0) { buf.bits.push(0); }

        var out = [];
        for (var b = 0; b < buf.bits.length; b += 8) {
            var v = 0;
            for (var k = 0; k < 8; k++) { v = (v << 1) | buf.bits[b + k]; }
            out.push(v);
        }
        var padBytes = [0xEC, 0x11], p = 0;
        while (out.length < capacityBytes(version, level)) { out.push(padBytes[p++ % 2]); }
        return out;
    }

    /* Reparto en bloques y entrelazado, tal cual manda el estandar. */
    function interleave(data, version, level) {
        var spec = BLOCKS[level][version];
        var ecPer = spec[0];
        var blocks = [], ecs = [], offset = 0, i, j;

        for (i = 0; i < spec[1]; i++) {
            blocks.push(data.slice(offset, offset + spec[2]));
            offset += spec[2];
        }
        for (i = 0; i < spec[3]; i++) {
            blocks.push(data.slice(offset, offset + spec[4]));
            offset += spec[4];
        }
        for (i = 0; i < blocks.length; i++) { ecs.push(ecCodewords(blocks[i], ecPer)); }

        var out = [], maxData = Math.max(spec[2], spec[4]);
        for (j = 0; j < maxData; j++) {
            for (i = 0; i < blocks.length; i++) {
                if (j < blocks[i].length) { out.push(blocks[i][j]); }
            }
        }
        for (j = 0; j < ecPer; j++) {
            for (i = 0; i < ecs.length; i++) { out.push(ecs[i][j]); }
        }
        return out;
    }

    /* ---------------------------------------------------------------------
       Construccion de la matriz
       --------------------------------------------------------------------- */
    function newMatrix(size) {
        var m = [];
        for (var i = 0; i < size; i++) {
            m.push([]);
            for (var j = 0; j < size; j++) { m[i].push(null); }
        }
        return m;
    }

    function placeFinder(m, row, col) {
        for (var r = -1; r <= 7; r++) {
            for (var c = -1; c <= 7; c++) {
                var rr = row + r, cc = col + c;
                if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) { continue; }
                var on = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                         (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                         (r >= 2 && r <= 4 && c >= 2 && c <= 4);
                m[rr][cc] = on ? 1 : 0;
            }
        }
    }

    function placeAlignment(m, version) {
        var pos = ALIGN[version];
        for (var a = 0; a < pos.length; a++) {
            for (var b = 0; b < pos.length; b++) {
                var row = pos[a], col = pos[b];
                if (m[row][col] !== null) { continue; }
                for (var r = -2; r <= 2; r++) {
                    for (var c = -2; c <= 2; c++) {
                        var on = Math.max(Math.abs(r), Math.abs(c)) !== 1;
                        m[row + r][col + c] = on ? 1 : 0;
                    }
                }
            }
        }
    }

    function placeTiming(m) {
        for (var i = 8; i < m.length - 8; i++) {
            var v = (i % 2 === 0) ? 1 : 0;
            if (m[6][i] === null) { m[6][i] = v; }
            if (m[i][6] === null) { m[i][6] = v; }
        }
    }

    function bchFormat(data) {
        var d = data << 10;
        for (var i = 14; i >= 10; i--) {
            if ((d >> i) & 1) { d ^= 0x537 << (i - 10); }
        }
        return ((data << 10) | d) ^ 0x5412;
    }
    /* La informacion de version solo se pinta de la 7 en adelante, y el mismo
       polinomio 0x1f25 vale hasta la 40: son seis bits de version y doce de
       correccion, no dependen de lo grande que sea el codigo. */
    function bchVersion(version) {
        var d = version << 12;
        for (var i = 17; i >= 12; i--) {
            if ((d >> i) & 1) { d ^= 0x1f25 << (i - 12); }
        }
        return (version << 12) | d;
    }

    function reserveFormat(m) {
        var size = m.length, i;
        for (i = 0; i <= 8; i++) {
            if (i !== 6) { m[8][i] = m[8][i] === null ? 0 : m[8][i]; }
            if (i !== 6) { m[i][8] = m[i][8] === null ? 0 : m[i][8]; }
        }
        for (i = 0; i < 8; i++) {
            m[size - 1 - i][8] = m[size - 1 - i][8] === null ? 0 : m[size - 1 - i][8];
            m[8][size - 1 - i] = m[8][size - 1 - i] === null ? 0 : m[8][size - 1 - i];
        }
        m[size - 8][8] = 1;   /* modulo siempre negro */
    }

    function writeFormat(m, level, mask) {
        var bits = bchFormat((EC_BITS[level] << 3) | mask);
        var size = m.length, i;
        for (i = 0; i < 15; i++) {
            var bit = (bits >> i) & 1;
            /* copia vertical, arriba a la izquierda y abajo a la izquierda */
            if (i < 6) { m[i][8] = bit; }
            else if (i < 8) { m[i + 1][8] = bit; }
            else { m[size - 15 + i][8] = bit; }
            /* copia horizontal */
            if (i < 8) { m[8][size - 1 - i] = bit; }
            else if (i < 9) { m[8][15 - i - 1 + 1] = bit; }
            else { m[8][15 - i - 1] = bit; }
        }
        m[size - 8][8] = 1;
    }

    function writeVersion(m, version) {
        if (version < 7) { return; }
        var bits = bchVersion(version), size = m.length;
        for (var i = 0; i < 18; i++) {
            var bit = (bits >> i) & 1;
            var r = Math.floor(i / 3), c = i % 3;
            m[size - 11 + c][r] = bit;
            m[r][size - 11 + c] = bit;
        }
    }

    var MASKS = [
        function (i, j) { return (i + j) % 2 === 0; },
        function (i) { return i % 2 === 0; },
        function (i, j) { return j % 3 === 0; },
        function (i, j) { return (i + j) % 3 === 0; },
        function (i, j) { return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0; },
        function (i, j) { return ((i * j) % 2) + ((i * j) % 3) === 0; },
        function (i, j) { return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0; },
        function (i, j) { return (((i + j) % 2) + ((i * j) % 3)) % 2 === 0; }
    ];

    function placeData(m, codewords, mask) {
        var size = m.length, bitIndex = 0, dir = -1, row = size - 1;
        for (var col = size - 1; col > 0; col -= 2) {
            if (col === 6) { col--; }   /* la columna de sincronismo se salta */
            while (true) {
                for (var k = 0; k < 2; k++) {
                    var c = col - k;
                    if (m[row][c] === null) {
                        var bit = 0;
                        if (bitIndex < codewords.length * 8) {
                            bit = (codewords[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1;
                        }
                        bitIndex++;
                        if (MASKS[mask](row, c)) { bit ^= 1; }
                        m[row][c] = bit;
                    }
                }
                row += dir;
                if (row < 0 || row >= size) { row -= dir; dir = -dir; break; }
            }
        }
    }

    /* Penalizacion del estandar: sirve para elegir la mascara que mejor se
       lee, no para nada mas.

       La cuarta regla, la de la proporcion de negro, va escrita como la
       escribe el paquete de referencia y no como la enuncia el estandar: las
       dos se separan cuando el negro pasa del cincuenta por ciento sin llegar
       al cincuenta y cinco. La diferencia solo cambia que mascara gana, en
       dos de cada trescientos codigos medidos. Elegir una mascara u otra no
       hace el codigo mas ni menos valido -las dos se leen igual, y la que se
       use va escrita en la informacion de formato-, pero solo una de las dos
       formulas permite comparar la matriz entera con la referencia, y esa
       comparacion es la unica prueba de verdad que tiene este fichero. Entre
       una preferencia estetica y poder demostrar que las tablas estan bien,
       se prefiere lo segundo. */
    function penalty(m) {
        var size = m.length, score = 0, i, j, run, dark = 0;

        for (i = 0; i < size; i++) {
            run = 1;
            for (j = 1; j < size; j++) {
                if (m[i][j] === m[i][j - 1]) { run++; }
                else { if (run >= 5) { score += 3 + (run - 5); } run = 1; }
            }
            if (run >= 5) { score += 3 + (run - 5); }
        }
        for (j = 0; j < size; j++) {
            run = 1;
            for (i = 1; i < size; i++) {
                if (m[i][j] === m[i - 1][j]) { run++; }
                else { if (run >= 5) { score += 3 + (run - 5); } run = 1; }
            }
            if (run >= 5) { score += 3 + (run - 5); }
        }
        for (i = 0; i < size - 1; i++) {
            for (j = 0; j < size - 1; j++) {
                var s = m[i][j] + m[i][j + 1] + m[i + 1][j] + m[i + 1][j + 1];
                if (s === 0 || s === 4) { score += 3; }
            }
        }
        /* 1:1:3:1:1 con cuatro modulos claros a un lado: los once bits
           0x5D0 y 0x05D, buscados a la vez por filas y por columnas. */
        var bitsRow, bitsCol;
        for (i = 0; i < size; i++) {
            bitsRow = 0;
            bitsCol = 0;
            for (j = 0; j < size; j++) {
                bitsRow = ((bitsRow << 1) & 0x7FF) | m[i][j];
                bitsCol = ((bitsCol << 1) & 0x7FF) | m[j][i];
                if (j >= 10) {
                    if (bitsRow === 0x5D0 || bitsRow === 0x05D) { score += 40; }
                    if (bitsCol === 0x5D0 || bitsCol === 0x05D) { score += 40; }
                }
            }
        }
        for (i = 0; i < size; i++) {
            for (j = 0; j < size; j++) { dark += m[i][j]; }
        }
        var percent = (dark * 100) / (size * size);
        score += 10 * Math.abs(Math.ceil(percent / 5) - 10);
        return score;
    }

    /* ---------------------------------------------------------------------
       Punto de entrada.
       Devuelve {size, modules} con modules[fila][columna] a 0 o 1.
       --------------------------------------------------------------------- */
    Q.encode = function (text, opts) {
        opts = opts || {};
        var level = opts.level || 'M';
        if (!BLOCKS[level]) { throw new Error('Nivel de correccion desconocido: ' + level); }
        var bytes = V.util.fromString(String(text));

        var version = opts.version || 0;
        if (version) {
            if (version < 1 || version > MAX_VERSION) {
                throw new Error('Version de QR fuera de rango: ' + version);
            }
            /* Con la version impuesta a mano nadie comprueba que quepa: sin
               esto el relleno se sale de los bloques y sale una matriz que
               parece un QR y no lo es. */
            if (bytes.length > maxBytes(level, version)) { throw noCabe(bytes.length, level, version); }
        } else {
            for (var v = 1; v <= MAX_VERSION; v++) {
                /* 4 bits de modo + la cuenta de caracteres + los datos */
                var needed = 4 + countBits(v) + bytes.length * 8;
                if (needed <= capacityBytes(v, level) * 8) { version = v; break; }
            }
            if (!version) { throw noCabe(bytes.length, level, MAX_VERSION); }
        }

        var codewords = interleave(encodeData(bytes, version, level), version, level);
        var size = version * 4 + 17;

        var first = opts.mask === undefined ? 0 : opts.mask;
        var last = opts.mask === undefined ? 7 : opts.mask;
        /* La mejor hasta ahora va junta en un objeto y no en tres variables
           sueltas: las tres cambian siempre a la vez y separadas invitan a
           actualizar dos y olvidar la tercera. */
        var best = { score: Infinity, modules: null, mask: first };
        for (var mask = first; mask <= last; mask++) {
            var m = newMatrix(size);
            placeFinder(m, 0, 0);
            placeFinder(m, size - 7, 0);
            placeFinder(m, 0, size - 7);
            placeAlignment(m, version);
            placeTiming(m);
            reserveFormat(m);
            writeVersion(m, version);
            placeData(m, codewords, mask);
            writeFormat(m, level, mask);
            var s = penalty(m);
            if (s < best.score) { best.score = s; best.modules = m; best.mask = mask; }
        }
        return { size: size, version: version, level: level,
                 mask: best.mask, modules: best.modules };
    };

    /* Cuanto texto admite un nivel, entero o por version. Sirve para saber si
       algo se puede ensenar como codigo antes de intentarlo, y para que la
       prueba pueda fabricar textos que llenan cada version al ras. */
    Q.maxBytes = maxBytes;
    Q.maxVersion = MAX_VERSION;
})(BINTIO);
