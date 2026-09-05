/* Prueba de la bolsa de la malla.

   La bolsa es la razon de ser del proyecto: si no hay camino, tu mensaje viaja
   dentro de aparatos de terceros que no pueden leerlo. Por eso lo que se
   prueba aqui no es que "funcione", sino que NO se llene sola.

   El fallo que motiva este fichero, medido antes de arreglarlo: un mensaje que
   no podia salir se reintentaba cada minuto, cada reintento lo volvia a sellar
   (efimera nueva, nonce nuevo, identificador nuevo), y la bolsa se quedaba una
   copia mas cada vez. Once copias del mismo mensaje en diez minutos. Y como
   M.prune tira primero lo que antes caduca, y cada copia nueva nace con 72
   horas por delante, lo que se iba de la bolsa eran los sobres AJENOS: en
   cinco horas sin cobertura ya no llevabas ni uno de nadie.                  */
var load = require('./load');
var fails = 0, checks = 0;

function ok(name, cond, extra) {
    checks++;
    if (cond) { console.log('  ok  ' + name); }
    else { fails++; console.log('  FALLA ' + name + (extra ? '  -> ' + extra : '')); }
}

/* Un nodo completo en memoria, sin DOM y sin transportes: aqui se mide la
   bolsa, no la red. */
function nodo() {
    var V = load('49');
    var U = V.util;
    var st = {
        identity: null, contacts: [], chats: {}, carrier: [], seen: [],
        settings: { relay: true, receipts: true, theme: 'bintio' }
    };
    V.vault.state = st;
    V.vault.save = function () {};
    V.vault.saveNow = function () {};
    var id = V.id.create();
    st.identity = { seed: U.toHex(id.seed), name: 'Yo' };
    V.contacts.bind(id);
    /* La entrega tiene que ser la de verdad: con una vacia, un sobre que se
       abre no llega a la conversacion y la prueba mediria otra cosa. */
    V.mesh.init(function (abierto) { V.chat.onIncoming(abierto); });
    return V;
}

console.log('Bolsa de la malla');

var V = nodo();
var otro = V.id.create();
var contacto = V.contacts.add(V.util.toHex(otro.pk), 'Destino').contact;

/* Sin un solo enlace: el mensaje no puede salir y se queda pendiente. */
var msg = V.chat.sendText(contacto, 'esto no puede salir todavia');
ok('sin enlaces el mensaje se queda pendiente', msg.state === 'pendiente', msg.state);
ok('y se guarda una copia en la bolsa', V.mesh.bagSize().count === 1,
   V.mesh.bagSize().count + ' piezas');

/* Diez reintentos son diez minutos del reloj de 50-app.js. */
for (var i = 0; i < 10; i++) { V.chat.retryPending(); }
ok('diez reintentos NO dejan diez copias', V.mesh.bagSize().count === 1,
   V.mesh.bagSize().count + ' piezas tras 10 reintentos');
ok('el mensaje sigue pendiente y sin duplicar en la conversacion',
   V.chat.get(contacto.pk).messages.length === 1);

/* El caso que de verdad duele: llevando sobres de otros. */
var W = nodo();
var tercero = W.id.create();
var destino = W.id.create();
var ajenos = 0, k;
for (k = 0; k < 25; k++) {
    /* Un sobre que no es para nosotros: entra por la malla y se queda en la
       bolsa porque no se puede abrir. */
    var otroNodo = load('49');
    otroNodo.vault.state = {
        identity: null, contacts: [], chats: {}, carrier: [], seen: [],
        settings: { relay: true, receipts: true }
    };
    otroNodo.contacts.bind(tercero);
    var c2 = otroNodo.contacts.add(otroNodo.util.toHex(destino.pk), 'Otro').contact;
    var sobre = otroNodo.session.seal(c2, otroNodo.session.T_TEXT,
        otroNodo.util.fromString('sobre ajeno ' + k), null);
    W.mesh.handleEnvelope(sobre, { id: 'p' + k, kind: 'local', send: function () {}, close: function () {} });
    ajenos++;
}
var conAjenos = W.mesh.bagSize().count;
ok('la bolsa recoge los sobres ajenos', conAjenos === ajenos, conAjenos + ' de ' + ajenos);

