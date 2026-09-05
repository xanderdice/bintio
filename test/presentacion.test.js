/* Prueba de la PRESENTACION: el sobre que abre alguien que no te conoce.

   Lo que hay que demostrar aqui no es que "funcione", sino tres cosas que son
   la razon de que exista este formato:

     1. Que un desconocido pueda escribirte SIN estar dado de alta, y que eso
        no le anada a tu lista: llega como solicitud y decide el usuario.
     2. Que NADIE pueda presentarse con la identidad de otro. El sello de ss2
        es lo unico que impide eso, asi que aqui se fabrica una presentacion
        que declara una clave ajena y se comprueba que se tira entera.
     3. Que el que solo la transporta no pueda leerla ni saber para quien es,
        que es lo mismo que ya se le exige a un sobre normal.

   Todo lo caro (minar la prueba de coste) es sincrono a proposito salvo el
   ultimo bloque, que es el flujo de verdad: escribir a alguien que todavia no
   te tiene, con un tercero en medio que solo hace de mula.                  */
var ayuda = require('./ayuda');
var ok = ayuda.ok;

/* El nodo lo monta test/ayuda.js; aqui solo se le pide lo que esta prueba
   necesita distinto, y se le ponen los nombres que usa este fichero.

   viejo: la boveda se monta SIN el campo "requests", que es como esta una
   hecha antes de que la presentacion existiera. Si algo de esto se rompiera
   con una boveda vieja, se rompe aqui.

   openInbox: el buzon va CERRADO de serie (vault.js). Sin abrirlo, una
   presentacion no se abre siquiera y todo lo de abajo mediria el rechazo en
   vez de lo que quiere medir. Que haya que pedirlo a mano es justo lo que se
   quiere, y el valor por defecto se comprueba aparte al final. */
function nodo(nombre) {
    var V = ayuda.nodo(nombre, { viejo: true, ajustes: { openInbox: true } });
    return { V: V, U: V.util, id: V.yo, pk: V.pkHex, nombre: nombre, st: V.vault.state };
}

/* Un nodo con los ajustes tal y como salen de fabrica: sin tocar el buzon.
   Sirve para comprobar el valor por defecto, que es la mitad de esta
   funcionalidad. */
function nodoDeFabrica(nombre) {
    var n = nodo(nombre);
    delete n.st.settings.openInbox;
    return n;
}


/* Cada marco entra por un enlace distinto: el cupo por enlace es de diez
   aperturas por minuto y con un solo identificador la prueba mediria el cupo
   en vez de lo que quiere medir. */
var nEnlace = 0;
function enlace() {
    nEnlace++;
    var p = { id: 'cable-' + nEnlace, kind: 'local', label: 'x',
              send: function () {}, close: function () {} };
    return p;
}

function entregar(destino, bytes) {
    destino.V.mesh.handleFrame(new Uint8Array(bytes), enlace());
}

/* Sellar una presentacion de "de" para "para". declara permite mentir sobre la
   clave publica propia, que es justo lo que tiene que fallar. */
function presentacion(de, para, name, text, declara, extra) {
    var opts = {
        mySk: de.id.sk,
        myPk: declara || de.id.pk,
        recipPk: para.id.pk,
        name: name,
        text: text
    };
    if (extra) {
        for (var k in extra) {
            if (Object.prototype.hasOwnProperty.call(extra, k)) { opts[k] = extra[k]; }
        }
    }
    return de.V.presenta.sealSync(opts);
}

/* ======================================================================== */
console.log('El marco en el cable');

var ana = nodo('Ana'), beto = nodo('Beto'), carla = nodo('Carla');
var P = ana.V.presenta, E = ana.V.envelope, U = ana.U;

var t0 = Date.now();
var marco = presentacion(ana, beto, 'Ana', 'hola, soy ana y quiero escribirte');
var minado = Date.now() - t0;

ok('el marco mide 708 bytes exactos', marco.length === P.FRAME, marco.length + ' bytes');
ok("empieza por 'N' y 'P'", marco[0] === E.MAGIC0 && marco[1] === E.MAGIC_PRES,
   marco[0] + ',' + marco[1]);
ok('las banderas van a cero', marco[3] === 0, 'valen ' + marco[3]);
ok('los saltos dados arrancan en 1, no en 0', marco[5] === 1,
   'vale ' + marco[5]);
ok('lleva la prueba de coste hecha',
   P.workOk(marco.subarray(0, 64), marco.subarray(64)), 'minada en ' + minado + ' ms');

var hex = U.toHex(marco);
ok('la clave publica del remitente no viaja en claro', hex.indexOf(ana.pk) === -1);
ok('la clave publica del destinatario no viaja en claro', hex.indexOf(beto.pk) === -1);
ok('el texto no viaja en claro',
   hex.indexOf(U.toHex(U.fromString('quiero escribirte'))) === -1);

/* Todo lo que se comprueba antes de gastar una sola curva. Un null aqui
   significa ademas que no se reenvia y no se guarda. */
console.log('Lo que se rechaza sin pagar criptografia');
var roto;
roto = new Uint8Array(marco.subarray(0, 707));
ok('707 bytes no son una presentacion', P.parse(roto) === null);
roto = U.concat([marco, new Uint8Array(1)]);
ok('709 bytes tampoco', P.parse(roto) === null);
roto = new Uint8Array(marco); roto[3] = 1;
ok('con banderas distintas de cero se descarta', P.parse(roto) === null);
roto = new Uint8Array(marco); roto[4] = 255;
ok('con un ttl de 255 se descarta (nada amplifica)', P.parse(roto) === null);
roto = new Uint8Array(marco); roto[44] ^= 0x40;
ok('con la prueba de coste alterada se descarta', P.parse(roto) === null);
roto = new Uint8Array(marco); roto[700] ^= 0x40;
ok('con un byte del cuerpo cambiado se descarta', P.parse(roto) === null);
ok('un marco intacto si se parsea', P.parse(marco) !== null);

/* La caducidad se mina dentro del hash, asi que para probar el tope hay que
   sellar de verdad una con vida absurda. Sin este tope, un marco con
   caducidad enorme es inmortal en todas las bolsas de la malla. */
