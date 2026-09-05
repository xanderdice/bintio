/* ==========================================================================
   La conversacion abierta, la ficha del contacto y la del grupo.

   Una persona y un grupo se pintan en el MISMO sitio, y no por ahorrar: para
   quien mira son la misma cosa -un nombre arriba, lo dicho en medio y un
   hueco donde escribir- y partirlo en dos pantallas habria sido mantener dos
   veces el desplazamiento, el separador de dias, el pie de cada mensaje y el
   aviso de que no hay enlaces. Lo que cambia entre una y otro cabe en cuatro
   preguntas, y estan todas aqui arriba: quien es, quien lo escribio, a cuantos
   ha llegado y a quien no se le puede escribir.

   D.activePk guarda la CLAVE de la conversacion, que para una persona es su
   clave publica y para un grupo es "g:" y su identificador (38-groups.js). Todo
   lo demas -abrir, marcar leido, borrar- funciona igual con las dos.
   ========================================================================== */
(function (V) {
    'use strict';
    var D = V.ui;

    /* Ultima conversacion en la que ya se aviso de que no hay enlaces. Asi el
       aviso sale una vez y no en cada linea que se escriba. */
    var avisadoSinEnlace = null;

    /* Que grupo se esta editando en view-group, o null si se esta creando uno
       nuevo. Es lo unico que distingue los dos modos de esa vista. */
    var editando = null;

    var ESTADOS = {
        pendiente: 'sin salir',
        enviado: 'enviado',
        entregado: 'entregado',
        leido: 'leido',
        error: 'error',
        recibido: ''
    };

    /* El grupo de la conversacion abierta, o null si es una persona. */
    function grupoAbierto() {
        if (!D.activePk || !V.groups.isKey(D.activePk)) { return null; }
        return V.groups.get(V.groups.idOf(D.activePk));
    }

    /* Lo que pone en el pie de un mensaje propio, y de que color.

       En uno a uno es una palabra. En un grupo la palabra sola mentiria en una
       direccion o en la otra -"enviado" cuando ya lo han leido tres de cuatro,
       o "leido" cuando falta uno-, asi que mientras no esten todos se ensena
       la cuenta. Cuando llegan todos, la cuenta sobra y desaparece: "leido", a
       secas, que es lo que se queria saber.

       Se mira primero lo leido y luego lo entregado, no al reves. Un mensaje
       que tienen los dos y ha leido uno esta a la vez "entregado" y "leido 1 de
       2"; de las dos, la que hace falta saber es la segunda, porque la primera
       ya se da por hecha en cuanto aparece la otra.

       El color va con lo que PONE y no con m.state, que es lo que se guarda:
       si no, un pie que dice "leido 1 de 2" saldria del color de entregado. */
    function pieDe(m) {
        var base = ESTADOS[m.state] === undefined ? m.state : ESTADOS[m.state];
        if (!m.g || !m.n) { return { texto: base, clase: m.state }; }
        if (m.state === 'pendiente' || m.state === 'error') { return { texto: base, clase: m.state }; }
        if (m.r >= m.n) { return { texto: 'leido', clase: 'leido' }; }
        if (m.r) { return { texto: 'leido ' + m.r + ' de ' + m.n, clase: 'leido' }; }
        if (m.d >= m.n) { return { texto: 'entregado', clase: 'entregado' }; }
        if (m.d) { return { texto: 'entregado ' + m.d + ' de ' + m.n, clase: 'entregado' }; }
        return { texto: base, clase: m.state };
    }

    D.openChat = function (key) {
        var group = V.groups.isKey(key) ? V.groups.get(V.groups.idOf(key)) : null;
        var contact = group ? null : V.contacts.get(key);
        if (!group && !contact) { return; }
        D.activePk = key;

        var dot = D.$('peer-dot');
        if (group) {
            D.text(D.$('peer-name'), group.name);
            D.text(D.$('peer-fp'), group.members.length + ' personas');
            /* Sin punto: ver el comentario de la lista. Un grupo no tiene un
               camino, tiene tantos como miembros. */
            dot.className = 'dot dot--none';
        } else {
            D.clear(D.$('peer-name'));
            D.$('peer-name').appendChild(document.createTextNode(contact.name + ' '));
            D.$('peer-name').appendChild(D.vinculo(contact));
            D.text(D.$('peer-fp'), contact.verified ? 'huella comprobada' : contact.fingerprint);
            dot.className = 'dot' + (contact.lastSeen && Date.now() - contact.lastSeen < 120000 ? ' dot--live' : '');
        }
        D.text(D.$('btn-peer'), group ? 'Grupo' : 'Ficha');

        var main = D.$('view-main');
        main.className = 'view is-active show-chat';
        D.view('view-main');
        main.className = 'view is-active show-chat';

        D.renderMessages();
        D.paintTyping();
        V.chat.markRead(key);
        D.refreshRoster();
        var box = D.$('composer-text');
        if (box) { try { box.focus(); } catch (e) {} }
    };

    /* El renglon de "esta escribiendo". Se pinta aparte de la conversacion a
       proposito: aparece y desaparece cada pocos segundos, y meterlo dentro
       obligaria a repintar todos los mensajes por un renglon. */
    D.paintTyping = function () {
        var linea = D.$('typing-line');
        if (!linea) { return; }
        var quien = D.activePk ? V.chat.typingIn(D.activePk) : null;
        if (!quien) { D.show(linea, false); return; }
        /* El nombre va tambien en uno a uno, aunque parezca obvio: la
           conversacion se puede tener abierta con la lista al lado, y en el
           movil el aviso sale mientras se ve otra cosa. */
        D.text(linea, quien + ' esta escribiendo...');
        D.show(linea, true);
    };

    D.renderMessages = function () {
        var scroll = D.$('chat-scroll');
        if (!scroll || !D.activePk) { return; }
        D.clear(scroll);

        var group = grupoAbierto();
        var chat = V.chat.get(D.activePk);

        if (group) {
            /* A quien de la lista NO puedes escribirle. Se dice en la propia
               conversacion y con nombres, porque es la unica explicacion
               posible de por que un mensaje se queda en "leido 2 de 3" para
               siempre. Sin esto pareceria que el grupo esta roto. */
            var faltan = V.groups.missing(group);
            if (faltan.length) {
                var nombres = [], k;
                for (k = 0; k < faltan.length; k++) { nombres.push(faltan[k].name); }
                var avisoG = D.make('div', 'msg msg--sys');
                avisoG.appendChild(document.createTextNode(
                    'En este grupo esta ' + nombres.join(', ') + ', pero no lo tienes anadido: ' +
                    'lo que escribas aqui no le llegara, y sus acuses no te llegaran a ti. ' +
                    'Anadelo desde + Contacto y el grupo se completa solo.'));
                scroll.appendChild(avisoG);
            }
        } else {
            /* Aviso de contacto a medias. Anadir a alguien es de UNA direccion:
               tu tienes su clave, pero el no tiene la tuya hasta que hace lo
               mismo, y un sobre solo se puede abrir si quien lo recibe tiene
               dado de alta a quien lo manda (34-session.js). Asi que mientras
               no haya llegado nada suyo, lo que le escribas puede salir del
               aparato y aun asi no poder abrirse al otro lado.

               Se queda fijo en la conversacion, no en un aviso que se va a los
               tres segundos: es la unica forma de que se entienda por que no
               llega nada. Desaparece solo con el primer mensaje suyo. */
            var contacto = V.contacts.get(D.activePk);
            if (contacto && contacto.unlinked) {
                /* Nos ha quitado y nos lo ha dicho. Es distinto de "todavia no
                   ha llegado nada suyo" y no se puede contar igual: ahi cabe
                   esperar, y aqui no hay nada que esperar. */
                var corte = D.make('div', 'msg msg--sys');
                corte.appendChild(document.createTextNode(
                    contacto.name + ' te ha quitado de sus contactos. Lo que escribas aqui saldra ' +
                    'del aparato, pero ' + contacto.name + ' ya no lo puede abrir: para eso tendria ' +
                    'que volver a anadirte. Lo que ya os disteis sigue aqui; si no lo quieres, ' +
                    'borra la conversacion desde Ficha.'));
                scroll.appendChild(corte);
            } else if (contacto && !contacto.mutuo) {
                var nota = D.make('div', 'msg msg--sys');
                nota.appendChild(document.createTextNode(
                    'Todavia no ha llegado nada de ' + contacto.name + '. Anadir a alguien va en una ' +
                    'sola direccion: hasta que ' + contacto.name + ' te tenga a ti, no puede abrir lo ' +
                    'que le escribas. Si le pasaste tu codigo, tiene que devolverte su respuesta; si ' +
                    'le anadiste tu con su codigo, pasale el tuyo.'));
                scroll.appendChild(nota);
            }

            if (!chat.messages.length && (!contacto || contacto.mutuo)) {
                scroll.appendChild(D.make('div', 'empty-msg',
                    'Todavia no hay nada. Lo que escribas aqui solo lo puede leer esta persona.'));
                return;
            }
        }

        if (!chat.messages.length) {
            if (group) {
                scroll.appendChild(D.make('div', 'empty-msg',
                    'Grupo vacio. Lo que escribas sale cifrado por separado para cada persona.'));
            }
            return;
        }

        var lastDay = '', ultimoAutor = '';
        for (var i = 0; i < chat.messages.length; i++) {
            var m = chat.messages[i];
            var day = D.day(m.ts);
            if (day !== lastDay) {
                scroll.appendChild(D.make('div', 'day-sep', day));
                lastDay = day;
                ultimoAutor = '';
            }
            var el = D.make('div', 'msg msg--' + (m.dir === 'out' ? 'out' : 'in'));

            /* En un grupo, quien lo dijo. Solo cuando cambia de autor: repetir
               el nombre en cada linea de la misma persona es ruido, y con dos
               que hablen seguido la conversacion se vuelve ilegible. */
            if (group && m.dir === 'in') {
                var autor = m.from || '';
                if (autor !== ultimoAutor) {
                    el.appendChild(D.make('div', 'msg-who', m.fromName || 'alguien'));
                }
                ultimoAutor = autor;
            } else if (m.dir === 'out') {
                ultimoAutor = '';
            }

            el.appendChild(document.createTextNode(m.text));

            var foot = D.make('div', 'foot');
            foot.appendChild(D.make('span', null, D.time(m.ts)));
            if (m.dir === 'out') {
                var pie = pieDe(m);
                if (pie.texto) { foot.appendChild(D.make('span', 'st--' + pie.clase, pie.texto)); }
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

        var group = grupoAbierto();
        if (group) {
            V.chat.sendGroupText(group, text);
        } else {
            var contact = V.contacts.get(D.activePk);
            if (!contact) { return; }
            V.chat.sendText(contact, text);
        }
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

    /* ---------------------------------------------------------------------
       La vista de grupo, que sirve para crear y para editar.
       --------------------------------------------------------------------- */
    function pintarGrupo(group) {
        editando = group || null;
        D.text(D.$('group-title'), group ? 'Grupo' : 'Nuevo grupo');
        D.$('group-name').value = group ? group.name : '';
        D.text(D.$('btn-group-save'), group ? 'Guardar' : 'Crear grupo');
        D.show(D.$('btn-group-clear'), !!group);
        D.show(D.$('btn-group-leave'), !!group);

        var caja = D.$('group-members');
        D.clear(caja);

        var dentro = {}, i;
        if (group) {
            for (i = 0; i < group.members.length; i++) { dentro[group.members[i].pk] = 1; }
        }

        var todos = V.contacts.all();
        if (!todos.length) {
            caja.appendChild(D.make('div', 'empty-msg',
                'Todavia no tienes a nadie. Un grupo se hace con gente que ya has anadido.'));
        }
        for (i = 0; i < todos.length; i++) {
            (function (c) {
                var fila = D.make('label', 'check check--row');
                var caja2 = document.createElement('input');
                caja2.type = 'checkbox';
                caja2.value = c.pk;
                caja2.checked = !!dentro[c.pk];
                fila.appendChild(caja2);
                var texto = D.make('span', null, c.name);
                texto.appendChild(D.make('small', null, c.address));
                fila.appendChild(texto);
                caja.appendChild(fila);
            })(todos[i]);
        }

        /* Miembros que estan en la lista y NO tienes: salen aqui apagados, no
           desaparecidos. Si desaparecieran, guardar el grupo los echaria sin
           que nadie se enterase, y echar a alguien no puede ser un efecto
           secundario de tocar el nombre. */
        var fuera = group ? V.groups.missing(group) : [];
        for (i = 0; i < fuera.length; i++) {
            var f = D.make('div', 'check check--row is-off');
            var t = D.make('span', null, fuera[i].name);
            t.appendChild(D.make('small', null, 'no lo tienes anadido: sigue en el grupo, pero no puedes escribirle'));
            f.appendChild(t);
            caja.appendChild(f);
        }

        D.text(D.$('group-note'), group
            ? 'Cada mensaje sale cifrado por separado para cada persona. Un mensaje pone "leido" solo cuando lo han leido todos.'
            : 'Elige a quien quieras. Todos veran el nombre del grupo y quien esta dentro.');
        D.view('view-group');
    }

    function elegidos() {
        var cajas = D.$('group-members').getElementsByTagName('input');
        var out = [];
        for (var i = 0; i < cajas.length; i++) {
            if (cajas[i].checked) { out.push(cajas[i].value); }
        }
        return out;
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
            /* El aviso de "escribiendo". Se manda en cada pulsacion y es
               36-chat.js quien lo estrangula a uno cada cuatro segundos: el
               limite vive con el protocolo y no con el teclado, para que valga
               igual venga de donde venga. Con el hueco vacio no se avisa: darle
               a borrar hasta dejarlo en blanco no es escribir. */
            if (D.activePk && (box.value || '').replace(/^\s+|\s+$/g, '')) {
                V.chat.sendTyping(D.activePk);
            }
        });

        D.on(D.$('btn-back'), 'click', function () {
            D.$('view-main').className = 'view is-active';
            D.activePk = null;
            D.refreshRoster();
        });

        D.on(D.$('btn-add'), 'click', function () { D.openConnect(); });
        D.on(D.$('btn-new-group'), 'click', function () { pintarGrupo(null); });

        /* ------------------------------------------------------ ficha */
        D.on(D.$('btn-peer'), 'click', function () {
            if (!D.activePk) { return; }
            var g = grupoAbierto();
            if (g) { pintarGrupo(g); return; }
            var c = V.contacts.get(D.activePk);
            if (!c) { return; }
            D.clear(D.$('peer-title'));
            D.$('peer-title').appendChild(document.createTextNode(c.name + ' '));
            D.$('peer-title').appendChild(D.vinculo(c));
            D.text(D.$('peer-estado'), c.mutuo
                ? 'Vinculado: te tiene anadido, asi que lo que le escribas lo puede abrir.'
                : c.unlinked
                    ? 'Te ha quitado de sus contactos. Lo que le escribas ya no lo puede abrir.'
                    : 'Sin vinculo todavia: no ha llegado nada suyo. Hasta que te anada, no puede abrir lo que le escribas.');
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
            /* Se dice que se le avisa. Quitar a alguien en silencio y que siga
               escribiendo a una pared es lo que esta aplicacion no quiere
               hacerle a nadie, pero tampoco puede ser una sorpresa para quien
               lo hace: quien prefiera irse sin decir nada tiene que poder
               enterarse ANTES de pulsar. */
            if (!window.confirm('Eliminar el contacto y su conversacion? ' +
                'Se le avisara de que ya no hay vinculo, para que no siga escribiendote sin saberlo.')) { return; }
            V.chat.unlink(D.activePk);
            D.activePk = null;
            D.$('view-main').className = 'view is-active';
            D.view('view-main');
            D.refreshRoster();
            D.refreshStatus();
            D.toast('Contacto eliminado');
        });

        /* ------------------------------------------------------ grupo */
        D.on(D.$('btn-group-save'), 'click', function () {
            var name = (D.$('group-name').value || '').replace(/^\s+|\s+$/g, '');
            var pks = elegidos();

            if (!editando) {
                var hecho = V.groups.create(name, pks);
                if (hecho.error) { D.toast(hecho.error, 'bad'); return; }
                D.refreshRoster();
                D.openChat(V.groups.key(hecho.group.id));
                D.toast('Grupo creado. Lo sabran cuando escribas el primer mensaje.', 'ok');
                return;
            }

            if (!V.groups.rename(editando.id, name)) { D.toast('El grupo necesita un nombre', 'bad'); return; }
            if (!V.groups.setMembers(editando.id, pks)) {
                D.toast('Un grupo necesita al menos a una persona mas', 'bad');
                return;
            }
            D.toast('Guardado. El cambio les llega con el siguiente mensaje.', 'ok');
            D.openChat(V.groups.key(editando.id));
        });

        D.on(D.$('btn-group-back'), 'click', function () {
            if (editando) { D.openChat(V.groups.key(editando.id)); return; }
            D.activePk = null;
            D.view('view-main');
            D.refreshRoster();
        });

        D.on(D.$('btn-group-clear'), 'click', function () {
            if (!editando) { return; }
            if (!window.confirm('Borrar toda la conversacion de este grupo en este aparato?')) { return; }
            V.chat.clear(V.groups.key(editando.id));
            D.openChat(V.groups.key(editando.id));
            D.toast('Conversacion borrada');
        });

        D.on(D.$('btn-group-leave'), 'click', function () {
            if (!editando) { return; }
            if (!window.confirm('Salir del grupo? Se borra de este aparato con su conversacion. ' +
                'Los demas no reciben ningun aviso.')) { return; }
            V.groups.remove(editando.id);
            editando = null;
            D.activePk = null;
            D.$('view-main').className = 'view is-active';
            D.view('view-main');
            D.refreshRoster();
            D.refreshStatus();
            D.toast('Has salido del grupo');
        });
    };
})(BINTIO);