var mio = W.contacts.add(W.util.toHex(destino.pk), 'Mi destino').contact;
W.chat.sendText(mio, 'uno mio, atascado');
for (i = 0; i < 200; i++) { W.chat.retryPending(); }

var b = W.vault.state.carrier;
ok('doscientos reintentos no desalojan a nadie', b.length === conAjenos + 1,
   b.length + ' piezas (esperadas ' + (conAjenos + 1) + ')');

/* Que los ajenos sigan ahi, uno a uno, es lo que de verdad importa. */
var siguen = 0;
for (i = 0; i < b.length; i++) { if (b[i].d) { siguen++; } }
ok('los sobres ajenos siguen enteros', siguen === b.length, siguen + '/' + b.length);

/* --------------------------------------------------------------------------
   La mochila no echa lo tuyo por lo de otros.

   Las presentaciones se podaban AL AZAR dentro de su cupo, y ahi entraba
   tambien la que acababas de sellar: trescientos marcos ajenos la echaban de tu
   propia mochila y, como no habia salido del aparato, no la tenia nadie mas.
   Con los sobres 'X' eso no pasa nunca, porque se ordenan por caducidad y lo
   recien sellado es lo ultimo en morir; aqui hacia falta decirlo.

   El azar se queda -es lo unico que impide que quien inunda elija a quien echa-
   pero por orden de dueno: primero lo ajeno, luego lo que espera sitio, y lo
   propio solo cuando ya no queda nada mas.
   -------------------------------------------------------------------------- */
console.log('');
console.log('La mochila no echa lo propio por lo ajeno');

function enLaBolsa(nodoV, id) {
    var lista = nodoV.vault.state.carrier;
    for (var q = 0; q < lista.length; q++) { if (lista[q].i === id) { return true; } }
    return false;
}

var Y = nodo();
var ahora = Math.floor(Date.now() / 1000);
function pieza(nodoV, id, marcas) {
    var reg = { i: id, d: nodoV.util.toB64(nodoV.crypto.random(708)),
                e: ahora + 3600, t: 0, k: 'p' };
    for (var m in marcas) {
        if (Object.prototype.hasOwnProperty.call(marcas, m)) { reg[m] = marcas[m]; }
    }
    nodoV.vault.state.carrier.push(reg);
    return reg;
}

pieza(Y, 'propia', { p: 1, m: 1 });
pieza(Y, 'espera', { w: 1 });
for (k = 0; k < 300; k++) { pieza(Y, 'ajena' + k, { p: 1 }); }
Y.mesh.prune();

var quedanY = Y.vault.state.carrier.length;
ok('la poda respeta el cupo de presentaciones', quedanY === 40, quedanY + ' piezas');
ok('la propia sigue dentro', enLaBolsa(Y, 'propia'));
ok('la que espera sitio tambien', enLaBolsa(Y, 'espera'));
var ajenasFuera = 0;
for (k = 0; k < 300; k++) { if (!enLaBolsa(Y, 'ajena' + k)) { ajenasFuera++; } }
ok('y lo que se ha ido es todo ajeno', ajenasFuera === 262, ajenasFuera + ' echadas');

/* Y la marca la tiene que poner quien la pone de verdad, M.send: si dejara de
   ponerla, la proteccion de arriba seguiria verde y no protegeria nada. */
var Z = nodo();
var yo = Z.contacts.me();
var alguien = Z.id.create();
var propiaZ = Z.presenta.sealSync({
    mySk: yo.sk, myPk: yo.pk, recipPk: alguien.pk, name: 'Yo', text: 'hola'
});
Z.mesh.send(propiaZ);
var regZ = Z.vault.state.carrier[0];
ok('una presentacion propia entra marcada como propia y como probada',
   regZ && regZ.k === 'p' && regZ.m === 1 && regZ.p === 1, JSON.stringify(regZ));
