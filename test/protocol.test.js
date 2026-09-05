/* Prueba del protocolo completo con tres nodos independientes.

   Ana y Beto no se conectan nunca directamente: solo hablan a traves de
   Carla, que reenvia sobres que no puede leer. Es el caso que justifica
   toda la malla, asi que es el que hay que probar.                        */
var ayuda = require('./ayuda');
var ok = ayuda.ok;

/* El nodo lo monta test/ayuda.js; aqui solo se le pone el nombre que usa esta
   prueba a cada cosa. Antes este fichero se lo fabricaba entero, igual que
   otros cinco: cada campo nuevo de la boveda habia que anadirlo seis veces. */
function makeNode(label) {
    var V = ayuda.nodo(label);
    return { V: V, U: V.util, id: V.yo, label: label, pk: V.pkHex };
}

/* Todo lo que ha cruzado un cable durante la prueba, por sus dos primeros
   bytes. Al final se comprueba que no ha salido ni un marco con otra marca. */
var vistos = [];
function espia(bytes) { if (bytes && bytes.length >= 2) { vistos.push([bytes[0], bytes[1]]); } }

/* Un cable entre dos nodos, en los dos sentidos. */
function link(a, b) {
    var pa = { id: 'to-' + b.label, kind: 'local', label: b.label,
        send: function (bytes) { espia(bytes); setImmediate(function () { b.V.transport.receive(new Uint8Array(bytes), pb); }); },
        close: function () {} };
    var pb = { id: 'to-' + a.label, kind: 'local', label: a.label,
        send: function (bytes) { espia(bytes); setImmediate(function () { a.V.transport.receive(new Uint8Array(bytes), pa); }); },
        close: function () {} };
    a.V.transport.addPeer(pa);
    b.V.transport.addPeer(pb);
    return { a: pa, b: pb };
}

/* Margen generoso: cada salto hace criptografia de curva en JavaScript puro
   y una ronda completa entre tres nodos son varias decenas de operaciones. */
function settle(fn) { setTimeout(fn, 400); }

/* Lo unico que no se puede esperar con un reloj es una presentacion: minarla
   son segundos y cuantos, no se sabe. Esto espera a que una haya cruzado un
   cable de verdad, mirando lo mismo que mira el espia. */
function esperarPresentacion(cb) {
    var t = Date.now();
    (function mira() {
        for (var i = 0; i < vistos.length; i++) {
            if (vistos[i][0] === 0x42 && vistos[i][1] === 0x50) { cb(true); return; }
        }
        if (Date.now() - t > 30000) { cb(false); return; }
        setTimeout(mira, 50);
    })();
}

/* ---------------------------------------------------------------------
   El formato del cable, fijado aqui a proposito.

   Los dos primeros bytes de cada marco son la unica parte del protocolo que
   se escribe como numero y no como texto, asi que son invisibles para
   cualquier busqueda del nombre del proyecto. Ya se colaron una vez: al
   renombrar, todo paso a BINTIO menos estos bytes, que siguieron diciendo la
   inicial del nombre anterior porque estaban escritos en hexadecimal.

   Esta comprobacion existe para que eso no pueda repetirse en silencio, y
   para que la documentacion (envelope.js, mesh.js y el README) no pueda
   desviarse del codigo sin que algo se ponga rojo.
   --------------------------------------------------------------------- */
console.log('Formato del cable');
(function () {
    var E = ayuda.cargar('sin-interfaz').envelope;
    ok("el byte de familia es 'B'", E.MAGIC0 === 0x42, 'es 0x' + E.MAGIC0.toString(16));
    ok("un sobre se marca con 'X'", E.MAGIC1 === 0x58, 'es 0x' + E.MAGIC1.toString(16));
    ok("una presentacion se marca con 'P'", E.MAGIC_PRES === 0x50,
       'es 0x' + E.MAGIC_PRES.toString(16));
    /* 0x43 es 'C', el control de la malla (mesh.js). No se importa de alli
       a proposito: si algun dia coincidieran, esto tiene que ponerse rojo. */
    ok('las tres clases de marco son distintas',
       E.MAGIC_PRES !== E.MAGIC1 && E.MAGIC_PRES !== 0x43 && E.MAGIC_PRES !== E.MAGIC0);
})();

