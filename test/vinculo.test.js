/* El vinculo: quien te tiene, quien no, y enterarse cuando te quitan.

   Anadir a alguien en BINTIO va en UNA sola direccion. Tu tienes su clave, pero
   el no tiene la tuya hasta que hace lo mismo, y un sobre solo se puede abrir si
   quien lo recibe tiene dado de alta a quien lo manda. De ahi salen dos
   situaciones que se parecen en la pantalla y no se parecen en nada:

     - todavia no ha llegado nada suyo: puede que no te haya anadido, o puede
       que sencillamente no os hayais cruzado. Cabe esperar.
     - te ha quitado: te lo ha dicho el. No hay nada que esperar.

   Sin el aviso, la segunda era indistinguible de la primera y se quedaba uno
   escribiendo a una pared durante semanas. Eso es lo que se prueba aqui, y
   sobre todo el detalle que lo puede romper entero: el sobre que dice "te he
   quitado" DEMUESTRA, por el mero hecho de abrirse, que quien lo mando te tenia
   dado de alta. Si el orden se cambia, el aviso se marca a si mismo como
   vinculo y no sirve de nada.                                               */
var load = require('./load');
var fails = 0, checks = 0;

function ok(name, cond, extra) {
    checks++;
    if (cond) { console.log('  ok  ' + name); }
    else { fails++; console.log('  FALLA ' + name + (extra ? '  -> ' + extra : '')); }
}

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

function cablear(a, b) {
    var haciaA = { id: a.nombre, kind: 'local', close: function () {},
        send: function (bytes) { a.mesh.handleFrame(bytes, haciaB); } };
    var haciaB = { id: b.nombre, kind: 'local', close: function () {},
        send: function (bytes) { b.mesh.handleFrame(bytes, haciaA); } };
    a.transport.addPeer(haciaB);
    b.transport.addPeer(haciaA);
    return function desconectar() {
        a.transport.removePeer(haciaB.id);
        b.transport.removePeer(haciaA.id);
    };
}

/* ------------------------------------------------------------ a medias */
console.log('Anadir va en una sola direccion');

var A = nodo('Ana'), B = nodo('Bruno');
A.contacts.add(B.pkHex, 'Bruno');
var cortar = cablear(A, B);

ok('recien anadido, Ana no sabe si Bruno la tiene',
   A.contacts.get(B.pkHex).mutuo !== true);
ok('y no es que la haya quitado: es que aun no hay nada',
   !A.contacts.get(B.pkHex).unlinked);

/* Bruno la anade y le escribe: eso SI demuestra que la tiene. */
B.contacts.add(A.pkHex, 'Ana');
B.chat.sendText(B.contacts.get(A.pkHex), 'ya te tengo');
ok('cuando llega algo suyo, hay vinculo', A.contacts.get(B.pkHex).mutuo === true);

/* ------------------------------------------------------- te han quitado */
console.log('');
console.log('Quitar a alguien y que se entere');

ok('antes de quitarla, Bruno tiene a Ana', !!B.contacts.get(A.pkHex));
ok('quitar avisa y devuelve true', B.chat.unlink(A.pkHex) === true);
ok('Bruno ya no la tiene', B.contacts.get(A.pkHex) === null);
ok('y se lleva la conversacion', !B.vault.state.chats[A.pkHex]);

var visto = A.contacts.get(B.pkHex);
ok('a Ana le consta que la han quitado', visto.mutuo === false, String(visto.mutuo));
ok('con la fecha apuntada', visto.unlinked > 0, String(visto.unlinked));
ok('pero Bruno sigue en su lista: quitarlo lo decide ella', !!visto);
ok('y sus mensajes de antes siguen ahi',
   A.chat.get(B.pkHex).messages.length === 1,
   String(A.chat.get(B.pkHex).messages.length));

/* El detalle que lo puede romper: el propio aviso se abre, y abrirse demuestra
   vinculo. Si el orden estuviera al reves, aqui pondria true. */
ok('el aviso NO se marca a si mismo como vinculo', visto.mutuo === false);

