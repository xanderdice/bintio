/* ==========================================================================
   Conectar.

   Una sola idea en toda la pantalla: los dos se ensenan un codigo.

   Antes habia dos ideas en paralelo, y la que la gente usaba era la que no
   llevaba a ninguna parte. "Tu codigo" era una TARJETA: identidad y nada
   mas. Quien la escaneaba te anadia, te escribia, y el mensaje se quedaba en
   "sin salir" porque una tarjeta no abre ningun camino de red. El camino
   estaba en otra seccion, "Enlace directo", con sus propios botones y su
   propio vocabulario: invitacion, respuesta, pegar aqui, pegar alli.

   Ahora el codigo que se ensena es, siempre que el navegador pueda, una
   INVITACION: lleva la oferta WebRTC dentro, asi que quien la lee te anade Y
   le sale una respuesta que devolver. La tarjeta no desaparece, pero baja a
   lo que es: el respaldo de cuando no hay WebRTC. Y cuando toca ensenarla se
   dice con todas las letras lo que NO hace.

   Siguen siendo dos pasos y no hay manera de que sean uno: WebRTC necesita
   oferta y respuesta, y sin servidor no hay quien lleve la respuesta de
   vuelta. Lo que cambia es que los dos pasos son "ensena esto" y "ensename
   lo tuyo", y que la pantalla dice en cada momento cual toca.
   ========================================================================== */
