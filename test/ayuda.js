/* ==========================================================================
   Lo que todas las pruebas hacian por su cuenta, en un solo sitio.

   Antes, cada fichero de prueba llevaba su propio ok(), su propio recuento de
   fallos, su propio nodo en memoria y su propio cable entre nodos. Nueve
   ficheros, nueve copias que se parecian pero no eran iguales: una traia el
   buzon abierto, otra el estado sin "requests", otra devolvia el objeto con
   otros nombres. Cambiar como se monta un nodo -y se cambia cada vez que
   aparece un campo nuevo en la boveda- era ir a buscarlo a nueve sitios.

   Aqui esta una vez. Lo que de verdad cambia entre una prueba y otra son dos
   cosas y se piden como argumentos: los ajustes y si la boveda es de las
   viejas.
   ========================================================================== */
var cargar = require('./load');

var fallos = 0, hechas = 0;

/* Una comprobacion. El tercer argumento sale solo cuando falla, y es para
   ensenar lo que se encontro en vez de lo que se esperaba. */
function ok(nombre, cond, extra) {
    hechas++;
    if (cond) { console.log('  ok  ' + nombre); }
    else { fallos++; console.log('  FALLA ' + nombre + (extra ? '  -> ' + extra : '')); }
}

/* La otra forma de comprobar: dos valores que tienen que ser identicos. La
   usan los vectores oficiales de cifrado, donde lo util cuando falla no es
   "no cuadra" sino ver los dos lados uno debajo del otro. Comparte el
   recuento con ok(), que es lo que hace que el resumen sea uno solo. */
function eq(nombre, obtenido, esperado) {
    hechas++;
    if (obtenido === esperado) { console.log('  ok  ' + nombre); }
    else {
        fallos++;
        console.log('  FALLA ' + nombre);
        console.log('    obtenido: ' + obtenido);
        console.log('    esperado: ' + esperado);
    }
}

/* El cierre de cualquier prueba: cuenta lo hecho y sale con codigo distinto de
   cero si algo fallo, que es lo unico que mira "npm test". */
function resumen() {
    console.log('');
    if (fallos) {
        console.log('FALLOS: ' + fallos + ' de ' + hechas);
        process.exit(1);
    }
    console.log('TODO CORRECTO: ' + hechas + ' comprobaciones');
}

function titulo(t) { console.log(t); }

/* Un aparato entero en memoria: boveda, identidad, contactos, malla y
   conversaciones. Sin DOM y sin transportes de verdad, que es justo lo que
   permite montar cinco en la misma prueba.

   Devuelve el espacio de nombres con tres cosas puestas encima:
     .nombre   como se llama, para los cables y los mensajes de fallo
     .pkHex    su clave publica, que es lo que se pasa para darse de alta
     .yo       el par de claves, para lo que necesite mirarlo por dentro

   opciones.ajustes  se mezcla sobre los ajustes de serie
   opciones.viejo    monta la boveda SIN los campos que se anadieron despues
                     (requests, groups), que es como esta la de alguien que
                     instalo la aplicacion hace un ano. Si algo se rompe con
                     una boveda vieja, se rompe aqui.
   opciones.capa     que cargar; de serie, todo menos la interfaz
   opciones.globales se pasa al cargador (localStorage y compania) */
function nodo(nombre, opciones) {
    opciones = opciones || {};
    var V = cargar(opciones.capa || 'sin-interfaz', opciones.globales);
    var U = V.util;

    var ajustes = { relay: true, receipts: true, typing: true, shield: true, theme: 'bintio' };
    if (opciones.ajustes) {
        for (var k in opciones.ajustes) {
            if (Object.prototype.hasOwnProperty.call(opciones.ajustes, k)) {
                ajustes[k] = opciones.ajustes[k];
            }
        }
    }

    var estado = { identity: null, contacts: [], chats: {}, carrier: [], seen: [], settings: ajustes };
    if (!opciones.viejo) { estado.requests = []; estado.groups = {}; }

    V.vault.state = estado;
    V.vault.save = function () {};
    V.vault.saveNow = function () {};

    var yo = V.id.create();
    estado.identity = { seed: U.toHex(yo.seed), name: nombre };
    V.contacts.bind(yo);
    /* La entrega tiene que ser la de verdad: con una vacia, un sobre que se
       abre no llega a la conversacion y la prueba mediria otra cosa. */
    V.mesh.init(function (abierto) { V.chat.onIncoming(abierto); });

    V.nombre = nombre;
    V.pkHex = U.toHex(yo.pk);
    V.yo = yo;
    return V;
}

/* Un cable entre dos nodos: lo que sale por uno entra por el otro tal cual,
   los mismos bytes que entregaria el bluetooth. Devuelve la funcion de
   desconectar, para poder probar que pasa cuando se van sin cobertura. */
function cablear(a, b) {
    var haciaA = {
        id: a.nombre, kind: 'local', close: function () {},
        send: function (bytes) { a.mesh.handleFrame(bytes, haciaB); }
    };
    var haciaB = {
        id: b.nombre, kind: 'local', close: function () {},
        send: function (bytes) { b.mesh.handleFrame(bytes, haciaA); }
    };
    a.transport.addPeer(haciaB);
    b.transport.addPeer(haciaA);
    return function desconectar() {
        a.transport.removePeer(haciaB.id);
        b.transport.removePeer(haciaA.id);
    };
}

/* Que se conozcan: cada uno da de alta al otro. Anadir va en una sola
   direccion, asi que hacen falta las dos llamadas. */
function presentar(a, b) {
    a.contacts.add(b.pkHex, b.nombre);
    b.contacts.add(a.pkHex, a.nombre);
}

module.exports = {
    ok: ok,
    eq: eq,
    resumen: resumen,
    titulo: titulo,
    nodo: nodo,
    cablear: cablear,
    presentar: presentar,
    cargar: cargar
};
