/* El generador de QR se compara modulo a modulo con una implementacion de
   referencia (el paquete "qrcode", que solo es dependencia de desarrollo).
   Si las dos matrices coinciden, cualquier lector del mundo lo leera.

   La comparacion recorre las cuarenta versiones en los cuatro niveles, y de
   cada una prueba los dos extremos: el texto mas corto que obliga a esa
   version (mucho relleno) y el que la llena al ras (ninguno). Una tabla de
   correccion mal copiada, un patron de alineacion en mal sitio o un contador
   de caracteres del ancho que no toca cambian la matriz entera, y aqui se ve.

   Importa porque de esto depende que una invitacion se pueda ensenar en la
   pantalla: son unos 530 bytes, muy por encima de lo que cabia antes. */
var ayuda = require('./ayuda');
var ok = ayuda.ok;
var V = ayuda.cargar('sin-interfaz');
var ref;
try { ref = require('qrcode'); }
catch (e) {
    console.log('  (sin el paquete de referencia; se omite la comparacion)');
    console.log('TODO CORRECTO: 0 comprobaciones');
    process.exit(0);
}

/* La referencia se fuerza a modo binario: BINTIO solo usa ese modo, porque
   sus codigos llevan minusculas y porque asi cualquier texto UTF-8 vale.
   Sin forzarlo, la referencia partiria el texto en tramos alfanumericos y
   sacaria una version mas pequena para textos en mayusculas; seria una
   comparacion entre cosas distintas, no una prueba. */
function compare(text, level) {
    var mine = V.qr.encode(text, { level: level });
    var theirs = ref.create([{ data: text, mode: 'byte' }], { errorCorrectionLevel: level });
    if (theirs.modules.size !== mine.size) {
        return 'tamano ' + mine.size + ' frente a ' + theirs.modules.size;
    }
    for (var r = 0; r < mine.size; r++) {
        for (var c = 0; c < mine.size; c++) {
            var a = mine.modules[r][c] ? 1 : 0;
            var b = theirs.modules.data[r * theirs.modules.size + c] ? 1 : 0;
            if (a !== b) { return 'difiere en fila ' + r + ' columna ' + c; }
        }
    }
    return null;
}

/* Texto de n bytes con la pinta de un codigo de BINTIO: prefijo y base64url.
   Se genera con una sucesion propia y sin azar para que un fallo se pueda
   repetir tal cual. */
var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function filler(prefix, n) {
    var out = prefix.slice(0, n), seed = n * 2654435761 % 4294967296;
    while (out.length < n) {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        out += B64.charAt(seed % 64);
    }
    return out;
}

console.log('QR frente a la implementacion de referencia');

/* ------------------------------------------------------- textos sueltos */
var textos = [
    'BNC1',
    'HOLA',
    'BNC1abcdefghijklmnopqrstuvwxyz0123456789',
    'BNC1' + new Array(60).join('x'),
    'BNC1' + new Array(90).join('Z'),
    'BNC1p8Kq2mZr7Xt4Nb9Yc1Vd6Fg3Hj5Kl0Mn8Pq2Rs4Tu6Vw8Xy0Za2Bc4De6Fg8Hi0Jk2Lm4No6Pq8Rs0Tu2Vw4Xy6Z'
];
for (var i = 0; i < textos.length; i++) {
    var err = compare(textos[i], 'M');
    ok('nivel M, ' + textos[i].length + ' caracteres', err === null, err);
}
for (var j = 0; j < 3; j++) {
    var e2 = compare(textos[j + 1], 'L');
    ok('nivel L, ' + textos[j + 1].length + ' caracteres', e2 === null, e2);
}

/* Modo binario de verdad: acentos y enyes ocupan dos bytes, y el contador
   cuenta bytes, no letras. */
var acentos = 'BNC1 ma\u00f1ana la se\u00f1al viene por el balc\u00f3n, \u00bfsubimos?';
var errUtf = compare(acentos, 'M');
ok('texto UTF-8 con enyes y acentos', errUtf === null, errUtf);

/* --------------------------------------------- barrido de las 40 versiones */
console.log('');
console.log('Las cuarenta versiones en los cuatro niveles');
var niveles = ['L', 'M', 'Q', 'H'];
var barridoFallos = 0, barridoCasos = 0;
for (var n = 0; n < niveles.length; n++) {
    var level = niveles[n];
    for (var v = 1; v <= V.qr.maxVersion; v++) {
        var tope = V.qr.maxBytes(level, v);
        var suelo = v === 1 ? 1 : V.qr.maxBytes(level, v - 1) + 1;
        var casos = suelo === tope ? [tope] : [suelo, tope];
        for (var c = 0; c < casos.length; c++) {
            var texto = filler('BNO1', casos[c]);
            var res = V.qr.encode(texto, { level: level });
            barridoCasos++;
            if (res.version !== v) {
                barridoFallos++;
                console.log('  FALLA nivel ' + level + ' version ' + v + ', ' + casos[c] +
                            ' bytes  -> eligio la version ' + res.version);
                continue;
            }
            var e3 = compare(texto, level);
            if (e3 !== null) {
                barridoFallos++;
                console.log('  FALLA nivel ' + level + ' version ' + v + ', ' + casos[c] +
                            ' bytes  -> ' + e3);
            }
        }
    }
    ok('nivel ' + level + ', versiones 1 a ' + V.qr.maxVersion,
       barridoFallos === 0, barridoFallos + ' de ' + barridoCasos + ' matrices mal');
    barridoFallos = 0;
    barridoCasos = 0;
}

