/* Compresion y codigos de enlace. Aqui un fallo silencioso significa
   "dos personas no consiguen conectarse", asi que se prueba a lo bruto. */
var ayuda = require('./ayuda');
var ok = ayuda.ok;
var V = ayuda.cargar('sin-interfaz');
var U = V.util, C = V.crypto, I = V.invite;
var SDP = [
    'v=0', 'o=- 4611731400430051336 2 IN IP4 127.0.0.1', 's=-', 't=0 0',
    'a=group:BUNDLE 0', 'a=extmap-allow-mixed', 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
    'a=candidate:1467250027 1 udp 2122260223 192.168.1.34 46243 typ host generation 0',
    'a=candidate:1467250027 1 udp 2122194687 10.0.0.4 51234 typ host generation 0',
    'a=candidate:435653019 1 tcp 1518280447 192.168.1.34 9 typ host tcptype active',
    'a=ice-ufrag:ETEn', 'a=ice-pwd:OtSK0WRNHhqzZaFXOXAdcAmk', 'a=ice-options:trickle',
    'a=fingerprint:sha-256 A9:B4:C1:D2:E3:F4:05:16:27:38:49:5A:6B:7C:8D:9E:AF:B0:C1:D2:E3:F4:05:16:27:38:49:5A:6B:7C:8D:9E',
    'a=setup:actpass', 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144', ''
].join('\r\n');

console.log('LZSS');
var comp = I.compress(U.fromString(SDP));
var back = U.toString(I.decompress(comp));
ok('ida y vuelta con un SDP real', back === SDP);
ok('el LZSS solo ya recorta algo', comp.length < U.fromString(SDP).length,
   U.fromString(SDP).length + ' -> ' + comp.length);

var cases = ['', 'a', 'ab', 'abc', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
             'abababababababababab', 'los ratones no tienen ratones que no tienen ratones'];
var allOk = true;
for (var i = 0; i < cases.length; i++) {
    var r = I.decompress(I.compress(U.fromString(cases[i])));
    if (U.toString(r) !== cases[i]) { allOk = false; console.log('    fallo con: ' + JSON.stringify(cases[i])); }
}
ok('casos limite', allOk);

/* Datos aleatorios: el peor caso posible para cualquier compresor. */
var randomOk = true;
for (var t = 0; t < 40; t++) {
    var src = C.random(1 + Math.floor(Math.random() * 900));
    var out = I.decompress(I.compress(src));
    if (U.toHex(out) !== U.toHex(src)) { randomOk = false; break; }
}
ok('40 rondas de datos aleatorios', randomOk);

/* Datos repetitivos largos, que es donde revientan los indices. */
var big = '';
for (var b = 0; b < 400; b++) { big += 'a=candidate:' + (b % 7) + ' 1 udp 2122260223 192.168.1.' + (b % 250) + ' 4624 typ host\r\n'; }
ok('20 KB repetitivos', U.toString(I.decompress(I.compress(U.fromString(big)))) === big,
   'largo ' + big.length + ' -> ' + I.compress(U.fromString(big)).length);

console.log('Codigos');
var pk = C.random(32);
var card = I.encode('card', pk, 'Ana Nodo', null, null);
var dec = I.decode(card);
ok('la tarjeta lleva la clave', dec && dec.pk === U.toHex(pk));
ok('la tarjeta lleva el nombre', dec && dec.name === 'Ana Nodo');
ok('la tarjeta es corta', card.length < 90, card.length + ' caracteres');

var offer = I.encode('offer', pk, 'Ana', SDP, null);
var od = I.decode(offer);
ok('la invitacion devuelve el SDP intacto', od && od.sdp === SDP);
ok('la invitacion se reconoce como oferta', od && od.kind === 'offer');
/* Lo que de verdad importa: el texto que el usuario tiene que pegar.
   Con diccionario + LZSS + base64 debe quedarse por debajo del propio SDP. */
ok('la invitacion es mas corta que el SDP crudo', offer.length < SDP.length,
   SDP.length + ' -> ' + offer.length + ' caracteres');
ok('la invitacion cabe en un mensaje corriente', offer.length < 560, offer.length + ' caracteres');

ok('se encuentra el codigo dentro de una frase',
   I.decode('mira: ' + card + ' nos vemos').pk === U.toHex(pk));
ok('se encuentra el codigo dentro de un enlace',
   I.decode(I.toLink(card)).pk === U.toHex(pk));
ok('texto que no es un codigo devuelve nulo', I.decode('hola que tal') === null);

console.log('Clave de encuentro');
var secreto = I.encode('offer', pk, 'Ana', SDP, 'nos vemos en el bar');
ok('sin clave avisa de que hace falta', I.decode(secreto).needPass === true);
ok('con la clave equivocada no abre', I.decode(secreto, 'otra cosa').badPass === true);
var abierto = I.decode(secreto, 'nos vemos en el bar');
ok('con la clave correcta abre', abierto && abierto.sdp === SDP && abierto.pk === U.toHex(pk));

console.log('');
ayuda.resumen();