for (k = 0; k < 300; k++) { pieza(Z, 'ruido' + k, { p: 1 }); }
Z.mesh.prune();
ok('y sobrevive a trescientas presentaciones ajenas', enLaBolsa(Z, regZ.i));

/* --------------------------------------------------------------------------
   El orden de handleEnvelope: mirar el marco ANTES de darlo por visto.

   Los saltos (bytes 4 y 5) son lo unico que cambia por el camino, asi que son
   lo unico que E.idOf deja fuera del identificador. De ahi sale un ataque de
   silencio: coges un marco ajeno legitimo que va de paso, le pones 255 saltos
   -que es basura, el tope son 12- y lo sueltas. Mismo identificador.

   Si el nodo apuntara "visto" antes de mirar el marco, ese identificador
   quedaria quemado y el marco de VERDAD, cuando llegara por otro camino, se
   descartaria por repetido. Un mensaje que no se puede leer ni falsificar, se
   podria borrar. Por eso parse() va primero y solo se apunta lo que ha pasado
   el filtro. Se fija aqui porque es un orden de dos lineas que cualquier
   reordenacion inocente rompe sin que falle nada mas.
   -------------------------------------------------------------------------- */
console.log('');
console.log('Un marco roto no quema el identificador del bueno');

var Q = nodo();
var emisorQ = load('49');
emisorQ.vault.state = {
    identity: null, contacts: [], chats: {}, carrier: [], seen: [],
    settings: { relay: true, receipts: true }
};
emisorQ.vault.save = function () {};
emisorQ.vault.saveNow = function () {};
var idQ = emisorQ.id.create();
emisorQ.vault.state.identity = { seed: emisorQ.util.toHex(idQ.seed), name: 'Emisor' };
emisorQ.contacts.bind(idQ);
var destQ = emisorQ.id.create();
var cQ = emisorQ.contacts.add(emisorQ.util.toHex(destQ.pk), 'Destino').contact;
var sobreQ = emisorQ.session.seal(cQ, emisorQ.session.T_TEXT,
    emisorQ.util.fromString('un sobre de paso'), null);

/* El mismo marco con los saltos estropeados: identificador identico. */
var rotoQ = new Uint8Array(sobreQ);
rotoQ[4] = 255;
ok('estropear los saltos no cambia el identificador',
   Q.envelope.idOf(rotoQ) === Q.envelope.idOf(sobreQ),
   Q.envelope.idOf(rotoQ) + ' vs ' + Q.envelope.idOf(sobreQ));

var mudo = { id: 'mudo', kind: 'local', send: function () {}, close: function () {} };
Q.mesh.handleEnvelope(rotoQ, mudo);
ok('el marco roto no entra en la mochila', Q.mesh.bagSize().count === 0,
   Q.mesh.bagSize().count + ' piezas');

Q.mesh.handleEnvelope(sobreQ, mudo);
ok('y el bueno sigue llegando despues', Q.mesh.bagSize().count === 1,
   Q.mesh.bagSize().count + ' piezas');

/* --------------------------------------------------------------------------
   La lista de la mochila no dice para quien iba un sobre.

   El inventario se le da a cualquier vecino que lo pida: asi dos aparatos que
   se acaban de conocer se ponen al dia sin mandarse la mochila entera. El
   problema era lo que NO estaba en esa lista. Todo el que transporta un sobre
   lo tiene apuntado; el destinatario, que lo abria y no lo guardaba, era el
   unico que no. Basta con coger un sobre de la malla, ofrecerselo a cada
   vecino, pedirle la lista, y el unico al que le falta es para quien iba.
   Ni se descifra nada ni hace falta: la ausencia lo dice.

   Ahora lo propio se guarda igual que lo ajeno. Cuesta lo mismo que habria
   costado transportarlo, caduca a la vez y se poda igual.
   -------------------------------------------------------------------------- */