/* --------------------------------------------------------------------- */
console.log('Identidad');
var ana = makeNode('ana'), beto = makeNode('beto'), carla = makeNode('carla');
ok('la huella tiene el formato esperado', /^[0-9A-Z]{4}( [0-9A-Z]{4}){4}$/.test(ana.id.fingerprint), ana.id.fingerprint);
var rec = ana.V.id.toRecoveryKey(ana.id.seed);
var back = ana.V.id.fromRecoveryKey(rec);
ok('la llave de recuperacion devuelve la misma identidad', back && ana.U.toHex(back.pk) === ana.pk);
ok('una llave de recuperacion alterada se rechaza',
   ana.V.id.fromRecoveryKey(rec.replace(/^./, rec.charAt(0) === 'A' ? 'B' : 'A')) === null);

console.log('Contactos');
ana.V.contacts.add(beto.pk, 'Beto');
beto.V.contacts.add(ana.pk, 'Ana');
ok('ana ve a beto', !!ana.V.contacts.get(beto.pk));
ok('no se puede anadir uno mismo', !!ana.V.contacts.add(ana.pk, 'yo').error);

console.log('Sobre: privacidad frente al que lo transporta');
var contactoBeto = ana.V.contacts.get(beto.pk);
var env = ana.V.session.seal(contactoBeto, ana.V.session.T_TEXT, ana.U.fromString('hola beto'));
var parsed = carla.V.envelope.parse(env);
ok('carla puede leer la cabecera', !!parsed);
ok('carla NO puede abrirlo', carla.V.session.open(parsed) === null);
var hex = ana.U.toHex(env);
ok('la clave publica del destinatario no viaja en claro', hex.indexOf(beto.pk) === -1);
ok('la clave publica del remitente no viaja en claro', hex.indexOf(ana.pk) === -1);
ok('el texto no viaja en claro', hex.indexOf(ana.U.toHex(ana.U.fromString('hola beto'))) === -1);

console.log('Sobre: el destinatario si puede');
var opened = beto.V.session.open(beto.V.envelope.parse(env));
ok('beto lo abre', !!opened && beto.U.toString(opened.body) === 'hola beto');
ok('beto sabe quien lo mando', opened && opened.contact.pk === ana.pk);

console.log('Manipulacion');
var tampered = new Uint8Array(env);
tampered[tampered.length - 20] ^= 0x40;
ok('un sobre alterado no abre', beto.V.session.open(beto.V.envelope.parse(tampered)) === null);

console.log('Saltos');
var hopped = new Uint8Array(env);
var ttl0 = hopped[4];
beto.V.envelope.hop(hopped);
ok('el ttl baja', hopped[4] === ttl0 - 1);
ok('el contador de saltos sube', hopped[5] === 1);
ok('el sobre sigue abriendose tras un salto (ttl no autenticado)',
   !!beto.V.session.open(beto.V.envelope.parse(hopped)));
ok('el identificador no cambia al saltar',
   beto.V.envelope.parse(hopped).id === beto.V.envelope.parse(env).id);

/* ---------------------------------------------------------------------
   Un relevo no puede suprimir un sobre ajeno.

   El identificador se calculaba sobre b[12..64] y el cuerpo, o sea que dejaba
   fuera la caducidad (6-11), las banderas y la clave de trinquete que va detras
   de la cabecera. Todo eso SI entra en el AEAD, asi que bastaba con cambiar
   seis bytes -sin nada que volver a calcular, coste cero- para tener un marco
   con el MISMO identificador que ya no se puede abrir. Se propagaba, cada nodo
   lo daba por visto, y cuando llegaba el bueno detras lo tiraba como repetido:
   un mensaje suprimido por cualquiera que se ofrezca a transportarlo.

   La regla que lo cierra es la del comentario de E.idOf: lo unico mutable en
   transito son los saltos, asi que todo lo demas entra en el identificador.
   --------------------------------------------------------------------- */
