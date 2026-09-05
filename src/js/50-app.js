/* ==========================================================================
   Controlador.

   Une el nucleo con los transportes y avisa a la interfaz. Es el unico
   fichero que conoce a los dos lados, y por eso es corto a proposito: si
   crece, es que alguien esta metiendo aqui logica que pertenece a otro
   sitio.
   ========================================================================== */
(function (V) {
    'use strict';
    var U = V.util, A = V.app;

    var timer = null;
    var enganchado = false;   /* los manejadores se ponen una sola vez */
    var listeners = [];

    /* La ultima invitacion que se creo, mientras siga esperando respuesta.
       Se guarda por una razon concreta: si cada vez que se abre la pantalla
       de conectar se fabricara una invitacion nueva, la anterior se cerraria
       (R.createOffer cierra la que espera) y el codigo que el usuario acaba de
       pasar por WhatsApp dejaria de valer sin que nadie se lo dijera. */
    var invitacionViva = null;

    A.identity = null;
    A.ready = false;

    A.on = function (fn) { listeners.push(fn); };
    A.emit = function (what, arg) {
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](what, arg); } catch (e) {}
        }
    };

    /* ---------------------------------------------------------------------
       Arranque tras abrir la boveda.
       --------------------------------------------------------------------- */
    A.start = function () {
        var st = V.vault.state;

        if (!st.identity) {
            var fresh = V.id.create();
            st.identity = { seed: U.toHex(fresh.seed), name: V.id.suggestName(fresh.pk) };
            V.vault.save();
        }
        A.identity = V.id.fromSeed(U.fromHex(st.identity.seed));
        A.identity.name = st.identity.name;

        V.contacts.bind(A.identity);
        V.mesh.init(function (opened) { V.chat.onIncoming(opened); });

        /* Esto se engancha UNA vez por pestana, no una vez por sesion.

           transport.on y chat.onChange solo saben anadir: no hay forma de
           quitar un manejador. Como start() se ejecuta entera cada vez que se
           abre la boveda, cerrar y volver a abrir sin recargar dejaba dos
           copias de cada manejador; tres ciclos, tres copias. Cada mensaje
           repintaba la conversacion tantas veces como ciclos llevara la
           pestana, y cada enlace nuevo vaciaba la bolsa y reintentaba la cola
           una vez por copia. */
        if (!enganchado) {
            enganchado = true;
            V.transport.on('peer', function (peer) {
                V.mesh.flushTo(peer);
                V.chat.retryPending();
                A.emit('link', peer);
            });
            V.transport.on('gone', function (peer) { A.emit('link', peer); });
            V.chat.onChange(function (what, arg) { A.emit(what, arg); });
        }

        A.startTransports();

        /* Tareas de mantenimiento. Un minuto es tiempo de sobra: nada de
           esto es urgente y el movil agradece no despertarse. */
        if (timer) { clearInterval(timer); }
        timer = setInterval(function () {
            V.mesh.prune();
            V.chat.retryPending();
            /* Presentaciones que se quedaron sin cupo de curva en su minuto, y
               solicitudes que llevan demasiado tiempo sin que nadie decida. En
               regimen normal las dos son cero y no cuestan nada. */
            try { V.presenta.retry(); V.requests.prune(); } catch (e) {}
            V.vault.save();
            A.emit('tick');
        }, 60000);

        A.ready = true;
        A.emit('ready');
    };

    A.startTransports = function () {
        try { V.transport.local.start(); } catch (e) {}
    };

    A.stop = function () {
        if (timer) { clearInterval(timer); timer = null; }
        invitacionViva = null;
        try { V.transport.rtc.closeAll(); } catch (e) {}
        try { V.transport.ble.closeAll(); } catch (e) {}
        try { V.transport.local.stop(); } catch (e) {}
        V.transport.closeAll();
        V.vault.lock();
        A.identity = null;
        A.ready = false;
        A.emit('locked');
    };

    /* ---------------------------------------------------------------------
       Invitaciones. La interfaz solo llama a estas cuatro.
       --------------------------------------------------------------------- */
    A.myCard = function (pass) {
        return V.invite.encode('card', A.identity.pk, A.identity.name, null, pass);
    };

    A.createInvite = function (pass, cb) {
        if (invitacionViva && invitacionViva.pass === (pass || null) &&
            V.transport.rtc.hasPendingOffer()) {
            cb(null, invitacionViva.code, true);
            return;
        }
        V.transport.rtc.createOffer(function (err, sdp) {
            if (err) { invitacionViva = null; cb(err); return; }
            var code = V.invite.encode('offer', A.identity.pk, A.identity.name, sdp, pass);
            invitacionViva = { code: code, pass: pass || null };
            cb(null, code, false);
        });
    };

    /* Acepta cualquier codigo: tarjeta, invitacion o respuesta. Devuelve por
       el callback lo que ha pasado, para que la interfaz lo cuente. */
    A.useCode = function (text, pass, cb) {
        var parsed = V.invite.decode(text, pass);
        if (!parsed) { cb(new Error('Eso no es un codigo de BINTIO')); return; }
        if (parsed.needPass) { cb(null, { needPass: true }); return; }
        if (parsed.badPass) { cb(new Error('La clave de encuentro no es la correcta')); return; }
        if (parsed.pk === U.toHex(A.identity.pk)) { cb(new Error('Ese codigo es tuyo')); return; }

        var res = V.contacts.add(parsed.pk, parsed.name);
        if (res.error) { cb(new Error(res.error)); return; }
        var contact = res.contact;

        if (parsed.kind === 'card' || !parsed.sdp) {
            cb(null, { kind: 'card', contact: contact, existed: res.existed });
            return;
        }
        if (parsed.kind === 'offer') {
            V.transport.rtc.acceptOffer(parsed.sdp, function (err, sdp) {
                if (err) { cb(err); return; }
                cb(null, {
                    kind: 'offer',
                    contact: contact,
                    answer: V.invite.encode('answer', A.identity.pk, A.identity.name, sdp, pass)
                });
            });
            return;
        }
        V.transport.rtc.acceptAnswer(parsed.sdp, function (err) {
            if (err) { cb(err); return; }
            cb(null, { kind: 'answer', contact: contact });
        });
    };

    /* ---------------------------------------------------------------------
       Estado para la barra inferior.
       --------------------------------------------------------------------- */
    A.status = function () {
        var bag = V.mesh.bagSize();
        return {
            peers: V.transport.count(),
            rtc: V.transport.countByKind('rtc'),
            ble: V.transport.countByKind('ble'),
            local: V.transport.countByKind('local'),
            carrying: bag.count,
            carryingBytes: bag.bytes,
            stats: V.mesh.stats,
            contacts: V.contacts.all().length,
            unread: V.chat.totalUnread(),
            requests: V.requests ? V.requests.count() : 0,
            presented: V.mesh.stats.presented,
            storage: V.vault.sizeBytes(),
            persistent: V.vault.isPersistent()
        };
    };
})(BINTIO);
