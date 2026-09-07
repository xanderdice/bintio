/* La videollamada, sin video: la maquina de estados de nucleo/llamada.js.

   Aqui no hay camara ni WebRTC. Lo que se prueba es el papeleo, que es donde
   estan los fallos que importan: que un timbre llegue, que acepte solo quien
   debe, que una descripcion falsa no llegue al navegador, que "ocupado" sea
   ocupado y no silencio, que colgar cuelgue en los dos lados, y que nada de
   esto deje rastro en ninguna mochila.

   Dos aparatos unidos por un cable, como en las demas pruebas. La descripcion
   SDP es un texto cualquiera que empieza por v=0: a la maquina de estados le
   da igual lo que diga, solo que sea una.                                    */
var ayuda = require('./ayuda');
var ok = ayuda.ok, titulo = ayuda.titulo;

var SDP = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=fingerprint:sha-256 AA:BB\r\n';

/* Un aparato con los tiempos acortados: nadie espera 45 s a un timbre. */
function aparato(nombre) {
    var V = ayuda.nodo(nombre);
    V.llamada.TIMBRE_MS = 60;
    V.llamada.ENLACE_MS = 60;
    /* Los eventos que suelta, por orden. */
    V.eventos = [];
    V.llamada.onChange(function (what, arg) { V.eventos.push({ what: what, arg: arg }); });
    V.ultimo = function (what) {
        for (var i = V.eventos.length - 1; i >= 0; i--) {
            if (V.eventos[i].what === what) { return V.eventos[i].arg; }
        }
        return undefined;
    };
    return V;
}

/* Que se tengan como vinculados: lo normal es que llegue algo del otro y se
   abra, pero aqui basta con decirlo. */
function vincular(a, b) {
    ayuda.presentar(a, b);
    a.contacts.enlazado(a.contacts.get(b.pkHex));
    b.contacts.enlazado(b.contacts.get(a.pkHex));
}

/* ------------------------------------------------------------------------ */
titulo('Una llamada entera');

var ana = aparato('ana'), beto = aparato('beto');
vincular(ana, beto);
ayuda.cablear(ana, beto);

var r = ana.llamada.llamar(beto.pkHex);
ok('ana llama', !!r.ok);
ok('ana esta llamando', ana.llamada.actual().estado === 'sonando' && ana.llamada.actual().papel === 'llamo');
ok('a beto le suena', !!beto.llamada.actual() && beto.llamada.actual().estado === 'sonando' &&
   beto.llamada.actual().papel === 'me-llaman');
ok('con el mismo identificador', beto.llamada.actual().id === ana.llamada.actual().id);
ok('beto sabe quien es', beto.llamada.actual().pk === ana.pkHex);

ok('beto acepta', beto.llamada.aceptar());
ok('beto esta conectando', beto.llamada.actual().estado === 'conectando');
ok('ana se entera y conecta', ana.llamada.actual().estado === 'conectando');

ok('ana ofrece', ana.llamada.ofrecer(SDP));
var of = beto.ultimo('llamada-sdp');
ok('a beto le llega la oferta', !!of && of.tipo === 'oferta' && of.sdp === SDP);

ok('beto responde', beto.llamada.responder(SDP + 'a=answer\r\n'));
ok('beto ya esta en llamada', beto.llamada.actual().estado === 'activa');
var re = ana.ultimo('llamada-sdp');
ok('a ana le llega la respuesta', !!re && re.tipo === 'respuesta');
ok('ana ya esta en llamada', ana.llamada.actual().estado === 'activa');

ok('ana cuelga', ana.llamada.colgar('colgado'));
ok('ana sin llamada', ana.llamada.actual() === null);
ok('beto sin llamada', beto.llamada.actual() === null);
var finB = beto.ultimo('llamada-fin');
ok('beto sabe que le colgaron', !!finB && finB.motivo === 'colgado' && finB.pk === ana.pkHex);

/* ------------------------------------------------------------------------ */
titulo('Rechazar');

ana.llamada.llamar(beto.pkHex);
ok('beto rechaza', beto.llamada.colgar('rechazada'));
ok('ana se entera del motivo', ana.llamada.actual() === null && ana.ultimo('llamada-fin').motivo === 'rechazada');