console.log('Un relevo no puede suprimir un sobre cambiando la caducidad');
var zoe = makeNode('zoe'), yago = makeNode('yago');
zoe.V.contacts.add(yago.pk, 'Yago');
yago.V.contacts.add(zoe.pk, 'Zoe');

var bueno = yago.V.session.seal(yago.V.contacts.get(zoe.pk), yago.V.session.T_TEXT,
                                yago.U.fromString('no me puedes borrar'));
var tocado = new Uint8Array(bueno);
tocado.set(yago.U.u48(yago.U.readU48(tocado, 6) + 3600), 6);

ok('cambiar la caducidad cambia el identificador',
   zoe.V.envelope.parse(tocado).id !== zoe.V.envelope.parse(bueno).id,
   zoe.V.envelope.parse(tocado).id + ' / ' + zoe.V.envelope.parse(bueno).id);
ok('el marco tocado no se puede abrir: la caducidad esta en el AEAD',
   zoe.V.session.open(zoe.V.envelope.parse(tocado)) === null);

var hostil = { id: 'relevo-hostil', kind: 'local', label: 'x',
               send: function () {}, close: function () {} };
zoe.V.mesh.handleFrame(tocado, hostil);
zoe.V.mesh.handleFrame(new Uint8Array(bueno), hostil);
var llegados = zoe.V.chat.get(yago.pk).messages;
ok('el bueno llega igual, aunque el falso pasara primero',
   llegados.length === 1 && llegados[0].text === 'no me puedes borrar',
   JSON.stringify(llegados));

/* --------------------------------------------------------------------- */
console.log('Entrega a traves de un tercero que no puede leer');
carla.V.contacts.add(ana.pk, 'Ana desconocida para el trafico');  /* aunque la conozca, no puede leer lo de beto */
link(ana, carla);
link(carla, beto);

ana.V.chat.sendText(ana.V.contacts.get(beto.pk), 'mensaje que pasa por carla');