/* ------------------------------------------------- lo que se ensena de veras */
console.log('');
console.log('Lo que la aplicacion ensena de verdad');

/* Una tarjeta de contacto, del tamano que se genera en la app. */
var card = V.invite.encode('card', V.crypto.random(32), 'Ana Nodo', null, null);
var errCard = compare(card, 'M');
ok('tarjeta de contacto real (' + card.length + ' caracteres)', errCard === null, errCard);
var mCard = V.qr.encode(card, { level: 'M' });
ok('la tarjeta cabe en una version comoda de leer', mCard.version <= 8, 'version ' + mCard.version);

/* Una invitacion: lo mismo mas la descripcion de sesion entera. Esta es la
   que antes no se podia pintar, y es la unica que abre camino de red. */
var sdp = 'v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' +
    'a=group:BUNDLE 0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n' +
    'c=IN IP4 0.0.0.0\r\na=ice-ufrag:F7gI\r\na=ice-pwd:x9cml/YzichV2+XlhiMu8g\r\n' +
    'a=fingerprint:sha-256 ' +
    '4A:AD:B9:B1:3F:82:18:3B:54:02:12:DF:3E:5D:49:6B:19:E5:7C:AB:3B:5D:4A:5F:1E:8B:2C:71:0D:9A:33:04\r\n' +
    'a=setup:actpass\r\na=mid:0\r\na=sctp-port:5000\r\na=max-message-size:262144\r\n' +
    /* Las candidatas van dentro: sin servidor no hay a quien preguntarlas
       despues, asi que la invitacion se genera con la recoleccion terminada
       y por eso es larga. */
    'a=candidate:1 1 udp 2113937151 192.168.1.37 54321 typ host\r\n' +
    'a=candidate:2 1 udp 2113937150 10.24.7.19 54322 typ host\r\n' +
    'a=candidate:3 1 udp 1677729535 88.16.204.91 41007 typ srflx raddr 192.168.1.37 rport 54321\r\n' +
    'a=candidate:4 1 tcp 1518214911 192.168.1.37 9 typ host tcptype active\r\n' +
    'a=end-of-candidates\r\n';
var offer = V.invite.encode('offer', V.crypto.random(32), 'Ana Nodo', sdp, null);
var errOffer = compare(offer, 'M');
ok('invitacion real (' + offer.length + ' caracteres)', errOffer === null, errOffer);
var mOffer = V.qr.encode(offer, { level: 'M' });
ok('la invitacion se puede ensenar en pantalla', mOffer.version <= 25,
   'version ' + mOffer.version + ', ' + mOffer.size + ' modulos');

/* Y la misma medida en seco: 530 caracteres con pinta de invitacion. */
var largo = filler('BNO1', 530);
var errLargo = compare(largo, 'M');
ok('530 caracteres estilo invitacion, nivel M', errLargo === null, errLargo);
var errLargoL = compare(largo, 'L');
ok('530 caracteres estilo invitacion, nivel L', errLargoL === null, errLargoL);

/* --------------------------------------------------------------- el techo */
console.log('');
console.log('El techo del generador');
for (var t = 0; t < niveles.length; t++) {
    (function (level) {
        var tope = V.qr.maxBytes(level);
        var justo = V.qr.encode(filler('BNO1', tope), { level: level });
        ok('nivel ' + level + ' llega a la version ' + V.qr.maxVersion + ' con ' + tope + ' bytes',
           justo.version === V.qr.maxVersion, 'version ' + justo.version);
        var msg = '';
        try { V.qr.encode(filler('BNO1', tope + 1), { level: level }); }
        catch (e) { msg = e.message; }
        ok('nivel ' + level + ', un byte de mas y lo dice con numeros',
           msg.indexOf(String(V.qr.maxVersion)) >= 0 && msg.indexOf(String(tope)) >= 0,
           msg || 'no salto ningun error');
    })(niveles[t]);
}

/* Version impuesta a mano: la que se pide es la que sale, y si el texto no
   cabe en ella se dice en vez de pintar una matriz rota. */
var forzado = V.qr.encode(filler('BNO1', V.qr.maxBytes('M', 14)), { level: 'M', version: 14 });
var refForzado = ref.create([{ data: filler('BNO1', V.qr.maxBytes('M', 14)), mode: 'byte' }],
                            { errorCorrectionLevel: 'M', version: 14 });
ok('version impuesta a mano: sale la que se pide',
   forzado.version === 14 && forzado.size === refForzado.modules.size,
   'version ' + forzado.version + ', ' + forzado.size + ' modulos');
var msgForzado = '';
try { V.qr.encode(filler('BNO1', V.qr.maxBytes('M', 14) + 1), { level: 'M', version: 14 }); }
catch (e2) { msgForzado = e2.message; }
ok('version impuesta a mano: avisa si el texto no cabe en ella',
   msgForzado.indexOf('version 14') >= 0, msgForzado || 'no salto ningun error');

console.log('');
ayuda.resumen();
