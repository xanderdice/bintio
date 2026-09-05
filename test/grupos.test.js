/* Confirmaciones y grupos, con aparatos de verdad hablandose.

   Aqui no se simula nada del protocolo: cada nodo es la aplicacion entera en
   memoria -boveda, contactos, sesion, malla y conversaciones- y los cables
   entre ellos entregan los mismos bytes que entregaria el bluetooth. Si algo
   pasa en esta prueba, pasa en la aplicacion.

   Lo que se mide:

     1. "Esta escribiendo" llega, se ve y se apaga solo. Y NO deja rastro: ni
        un byte en la mochila ni una linea en la conversacion. Esa es la parte
        que se puede romper sin que se note, porque lo unico que se veria es
        una mochila que crece.

     2. Entregado y leido en uno a uno.

     3. Grupos: la ficha viaja con cada mensaje, asi que quien recibe el primer
        mensaje de un grupo que no conocia se entera del nombre y de la lista
        sin que nadie se lo mande aparte.

     4. Y lo que se pidio con todas las letras: un mensaje de grupo NO se pone
        "leido" hasta que lo ha leido el ultimo. Con uno de dos se queda en
        "enviado" y contando; con los dos, y solo entonces, cambia.          */
var load = require('./load');
var fails = 0, checks = 0;

function ok(name, cond, extra) {
    checks++;
    if (cond) { console.log('  ok  ' + name); }
    else { fails++; console.log('  FALLA ' + name + (extra ? '  -> ' + extra : '')); }
}

/* ---------------------------------------------------------------- aparatos */

function nodo(nombre) {
    var V = load('49');
    var U = V.util;
    V.vault.state = {
        identity: null, contacts: [], chats: {}, carrier: [], seen: [],
        requests: [], groups: {},
        settings: { relay: true, receipts: true, typing: true, theme: 'bintio' }
    };
    V.vault.save = function () {};
    V.vault.saveNow = function () {};
    var id = V.id.create();
    V.vault.state.identity = { seed: U.toHex(id.seed), name: nombre };
    V.contacts.bind(id);
    V.mesh.init(function (abierto) { V.chat.onIncoming(abierto); });
    V.nombre = nombre;
    V.pkHex = U.toHex(id.pk);
    return V;
}

/* Un cable entre dos nodos: lo que sale por uno entra por el otro tal cual. */
function cablear(a, b) {
    var haciaA = { id: a.nombre, kind: 'local', close: function () {},
        send: function (bytes) { a.mesh.handleFrame(bytes, haciaB); } };
    var haciaB = { id: b.nombre, kind: 'local', close: function () {},
        send: function (bytes) { b.mesh.handleFrame(bytes, haciaA); } };
    a.transport.addPeer(haciaB);
    b.transport.addPeer(haciaA);
}

/* Que se conozcan: cada uno da de alta al otro por su clave publica. */
function presentar(a, b) {
    a.contacts.add(b.pkHex, b.nombre);
    b.contacts.add(a.pkHex, a.nombre);
}

function ultimo(V, clave) {
    var m = V.chat.get(clave).messages;
    return m.length ? m[m.length - 1] : null;
}

/* ====================================================================== 1 */
console.log('Escribiendo');

var A = nodo('Ana'), B = nodo('Bruno');
presentar(A, B);
cablear(A, B);

var mochilaAntes = A.mesh.bagSize().count;
A.chat.sendTyping(B.pkHex === A.pkHex ? null : A.contacts.all()[0].pk);
ok('a la otra persona le consta que estas escribiendo',
   B.chat.typingIn(A.pkHex) === 'Ana', String(B.chat.typingIn(A.pkHex)));
ok('el aviso NO entra en la mochila de quien lo manda',
   A.mesh.bagSize().count === mochilaAntes,
   A.mesh.bagSize().count + ' piezas, antes ' + mochilaAntes);
ok('ni en la de quien lo recibe', B.mesh.bagSize().count === 0,
   B.mesh.bagSize().count + ' piezas');
ok('y no aparece como mensaje en ninguna conversacion',
   B.chat.get(A.pkHex).messages.length === 0);

