/* ==========================================================================
   La conversacion abierta y la ficha del contacto.
   ========================================================================== */
(function (V) {
    'use strict';
    var D = V.ui;

    /* Ultima conversacion en la que ya se aviso de que no hay enlaces. Asi el
       aviso sale una vez y no en cada linea que se escriba. */
    var avisadoSinEnlace = null;

    var ESTADOS = {
        pendiente: 'sin salir',
        enviado: 'enviado',
        entregado: 'entregado',
        leido: 'leido',
        error: 'error',
        recibido: ''
    };

    D.openChat = function (pkHex) {
        var contact = V.contacts.get(pkHex);
        if (!contact) { return; }
        D.activePk = pkHex;

        D.text(D.$('peer-name'), contact.name);
        D.text(D.$('peer-fp'), contact.verified ? 'huella comprobada' : contact.fingerprint);
        var dot = D.$('peer-dot');
        dot.className = 'dot' + (contact.lastSeen && Date.now() - contact.lastSeen < 120000 ? ' dot--live' : '');

        var main = D.$('view-main');
        main.className = 'view is-active show-chat';
        D.view('view-main');
        main.className = 'view is-active show-chat';

        D.renderMessages();
        V.chat.markRead(pkHex);
        D.refreshRoster();
        var box = D.$('composer-text');
        if (box) { try { box.focus(); } catch (e) {} }
    };

    D.renderMessages = function () {
        var scroll = D.$('chat-scroll');
        if (!scroll || !D.activePk) { return; }
        D.clear(scroll);

        var chat = V.chat.get(D.activePk);

        /* Aviso de contacto a medias. Anadir a alguien es de UNA direccion: tu
           tienes su clave, pero el no tiene la tuya hasta que hace lo mismo, y
           un sobre solo se puede abrir si quien lo recibe tiene dado de alta a
           quien lo manda (34-session.js). Asi que mientras no haya llegado
           nada suyo, lo que le escribas puede salir del aparato y aun asi no
           poder abrirse al otro lado.

           Se queda fijo en la conversacion, no en un aviso que se va a los
           tres segundos: es la unica forma de que se entienda por que no
           llega nada. Desaparece solo con el primer mensaje suyo. */
        var contacto = V.contacts.get(D.activePk);
        if (contacto && !contacto.mutuo) {
            var nota = D.make('div', 'msg msg--sys');
            nota.appendChild(document.createTextNode(
                'Todavia no ha llegado nada de ' + contacto.name + '. Anadir a alguien va en una ' +
                'sola direccion: hasta que ' + contacto.name + ' te tenga a ti, no puede abrir lo ' +
                'que le escribas. Si le pasaste tu codigo, tiene que devolverte su respuesta; si ' +
                'le anadiste tu con su codigo, pasale el tuyo.'));
            scroll.appendChild(nota);
        }

        if (!chat.messages.length) {
            if (!contacto || contacto.mutuo) {
                scroll.appendChild(D.make('div', 'empty-msg',
                    'Todavia no hay nada. Lo que escribas aqui solo lo puede leer esta persona.'));
            }
            return;
        }

        var lastDay = '';
        for (var i = 0; i < chat.messages.length; i++) {
            var m = chat.messages[i];
            var day = D.day(m.ts);
            if (day !== lastDay) {
                scroll.appendChild(D.make('div', 'day-sep', day));
                lastDay = day;
            }
            var el = D.make('div', 'msg msg--' + (m.dir === 'out' ? 'out' : 'in'));
            el.appendChild(document.createTextNode(m.text));

            var foot = D.make('div', 'foot');
            foot.appendChild(D.make('span', null, D.time(m.ts)));
            if (m.dir === 'out') {
                var label = ESTADOS[m.state] === undefined ? m.state : ESTADOS[m.state];
                if (label) { foot.appendChild(D.make('span', 'st--' + m.state, label)); }
            }
            el.appendChild(foot);
            scroll.appendChild(el);
        }
        var body = D.$('chat-body');
        body.scrollTop = body.scrollHeight;
    };

    function send() {
        var box = D.$('composer-text');
        var text = (box.value || '').replace(/^\s+|\s+$/g, '');
        if (!text || !D.activePk) { return; }
        var contact = V.contacts.get(D.activePk);
        if (!contact) { return; }
        V.chat.sendText(contact, text);
        box.value = '';
        box.style.height = 'auto';
        D.renderMessages();
        D.refreshRoster();
        D.refreshStatus();

        /* Sin un solo enlace, el mensaje se queda escrito y en el pie pone
           "sin salir". Eso es correcto y no se pierde nada (50-app.js:45 lo
           reintenta en cuanto aparece un enlace), pero la primera vez no hay
           quien lo adivine: aqui no hay servidor que lleve el mensaje, y tener
           el contacto anadido NO es tenerlo conectado. Se avisa una vez por
           conversacion y solo si de verdad no hay por donde salir. */
        if (!V.transport.peers().length && avisadoSinEnlace !== D.activePk) {
            avisadoSinEnlace = D.activePk;
            D.toast('Guardado, pero no hay ningun enlace: saldra solo en cuanto conectes con alguien. Pulsa Conectar.', 'bad');
        }
    }

    D.initChat = function () {
        D.on(D.$('btn-send'), 'click', send);

        var box = D.$('composer-text');
        D.on(box, 'keydown', function (ev) {
            /* Enter envia; Mayusculas+Enter hace un salto de linea. En movil
               el teclado manda su propio Enter y tambien envia, que es lo que
               espera cualquiera. */
            if (ev.keyCode === 13 && !ev.shiftKey) {
                if (ev.preventDefault) { ev.preventDefault(); }
                send();
            }
        });
        D.on(box, 'input', function () {
            box.style.height = 'auto';
            box.style.height = Math.min(132, box.scrollHeight) + 'px';
        });

        D.on(D.$('btn-back'), 'click', function () {
            D.$('view-main').className = 'view is-active';
            D.activePk = null;
            D.refreshRoster();
        });

        D.on(D.$('btn-add'), 'click', function () { D.openConnect(); });

        /* ------------------------------------------------------ ficha */
        D.on(D.$('btn-peer'), 'click', function () {
            if (!D.activePk) { return; }
            var c = V.contacts.get(D.activePk);
            if (!c) { return; }
            D.text(D.$('peer-title'), c.name);
            D.$('peer-alias').value = c.name;
            D.text(D.$('peer-fingerprint'), c.fingerprint);
            D.$('peer-verified').checked = !!c.verified;
            D.view('view-peer');
        });

        D.on(D.$('btn-peer-save'), 'click', function () {
            var name = (D.$('peer-alias').value || '').replace(/^\s+|\s+$/g, '');
            if (name) {
                V.contacts.rename(D.activePk, name);
                var c = V.contacts.get(D.activePk);
                c.nameLocked = true;   /* a partir de ahora manda tu nombre, no el suyo */
            }
            V.contacts.setVerified(D.activePk, D.$('peer-verified').checked);
            D.toast('Guardado', 'ok');
            D.openChat(D.activePk);
        });

        D.on(D.$('btn-peer-back'), 'click', function () { D.openChat(D.activePk); });

        D.on(D.$('btn-peer-clear'), 'click', function () {
            if (!window.confirm('Borrar toda la conversacion de este aparato? No se puede deshacer.')) { return; }
            V.chat.clear(D.activePk);
            D.openChat(D.activePk);
            D.toast('Conversacion borrada');
        });

        D.on(D.$('btn-peer-remove'), 'click', function () {
            if (!window.confirm('Eliminar el contacto y su conversacion?')) { return; }
            V.contacts.remove(D.activePk);
            D.activePk = null;
            D.$('view-main').className = 'view is-active';
            D.view('view-main');
            D.refreshRoster();
            D.refreshStatus();
            D.toast('Contacto eliminado');
        });
    };
})(BINTIO);