/* Y a partir de ahi, lo que Ana escriba ya no se puede abrir. */
A.chat.sendText(A.contacts.get(B.pkHex), 'sigues ahi?');
ok('lo que escriba a partir de ahora no le llega',
   B.chat.get(A.pkHex).messages.length === 0,
   String(B.chat.get(A.pkHex).messages.length));

/* ------------------------------------------- el aviso espera si no hay red */
console.log('');
console.log('El aviso no se pierde por no haber enlace');

var C = nodo('Cira'), D = nodo('Dario');
C.contacts.add(D.pkHex, 'Dario');
D.contacts.add(C.pkHex, 'Cira');
var cortarCD = cablear(C, D);
D.chat.sendText(D.contacts.get(C.pkHex), 'hola');
ok('primero hay vinculo', C.contacts.get(D.pkHex).mutuo === true);

cortarCD();                       /* se van sin cobertura */
D.chat.unlink(C.pkHex);
ok('sin enlace, Cira todavia no se ha enterado',
   C.contacts.get(D.pkHex).mutuo === true);
ok('pero el aviso esta esperando en la mochila de Dario',
   D.mesh.bagSize().count > 0, String(D.mesh.bagSize().count));

cablear(C, D);                    /* vuelven a cruzarse */
ok('en cuanto hay camino, se entera',
   C.contacts.get(D.pkHex).mutuo === false,
   String(C.contacts.get(D.pkHex).mutuo));
ok('y queda apuntado como quitada, no como "sin noticias"',
   C.contacts.get(D.pkHex).unlinked > 0);

/* ------------------------------------------------------- volver a anadir */
console.log('');
console.log('Si vuelve a anadirte, el icono vuelve');

D.contacts.add(C.pkHex, 'Cira');
D.chat.sendText(D.contacts.get(C.pkHex), 'me arrepenti');
var deVuelta = C.contacts.get(D.pkHex);
ok('vuelve a haber vinculo', deVuelta.mutuo === true, String(deVuelta.mutuo));
ok('y la marca de "me quito" desaparece', !deVuelta.unlinked,
   String(deVuelta.unlinked));
ok('con su mensaje dentro',
   C.chat.get(D.pkHex).messages.length === 2,
   String(C.chat.get(D.pkHex).messages.length));

/* ------------------------------------------------------------- los tres */
console.log('');
console.log('Los tres estados se distinguen');

function estado(contacto) {
    return contacto.mutuo ? 'vinculado' : (contacto.unlinked ? 'me quito' : 'a medias');
}
var E = nodo('Eva'), F = nodo('Fito'), G = nodo('Gala');
E.contacts.add(F.pkHex, 'Fito');
E.contacts.add(G.pkHex, 'Gala');
cablear(E, F); cablear(E, G);
F.contacts.add(E.pkHex, 'Eva');
G.contacts.add(E.pkHex, 'Eva');
G.chat.sendText(G.contacts.get(E.pkHex), 'hola Eva');
G.chat.unlink(E.pkHex);

ok('a medias: anadido y sin noticias', estado(E.contacts.get(F.pkHex)) === 'a medias',
   estado(E.contacts.get(F.pkHex)));
F.chat.sendText(F.contacts.get(E.pkHex), 'aqui estoy');
ok('vinculado: ha llegado algo suyo', estado(E.contacts.get(F.pkHex)) === 'vinculado',
   estado(E.contacts.get(F.pkHex)));
ok('me quito: lo ha dicho el', estado(E.contacts.get(G.pkHex)) === 'me quito',
   estado(E.contacts.get(G.pkHex)));

/* Quitar a quien ya no esta no revienta nada. */
var nadie = new Array(65).join('a');   /* 64 caracteres: una clave que no existe */
ok('quitar a alguien que ya no esta devuelve false',
   E.chat.unlink(nadie) === false);

console.log('');
if (fails) {
    console.log('FALLOS: ' + fails + ' de ' + checks);
    process.exit(1);
}
console.log('TODO CORRECTO: ' + checks + ' comprobaciones');