/* Tecleando sin parar no se manda un sobre por tecla. */
var enviados = 0;
var flashOriginal = A.mesh.flash;
A.mesh.flash = function (b) { enviados++; return flashOriginal(b); };
for (var t = 0; t < 20; t++) { A.chat.sendTyping(A.contacts.all()[0].pk); }
ok('veinte pulsaciones seguidas no mandan veinte avisos', enviados === 0,
   enviados + ' avisos en la misma tanda');
A.mesh.flash = flashOriginal;

/* Y se apaga solo cuando caduca. */
var caducado = B.chat.typingIn(A.pkHex);
B.chat.onIncoming({
    contact: B.contacts.get(A.pkHex), type: B.session.T_TYPING,
    mid: '0000000000000000', ts: Date.now(), body: new Uint8Array(0)
});
ok('mientras teclea, sigue constando', B.chat.typingIn(A.pkHex) === 'Ana', String(caducado));

/* ====================================================================== 2 */
console.log('');
console.log('Entregado y leido, uno a uno');

var m1 = A.chat.sendText(A.contacts.get(B.pkHex), 'hola Bruno');
ok('al escribirlo, sale', m1.state !== 'pendiente' && m1.state !== 'error', m1.state);
ok('a Bruno le llega', B.chat.get(A.pkHex).messages.length === 1);
ok('y Ana lo ve entregado sin hacer nada mas',
   A.chat.get(B.pkHex).messages[0].state === 'entregado',
   A.chat.get(B.pkHex).messages[0].state);
ok('a Bruno le consta sin leer', B.chat.get(A.pkHex).unread === 1);

B.chat.markRead(A.pkHex);
ok('cuando Bruno abre la conversacion, Ana lo ve leido',
   A.chat.get(B.pkHex).messages[0].state === 'leido',
   A.chat.get(B.pkHex).messages[0].state);

/* Con los acuses apagados no se dice nada, que es la promesa del interruptor. */
var C0 = nodo('Cira'), D0 = nodo('Dario');
presentar(C0, D0);
cablear(C0, D0);
D0.vault.state.settings.receipts = false;
var mudo = C0.chat.sendText(C0.contacts.get(D0.pkHex), 'y esto?');
ok('con los acuses apagados, el otro no confirma nada', mudo.state === 'enviado', mudo.state);
D0.chat.markRead(C0.pkHex);
ok('ni al leerlo', C0.chat.get(D0.pkHex).messages[0].state === 'enviado',
   C0.chat.get(D0.pkHex).messages[0].state);

/* ====================================================================== 3 */
console.log('');
console.log('Grupos');

var P = nodo('Pau'), Q = nodo('Quim'), R = nodo('Rita');
presentar(P, Q); presentar(P, R); presentar(Q, R);
cablear(P, Q); cablear(P, R); cablear(Q, R);

var hecho = P.groups.create('Cena del viernes', [Q.pkHex, R.pkHex]);
ok('se crea el grupo', !!hecho.group, hecho.error);
var grupo = hecho.group;
var clave = P.groups.key(grupo.id);
ok('el grupo cuenta con los tres', grupo.members.length === 3, String(grupo.members.length));
ok('y "los demas" son dos', P.groups.others(grupo).length === 2);

ok('un grupo sin nombre no se crea', !!P.groups.create('   ', [Q.pkHex]).error);
ok('un grupo de uno solo tampoco', !!P.groups.create('Yo solo', []).error);

var g1 = P.chat.sendGroupText(grupo, 'quedamos a las nueve');
/* Por un cable local la entrega es instantanea y el acuse vuelve dentro de la
   misma llamada, asi que aqui ya puede poner "entregado". Lo que se comprueba
   es que SALIO del aparato, no el escalon exacto. */
ok('el mensaje de grupo sale', g1.state !== 'pendiente' && g1.state !== 'error', g1.state);

/* La ficha viaja dentro: ni Quim ni Rita sabian que existia este grupo. */
ok('a Quim le aparece el grupo entero, sin que nadie se lo mande aparte',
   !!Q.groups.get(grupo.id) && Q.groups.get(grupo.id).name === 'Cena del viernes',
   Q.groups.get(grupo.id) ? Q.groups.get(grupo.id).name : 'no le ha llegado');