/* ------------------------------------------------------------------------ */
titulo('Ocupado');

var carla = aparato('carla');
vincular(carla, beto);
ayuda.cablear(carla, beto);

ana.llamada.llamar(beto.pkHex);
var enCurso = beto.llamada.actual().id;
carla.llamada.llamar(beto.pkHex);
ok('a carla le dicen ocupado', carla.llamada.actual() === null && carla.ultimo('llamada-fin').motivo === 'ocupado');
ok('beto sigue con la de ana', beto.llamada.actual() && beto.llamada.actual().id === enCurso);
ok('ana no se ha enterado de nada', ana.llamada.actual() && ana.llamada.actual().estado === 'sonando');
ok('ana no puede llamar a dos a la vez', ana.llamada.llamar(carla.pkHex).error === 'ocupado');
beto.llamada.colgar('colgado');

/* ------------------------------------------------------------------------ */
titulo('Lo que no se acepta');

ok('sin vinculo no se llama', (function () {
    var d = aparato('dani');
    ayuda.presentar(d, beto);        /* se conocen, pero nadie ha abierto nada del otro */
    return d.llamada.llamar(beto.pkHex).error === 'sin-vinculo';
})());
ok('a un desconocido no se llama', ana.llamada.llamar('00'.repeat(32)).error === 'desconocido');

ana.llamada.llamar(beto.pkHex);
beto.llamada.aceptar();
ok('una descripcion que no es SDP no sale', !ana.llamada.ofrecer('javascript:alert(1)'));
ok('una descripcion vacia no sale', !ana.llamada.ofrecer(''));
ok('una descripcion enorme no sale', !ana.llamada.ofrecer('v=0' + new Array(40000).join('x')));
ok('un numero tampoco', !ana.llamada.ofrecer(12345));
ok('y la llamada sigue viva', ana.llamada.actual().estado === 'conectando');

/* Lo que llega de la red con mala pinta. Se le pasa a recibir() como si
   session.js lo hubiera abierto: un contacto de verdad, cuerpo hostil. */
var contactoAna = beto.contacts.get(ana.pkHex);
function entra(V, contact, cuerpo) {
    V.llamada.recibir({ contact: contact, type: V.session.T_CALL, body: V.util.fromString(cuerpo) });
}
var antes = JSON.stringify(beto.llamada.actual());
entra(beto, contactoAna, 'esto no es json');
entra(beto, contactoAna, '{"c":"zzzz","a":"bye"}');
entra(beto, contactoAna, '{"c":"0123456789abcdef","a":"bye"}');       /* otra llamada */
entra(beto, contactoAna, JSON.stringify({ c: beto.llamada.actual().id, a: 'offer', s: 'javascript:x' }));
entra(beto, contactoAna, JSON.stringify({ c: beto.llamada.actual().id, a: 7 }));
entra(beto, contactoAna, '[]');
entra(beto, contactoAna, 'null');
ok('nada de eso cambia la llamada', JSON.stringify(beto.llamada.actual()) === antes);
ok('ni le llego ninguna oferta falsa', beto.ultimo('llamada-sdp') === undefined ||
   beto.ultimo('llamada-sdp').sdp.indexOf('javascript') < 0);

/* Un "bye" de la llamada correcta pero de OTRO contacto: carla no puede
   colgar la llamada de ana. */
entra(beto, beto.contacts.get(carla.pkHex), JSON.stringify({ c: beto.llamada.actual().id, a: 'bye', r: 'colgado' }));
ok('otro contacto no puede colgar la llamada', beto.llamada.actual() !== null);
/* Y el motivo de un bye se filtra: solo palabras cortas en minuscula. */
entra(beto, contactoAna, JSON.stringify({ c: beto.llamada.actual().id, a: 'bye', r: '<script>alert(1)</script>' }));
ok('el bye si cuelga, con el motivo limpio', beto.llamada.actual() === null &&
   beto.ultimo('llamada-fin').motivo === 'colgado');
ana.llamada.colgar('colgado');

/* ------------------------------------------------------------------------ */
titulo('Los dos llaman a la vez');