settle(function () {
    var recibidos = beto.V.chat.get(ana.pk).messages;
    ok('beto recibe el mensaje', recibidos.length === 1 && recibidos[0].text === 'mensaje que pasa por carla',
       JSON.stringify(recibidos));
    ok('carla no ve ninguna conversacion con ese texto',
       JSON.stringify(carla.V.vault.state.chats).indexOf('pasa por carla') === -1);
    ok('carla si lo llevo en la bolsa', carla.V.mesh.stats.relayed > 0);

    settle(function () {
        var salida = ana.V.chat.get(beto.pk).messages[0];
        ok('ana recibe el acuse de entrega', salida.state === 'entregado' || salida.state === 'leido', salida.state);

        console.log('Trinquete: las claves rotan solas');
        var cb = ana.V.contacts.get(beto.pk);
        var clavesAntes = cb.ratchet.mine.length;
        var clavePeerAntes = cb.ratchet.theirs.pk;
        ok('ana ya guarda la clave de trinquete de beto', !!clavePeerAntes);
        /* Una ronda mas: ana publica su clave nueva, beto gira la suya al
           verla, y ana gira otra vez al recibir el acuse con la de beto. */
        beto.V.chat.sendText(beto.V.contacts.get(ana.pk), 'respuesta');
        ana.V.chat.sendText(ana.V.contacts.get(beto.pk), 'y otra ronda');
        settle(function () {
            ok('ana recibe la respuesta', ana.V.chat.get(beto.pk).messages.length >= 2);
            var cbAhora = ana.V.contacts.get(beto.pk);
            ok('ana ha girado su trinquete', cbAhora.ratchet.mine.length > clavesAntes,
               'antes ' + clavesAntes + ' ahora ' + cbAhora.ratchet.mine.length);
            ok('la clave de trinquete de beto cambio', cbAhora.ratchet.theirs.pk !== clavePeerAntes);
            ok('solo se guardan las ultimas claves', cbAhora.ratchet.mine.length <= 6);

            console.log('Guardar y reenviar: el destinatario aparece despues');
            var dora = makeNode('dora');
            var eva = makeNode('eva');
            dora.V.contacts.add(eva.pk, 'Eva');
            eva.V.contacts.add(dora.pk, 'Dora');
            var mula = makeNode('mula');   /* solo transporta */

            link(dora, mula);
            dora.V.chat.sendText(dora.V.contacts.get(eva.pk), 'te llegara cuando aparezcas');

            settle(function () {
                /* Solo los sobres: dora no tiene todavia reciprocidad con eva,
                   asi que su primer mensaje sale ADEMAS como presentacion
                   (chat.js) y la mula tambien la lleva encima. Contar las
                   dos cosas juntas haria que esta linea dependiera de cuanto
                   tardo en minarse una prueba de coste. */
                var enBolsa = mula.V.vault.state.carrier, llevaSobres = 0;
                for (var q = 0; q < enBolsa.length; q++) {
                    if (enBolsa[q].k !== 'p') { llevaSobres++; }
                }
                ok('la mula lleva el sobre encima', llevaSobres === 1,
                   JSON.stringify(mula.V.mesh.bagSize()));
                ok('la mula no puede leerlo', mula.V.mesh.stats.delivered === 0);

                /* Eva aparece mucho despues y se conecta solo a la mula. */
                link(mula, eva);
                settle(function () {
                    var m = eva.V.chat.get(dora.pk).messages;
                    ok('eva recibe el mensaje sin haber visto nunca a dora',
                       m.length === 1 && m[0].text === 'te llegara cuando aparezcas', JSON.stringify(m));

                    console.log('Repeticion');
                    var antes = eva.V.chat.get(dora.pk).messages.length;
                    eva.V.transport.receive(new Uint8Array(env), { id: 'x', send: function () {} });
                    settle(function () {
                        ok('un sobre repetido no duplica el mensaje',
                           eva.V.chat.get(dora.pk).messages.length === antes);

                        /* Nada de lo que ha salido al cable en toda la
                           prueba puede llevar otra marca. Cubre las dos
                           clases de marco sin construir ninguno a mano. */
                        console.log('Marcas de todo lo que salio al cable');
                        /* Se espera A QUE PASE LA COSA, no a que pase un
                           tiempo. Minar la prueba de coste de una presentacion
                           es una cuenta con suerte -la media son unos 65.000
                           hashes, pero puede tocar el triple- y ademas compite
                           con los relojes de esta misma prueba. Con una espera
                           fija, la comprobacion de mas abajo se ponia roja de
                           vez en cuando sin que nada estuviera mal, que es la
                           peor clase de prueba que hay. */
                        esperarPresentacion(function (salio) {
                            var sobres = 0, control = 0, presentaciones = 0, raros = [];
                            for (var f = 0; f < vistos.length; f++) {
                                var b0 = vistos[f][0], b1 = vistos[f][1];
                                if (b0 === 0x42 && b1 === 0x58) { sobres++; }
                                else if (b0 === 0x42 && b1 === 0x50) { presentaciones++; }
                                else if (b0 === 0x42 && b1 === 0x43) { control++; }
                                else { raros.push(b0 + ',' + b1); }
                            }
                            ok('salieron sobres y marcos de control', sobres > 0 && control > 0,
                               sobres + ' sobres, ' + control + ' de control');
                            /* Que la clase 'P' este en la lista de buenas no
                               basta: sin esta linea, la comprobacion de abajo
                               pasaria por no haberse ejercitado nunca ese
                               camino. */
                            ok('salio al menos una presentacion', salio && presentaciones > 0,
                               presentaciones + ' presentaciones');
                            ok('ni un solo marco con otra marca', raros.length === 0,
                               raros.slice(0, 5).join(' / '));

                            ayuda.resumen();
                        });
                    });
                });
            });
        });
    });
});