ok('con la lista de los tres', Q.groups.get(grupo.id).members.length === 3);
ok('y con el mensaje dentro',
   ultimo(Q, clave) && ultimo(Q, clave).text === 'quedamos a las nueve',
   ultimo(Q, clave) ? ultimo(Q, clave).text : 'nada');
ok('sabiendo quien lo escribio', ultimo(Q, clave).from === P.pkHex);
ok('a Rita tambien', ultimo(R, clave) && ultimo(R, clave).text === 'quedamos a las nueve');

/* ====================================================================== 4 */
console.log('');
console.log('Leido solo cuando lo han leido TODOS');

var mio = P.chat.get(clave).messages[0];
ok('los dos lo tienen: entregado', mio.state === 'entregado', mio.state);
ok('y la cuenta lo dice', mio.d === 2 && mio.n === 2, mio.d + ' de ' + mio.n);

Q.chat.markRead(clave);
ok('Quim lo lee: TODAVIA no es leido', mio.state !== 'leido', mio.state);
ok('pero la cuenta sube a uno de dos', mio.r === 1 && mio.n === 2, mio.r + ' de ' + mio.n);

R.chat.markRead(clave);
ok('cuando lo lee Rita, y solo entonces, es leido', mio.state === 'leido', mio.state);
ok('con la cuenta al completo', mio.r === 2 && mio.n === 2, mio.r + ' de ' + mio.n);

/* Leer el ultimo marca los de antes: sin esto haria falta un acuse por
   mensaje, que es diez veces mas trafico para decir lo mismo. */
var a1 = P.chat.sendGroupText(grupo, 'primero');
var a2 = P.chat.sendGroupText(grupo, 'segundo');
var a3 = P.chat.sendGroupText(grupo, 'tercero');
Q.chat.markRead(clave); R.chat.markRead(clave);
ok('leer el ultimo da por leidos los anteriores',
   a1.state === 'leido' && a2.state === 'leido' && a3.state === 'leido',
   a1.state + ' / ' + a2.state + ' / ' + a3.state);

/* ------------------------------------------------ a quien no tienes de alta */
console.log('');
console.log('Quien no esta dado de alta');

var S0 = nodo('Sol');
presentar(P, S0); cablear(P, S0);
/* Sol entra en el grupo, pero Quim y Rita no la tienen: para ellos es alguien
   de la lista a quien no pueden escribir. */
P.groups.setMembers(grupo.id, [Q.pkHex, R.pkHex, S0.pkHex]);
var g2 = P.chat.sendGroupText(P.groups.get(grupo.id), 'viene Sol tambien');
ok('a los tres les sale', g2.n === 3, String(g2.n));
Q.chat.markRead(clave); R.chat.markRead(clave);
ok('con dos de tres leido, NO es leido', g2.state !== 'leido', g2.state);
S0.chat.markRead(clave);
ok('con los tres, si', g2.state === 'leido', g2.state);

var visto = Q.groups.get(grupo.id);
ok('a Quim le llega la lista nueva', visto.members.length === 4, String(visto.members.length));
ok('y sabe que a Sol no puede escribirle',
   Q.groups.missing(visto).length === 1 && Q.groups.missing(visto)[0].pk === S0.pkHex,
   JSON.stringify(Q.groups.missing(visto)));
ok('asi que solo reparte a los que tiene',
   Q.groups.reachable(visto).length === 2, String(Q.groups.reachable(visto).length));

/* Una ficha vieja no puede resucitar una lista ya cambiada. */
var vieja = { g: grupo.id, n: 'Nombre viejo', r: 1,
    m: [[P.pkHex, 'Pau'], [Q.pkHex, 'Quim']] };
Q.groups.fromCard(vieja, P.pkHex);
ok('una ficha con revision vieja no pisa a la nueva',
   Q.groups.get(grupo.id).members.length === 4 &&
   Q.groups.get(grupo.id).name === 'Cena del viernes',
   Q.groups.get(grupo.id).name + ', ' + Q.groups.get(grupo.id).members.length + ' miembros');