(function (V) {
    'use strict';
    var D = V.ui;

    /* Que ocupa el hueco de arriba: 'mio' (tu invitacion o tu tarjeta) o
       'respuesta' (lo que hay que ensenar para cerrar un enlace). */
    var estado = 'mio';
    var mostrado = '';        /* el texto exacto que se esta ensenando */
    var comoSeComparte = '';  /* la frase con la que sale al compartirlo */

    /* Mi codigo, guardado entre visitas a la pantalla.

       Una invitacion no es un texto cualquiera: es la cara visible de una
       conexion WebRTC viva que espera respuesta. Por eso NO se rehace cada
       vez que se entra aqui. rtc.js guarda todas las ofertas en
       una tabla y acceptAnswer no puede saber a cual pertenece la respuesta
       que le llega: se queda con la ultima que encuentra esperando. Con una
       sola oferta viva eso es exacto; con cuatro, es una moneda al aire. Asi
       que se crea una, se ensena esa, y solo se hace otra cuando la anterior
       ya no sirve: cuando se ha consumido con una respuesta, cuando se cierra
       la boveda o cuando el usuario cambia la clave de encuentro. */
    var miCodigo = '';
    var miTipo = '';          /* 'invitacion' o 'tarjeta' */
    var miClave = null;
    var miMotivo = '';        /* por que se ha caido a la tarjeta */
    var creando = false;

    var pkNota = null;        /* contacto anadido que todavia no tiene camino */
    var pkRespuesta = null;   /* a quien le estamos ensenando una respuesta */

    function limpio(s) { return String(s || '').replace(/^\s+|\s+$/g, ''); }

    /* El hueco del codigo esta arriba del todo y lo que lo cambia (pegar,
       escanear) esta abajo: sin esto, el usuario pega una invitacion y su
       respuesta aparece fuera de la pantalla. */
    function alPrincipio() {
        var s = D.$('connect-sheet');
        if (s) { s.scrollTop = 0; }
    }

    function nota(msg, pk) {
        var caja = D.$('use-note');
        if (!msg) { pkNota = null; D.show(caja, false); return; }
        pkNota = pk || null;
        D.text(D.$('use-note-text'), msg);
        D.show(D.$('btn-note-chat'), !!pkNota);
        D.show(caja, true);
    }

    /* ---------------------------------------------------------------------
       El hueco de arriba. Siempre el mismo QR, el mismo recuadro de texto y
       los mismos botones: lo unico que cambia es que codigo hay dentro y que
       dice el titulo.
       --------------------------------------------------------------------- */
    function pintar(titulo, texto, codigo, etiqueta, frase) {
        D.text(D.$('mine-title'), titulo);
        D.text(D.$('mine-note'), texto);
        D.text(D.$('my-code'), codigo);
        mostrado = codigo;
        comoSeComparte = frase;
        D.drawQr(D.$('my-qr'), codigo, etiqueta);
    }

    function pintarEspera() {
        mostrado = '';
        D.text(D.$('mine-title'), D.t('Preparando tu codigo'));
        D.text(D.$('mine-note'), D.t('Mirando por donde puede salir este aparato. Un segundo.'));
        D.text(D.$('my-code'), '');
        D.qrNote(D.$('my-qr'), D.t('Preparando el codigo...'));
    }

    function mostrarMio() {
        estado = 'mio';
        pkRespuesta = null;
        D.show(D.$('btn-show-mine'), false);
        D.show(D.$('mine-lock'), true);

        if (!miCodigo) { pintarEspera(); return; }

        if (miTipo === 'invitacion') {
            pintar(D.t('Tu codigo para conectar'),
                   D.t('Ense\u00f1aselo a la otra persona, o pasaselo por donde quieras. Al leerlo te a\u00f1ade y le sale una respuesta: escanea esa respuesta aqui abajo y el camino queda abierto. Son dos pasos porque no hay ningun servidor que lleve el segundo por vosotros.'),
                   miCodigo,
                   D.t('Codigo QR con tu invitacion'),
                   'Conecta conmigo por BINTIO: ');
            return;
        }
        pintar(D.t('Tu tarjeta de contacto'),
               D.t('{motivo} Con esta tarjeta pueden a\u00f1adirte y comprobar tu huella, pero NO abre camino de red: lo que os escribais se quedara guardado y sin salir hasta que aparezca un enlace por Bluetooth, por la malla o desde otro aparato.',
                   { motivo: D.t(miMotivo) }),
               miCodigo,
               D.t('Codigo QR con tu tarjeta de contacto'),
               'Mi tarjeta de BINTIO: ');
    }

    function mostrarRespuesta(contact, answer) {
        estado = 'respuesta';
        pkRespuesta = contact.pk;
        D.show(D.$('btn-show-mine'), true);
        D.show(D.$('mine-lock'), false);
        pintar(D.t('Ense\u00f1ale esto ahora a {quien}', { quien: contact.name }),
               D.t('Segundo y ultimo paso. En cuanto lea esta respuesta, el camino queda abierto por los dos lados y no hace falta ningun codigo mas. Si no puede escanear, copiala y pasasela.'),
               answer,
               D.t('Codigo QR con tu respuesta'),
               'Mi respuesta de BINTIO: ');
        alPrincipio();
    }

    function caerATarjeta(motivo) {
        miTipo = 'tarjeta';
        miMotivo = motivo;
        miCodigo = V.app.myCard(miClave);
        if (estado === 'mio') { mostrarMio(); }
    }

    /* Se llama cada vez que se abre la pantalla. Si ya hay una invitacion
       viva, la vuelve a ensenar tal cual; si no, crea una. */
    function prepararMio() {
        if (miCodigo) { mostrarMio(); return; }
        if (creando) { pintarEspera(); return; }

        if (!V.transport.rtc.available()) {
            caerATarjeta(D.t('Este navegador no tiene WebRTC, asi que no puede abrir un enlace directo.'));
            return;
        }

        creando = true;
        pintarEspera();
        /* Con que clave se pidio ESTA vuelta. Recoger los candidatos de red
           tarda hasta 2500 ms (rtc.js, GATHER_MS) y la pantalla
           deja pulsar el boton de la clave mientras tanto: si la clave cambia
           por el camino, el codigo que llega es el de antes y ensenarlo seria
           mentir, porque el aviso ya ha dicho que lleva clave. */
        var claveDeEstaVuelta = miClave;
        V.app.createInvite(miClave, function (err, code) {
            creando = false;
            /* La boveda se pudo cerrar mientras tanto: sin identidad no hay
               ni tarjeta que ensenar, y myCard reventaria. */
            if (!V.app.identity) { return; }
            if (claveDeEstaVuelta !== miClave) { olvidarMio(); prepararMio(); return; }
            if (err) {
                caerATarjeta('No se ha podido preparar un enlace directo (' + err.message + ').');
                return;
            }
            miCodigo = code;
            miTipo = 'invitacion';
            miMotivo = '';
            if (estado === 'mio') { mostrarMio(); }
        });
    }

    /* La oferta que llevaba dentro mi codigo ya no espera a nadie. */
    function olvidarMio() {
        miCodigo = '';
        miTipo = '';
        miMotivo = '';
    }

    D.openConnect = function () {
        /* boot.js puede llamar aqui con un codigo pegado en la direccion
           antes de que se haya abierto la boveda. Sin identidad no hay ni
           tarjeta ni invitacion que ensenar, y sacar al usuario de la
           pantalla de acceso solo lo dejaria mas perdido. El codigo no se
           pierde: se queda en el campo de abajo esperando. */
        if (!V.app.ready) {
            D.toast(D.t('Abre tu identidad y entra en Conectar: el codigo te espera ahi.'));
            return;
        }
        D.view('view-connect');
        nota('');
        alPrincipio();

        /* Una respuesta a medio ensenar se conserva al salir y volver:
           mientras el otro no la lea, sigue siendo lo que hay que ensenar. El
           boton "Volver a mi codigo" esta ahi para lo otro. */
        if (estado === 'respuesta' && mostrado) { return; }
        prepararMio();
    };

    /* ---------------------------------------------------------------------
       Codigos que llegan de fuera, pegados o por la camara.
       --------------------------------------------------------------------- */
    function handleCode(text, pass) {
        V.app.useCode(text, pass, function (err, res) {
            if (err) { D.toast(err.message, 'bad'); return; }

            if (res.needPass) {
                D.toast(D.t('Ese codigo lleva clave de encuentro: escribela abajo y vuelve a darle'), 'bad');
                var f = D.$('paste-pass');
                if (f) { try { f.focus(); } catch (e) {} }
                return;
            }

            D.$('paste-code').value = '';
            D.refreshRoster();
            D.refreshStatus();

            /* Una tarjeta anade el contacto y para de contar. Decirlo aqui, y
               no dejar que lo descubra escribiendo a alguien que no le lee,
               es la mitad del arreglo. */
            if (res.kind === 'card') {
                nota((res.existed ? 'Ya tenias a ' : 'A\u00f1adido: ') + res.contact.name +
                     '. Pero eso era una tarjeta, que es solo identidad: todavia NO hay camino hasta su aparato. Para abrirlo, ense\u00f1ale el codigo de aqui arriba y que lo escanee, o pidele el suyo. Mientras tanto lo que le escribas se guarda y sale solo en cuanto haya camino.',
                     res.contact.pk);
                D.toast(D.t('Te lo a\u00f1ade como contacto, pero no conecta: falta un codigo de los de arriba'), 'bad');
                return;
            }

            /* Una invitacion: el contacto queda anadido y la respuesta ya
               viene calculada. Lo unico que falta es que la vea el otro, asi
               que sale grande y en QR, no como un texto para copiar a mano. */
            if (res.kind === 'offer') {
                nota('');
                mostrarRespuesta(res.contact, res.answer);
                D.toast(D.t('Ya tienes a {quien}. Falta un paso: ense\u00f1ale la respuesta de arriba.',
                    { quien: res.contact.name }), 'ok');
                return;
            }

            /* Una respuesta DEBERIA cerrar el enlace, pero que se haya
               aceptado no quiere decir que se haya abierto.

               setRemoteDescription se traga cualquier respuesta con forma
               valida, incluida una de una sesion anterior (el otro recargo la
               pagina, o cerro la aplicacion): el navegador la acepta, el
               intercambio de red no cuadra y el canal no llega a abrirse
               NUNCA. Cantar victoria ahi es lo peor que se puede hacer,
               porque manda al usuario a escribir a una conversacion que no
               tiene salida y le deja los mensajes en "sin salir" sin decirle
               por que.

               Asi que aqui no se promete nada: se espera a que el canal se
               abra de verdad (rtc.js avisa con 'peer' cuando el
               canal de datos abre) y, si no abre, se dice claramente. */
            olvidarMio();
            nota('');
            estado = 'mio';
            esperarEnlace(res.contact);
        });
    }

    /* Cuanto se espera a que el canal abra despues de aceptar una respuesta.
       En la misma red esto es cosa de decimas; doce segundos son de sobra
       incluso con la red mal, y es poco para el que espera mirando. */
    var ESPERA_MS = 12000;
    var esperando = null;     /* { pk, nombre, timer } mientras se comprueba */

    function esperarEnlace(contact) {
        if (esperando) { clearTimeout(esperando.timer); }
        D.toast(D.t('Respuesta aceptada. Comprobando el enlace con {quien}...', { quien: contact.name }));
        esperando = { pk: contact.pk, nombre: contact.name, timer: null };
        esperando.timer = setTimeout(function () {
            if (!esperando) { return; }
            var e = esperando;
            esperando = null;
            D.toast(D.t('No se ha abierto el enlace con {quien}. Esa respuesta puede ser de una ' +
                'sesion anterior: pidele que te ense\u00f1e su codigo otra vez.',
                { quien: e.nombre }), 'bad');
            /* Se vuelve a ensenar el codigo propio, que es lo que hay que
               hacer a continuacion. */
            prepararMio();
        }, ESPERA_MS);
    }

    /* El otro lado del enlace: aqui no se pega nada, el canal se abre solo
       cuando la otra persona lee la respuesta que le estamos ensenando. Sin
       este aviso la pantalla se queda con el QR puesto y nada dice que ya
       esta hecho. */
    function avisarEnlace(peer) {
        if (!peer || peer.kind !== 'rtc') { return; }
        var lista = V.transport.peers(), vivo = false;
        for (var i = 0; i < lista.length; i++) {
            if (lista[i].id === peer.id) { vivo = true; }
        }
        if (!vivo) { return; }   /* esto era un enlace que se cae, no uno que nace */

        /* Estabamos comprobando si la respuesta que pegamos abria de verdad.
           Abrio: ahora si se puede prometer. */
        if (esperando) {
            var e = esperando;
            esperando = null;
            clearTimeout(e.timer);
            D.toast(D.t('Enlace abierto con {quien}. Lo que tuvieras sin salir sale ahora.',
                    { quien: e.nombre }), 'ok');
            if (e.pk && V.contacts.get(e.pk)) { D.openChat(e.pk); }
            return;
        }

        if (estado !== 'respuesta') { return; }

        var pk = pkRespuesta;
        estado = 'mio';
        pkRespuesta = null;
        D.toast(D.t('Camino abierto. Lo que tuvieras sin salir sale ahora.'), 'ok');
        if (D.current !== 'view-connect') { return; }
        if (pk && V.contacts.get(pk)) { D.openChat(pk); }
        else { mostrarMio(); }
    }

    D.initConnect = function () {

        D.on(D.$('btn-copy-code'), 'click', function () {
            if (!mostrado) { D.toast(D.t('Todavia se esta preparando')); return; }
            D.copy(mostrado);
        });

        /* Se comparte el enlace, no el codigo pelado: quien lo reciba solo
           tiene que pulsarlo y BINTIO se abre con el codigo puesto. Donde no
           hay direccion (un fichero suelto), toLink devuelve el codigo tal
           cual y se comparte igual de bien. */
        D.on(D.$('btn-share-code'), 'click', function () {
            if (!mostrado) { D.toast(D.t('Todavia se esta preparando')); return; }
            D.share(comoSeComparte + V.invite.toLink(mostrado), 'BINTIO');
        });

        D.on(D.$('btn-show-mine'), 'click', function () {
            mostrarMio();
            alPrincipio();
        });

        /* Rehacer el codigo con clave de encuentro. Es lo unico que crea una
           oferta nueva teniendo otra viva: la de antes se queda esperando a
           nadie, y acceptAnswer se queda con la ultima, que es justo la que
           el usuario esta ensenando. */
        D.on(D.$('btn-lock-code'), 'click', function () {
            var pass = limpio(D.$('meet-pass').value) || null;
            if (pass === miClave && miCodigo) {
                D.toast(D.t(pass ? 'Tu codigo ya lleva esa clave' : 'Tu codigo ya va sin clave'));
                return;
            }
            miClave = pass;
            olvidarMio();
            estado = 'mio';
            prepararMio();
            /* En pasado no, que todavia se esta haciendo: la oferta nueva
               tarda lo que tarde en recoger candidatos, y hasta entonces
               arriba pone "Preparando tu codigo". */
            D.toast(D.t(pass
                ? 'Rehaciendo tu codigo con clave. Dile la clave por otra via, no en el mismo mensaje.'
                : 'Rehaciendo tu codigo sin clave.'), 'ok');
        });

        D.on(D.$('btn-use-code'), 'click', function () {
            var text = limpio(D.$('paste-code').value);
            var pass = limpio(D.$('paste-pass').value);
            if (!text) { D.toast(D.t('Pega primero un codigo, o escanea su QR'), 'bad'); return; }
            handleCode(text, pass || null);
        });

        D.on(D.$('btn-note-chat'), 'click', function () {
            if (pkNota) { D.openChat(pkNota); }
        });

        /* ------------------------------------------------------ camara */
        D.on(D.$('btn-scan'), 'click', function () {
            var area = D.$('scan-area'), video = D.$('scan-video');
            D.show(area, true);
            D.startScan(video, function (value) {
                D.stopScan(video);
                D.show(area, false);
                D.$('paste-code').value = value;
                handleCode(value, limpio(D.$('paste-pass').value) || null);
            }, function (err) {
                D.show(area, false);
                D.toast(err.message, 'bad');
            });
        });
        D.on(D.$('btn-scan-stop'), 'click', function () {
            D.stopScan(D.$('scan-video'));
            D.show(D.$('scan-area'), false);
        });

        /* Salir de esta pantalla por donde sea (el boton, o la conversacion
           que se abre sola al conectar) tiene que apagar la camara. */
        var antes = D.onViewChange;
        D.onViewChange = function (name) {
            if (antes) { antes(name); }
            if (name !== 'view-connect') {
                D.stopScan(D.$('scan-video'));
                D.show(D.$('scan-area'), false);
            }
        };

        /* --------------------------------------------------- bluetooth */
        D.on(D.$('btn-ble'), 'click', function () {
            if (!V.transport.ble.available()) {
                D.toast(D.t('Este navegador no tiene Web Bluetooth. En Android usa Chrome; en iPhone todavia no existe.'), 'bad');
                return;
            }
            D.toast(D.t('Elige un nodo de la lista del navegador...'));
            V.transport.ble.connect(function (err, peer) {
                if (err) { D.toast(D.t('Bluetooth: {motivo}', { motivo: D.t(err.message) }), 'bad'); return; }
                D.toast(D.t('Conectado por Bluetooth a {quien}', { quien: peer.label }), 'ok');
                D.refreshStatus();
            });
        });

        D.on(D.$('btn-connect-back'), 'click', function () {
            D.view('view-main');
        });

        /* Al cerrar la boveda se cierran todas las conexiones WebRTC, y al
           abrirla puede ser otra identidad distinta: el codigo guardado no
           vale para ninguna de las dos cosas. */
        V.app.on(function (what, arg) {
            if (what === 'locked' || what === 'ready') {
                olvidarMio();
                estado = 'mio';
                pkRespuesta = null;
                pkNota = null;
                miClave = null;
                /* Si se cerro la boveda mientras se comprobaba un enlace, ese
                   aviso ya no le importa a nadie: iria a caer encima de la
                   pantalla de acceso de la siguiente persona. */
                if (esperando) { clearTimeout(esperando.timer); esperando = null; }
            }
            if (what === 'link') { avisarEnlace(arg); }
        });
    };
})(BINTIO);