ana.eventos = []; beto.eventos = [];
/* Sin cable mientras pulsan, para que los dos timbres se crucen de verdad. */
var soltar = ayuda.cablear(ana, beto);
soltar();
ana.llamada.llamar(beto.pkHex);
beto.llamada.llamar(ana.pkHex);
ok('cada uno cree que llama', ana.llamada.actual().papel === 'llamo' && beto.llamada.actual().papel === 'llamo');
/* Ahora se conectan y cada timbre llega al otro: los sobres se reenvian al
   aparecer el cable (mesh.flushTo). Como no viven en mochila, se reenvian a
   mano, que es lo que haria un cable que se abre un instante despues. */
var cable = ayuda.cablear(ana, beto);
var timbreAna = ana.session.seal(ana.contacts.get(beto.pkHex), ana.session.T_CALL,
    ana.util.fromString(JSON.stringify({ c: ana.llamada.actual().id, a: 'ring' })), null, 0, 40);
var timbreBeto = beto.session.seal(beto.contacts.get(ana.pkHex), beto.session.T_CALL,
    beto.util.fromString(JSON.stringify({ c: beto.llamada.actual().id, a: 'ring' })), null, 0, 40);
ana.mesh.handleFrame(timbreBeto, { id: 'beto', send: function () {} });
beto.mesh.handleFrame(timbreAna, { id: 'ana', send: function () {} });
var quienLlama = ana.pkHex < beto.pkHex ? ana : beto;
var quienRecibe = quienLlama === ana ? beto : ana;
ok('sale UNA llamada, no cero ni dos', quienLlama.llamada.actual().papel === 'llamo' &&
   quienRecibe.llamada.actual().papel === 'me-llaman');
ok('con el mismo identificador', quienLlama.llamada.actual().id === quienRecibe.llamada.actual().id);
ok('y el que llama es el de la clave mas baja', quienLlama.llamada.actual().papel === 'llamo');
quienRecibe.llamada.colgar('colgado');
ok('colgar la deja a cero en los dos', ana.llamada.actual() === null && beto.llamada.actual() === null);
cable();

/* ------------------------------------------------------------------------ */
titulo('No deja rastro');

var eva = aparato('eva'), fran = aparato('fran');
vincular(eva, fran);
/* Sin cable: el timbre no tiene por donde salir. */
eva.llamada.llamar(fran.pkHex);
ok('el timbre no se queda en la mochila de quien llama', eva.mesh.bagSize().count === 0);
eva.llamada.colgar('colgado');
ok('ni el cuelgue', eva.mesh.bagSize().count === 0);
ok('ni hay nada en la boveda', !eva.vault.state.llamadas && JSON.stringify(eva.vault.state).indexOf('ring') < 0);

/* ------------------------------------------------------------------------ */
titulo('Cerrar la boveda cuelga');

ayuda.cablear(eva, fran);
eva.llamada.llamar(fran.pkHex);
fran.llamada.aceptar();
ok('hay llamada en los dos', eva.llamada.actual() && fran.llamada.actual());
eva.app.ready = true;   /* app.stop solo cuelga si la boveda estaba abierta de verdad */
eva.app.stop();
ok('eva se queda sin llamada', eva.llamada.actual() === null);
ok('y a fran le llega que se corto', fran.llamada.actual() === null && fran.ultimo('llamada-fin').motivo === 'bloqueo');

/* ------------------------------------------------------------------------ */
titulo('Los tiempos');

var gus = aparato('gus'), hana = aparato('hana');
vincular(gus, hana);
ayuda.cablear(gus, hana);
gus.llamada.llamar(hana.pkHex);
setTimeout(function () {
    ok('un timbre sin contestar se apaga solo', gus.llamada.actual() === null && hana.llamada.actual() === null);
    ok('y los dos saben que fue por no contestar',
       gus.ultimo('llamada-fin').motivo === 'sin-respuesta' && hana.ultimo('llamada-fin').motivo === 'sin-respuesta');

    gus.llamada.llamar(hana.pkHex);
    hana.llamada.aceptar();
    setTimeout(function () {
        ok('aceptada pero sin conectar, se corta', gus.llamada.actual() === null && hana.llamada.actual() === null);
        ok('con motivo de fallo', hana.ultimo('llamada-fin').motivo === 'fallo');
        ayuda.resumen();
    }, 150);
}, 150);
