/* ==========================================================================
   Lista de conversaciones y barra de estado.
   ========================================================================== */
(function (V) {
    'use strict';
    var D = V.ui;

    D.activePk = null;

    D.refreshRoster = function () {
        var list = D.$('roster-list');
        if (!list) { return; }
        D.clear(list);

        var rows = V.chat.list();
        /* Con cero contactos pero una solicitud esperando, "Todavia no
           conoces a nadie" es mentira: alguien te ha escrito y lo tienes
           justo arriba. Ademas ese cartel ocupa 44 px de relleno y taparia
           el aviso, que es lo unico que hay que mirar en esa pantalla. */
        D.show(D.$('roster-empty'), rows.length === 0 && (V.requests ? V.requests.count() : 0) === 0);

        for (var i = 0; i < rows.length; i++) {
            (function (row) {
                var esGrupo = !!row.group;
                var item = D.make('div', 'list-item' + (row.key === D.activePk ? ' is-active' : ''));

                /* El punto verde significa "hay camino con esta persona". Un
                   grupo no es una persona y no tiene un camino: son cuatro
                   caminos distintos. Pintarle un punto seria inventarse un
                   estado, asi que lleva su marca y no punto. */
                if (esGrupo) {
                    item.appendChild(D.make('span', 'gmark', String(row.group.members.length)));
                } else {
                    item.appendChild(D.make('span',
                        'dot' + (D.enLinea(row.contact) ? ' dot--live' : '')));
                }

                var who = D.make('div', 'who');
                var name = D.make('b', null, esGrupo ? row.group.name : row.contact.name);
                /* El vinculo va con el NOMBRE y no en la fila suelta: lo que se
                   pregunta es "puedo escribirle a esta persona", no "que pasa
                   en esta fila". */
                if (!esGrupo) {
                    name.appendChild(document.createTextNode(' '));
                    name.appendChild(D.vinculo(row.contact));
                }
                if (!esGrupo && row.contact.verified) {
                    var v = D.make('span', 'tag tag--ok', D.t('ok'));
                    v.title = 'Huella comprobada';
                    name.appendChild(document.createTextNode(' '));
                    name.appendChild(v);
                }
                who.appendChild(name);

                /* Quien esta escribiendo se lee desde la lista, sin abrir la
                   conversacion: es justo cuando mas sirve. */
                var teclea = V.chat.typingIn(row.key);
                var pie;
                if (teclea) {
                    pie = D.make('small', 'typing-now',
                        esGrupo ? D.t('{quien} esta escribiendo...', { quien: teclea }) : D.t('escribiendo...'));
                } else if (row.last) {
                    /* En un grupo hace falta saber quien lo dijo; en uno a uno
                       solo si fuiste tu, que es lo que distingue tu ultima
                       linea de la suya. */
                    var quien = row.last.dir === 'out' ? D.t('Tu: ')
                        : (esGrupo && row.last.fromName ? row.last.fromName + ': ' : '');
                    pie = D.make('small', null, quien + row.last.text);
                } else {
                    pie = D.make('small', null, esGrupo
                        ? D.t('{n} personas, sin nada escrito todavia', { n: row.group.members.length })
                        : row.contact.address);
                }
                who.appendChild(pie);
                item.appendChild(who);

                var meta = D.make('div', 'meta');
                if (row.last) { meta.appendChild(D.make('time', null, D.ago(row.last.ts))); }
                if (row.chat.unread) { meta.appendChild(D.make('span', 'badge', row.chat.unread)); }
                item.appendChild(meta);

                D.on(item, 'click', function () { D.openChat(row.key); });
                list.appendChild(item);
            })(rows[i]);
        }

        /* La fila de solicitudes esta FUERA de #roster-list -aqui arriba se
           vacia y se reconstruye entera, y esa fila no es una conversacion ni
           puede ordenarse entre ellas-, pero se pinta al mismo tiempo porque
           comparte pantalla. Es requests.js quien es dueno de sus ids;
           aqui solo se le avisa. */
        if (D.refreshRequests) { D.refreshRequests(); }
    };

    /* Lo ultimo que se pinto en la barra de abajo. La barra se repasa cada
       cuatro segundos y en regimen normal no cambia NADA entre repaso y
       repaso: mismos enlaces, misma mochila, mismos contactos. Repintarla
       igualmente eran seis borrados y once nodos nuevos cada cuatro segundos,
       con su calculo de estilo y su pintada, para dejar la pantalla
       exactamente como estaba. Ahora se compara antes y casi siempre se sale
       por la puerta de al lado. */
    var pintado = null;

    D.refreshStatus = function () {
        /* Con la boveda cerrada no se sale sin mas: se BORRA. Salir dejaba en
           pantalla los ultimos numeros del dueno -cuantos contactos tiene,
           cuanto ocupa su boveda, cuantos sobres ajenos lleva- justo encima de
           la pantalla de contrasena, que es la que ve cualquiera que coja el
           aparato despues. Es poco, pero es exactamente lo que esta aplicacion
           promete no ensenar. */
        if (!V.app.ready) {
            if (pintado === 'cerrada') { return; }
            pintado = 'cerrada';
            var ids = ['st-links', 'st-bag', 'st-contacts', 'st-store', 'st-mode'];
            for (var i = 0; i < ids.length; i++) {
                var el = D.$(ids[i]);
                if (el) { D.clear(el); el.className = 'stat'; }
            }
            return;
        }
        var s = V.app.status();

        /* Todo lo que la barra ensena, y nada mas: si esta firma no ha
           cambiado, lo que hay en pantalla ya es correcto.

           El idioma va DENTRO de la firma, y no es un adorno: la barra tambien
           ensena palabras, no solo numeros. Sin el, cambiar de idioma no movia
           ni un numero, la firma salia igual, se salia por la puerta de al lado
           y la barra se quedaba en el idioma anterior. En una aplicacion en
           reposo -sin enlaces, sin mensajes, sin contactos nuevos- esa firma no
           vuelve a cambiar nunca, asi que se quedaba asi para siempre. */
        var firma = [D.idioma(), s.peers, s.rtc, s.ble, s.local, s.carrying,
                     s.contacts, s.storage, s.persistent].join('|');
        if (firma === pintado) { return; }
        pintado = firma;

        var links = D.$('st-links');
        D.clear(links);
        links.appendChild(document.createTextNode(D.t('Enlaces ')));
        links.appendChild(D.make('b', null, s.peers));
        links.className = 'stat' + (s.peers ? ' is-live' : '');

        var bag = D.$('st-bag');
        D.clear(bag);
        bag.appendChild(document.createTextNode(D.t('Mochila ')));
        bag.appendChild(D.make('b', null, s.carrying));

        var con = D.$('st-contacts');
        D.clear(con);
        con.appendChild(document.createTextNode(D.t('Contactos ')));
        con.appendChild(D.make('b', null, s.contacts));

        var st = D.$('st-store');
        D.clear(st);
        st.appendChild(document.createTextNode(D.t('Disco ')));
        st.appendChild(D.make('b', null, D.bytes(s.storage)));

        /* Con hueco y no pegando el numero delante de la palabra: en ingles
           "2 directo" no se dice asi, y una frase partida en dos trozos no se
           puede traducir entera. Es la misma regla que explica idioma.js. */
        var modes = [];
        if (s.rtc) { modes.push(D.t('{n} directo', { n: s.rtc })); }
        if (s.ble) { modes.push(D.t('{n} bluetooth', { n: s.ble })); }
        if (s.local) { modes.push(D.t('{n} local', { n: s.local })); }
        D.text(D.$('st-mode'), modes.length ? modes.join(' / ')
            : D.t(s.persistent ? 'sin enlaces' : 'sin guardar en disco'));

    };
})(BINTIO);