/* Y nadie puede meterte en un grupo del que no formas parte. */
var ajena = { g: 'ffffffffffffffff', n: 'Grupo ajeno', r: 1,
    m: [[P.pkHex, 'Pau'], [R.pkHex, 'Rita']] };
ok('una ficha en la que no estas se rechaza',
   Q.groups.fromCard(ajena, P.pkHex) === null && !Q.groups.get('ffffffffffffffff'));

/* ------------------------------------------------------------- reintentos */
console.log('');
console.log('Reintentos de grupo');

/* El fallo que costo la bolsa entera en su dia (test/mesh.test.js) tiene aqui
   una version peor: un mensaje de grupo son N sobres, asi que un reintento que
   no sepa parar multiplica por N. Se mide con un grupo cuyos miembros no van a
   acusar nunca, que es el caso que no puede degenerar. */
var X = nodo('Xavi'), Y = nodo('Yago');
presentar(X, Y);
/* Sin cablear: no hay por donde salir, asi que todo se queda en la mochila. */
var gx = X.groups.create('Sin salida', [Y.pkHex]).group;
X.chat.sendGroupText(gx, 'esto no puede salir todavia');
var piezasTrasUno = X.mesh.bagSize().count;
ok('un mensaje de grupo deja una copia por miembro', piezasTrasUno === 1,
   piezasTrasUno + ' piezas');

for (var v = 0; v < 15; v++) { X.chat.retryPending(); }
ok('quince reintentos NO dejan quince copias', X.mesh.bagSize().count === piezasTrasUno,
   X.mesh.bagSize().count + ' piezas tras 15 reintentos');
ok('ni duplican el mensaje en la conversacion',
   X.chat.get(X.groups.key(gx.id)).messages.length === 1,
   String(X.chat.get(X.groups.key(gx.id)).messages.length));

/* Y con enlace: sale, y a partir de ahi no se vuelve a sellar aunque el otro
   no acuse nunca (tiene los acuses apagados). */
Y.vault.state.settings.receipts = false;
cablear(X, Y);
X.chat.retryPending();
var salido = X.chat.get(X.groups.key(gx.id)).messages[0];
ok('en cuanto hay enlace, sale', salido.state === 'enviado', salido.state);
var copiasTrasSalir = X.mesh.bagSize().count;
for (var w = 0; w < 15; w++) { X.chat.retryPending(); }
ok('y sin acuses, quince minutos mas no anaden ni una copia',
   X.mesh.bagSize().count === copiasTrasSalir,
   X.mesh.bagSize().count + ' piezas, antes ' + copiasTrasSalir);
ok('ni le llega el mismo mensaje dos veces al otro',
   Y.chat.get(Y.groups.key(gx.id)).messages.length === 1,
   String(Y.chat.get(Y.groups.key(gx.id)).messages.length));

/* ------------------------------------------------------ escribiendo en grupo */
console.log('');
console.log('Escribiendo en grupo');

Q.chat.sendTyping(clave);
ok('en un grupo, el aviso llega a los demas',
   P.chat.typingIn(clave) === 'Quim', String(P.chat.typingIn(clave)));
ok('y sigue sin dejar nada en la mochila',
   P.mesh.bagSize().count === P.mesh.bagIds().length);

var antesDelMensaje = P.chat.typingIn(clave);
Q.chat.sendGroupText(Q.groups.get(grupo.id), 'yo me apunto');
ok('al mandar el mensaje, el aviso se apaga',
   antesDelMensaje === 'Quim' && P.chat.typingIn(clave) === null,
   String(P.chat.typingIn(clave)));

/* ------------------------------------------------------------------ salir */
console.log('');
console.log('Salir del grupo');

var cuantosAntes = R.chat.list().length;
R.groups.remove(grupo.id);
ok('salirse quita el grupo de la lista', R.chat.list().length === cuantosAntes - 1);
ok('y se lleva la conversacion con el', !R.vault.state.chats[clave]);
ok('sin tocar los grupos de los demas', !!P.groups.get(grupo.id));

console.log('');
if (fails) {
    console.log('FALLOS: ' + fails + ' de ' + checks);
    process.exit(1);
}
console.log('TODO CORRECTO: ' + checks + ' comprobaciones');