var eterna = presentacion(ana, beto, 'Ana', 'para siempre', null,
                          { lifeSeconds: 365 * 24 * 3600 });
ok('una caducidad mas alla del tope se descarta', P.parse(eterna) === null,
   'caduca en ' + U.readU48(eterna, 6));

/* ======================================================================== */
console.log('');
console.log('Alguien te escribe sin que lo tengas dado de alta');

ok('la boveda vieja no tiene el campo y no estorba',
   beto.st.requests === undefined && beto.V.requests.count() === 0);

entregar(beto, marco);

ok('llega UNA solicitud', beto.V.requests.count() === 1, beto.V.requests.count() + '');
ok('y NO se ha anadido ningun contacto', beto.V.contacts.all().length === 0,
   beto.V.contacts.all().length + ' contactos');
var sol = beto.V.requests.all()[0];
ok('la solicitud dice de quien es', sol && sol.pk === ana.pk);
ok('trae el nombre declarado', sol && sol.name === 'Ana', sol && sol.name);
ok('trae el primer mensaje', sol && sol.text === 'hola, soy ana y quiero escribirte',
   sol && sol.text);
ok('la hora es la de llegada a este aparato', sol && sol.at > 0 && sol.at <= Date.now());
ok('no hay ninguna conversacion todavia',
   JSON.stringify(beto.st.chats) === '{}', JSON.stringify(beto.st.chats));
/* Lo nuestro se guarda EXACTAMENTE igual que lo ajeno.

   Antes no se guardaba, por ahorrar sitio, y ese ahorro era una delacion:
   el inventario de la mochila se le da a cualquier vecino que lo pida, todo
   el que transporta un marco lo tiene apuntado, y el destinatario era el
   unico que no. Se captura un marco de la malla, se le ofrece a cada vecino,
   se le pide la lista, y el unico que no lo lleva es para quien iba. Con una
   presentacion delataba ademas que ese buzon esta abierto.

   Se fija comparandolo con Carla, que solo lo transporta: las dos listas
   tienen que quedar iguales. */
ok('lo suyo se guarda igual que lo ajeno', beto.V.mesh.bagSize().count === 1,
   beto.V.mesh.bagSize().count + ' piezas');
var soloTransporta = nodo('Testigo');
entregar(soloTransporta, marco);
ok('y la mochila del que solo lo lleva es identica',
   JSON.stringify(beto.V.mesh.bagIds()) === JSON.stringify(soloTransporta.V.mesh.bagIds()),
   JSON.stringify(beto.V.mesh.bagIds()) + ' vs ' + JSON.stringify(soloTransporta.V.mesh.bagIds()));
ok('la malla lo cuenta como presentacion', beto.V.mesh.stats.presented === 1);
ok('y lo reenvia como cualquier otro marco', beto.V.mesh.stats.relayed === 1,
   beto.V.mesh.stats.relayed + '');

/* ======================================================================== */
console.log('');
console.log('El buzon: de serie hay que estar dado de alta para escribir');

/* La mitad de esta funcionalidad es su valor por defecto. Si algun dia alguien
   le da la vuelta -por comodidad, por una migracion, por un descuido- todas las
   demas pruebas seguirian verdes, porque todas abren el buzon a mano. Esta es la
   unica que se enteraria. */
var cerrado = nodoDeFabrica('Cerrado');

ok('una boveda recien creada trae el buzon cerrado',
   cerrado.V.presenta.buzonAbierto() === false);

var marcoParaCerrado = ana.V.presenta.sealSync({
    mySk: ana.id.sk, myPk: ana.id.pk, recipPk: cerrado.id.pk,
    name: 'Ana', text: 'dejame entrar'
});
var curvasAntes = cerrado.V.mesh.stats.presented;
entregar(cerrado, marcoParaCerrado);

ok('con el buzon cerrado no llega ninguna solicitud',
   cerrado.V.requests.count() === 0, cerrado.V.requests.count() + '');
ok('ni se anade ningun contacto', cerrado.V.contacts.all().length === 0);
ok('ni aparece conversacion ninguna',
   JSON.stringify(cerrado.st.chats) === '{}', JSON.stringify(cerrado.st.chats));
/* Y lo importante: se trata como lo que es para nosotros, un marco ajeno. Se
   sigue transportando para quien si lo quiera. */
ok('pero se sigue llevando para otros', cerrado.V.mesh.bagSize().count === 1,
   cerrado.V.mesh.bagSize().count + ' piezas');
ok('y se reenvia como cualquier marco', cerrado.V.mesh.stats.relayed >= 1);

/* Abrirlo es una decision, y surte efecto sin reiniciar nada. */
cerrado.st.settings.openInbox = true;
ok('al abrirlo, buzonAbierto lo dice', cerrado.V.presenta.buzonAbierto() === true);
var otroMarco = ana.V.presenta.sealSync({
    mySk: ana.id.sk, myPk: ana.id.pk, recipPk: cerrado.id.pk,
    name: 'Ana', text: 'ahora si'
});
entregar(cerrado, otroMarco);
ok('y entonces si entra la solicitud', cerrado.V.requests.count() === 1,
   cerrado.V.requests.count() + '');

/* ======================================================================== */
console.log('');
console.log('El sello de ss2: nadie puede presentarse con la identidad de otro');

/* Carla sella con SU privada pero declara dentro la clave publica de Ana. El
   texto cifrado se abre (para eso solo hace falta la publica de Beto), asi que
   lo unico que la para es el sello. */
var suplantacion = presentacion(carla, beto, 'Ana', 'soy ana, de verdad', ana.id.pk);
ok('la suplantacion es un marco valido en el cable', P.parse(suplantacion) !== null);
ok('pero no abre: el sello no cuadra',
   beto.V.presenta.open(beto.V.presenta.parse(suplantacion), beto.id.sk, beto.id.pk) === null);

var antes = beto.V.requests.count();
entregar(beto, suplantacion);
ok('no crea ninguna solicitud', beto.V.requests.count() === antes,
   beto.V.requests.count() + ' solicitudes');
ok('no anade ningun contacto', beto.V.contacts.all().length === 0);

