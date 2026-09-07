/* ==========================================================================
   Codigos de enlace y tarjetas de contacto.

   BINTIO no tiene directorio ni servidor de senalizacion, asi que la unica
   manera de que dos personas se encuentren es que se pasen un texto. Ese
   texto lo genera y lo lee este fichero.

     Tarjeta de contacto   BNC1...   clave publica + nombre. Corta, cabe en
                                     un QR comodo. Sirve para anadir a
                                     alguien sin conectarse todavia.
     Invitacion            BNO1...   tarjeta + la oferta WebRTC.
     Respuesta             BNA1...   tarjeta + la respuesta WebRTC.

   Si el usuario pone una CLAVE DE ENCUENTRO, el contenido va cifrado con
   ella: un codigo interceptado por el camino no sirve de nada. Es la
   respuesta directa al unico punto debil de este esquema, que es el momento
   de intercambiar el primer codigo.

   La compresion es un LZSS clasico. No busca records: busca que un SDP de
   dos mil bytes quepa en un mensaje que se pueda pegar en cualquier sitio.
   ========================================================================== */
(function (V) {
    'use strict';
    var U = V.util, C = V.crypto, I = V.invite;

    /* ---------------------------------------------------------------------
       LZSS: literal (1 byte) o referencia (12 bits de distancia, 4 de
       longitud). Un byte de banderas cada ocho piezas.
       --------------------------------------------------------------------- */
    var WINDOW = 4096, MIN_MATCH = 3, MAX_MATCH = 18, MAX_CHAIN = 48;

    I.compress = function (src) {
        var out = [], flagPos = 0, flagBit = 0, i = 0;
        var heads = {}, chain = [];

        function key(p) { return src[p] * 65536 + src[p + 1] * 256 + src[p + 2]; }

        out.push(0); flagPos = 0; flagBit = 0;
        while (i < src.length) {
            if (flagBit === 8) { out.push(0); flagPos = out.length - 1; flagBit = 0; }
            var bestLen = 0, bestDist = 0;
            if (i + MIN_MATCH <= src.length) {
                var k = key(i), p = heads[k], hops = 0;
                while (p !== undefined && hops < MAX_CHAIN) {
                    var dist = i - p;
                    if (dist > WINDOW) { break; }
                    var len = 0;
                    while (len < MAX_MATCH && i + len < src.length && src[p + len] === src[i + len]) { len++; }
                    if (len > bestLen) { bestLen = len; bestDist = dist; }
                    if (bestLen === MAX_MATCH) { break; }
                    p = chain[p];
                    hops++;
                }
            }
            if (bestLen >= MIN_MATCH) {
                out[flagPos] |= (1 << flagBit);
                var code = ((bestDist - 1) << 4) | (bestLen - MIN_MATCH);
                out.push((code >> 8) & 255, code & 255);
                for (var n = 0; n < bestLen; n++) {
                    if (i + MIN_MATCH <= src.length) { var kk = key(i); chain[i] = heads[kk]; heads[kk] = i; }
                    i++;
                }
            } else {
                out.push(src[i]);
                if (i + MIN_MATCH <= src.length) { var k2 = key(i); chain[i] = heads[k2]; heads[k2] = i; }
                i++;
            }
            flagBit++;
        }
        return new Uint8Array(out);
    };

    I.decompress = function (src) {
        var out = [], i = 0, flags = 0, bit = 8;
        while (i < src.length) {
            if (bit === 8) { flags = src[i++]; bit = 0; if (i >= src.length) { break; } }
            if (flags & (1 << bit)) {
                var code = (src[i] << 8) | src[i + 1];
                i += 2;
                var dist = (code >> 4) + 1, len = (code & 15) + MIN_MATCH;
                var start = out.length - dist;
                if (start < 0) { return null; }
                for (var n = 0; n < len; n++) { out.push(out[start + n]); }
            } else {
                out.push(src[i++]);
            }
            bit++;
        }
        return new Uint8Array(out);
    };

    /* ---------------------------------------------------------------------
       Diccionario fijo de trozos de SDP.

       Un SDP es el mismo texto una y otra vez con cuatro numeros distintos.
       Sustituir esos trozos por un byte de control ANTES de comprimir vale
       mas que cualquier virgueria del compresor, y se entiende de un
       vistazo. Los codigos van del 1 al 31 saltandose 10 y 13, que son el
       salto de linea y el retorno de carro y si aparecen de verdad.

       Anadir una linea a esta tabla cambia los codigos que genera esta
       version, asi que si algun dia se toca, hay que subir el prefijo
       (BNO1 -> BNO2) para no confundir a versiones viejas.
       --------------------------------------------------------------------- */
    var DICT = [
        'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
        'v=0\r\no=- ',
        ' IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n',
        '\r\na=candidate:',
        'a=fingerprint:sha-256 ',
        'a=max-message-size:262144',
        'a=ice-options:trickle',
        'a=extmap-allow-mixed',
        'a=msid-semantic: WMS',
        'a=group:BUNDLE 0',
        'c=IN IP4 0.0.0.0',
        ' typ host generation 0',
        ' typ srflx raddr ',
        ' tcptype active',
        'a=sctp-port:5000',
        'a=setup:actpass',
        'a=ice-ufrag:',
        'a=setup:active',
        'a=ice-pwd:',
        ' network-cost ',
        ' generation 0',
        ' typ host',
        'a=mid:0',
        ' udp 21222',
        '192.168.',
        ' rport ',
        ':sha-256',
        '\r\na=',
        '\r\n'
    ];
    var CODES = [];
    (function () {
        for (var c = 1, n = 0; c < 32 && n < DICT.length; c++) {
            if (c === 10 || c === 13) { continue; }
            CODES[n++] = String.fromCharCode(c);
        }
    })();

    /* Devuelve null si el texto ya contiene bytes de control: en ese caso no
       se toca nada y se marca como crudo. */
    function dictPack(text) {
        for (var i = 0; i < text.length; i++) {
            var c = text.charCodeAt(i);
            if (c < 32 && c !== 10 && c !== 13) { return null; }
        }
        for (var d = 0; d < DICT.length; d++) {
            text = text.split(DICT[d]).join(CODES[d]);
        }
        return text;
    }
    function dictUnpack(text) {
        for (var d = DICT.length - 1; d >= 0; d--) {
            text = text.split(CODES[d]).join(DICT[d]);
        }
        return text;
    }

    /* ---------------------------------------------------------------------
       Empaquetado con longitudes explicitas, para poder anadir campos
       manana sin romper los codigos de hoy.
         pk (32) | largoNombre (1) | nombre | largoSdp (2) | sdp comprimido
       --------------------------------------------------------------------- */
    function packBody(pk, name, sdp) {
        var n = U.fromString(String(name || '').substr(0, 40));
        var s = new Uint8Array(0);
        if (sdp) {
            var packed = dictPack(sdp);
            var flag = packed === null ? 0 : 1;
            s = U.concat([
                new Uint8Array([flag]),
                I.compress(U.fromString(packed === null ? sdp : packed))
            ]);
        }
        return U.concat([
            pk,
            new Uint8Array([n.length]), n,
            new Uint8Array([(s.length >> 8) & 255, s.length & 255]), s
        ]);
    }

    function unpackBody(b) {
        if (!b || b.length < 35) { return null; }
        var pk = b.subarray(0, 32);
        var nLen = b[32];
        if (b.length < 33 + nLen + 2) { return null; }
        /* El nombre lo escribio quien fabrico el codigo, y un codigo se puede
           fabricar a mano con un nombre de 255 bytes lleno de saltos de linea:
           con eso se colaba un falso aviso del sistema de varios renglones en
           la conversacion. Se limpia aqui, en cuanto se lee del cable. */
        var name = U.nombreLimpio(U.toString(b.subarray(33, 33 + nLen)));
        var p = 33 + nLen;
        var sLen = (b[p] << 8) | b[p + 1];
        p += 2;
        if (b.length < p + sLen) { return null; }
        var sdp = null;
        if (sLen) {
            var flag = b[p];
            var raw = I.decompress(b.subarray(p + 1, p + sLen));
            if (!raw) { return null; }
            sdp = U.toString(raw);
            if (flag === 1) { sdp = dictUnpack(sdp); }
        }
        return { pk: U.toHex(pk), name: name, sdp: sdp };
    }

    /* ---------------------------------------------------------------------
       Cifrado opcional con clave de encuentro.
       Cabecera: 1 (marca de cifrado) | sal(8) | nonce(12) | ...
       Menos iteraciones que la boveda a proposito: la clave de encuentro es
       de usar y tirar y el codigo caduca en minutos, no en anos.
       --------------------------------------------------------------------- */
    function lock(body, pass) {
        var salt = C.random(8), nonce = C.random(12);
        var k = C.pbkdf2(pass, salt, 20000, 32);
        var ct = C.seal(k, nonce, U.fromString('bintio/invite/v1'), body);
        U.wipe(k);
        return U.concat([new Uint8Array([1]), salt, nonce, ct]);
    }
    function unlock(b, pass) {
        if (b[0] !== 1) { return b.subarray(1); }
        if (!pass) { return null; }
        var salt = b.subarray(1, 9), nonce = b.subarray(9, 21);
        var k = C.pbkdf2(pass, salt, 20000, 32);
        var out = C.open(k, nonce, U.fromString('bintio/invite/v1'), b.subarray(21));
        U.wipe(k);
        return out;
    }

    /* El prefijo vive en UN solo sitio y de ahi sale todo: el que se escribe
       al codificar, el que se busca al decodificar y el que mira el arranque
       para un codigo pegado en la direccion. Estaba repetido en dos formas
       distintas (literal aqui, clase de caracteres en la expresion regular)
       y cambiarle el nombre al proyecto dejo una desincronizada: los codigos
       se generaban bien y no se podian leer. Una vez y ya. */
    I.TAG = 'BN';
    var PREFIX = { card: I.TAG + 'C1', offer: I.TAG + 'O1', answer: I.TAG + 'A1' };
    var FIND = new RegExp(I.TAG + '[COA]1[A-Za-z0-9_-]+');

    I.encode = function (kind, pk, name, sdp, pass) {
        var body = packBody(pk, name, sdp);
        var payload = pass ? lock(body, pass) : U.concat([new Uint8Array([0]), body]);
        return PREFIX[kind] + U.toB64(payload);
    };

    /* Devuelve {kind, pk, name, sdp} , {needPass:true} o null. */
    I.decode = function (text, pass) {
        text = String(text).replace(/\s+/g, '');
        /* Tolerante: acepta el codigo pegado dentro de una frase o de una URL. */
        var m = text.match(FIND);
        if (!m) { return null; }
        text = m[0];
        var kind = text.charAt(2) === 'C' ? 'card' : (text.charAt(2) === 'O' ? 'offer' : 'answer');
        var payload;
        try { payload = U.fromB64(text.substr(4)); } catch (e) { return null; }
        if (!payload.length) { return null; }
        if (payload[0] === 1 && !pass) { return { needPass: true, kind: kind }; }
        /* Si el usuario ha escrito una clave de encuentro pero el codigo NO va
           cifrado, no es el codigo que esperaba: es justo la sustitucion que la
           clave existe para atrapar. Antes unlock devolvia el cuerpo en claro
           sin mirar la clave, asi que un atacante que controla el canal cambiaba
           la respuesta cifrada por una suya SIN cifrar y se colaba como el
           contacto, con la pantalla diciendo "enlace abierto". Ahora se dice. */
        if (payload[0] !== 1 && pass) { return { sinCifrar: true, kind: kind }; }
        var body = unlock(payload, pass);
        if (!body) { return { badPass: true, kind: kind }; }
        var parsed = unpackBody(body);
        if (!parsed) { return null; }
        parsed.kind = kind;
        return parsed;
    };

    /* Enlace para compartir por cualquier via. El codigo va detras de la
       almohadilla: lo que hay detras de una almohadilla no se envia nunca al
       servidor, ni siquiera acaba en su registro de accesos.

       La base es la direccion desde la que se esta usando la aplicacion, no
       un dominio nuestro: BINTIO no tiene dominio y no quiere tenerlo. Si se
       esta ejecutando desde un fichero suelto, se comparte el codigo pelado,
       que funciona igual pegandolo. */
    I.toLink = function (code, base) {
        if (base) { return base + '#' + code; }
        if (typeof location !== 'undefined' && location.protocol.indexOf('http') === 0) {
            return location.origin + location.pathname + '#' + code;
        }
        return code;
    };
    I.fromLocation = function (href) {
        var h = String(href || '');
        var i = h.indexOf('#');
        return i >= 0 ? h.substr(i + 1) : '';
    };
})(BINTIO);