console.log('');
console.log('La lista no dice para quien iba');

function nodoRelay(rele) {
    var N = nodo();
    N.vault.state.settings.relay = rele;
    /* Sin acuses: el acuse es un sobre NUESTRO y aqui se mide la lista, no el
       trafico que genera contestar. */
    N.vault.state.settings.receipts = false;
    return N;
}

var emisor = nodoRelay(true), destino = nodoRelay(true), porta = nodoRelay(true);
var pkDestino = destino.id.fromSeed(destino.util.fromHex(destino.vault.state.identity.seed)).pk;
var pkEmisor = emisor.id.fromSeed(emisor.util.fromHex(emisor.vault.state.identity.seed)).pk;
var cD = emisor.contacts.add(emisor.util.toHex(pkDestino), 'Destino').contact;
destino.contacts.add(destino.util.toHex(pkEmisor), 'Emisor');
var sobreO = emisor.session.seal(cD, emisor.session.T_TEXT,
    emisor.util.fromString('para el destinatario'), null);
var idO = emisor.envelope.idOf(sobreO);
var nadie = { id: 'n', kind: 'local', send: function () {}, close: function () {} };
destino.mesh.handleFrame(new Uint8Array(sobreO), nadie);
porta.mesh.handleFrame(new Uint8Array(sobreO), nadie);

ok('el destinatario recibe el mensaje',
   (destino.chat.get(destino.util.toHex(pkEmisor)).messages || []).length === 1);
ok('y aun asi lo publica en su lista, como el que solo lo lleva',
   destino.mesh.bagIds().indexOf(idO) >= 0 && porta.mesh.bagIds().indexOf(idO) >= 0,
   'destinatario ' + (destino.mesh.bagIds().indexOf(idO) >= 0) +
   ', portador ' + (porta.mesh.bagIds().indexOf(idO) >= 0));
ok('las dos listas son iguales',
   JSON.stringify(destino.mesh.bagIds()) === JSON.stringify(porta.mesh.bagIds()),
   JSON.stringify(destino.mesh.bagIds()) + ' vs ' + JSON.stringify(porta.mesh.bagIds()));

/* Y el senuelo no se vuelve a entregar al repasar la mochila. */
destino.mesh.rescanBag();
ok('repasar la mochila no duplica el mensaje',
   (destino.chat.get(destino.util.toHex(pkEmisor)).messages || []).length === 1,
   (destino.chat.get(destino.util.toHex(pkEmisor)).messages || []).length + ' mensajes');

/* Con el reenvio apagado no se lleva nada de nadie, asi que en la mochila solo
   queda lo propio y ensenarla seria justo lo contrario: la lista de un aparato
   asi tiene que salir vacia. */
var callado = nodoRelay(false), porta2 = nodoRelay(true);
var pkCallado = callado.id.fromSeed(callado.util.fromHex(callado.vault.state.identity.seed)).pk;
var cC = emisor.contacts.add(emisor.util.toHex(pkCallado), 'Callado').contact;
callado.contacts.add(callado.util.toHex(pkEmisor), 'Emisor');
var sobreC = emisor.session.seal(cC, emisor.session.T_TEXT,
    emisor.util.fromString('para el callado'), null);
callado.mesh.handleFrame(new Uint8Array(sobreC), nadie);
porta2.mesh.handleFrame(new Uint8Array(sobreC), nadie);
ok('sin reenvio el mensaje llega igual',
   (callado.chat.get(callado.util.toHex(pkEmisor)).messages || []).length === 1);
ok('y no publica ni una pieza', callado.mesh.bagIds().length === 0,
   JSON.stringify(callado.mesh.bagIds()));