/* Carla, con su propia identidad, si puede escribir: eso no es suplantar. */
var conSuNombre = presentacion(carla, beto, 'Carla', 'yo soy yo');
ok('con su identidad de verdad si se abre',
   beto.V.presenta.open(beto.V.presenta.parse(conSuNombre), beto.id.sk, beto.id.pk) !== null);

/* Un nombre con un salto de linea compondria una fila falsa en la lista. */
var nombreSucio = 'Ana' + String.fromCharCode(10) + 'VERIFICADA';
/* sinFiltrar simula un cliente modificado: el nuestro no llega ni a minar
   un nombre asi, pero el que protege de verdad es el filtro de quien recibe. */
var conControl = presentacion(ana, beto, nombreSucio, 'mira mi nombre', null, { sinFiltrar: true });
ok('un nombre con caracteres de control se rechaza',
   beto.V.presenta.open(beto.V.presenta.parse(conControl), beto.id.sk, beto.id.pk) === null);

/* ======================================================================== */
console.log('');
console.log('Dos presentaciones de la misma clave no son dos solicitudes');

var segunda = presentacion(ana, beto, 'Ana', 'te escribo otra vez');
ok('la segunda es un marco distinto', P.parse(segunda).id !== P.parse(marco).id);
entregar(beto, segunda);
ok('sigue habiendo UNA sola solicitud', beto.V.requests.count() === 1,
   beto.V.requests.count() + '');
ok('y la fila se ha puesto al dia',
   beto.V.requests.get(ana.pk).text === 'te escribo otra vez',
   beto.V.requests.get(ana.pk).text);

/* La misma copia otra vez, que es lo que hace la malla todo el rato. */
entregar(beto, marco);
ok('una copia repetida por la malla no cambia nada', beto.V.requests.count() === 1);

/* ======================================================================== */
console.log('');
console.log('El que solo la transporta');

entregar(carla, marco);
ok('carla NO puede abrirla',
   carla.V.presenta.open(carla.V.presenta.parse(marco), carla.id.sk, carla.id.pk) === null);
ok('carla no se entera de nada', carla.V.requests.count() === 0 &&
   carla.V.contacts.all().length === 0);
ok('pero la lleva en la bolsa', carla.V.mesh.bagSize().count === 1,
   carla.V.mesh.bagSize().count + ' piezas');
ok('marcada como presentacion, con su cupo aparte',
   carla.st.carrier[0].k === 'p', JSON.stringify(carla.st.carrier[0].k));
ok('y la reenvia', carla.V.mesh.stats.relayed === 1, carla.V.mesh.stats.relayed + '');
ok('nada de lo que lleva le dice para quien es',
   JSON.stringify(carla.st).indexOf(beto.pk) === -1);

/* ======================================================================== */
console.log('');
console.log('Aceptar');

var contacto = beto.V.requests.accept(ana.pk);
ok('se crea el contacto', !!contacto && contacto.pk === ana.pk);
ok('con el nombre que declaro', contacto && contacto.name === 'Ana', contacto && contacto.name);
ok('sin dar la huella por comprobada', contacto && contacto.verified === false);
ok('y con reciprocidad: puede leer lo que le escribamos',
   contacto && contacto.mutuo === true);
ok('la solicitud desaparece', beto.V.requests.count() === 0);

var conversacion = beto.V.chat.get(ana.pk).messages;
ok('su primer mensaje entra en la conversacion', conversacion.length === 1,
   JSON.stringify(conversacion));
ok('con el texto que traia', conversacion.length === 1 &&
   conversacion[0].text === 'te escribo otra vez', conversacion.length && conversacion[0].text);
ok('como mensaje recibido y sin leer', conversacion.length === 1 &&
   conversacion[0].dir === 'in' && beto.V.chat.get(ana.pk).unread === 1);

/* ======================================================================== */
console.log('');
console.log('De quien ya es contacto: mensaje, no solicitud');

var tercera = presentacion(ana, beto, 'Ana con otro nombre', 'y esto va al chat');
entregar(beto, tercera);
ok('no crea solicitud', beto.V.requests.count() === 0);
ok('entra como un mensaje mas', beto.V.chat.get(ana.pk).messages.length === 2,
   beto.V.chat.get(ana.pk).messages.length + ' mensajes');
ok('con su texto', beto.V.chat.get(ana.pk).messages[1].text === 'y esto va al chat');
ok('y NO le cambia el nombre al contacto (lo pudo poner el usuario)',
   beto.V.contacts.get(ana.pk).name === 'Ana', beto.V.contacts.get(ana.pk).name);

/* Otra copia de esa misma presentacion no duplica el mensaje: el
   identificador sale de la efimera y los dos lados lo calculan igual. */
beto.V.mesh.handleFrame(new Uint8Array(tercera), enlace());
ok('una copia repetida no duplica el mensaje',
   beto.V.chat.get(ana.pk).messages.length === 2,
   beto.V.chat.get(ana.pk).messages.length + ' mensajes');

/* ======================================================================== */
console.log('');
console.log('Descartar no deja rastro');

var dora = nodo('Dora');
var deCarla = presentacion(carla, dora, 'Carla', 'secreto que no quiero guardar');
entregar(dora, deCarla);
ok('llega la solicitud', dora.V.requests.count() === 1);
ok('se descarta', dora.V.requests.discard(carla.pk) === true);
ok('no queda ninguna solicitud', dora.V.requests.count() === 0);
ok('no se ha anadido contacto', dora.V.contacts.all().length === 0);
ok('no queda nada suyo en la boveda',
   JSON.stringify(dora.st).indexOf('secreto que no quiero guardar') === -1 &&
   JSON.stringify(dora.st).indexOf(carla.pk) === -1);

/* Mientras la boveda siga abierta, quien fue descartado no vuelve a asomar.
   No es una lista negra -no se guarda nada- es no repintar lo que el usuario
   acaba de quitar de la pantalla, que hace falta porque la malla repite. */
var insiste = presentacion(carla, dora, 'Carla', 'insisto');
entregar(dora, insiste);
ok('quien insiste no vuelve a la pantalla en esta sesion',
   dora.V.requests.count() === 0, dora.V.requests.count() + '');

/* ======================================================================== */
console.log('');
console.log('Limites duros');

var largo = '';
while (largo.length < 100) { largo += String.fromCharCode(0xe1); }   /* 2 bytes cada una */
var nombreLargo = presentacion(ana, dora, largo, 'nombre largo');
ok('un nombre largo no rompe el marco', nombreLargo.length === P.FRAME);
var leido = dora.V.presenta.open(dora.V.presenta.parse(nombreLargo), dora.id.sk, dora.id.pk);
ok('el nombre se corta a 64 bytes UTF-8',
   leido && U.fromString(leido.name).length <= P.NOMBRE_MAX,
   leido && U.fromString(leido.name).length + ' bytes');
ok('y sigue siendo el mismo nombre por delante',
   leido && largo.indexOf(leido.name) === 0);

var textazo = '';
while (textazo.length < 900) { textazo += 'x'; }
var conTextazo = presentacion(ana, dora, 'Ana', textazo);
ok('un mensaje que no cabe no rompe el marco', conTextazo.length === P.FRAME);
var leido2 = dora.V.presenta.open(dora.V.presenta.parse(conTextazo), dora.id.sk, dora.id.pk);
/* No se recorta a medias: se manda sin mensaje y el texto entero llega en el
   sobre normal, que viaja con el mismo identificador. Media frase para
   siempre seria peor que ninguna. */
ok('un mensaje de mas de 512 bytes viaja vacio, no cortado',
   leido2 && leido2.text === '', leido2 && ('[' + leido2.text.length + ']'));

ok('todas las presentaciones miden lo mismo',
   marco.length === segunda.length && segunda.length === conTextazo.length &&
   conTextazo.length === nombreLargo.length, 'no todas miden ' + P.FRAME);

/* ========================================================================
   Las defensas que se podian borrar sin que nada se pusiera rojo.

   Una auditoria por mutacion quito, una a una, seis comprobaciones del
   protocolo y las tres baterias siguieron verdes. Una defensa que ninguna
   prueba mira es una defensa que alguien quitara en una limpieza sin que nadie
   lo note hasta que sea tarde. Aqui hay una prueba por cada una, escrita para
   ponerse ROJA en cuanto se anule la linea que la sostiene.
   ======================================================================== */
console.log('');
console.log('Las defensas del sello, una por una');

/* Un sellado a mano, pieza a pieza. Es la unica forma de fabricar los marcos
   que ninguna implementacion correcta produce -un sello calculado sobre otra
   cabecera, un sello que no cubre el claro que viaja, un nombre en UTF-8 que no
   es canonico- y sin ellos esas defensas no las prueba nadie.

   Usa las mismas piezas publicas que P.sealSync (P.pack, P.authKey, P.boxKey,
   P.authFor, P.aadOf), asi que no reimplementa el formato: lo unico que cambia
   es lo que cada prueba quiere torcer.
     claro       el texto en claro que VIAJA (por defecto, uno correcto)
     claroSello  sobre el que se calcula el sello, si no es el que viaja
     headSello   funcion que devuelve la cabecera con la que se calcula el
                 sello, si no es la que viaja
     banderas    el byte 3
     minar       hacer la prueba de coste (un segundo largo)                  */
function fabricar(de, para, op) {
    op = op || {};
    var W = de.V, C = W.crypto, u = W.util, Pw = W.presenta, Ew = W.envelope;
    var eph = C.keypair(), nonce = C.random(C.NONCE);

    var head = new Uint8Array(Pw.HEAD);
    head[0] = Ew.MAGIC0; head[1] = Ew.MAGIC_PRES; head[2] = W.PROTO;
    head[3] = op.banderas || 0;
    head[4] = Ew.DEFAULT_TTL; head[5] = 1;
    head.set(u.u48(Math.floor(Date.now() / 1000) + Pw.LIFE), 6);
    head.set(eph.pk, 12);
    head.set(nonce, 52);

    var claro = op.claro || Pw.pack(de.id.pk, u.fromString('Ana'), u.fromString('hola'));
    var ss2 = C.x25519(de.id.sk, para.id.pk);
    var ak = Pw.authKey(ss2, eph.pk);
    claro.set(Pw.authFor(ak, op.headSello ? op.headSello(head) : head,
                         op.claroSello || claro), Pw.PLAIN - 16);

    var ss1 = C.x25519(eph.sk, para.id.pk);
    var k = Pw.boxKey(ss1, eph.pk);
    var cuerpo = C.seal(k, nonce, Pw.aadOf(head), claro);
    if (op.minar) { Pw.mineSync(head, cuerpo); }
    return u.concat([head, cuerpo]);
}

/* El descriptor que P.open espera, sin pasar por P.parse. P.parse exige la
   prueba de coste hecha, y minar un segundo por comprobacion para medir lo que
   hace P.open -que ni la mira- seria pagar un minuto de reloj por nada. Lo que
   si es cosa de P.parse se prueba aparte, con marcos minados de verdad. */
function comoParse(b) {
    return { raw: b, eph: b.subarray(12, 44), nonce: b.subarray(52, 64),
             body: b.subarray(64) };
}
function abrir(quien, bytes) {
    return quien.V.presenta.open(comoParse(bytes), quien.id.sk, quien.id.pk);
}

/* El control. Sin esto, todas las comprobaciones de abajo podrian estar
   pasando porque el fabricante produce basura, no porque la defensa funcione. */
var patron = fabricar(ana, beto, { minar: 1 });
ok('el fabricante a mano produce un marco valido', P.parse(patron) !== null);
var leidoPatron = abrir(beto, patron);
ok('...que se abre y trae lo que se puso dentro',
   leidoPatron && leidoPatron.name === 'Ana' && leidoPatron.text === 'hola',
   JSON.stringify(leidoPatron));

/* 1. El sello cubre el TEXTO EN CLARO. Si solo cubriera la cabecera, este
   marco -sello calculado sobre un claro y otro claro dentro- abriria. */
var claroA = P.pack(ana.id.pk, U.fromString('Ana'), U.fromString('hola'));
var claroB = P.pack(ana.id.pk, U.fromString('Ana'), U.fromString('HOLA'));
ok('un sello calculado sobre OTRO claro no vale',
   abrir(beto, fabricar(ana, beto, { claro: claroB, claroSello: claroA })) === null);