ok('mientras el que si transporta la publica',
   porta2.mesh.bagIds().indexOf(emisor.envelope.idOf(sobreC)) >= 0);

/* --------------------------------------------------------------------------
   Contacto a medias: alguien te anade y te escribe ANTES de que tu le anadas.

   Un sobre solo se puede abrir si quien lo recibe tiene dado de alta a quien
   lo manda (34-session.js recorre TUS contactos). Asi que ese mensaje llega al
   aparato, no se reconoce y se queda en la bolsa como el de un desconocido.
   Antes se perdia ahi para siempre; ahora, al dar de alta a esa persona, se
   vuelve a mirar la bolsa y aparece.
   -------------------------------------------------------------------------- */
console.log('');
console.log('Contacto a medias');

function conCable(a, b) {
    var pa = { id: 'a-b', kind: 'local', label: 'b',
        send: function (x) { setImmediate(function () { b.transport.receive(new Uint8Array(x), pb); }); },
        close: function () {} };
    var pb = { id: 'b-a', kind: 'local', label: 'a',
        send: function (x) { setImmediate(function () { a.transport.receive(new Uint8Array(x), pa); }); },
        close: function () {} };
    a.transport.addPeer(pa);
    b.transport.addPeer(pb);
}

var ana = nodo(), beto = nodo();
conCable(ana, beto);

/* La clave publica de cada uno sale de su propia semilla. */
var idAna = ana.id.fromSeed(ana.util.fromHex(ana.vault.state.identity.seed));
var idBeto = beto.id.fromSeed(beto.util.fromHex(beto.vault.state.identity.seed));

/* Beto tiene a Ana; Ana NO tiene a Beto. Es exactamente lo que pasa cuando
   alguien pega tu codigo y te escribe sin devolverte nada. */
var anaEnBeto = beto.contacts.add(beto.util.toHex(idAna.pk), 'Ana').contact;

beto.chat.sendText(anaEnBeto, 'te escribo antes de que me tengas');
beto.chat.sendText(anaEnBeto, 'y esto tambien');

setTimeout(function () {
    var visibles = 0, k;
    for (k in ana.vault.state.chats) {
        if (Object.prototype.hasOwnProperty.call(ana.vault.state.chats, k)) {
            visibles += (ana.vault.state.chats[k].messages || []).length;
        }
    }
    ok('sin tenerle dado de alta, no se ve nada', visibles === 0, visibles + ' mensajes');
    /* Los DOS sobres estan en la mochila. Puede haber una pieza mas, y se
       cuenta aparte a proposito: al escribir a alguien que no te tiene, sale
       ademas una presentacion (37-presenta.js). Ana la lleva como marco ajeno
       porque su buzon esta cerrado, que es como viene de serie. */
    var carrier = ana.vault.state.carrier, sobres = 0, presentaciones = 0;
    for (k = 0; k < carrier.length; k++) {
        if (carrier[k].k === 'p') { presentaciones++; } else { sobres++; }
    }
    ok('pero los sobres estan en la mochila', sobres === 2, sobres + ' sobres');
    ok('y la presentacion se lleva aparte, como marco ajeno', presentaciones <= 1,
       presentaciones + ' presentaciones');

    ana.contacts.add(ana.util.toHex(idBeto.pk), 'Beto');

    setTimeout(function () {
        var luego = 0;
        for (k in ana.vault.state.chats) {
            if (Object.prototype.hasOwnProperty.call(ana.vault.state.chats, k)) {
                luego += (ana.vault.state.chats[k].messages || []).length;
            }
        }
        ok('al darle de alta aparecen los mensajes que ya habia mandado', luego === 2,
           luego + ' mensajes');

        console.log('');
        console.log(fails ? fails + ' FALLOS de ' + checks + ' comprobaciones'
                          : 'TODO CORRECTO: ' + checks + ' comprobaciones');
        process.exit(fails ? 1 : 0);
    }, 300);
}, 400);