/* 2. El sello cubre la CABECERA. Ningun tercero puede llegar a este estado
   -tendria que cifrar hacia nosotros- pero el sello tiene que estar atado a la
   cabecera por su cuenta y no solo porque el AEAD tambien la cubra: el dia que
   alguien toque una de las dos, la otra sigue en pie. */
var m2 = fabricar(ana, beto, {
    headSello: function (h) {
        var otra = new Uint8Array(h);
        otra.set(U.u48(U.readU48(h, 6) + 3600), 6);   /* otra caducidad */
        return otra;
    }
});
ok('un sello calculado sobre OTRA cabecera no vale', abrir(beto, m2) === null);

/* 3. Una presentacion que declara TU PROPIA clave. No es una suplantacion
   -para fabricarla hace falta tu privada- pero seria una solicitud imposible de
   aceptar (K.add rechaza la clave propia) y obliga a razonar sobre reflexion en
   toda la aplicacion. Beto se la manda a Beto: el sello cuadra, porque los dos
   ss2 son el mismo. Lo unico que la para es la comparacion. */
ok('una presentacion que declara tu propia clave no abre',
   abrir(beto, fabricar(beto, beto, {})) === null);

/* 4. Las banderas. La comprobacion b[3] !== 0 estaba VACIA: quien rechazaba el
   caso era la prueba de coste, porque cambiarle el byte 3 a un marco ya minado
   la invalida. Aqui las banderas se ponen a uno ANTES de minar, asi que la
   prueba de coste esta bien hecha y el unico que puede rechazarlo es el filtro
   barato de P.parse. */
var m4 = fabricar(ana, beto, { banderas: 1, minar: 1 });
ok('la prueba de coste de ese marco esta bien hecha',
   P.workOk(m4.subarray(0, 64), m4.subarray(64)));
ok('y aun asi, con banderas distintas de cero se descarta', P.parse(m4) === null);

/* 5. El UTF-8 canonico. C1 A0 es una forma larga del acento grave: U.toString
   lo lee como tal, pero volver a codificarlo da 60, un byte distinto. El
   caracter que sale no esta en ninguna lista de prohibidos, asi que lo unico
   que lo rechaza es exigir que los bytes vuelvan a salir iguales. */
var acento = U.fromString(String.fromCharCode(0x60));
ok('el mismo nombre en UTF-8 canonico si abre',
   !!abrir(beto, fabricar(ana, beto, { claro: P.pack(ana.id.pk, acento, U.fromString('hola')) })));
ok('un nombre en UTF-8 no canonico no abre',
   abrir(beto, fabricar(ana, beto, {
       claro: P.pack(ana.id.pk, new Uint8Array([0xc1, 0xa0]), U.fromString('hola'))
   })) === null);

/* ======================================================================== */
console.log('');
console.log('El filtro del nombre cumple lo que promete');

/* Todos estos pasaban. U+2028 y U+2029 son saltos de linea de pleno derecho:
   con ellos se componia el mismo "Ana / VERIFICADA" en dos filas que el filtro
   decia impedir. Los demas no se ven, y lo que no se ve permite dos nombres
   distintos que se pintan igual. */
var COLADOS = [
    [0x2028, 'separador de linea'],
    [0x2029, 'separador de parrafo'],
    [0x0085, 'NEL, el salto de linea de los C1'],
    [0x061c, 'marca arabe'],
    [0x2060, 'juntapalabras'],
    [0x180e, 'separador mongol'],
    [0x3164, 'relleno hangul'],
    [0x115f, 'relleno hangul inicial'],
    [0xfff9, 'ancla de anotacion']
];
var colados = [], j;
for (j = 0; j < COLADOS.length; j++) {
    var sucio = 'Ana' + String.fromCharCode(COLADOS[j][0]) + 'VERIFICADA';
    var conSucio = fabricar(ana, beto, {
        claro: P.pack(ana.id.pk, U.fromString(sucio), U.fromString('hola'))
    });
    if (abrir(beto, conSucio) !== null) { colados.push(COLADOS[j][1]); }
}
ok('ninguno de los nueve caracteres que se colaban abre ya', colados.length === 0,
   colados.join(', '));

/* Un sustituto suelto no tiene representacion en UTF-8: solo existe dentro de
   UTF-16. Pasaba porque el ida y vuelta de U.toString lo devuelve igual, y esa
   es justo la razon por la que el comentario que decia que dos cadenas de bytes
   distintas no se pueden pintar igual era falso: media docena de sustitutos
   sueltos se pintan todos con el mismo rombo. */
var medioPar = U.fromString('Ana' + String.fromCharCode(0xd83d));
ok('un sustituto suelto no abre',
   abrir(beto, fabricar(ana, beto, {
       claro: P.pack(ana.id.pk, medioPar, U.fromString('hola'))
   })) === null);
/* Y el par entero, que es un caracter legitimo, tiene que seguir pasando: una
   lista de caracteres prohibidos que se lleve por delante los emojis estaria
   rechazando nombres de verdad. */
var conEmoji = 'Ana ' + String.fromCharCode(0xd83d) + String.fromCharCode(0xde00);
var leidoEmoji = abrir(beto, fabricar(ana, beto, {
    claro: P.pack(ana.id.pk, U.fromString(conEmoji), U.fromString('hola'))
}));
ok('un par de sustitutos completo (un emoji) si pasa',
   leidoEmoji && leidoEmoji.name === conEmoji, leidoEmoji && leidoEmoji.name);

/* ======================================================================== */
console.log('');
console.log('El cupo de curvas: la unica defensa contra un duelo de CPU');

/* La prueba de coste encarece FABRICAR un marco, pero no gana un pulso contra
   alguien con sha256 nativo. Ese pulso lo gana el cupo: pase lo que pase, abrir
   presentaciones no puede costar mas de 60 curvas por minuto en todo el nodo ni
   mas de 10 por enlace. No lo probaba nada, asi que se podia borrar entero.

   El cupo se cuenta por minuto de reloj: si la medida cae justo en el cambio de
   minuto, el contador se reinicia a mitad y no mide nada. Por eso se repite en
   ese caso, que es lo unico que hace falta -el minuto nuevo arranca con el cupo
   entero- y nunca mas de cuatro veces. */
function enUnMinuto(fn) {
    var r = null;
    for (var t = 0; t < 4; t++) {
        var w = Math.floor(Date.now() / 60000);
        r = fn();
        if (Math.floor(Date.now() / 60000) === w) { return r; }
    }
    return r;
}

var iker = nodo('Iker');
var medida = enUnMinuto(function () {
    /* El marco de Ana para Beto: Iker paga la curva y no abre, que es
       exactamente lo que hace un marco fabricado para agotarle la CPU. */
    var env = iker.V.presenta.parse(marco);
    var res = { peer: [], nodo: null, otro: null }, q, p;
    for (q = 0; q < P.TRY_PEER + 1; q++) {
        res.peer.push(iker.V.presenta.receive(env, { id: 'cable-terco' }));
    }
    res.otro = iker.V.presenta.receive(env, { id: 'cable-limpio' });
    /* Hasta agotar el cupo del nodo entero, con enlaces distintos para que no
       sea el sub-cupo por enlace quien lo pare. */
    for (p = 0; p < 6; p++) {
        for (q = 0; q < P.TRY_PEER; q++) {
            iker.V.presenta.receive(env, { id: 'cable-' + p });
        }
    }
    res.nodo = iker.V.presenta.receive(env, { id: 'cable-nuevo' });
    return res;
});

var diezPrimeras = 0;
for (j = 0; j < P.TRY_PEER; j++) {
    if (medida.peer[j] === 'ajena') { diezPrimeras++; }
}
ok('un enlace tiene diez intentos por minuto', diezPrimeras === P.TRY_PEER,
   diezPrimeras + ' de ' + P.TRY_PEER);
ok('y el once se queda sin cupo', medida.peer[P.TRY_PEER] === 'diferida',
   medida.peer[P.TRY_PEER]);
ok('el sub-cupo es por enlace: otro cable distinto todavia tiene el suyo',
   medida.otro === 'ajena', medida.otro);
ok('agotado el cupo del nodo, ya no se abre ninguna', medida.nodo === 'diferida',
   medida.nodo);

/* Y lo que no se pudo probar NO se pierde: entra en la mochila sin la marca de
   probada, y P.retry la recupera cuando vuelva a haber cupo. */
entregar(iker, marco);
var enEspera = 0;
for (j = 0; j < iker.st.carrier.length; j++) {
    if (iker.st.carrier[j].k === 'p' && !iker.st.carrier[j].p) { enEspera++; }
}
ok('sin cupo, la presentacion se guarda sin probar en vez de tirarse',
   enEspera === 1, JSON.stringify(iker.st.carrier));

/* ======================================================================== */
console.log('');
console.log('Un relevo no puede suprimir una presentacion re-minando la caducidad');

/* La caducidad SI entra en el AEAD pero no entraba en el identificador. Un
   relevo cambiaba esos seis bytes, volvia a minar (un sha256 por intento) y
   obtenia un marco con el MISMO identificador que ya no abre. Se propagaba, y
   cada nodo por el que pasaba daba por visto el identificador y tiraba el bueno
   cuando llegaba detras: la solicitud desaparecia sin dejar rastro. */
var fran = nodo('Fran');
var legitima = presentacion(ana, fran, 'Ana', 'no me puedes borrar');
var envenenada = new Uint8Array(legitima);
envenenada.set(U.u48(U.readU48(envenenada, 6) + 3600), 6);
P.mineSync(envenenada.subarray(0, 64), envenenada.subarray(64));

ok('el marco re-minado pasa el filtro barato', P.parse(envenenada) !== null);
ok('pero cambiar la caducidad cambia el identificador',
   P.parse(envenenada).id !== P.parse(legitima).id,
   P.parse(envenenada).id + ' / ' + P.parse(legitima).id);
ok('y no se puede abrir: la caducidad esta en el AEAD',
   fran.V.presenta.open(fran.V.presenta.parse(envenenada), fran.id.sk, fran.id.pk) === null);

entregar(fran, envenenada);
entregar(fran, legitima);
ok('el bueno llega igual: nadie lo ha suprimido', fran.V.requests.count() === 1,
   fran.V.requests.count() + ' solicitudes');

/* Y la deduplicacion legitima sigue en pie: lo unico mutable son los saltos. */
var conSalto = new Uint8Array(legitima);
E.hop(conSalto);
ok('dos copias con distinto contador de saltos siguen siendo la misma',
   P.parse(conSalto).id === P.parse(legitima).id);

/* Una presentacion SIN texto de quien ya tiene una solicitud puesta no la deja
   muda: puede ser el reintento que manda chat.js cuando la suya se perdio
   antes de salir, y ese va vacio a proposito porque el texto viaja aparte. */
entregar(fran, presentacion(ana, fran, 'Ana', ''));
ok('una presentacion sin texto no borra el que ya se habia leido',
   fran.V.requests.get(ana.pk).text === 'no me puedes borrar',
   '[' + fran.V.requests.get(ana.pk).text + ']');

/* ======================================================================== */
console.log('');
console.log('La lista llena no destruye lo que llega');

/* Con la lista al tope, la presentacion legitima se abria, no cabia, y se daba
   por atendida: la malla la marcaba como nuestra, no entraba en la mochila y el
   emisor no reintenta nunca. Se perdia para siempre, y con veinte basuras
   dentro no podia entrar ninguna hasta que el usuario las descartara a mano. */
var gaby = nodo('Gaby');
gaby.st.requests = [];
for (j = 0; j < P.SOL_MAX; j++) {
    gaby.st.requests.push({
        pk: U.toHex(gaby.V.crypto.random(32)), name: 'Basura ' + j,
        text: 'ruido', at: Date.now(), mid: U.toHex(gaby.V.crypto.random(8))
    });
}
var deAna = presentacion(ana, gaby, 'Ana', 'dejadme entrar');
entregar(gaby, deAna);

ok('la lista llena no admite una mas', gaby.V.requests.count() === P.SOL_MAX,
   gaby.V.requests.count() + '');
ok('pero la legitima NO se destruye: se queda en la mochila',
   gaby.V.mesh.bagGet(P.parse(deAna).id) !== null);
ok('marcada como presentacion que espera sitio, sin darse por atendida',
   gaby.st.carrier.length === 1 && gaby.st.carrier[0].k === 'p' &&
   gaby.st.carrier[0].w === 1 && !gaby.st.carrier[0].p,
   JSON.stringify(gaby.st.carrier[0]));
ok('y la aplicacion puede saber que hay alguien esperando sitio',
   gaby.V.requests.esperando() === 1 && gaby.V.requests.hueco() === false);

/* Mientras siga llena no se vuelve a pagar su curva: regalarle el cupo a quien
   ha llenado la lista seria hacerle el trabajo. */
ok('mientras no haya sitio, el reintento no la vuelve a abrir',
   gaby.V.presenta.retry() === 0);

/* El usuario descarta una basura y en la vuelta siguiente del reloj entra. */
gaby.V.requests.discard(gaby.st.requests[0].pk);
ok('al hacer sitio, el reintento la recupera', gaby.V.presenta.retry() === 1);
var recuperada = gaby.V.requests.get(ana.pk);
ok('y ahora si esta la solicitud de ana', !!recuperada);
ok('con su texto entero', !!recuperada && recuperada.text === 'dejadme entrar',
   recuperada && recuperada.text);
ok('ya no queda nada esperando sitio', gaby.V.requests.esperando() === 0);

/* ======================================================================== */
console.log('');
console.log('La efimera es de un solo uso, y no es de quien sella');

/* armar() hacia U.wipe(eph.sk) sobre el objeto de quien llama. Sellar dos veces
   con el mismo par cifraba con una privada de 32 ceros, que despues del
   clamping es un escalar CONSTANTE que cualquiera puede aplicar a la clave
   publica del destinatario -que es publica-: un tercero descifraba el nombre,
   el texto y la clave declarada. Hoy no hay forma de llegar ahi, porque el
   segundo sellado no produce ningun marco. */
var par = P.prepare();
var copiaSk = U.toHex(par.sk);
var conPar = ana.V.presenta.sealSync({
    mySk: ana.id.sk, myPk: ana.id.pk, recipPk: beto.id.pk,
    name: 'Ana', text: 'primera', eph: par
});
ok('sellar no toca la memoria de quien llama', U.toHex(par.sk) === copiaSk);
ok('y el marco se abre en su destino',
   beto.V.presenta.open(beto.V.presenta.parse(conPar), beto.id.sk, beto.id.pk) !== null);

var segundoIntento = null;
try {
    ana.V.presenta.sealSync({
        mySk: ana.id.sk, myPk: ana.id.pk, recipPk: beto.id.pk,
        name: 'Ana', text: 'SEGUNDA - SECRETO', eph: par
    });
} catch (e) { segundoIntento = e; }
ok('sellar otra vez con la misma efimera no produce marco: lanza',
   segundoIntento !== null, 'devolvio un marco');

/* Y el caso que midio la auditoria, por si alguien recupera el borrado: una
   efimera cuya privada ya son ceros no cuadra con su publica y no sella. */
var borrada = P.prepare();
U.wipe(borrada.sk);
var conBorrada = null;
try {
    ana.V.presenta.sealSync({
        mySk: ana.id.sk, myPk: ana.id.pk, recipPk: beto.id.pk,
        name: 'Ana', text: 'con la privada borrada', eph: borrada
    });
} catch (e) { conBorrada = e; }
ok('una efimera con la privada borrada tampoco sella', conBorrada !== null,
   'devolvio un marco');

/* ======================================================================== */
console.log('');
console.log('Cupo de la bolsa: una inundacion no desaloja ni un sobre');

var eva = nodo('Eva');
var i, reg;
for (i = 0; i < 5; i++) {
    eva.st.carrier.push({ i: 'sobre' + i, d: eva.U.toB64(eva.V.crypto.random(400)),
                          e: Math.floor(Date.now() / 1000) + 3600, t: 0 });
}
for (i = 0; i < 200; i++) {
    reg = { i: 'pres' + i, d: eva.U.toB64(eva.V.crypto.random(708)),
            e: Math.floor(Date.now() / 1000) + 3600 + i, t: 0, k: 'p', p: 1 };
    eva.st.carrier.push(reg);
}
eva.V.mesh.prune();
var quedanP = 0, quedanX = 0;
for (i = 0; i < eva.st.carrier.length; i++) {
    if (eva.st.carrier[i].k === 'p') { quedanP++; } else { quedanX++; }
}
ok('quedan 40 presentaciones', quedanP === 40, quedanP + '');
ok('y TODOS los sobres siguen dentro', quedanX === 5, quedanX + '');

/* ========================================================================
   Lo propio no se pierde.

   Dos cosas que se median mal y costaban un dia de silencio cada una: la fecha
   de la ultima presentacion se apuntaba ANTES de sellar, asi que perderla salia
   gratis para quien la perdia y carisimo para el usuario; y una presentacion
   propia que se caia de la mochila no se volvia a mandar en 24 h aunque no
   hubiera salido nunca del aparato.

   Va al final y en su propia funcion porque sella de verdad, y sellar mina.
   ======================================================================== */
function propia(cb) {
    console.log('');
    console.log('Lo propio: la fecha se apunta cuando hay algo sellado');

    var hugo = nodo('Hugo');                  /* sin un solo enlace: nada sale */
    var nadie = hugo.V.id.create();
    var c = hugo.V.contacts.add(hugo.U.toHex(nadie.pk), 'Nadie').contact;

    hugo.V.chat.sendText(c, 'primera');
    ok('la fecha no se apunta ANTES de sellar', !c.presAt, 'ya estaba apuntada');

    esperar(function () { return !!c.presAt; }, function (sellada) {
        ok('se apunta cuando hay algo sellado de verdad', sellada,
           'no se sello nada en 30 s');
        ok('y con el identificador de su copia en la mochila',
           !!c.presId && hugo.V.mesh.bagGet(c.presId) !== null);
        ok('sin enlaces, no consta que haya salido del aparato',
           c.presOut === false, String(c.presOut));

        var primera = c.presId, t0 = c.presAt;
        hugo.V.chat.sendText(c, 'segunda');
        ok('mientras siga en la mochila no se vuelve a presentar',
           c.presId === primera);

        /* Y ahora se pierde: la echa la poda, caduca, o el usuario vacia la
           mochila. No la tiene nadie mas, porque nunca salio de aqui.

           Sin escribir nada mas: quien manda un solo "hola" y se queda
           esperando no vuelve a pulsar enviar, asi que el reintento tiene que
           salir del reloj que ya reintenta los mensajes pendientes. */
        hugo.V.mesh.bagDrop(primera);
        hugo.V.chat.retryPending();
        esperar(function () { return c.presId && c.presId !== primera; }, function (otra) {
            ok('si se pierde sin llegar a salir, se vuelve a presentar', otra,
               'ni una presentacion nueva en 30 s');
            ok('y en segundos, no dentro de 24 h', c.presAt - t0 < 60000,
               (c.presAt - t0) + ' ms');
            ok('la nueva tambien esta en la mochila',
               hugo.V.mesh.bagGet(c.presId) !== null);
            /* Y va sin texto: el mensaje entero sigue viajando en el sobre
               normal, que se reintenta solo. Meterlo tambien dentro lo
               duplicaria, porque esta presentacion lleva otra efimera y por
               tanto otro identificador de mensaje. */
            var suya = hugo.V.presenta.parse(hugo.V.mesh.bagGet(c.presId));
            var leida = suya && hugo.V.presenta.open(suya, nadie.sk, nadie.pk);
            ok('el destinatario la puede abrir', !!leida);
            ok('y el reintento viaja sin texto', leida && leida.text === '',
               leida && '[' + leida.text + ']');
            cb();
        });
    });
}

function terminar() { ayuda.resumen(); }

/* ======================================================================== */
console.log('');
console.log('El flujo de verdad: escribir a quien no te tiene, con una mula en medio');

/* Ana tiene a Beto2 (pego su codigo), Beto2 no tiene a Ana. Entre los dos, una
   mula que solo transporta. Es el caso que la presentacion viene a arreglar:
   hasta ahora ese mensaje se quedaba en la mochila del otro para siempre. */
var ana2 = nodo('Ana2'), beto2 = nodo('Beto2'), mula = nodo('Mula');

function cableEntre(a, b) {
    var pa = { id: 'a-b', kind: 'local', label: 'b',
        send: function (x) { setImmediate(function () { b.V.transport.receive(new Uint8Array(x), pb); }); },
        close: function () {} };
    var pb = { id: 'b-a', kind: 'local', label: 'a',
        send: function (x) { setImmediate(function () { a.V.transport.receive(new Uint8Array(x), pa); }); },
        close: function () {} };
    a.V.transport.addPeer(pa);
    b.V.transport.addPeer(pb);
}
cableEntre(ana2, mula);
cableEntre(mula, beto2);

/* Minar es una cuenta con suerte: la media son unos 65.000 hashes pero puede
   tocar el triple. Por eso aqui se espera a que pase la cosa, en vez de a que
   pase un tiempo. */
function esperar(cond, cb) {
    var t = Date.now();
    (function mira() {
        if (cond()) { cb(true); return; }
        if (Date.now() - t > 30000) { cb(false); return; }
        setTimeout(mira, 50);
    })();
}

var contactoDeAna = ana2.V.contacts.add(beto2.pk, 'Beto').contact;
ok('ana todavia no tiene reciprocidad', !contactoDeAna.mutuo);
var mensaje = ana2.V.chat.sendText(contactoDeAna, 'hola, soy ana, pegame el codigo');

esperar(function () { return beto2.V.requests.count() > 0; }, function (llego) {
    ok('la presentacion cruza la mula y llega como solicitud', llego,
       'ni una solicitud en 30 s');
    ok('la mula no la ha podido leer', mula.V.mesh.stats.delivered === 0,
       mula.V.mesh.stats.delivered + ' abiertos');
    ok('la mula si la lleva encima', mula.V.mesh.bagSize().count > 0,
       JSON.stringify(mula.V.mesh.bagSize()));
    ok('beto sigue sin contactos hasta que decida', beto2.V.contacts.all().length === 0);

    var s = beto2.V.requests.all()[0];
    ok('la solicitud trae el mensaje entero', s && s.text === 'hola, soy ana, pegame el codigo',
       s && s.text);

    beto2.V.requests.accept(ana2.pk);
    var msgs = beto2.V.chat.get(ana2.pk).messages;
    ok('al aceptar, el mensaje esta en la conversacion', msgs.length === 1, JSON.stringify(msgs));

    /* El sobre normal del MISMO mensaje va tambien por la malla y se abre al
       dar de alta a Ana (M.rescanBag). Lleva el mismo identificador, asi que
       no puede aparecer dos veces. */
    setTimeout(function () {
        ok('el sobre normal del mismo mensaje no lo duplica',
           beto2.V.chat.get(ana2.pk).messages.length === 1,
           beto2.V.chat.get(ana2.pk).messages.length + ' mensajes');
        /* NO puede pasar a 'entregado' al aceptar, y esto es una comprobacion
           de privacidad, no de estado: el sobre normal del mismo mensaje se abre
           al dar de alta (M.rescanBag), y si eso acusara recibo, el acuse le
           diria a quien escribio el segundo exacto en que se acepto su
           solicitud. Sale si aceptas y no sale si descartas: un oraculo
           perfecto de una decision que es solo tuya. */
        ok('y aceptar NO le acusa recibo a quien escribio',
           mensaje.state === 'enviado', mensaje.state);

        /* La respuesta ya viaja como un sobre normal: Beto tiene a Ana. */
        beto2.V.chat.sendText(beto2.V.contacts.get(ana2.pk), 'te tengo, dime');
        esperar(function () { return ana2.V.chat.get(beto2.pk).messages.length > 1; }, function (vino) {
            ok('la respuesta llega como sobre normal', vino,
               JSON.stringify(ana2.V.chat.get(beto2.pk).messages));
            ok('y ahora ana si tiene reciprocidad',
               ana2.V.contacts.get(beto2.pk).mutuo === true);

            propia(terminar);
        });
    }, 600);
});
