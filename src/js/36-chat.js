/* ==========================================================================
   Conversaciones.

   Modelo de datos y nada mas: aqui no hay DOM ni transporte. La interfaz se
   suscribe con chat.onChange y repinta lo que haga falta.

   Estados de un mensaje propio:
     pendiente  -> escrito, todavia sin salir del aparato
     enviado    -> ha salido hacia al menos un nodo
     entregado  -> el destinatario ha confirmado que lo tiene
     leido      -> el destinatario lo ha abierto (si tiene los acuses puestos)
   ========================================================================== */
(function (V) {
    'use strict';
    var U = V.util, S = V.session, K = V.contacts, M = V.mesh, Chat = V.chat;

    var MAX_PER_CHAT = 400;   /* el navegador no es un archivo historico */
    var listeners = [];

    Chat.onChange = function (fn) { listeners.push(fn); };
    function fire(what, arg) {
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](what, arg); } catch (e) {}
        }
    }

    /* Una solicitud de presentacion no es una conversacion, pero su aviso
       tiene que llegar por el MISMO camino: 50-app.js reemite lo que sale de
       aqui y la interfaz ya escucha ahi. Un canal aparte seria un segundo
       sitio que enganchar, y enganchar dos veces es un fallo que este
       proyecto ya ha pagado una vez (ver el comentario de A.start). */
    Chat.emit = fire;

    function chats() { return V.vault.state.chats; }

    Chat.get = function (pkHex) {
        var c = chats()[pkHex];
        if (!c) {
            c = { messages: [], unread: 0, updated: 0, draft: '' };
            chats()[pkHex] = c;
        }
        return c;
    };

    /* Conversaciones ordenadas por actividad, con el contacto ya resuelto. */
    Chat.list = function () {
        var out = [], all = K.all();
        for (var i = 0; i < all.length; i++) {
            var c = Chat.get(all[i].pk);
            out.push({ contact: all[i], chat: c, last: c.messages.length ? c.messages[c.messages.length - 1] : null });
        }
        out.sort(function (a, b) {
            var ta = a.last ? a.last.ts : a.contact.added;
            var tb = b.last ? b.last.ts : b.contact.added;
            return tb - ta;
        });
        return out;
    };

    function push(pkHex, msg) {
        var c = Chat.get(pkHex);
        c.messages.push(msg);
        while (c.messages.length > MAX_PER_CHAT) { c.messages.shift(); }
        c.updated = msg.ts;
        V.vault.save();
        return msg;
    }

    function findMsg(pkHex, mid) {
        var m = Chat.get(pkHex).messages;
        for (var i = m.length - 1; i >= 0; i--) {
            if (m[i].id === mid) { return m[i]; }
        }
        return null;
    }

    /* Un mensaje entrante que NO viene de abrir un sobre: hoy solo lo usa una
       solicitud aceptada (37-presenta.js), que trae su primer mensaje dentro.
       No manda acuse a proposito: aceptar no puede avisar al otro lado del
       momento exacto en que lo hiciste. Devuelve null si ese identificador ya
       estaba, que es lo que impide duplicarlo cuando el sobre normal con el
       mismo mensaje aparece despues. */
    Chat.addIncoming = function (pkHex, midHex, text, ts) {
        if (!midHex || findMsg(pkHex, midHex)) { return null; }
        var msg = {
            id: midHex, dir: 'in', kind: 'text',
            text: String(text), ts: ts || U.now(), state: 'recibido'
        };
        push(pkHex, msg);
        Chat.get(pkHex).unread++;
        return msg;
    };

    /* ---------------------------------------------------------------------
       Salida
       --------------------------------------------------------------------- */

    /* Una presentacion por contacto y por dia como mucho. Minar cuesta
       segundos de CPU y el resto de la cola ya viaja como sobres normales que
       M.rescanBag recupera en cuanto el otro nos da de alta: repetirla en cada
       mensaje seria gastar la bateria para nada. */
    var PRES_ESPERA = 24 * 3600 * 1000;

    /* Presentaciones que se estan minando ahora mismo, por clave. Minar son
       segundos y en ese rato caben dos mensajes: sin esto, el segundo empezaria
       otra presentacion para la misma persona. Vive en memoria y no en la
       boveda a proposito: si la pestana se cierra a medias no hay nada sellado
       que proteger, y al volver hay que poder presentarse. */
    var sellando = {};

    function tocaPresentarse(contact) {
        if (!V.presenta || !V.presenta.prepare) { return false; }
        /* contact.mutuo lo pone 34-session.js cuando algo suyo se abre aqui:
           mientras sea falso, esta persona no nos tiene dados de alta y NO
           puede abrir un sobre normal nuestro. */
        if (contact.mutuo) { return false; }
        if (sellando[contact.pk]) { return false; }
        if (!contact.presAt) { return true; }
        /* Una presentacion sellada que NO llego a salir del aparato vive en la
           mochila hasta que aparezca alguien. Si ya no esta -la echo la poda,
           caduco, se vacio la mochila- no la tiene nadie: no hay nada esperando
           a nadie y volver a presentarse es lo unico que puede funcionar.
           Esperar el dia entero era regalar 24 h de silencio por una pieza que
           ya no existe. Lo que SI salio no se repite aunque su copia de la
           mochila desaparezca: ahi fuera hay al menos una. */
        if (contact.presId && !contact.presOut && !M.bagGet(contact.presId)) { return true; }
        return (U.now() - contact.presAt) > PRES_ESPERA;
    }

    /* La fecha se apunta cuando hay algo sellado de verdad, junto con QUE se
       sello (el identificador de su copia en la mochila) y si llego a SALIR.

       Antes se apuntaba antes de sellar, y eso convertia cualquier perdida en un
       dia entero de silencio: si el minado fallaba, o si la mochila echaba la
       presentacion recien hecha, el contacto se quedaba con la fecha puesta y
       sin nada mandado durante 24 h, y encima sin manera de saberlo.

       Cuando falla el sellado si se apunta la fecha, y a proposito: sin ella,
       cada mensaje que se escribiera volveria a intentar un minado que ya se ha
       demostrado que no funciona. Pero se apunta SIN identificador, asi que ahi
       si se espera el dia entero. */
    function apuntar(contact, id, salio) {
        contact.presAt = U.now();
        contact.presId = id || null;
        contact.presOut = !!salio;
        delete sellando[contact.pk];
        V.vault.save();
    }

    /* La presentacion sale ADEMAS del sobre normal, no en su lugar: el sobre
       es el que el otro podra abrir cuando nos de de alta, y la presentacion
       es la que puede abrir ya. Cuando la manda Chat.sendText, las dos llevan
       el MISMO identificador de mensaje (P.midOf sobre la efimera) y por eso la
       copia que llegue la segunda no duplica nada; el reintento de repescar()
       va sin texto justo porque ahi ese identificador ya no coincide. */
    function presentar(contact, pres, text, msg) {
        var yo = K.me(), mio = V.vault.state && V.vault.state.identity;
        if (!yo) { return; }
        sellando[contact.pk] = 1;
        try {
            V.presenta.seal({
                mySk: yo.sk,
                myPk: yo.pk,
                recipPk: U.fromHex(contact.pk),
                name: (mio && mio.name) || '',
                text: text,
                /* El par tal cual lo devolvio P.prepare. Antes se pasaba una
                   copia para que el borrado que hacia armar() no se llevara por
                   delante la privada de aqui; ahora armar() no toca la memoria
                   de quien llama, y ademas rechaza una efimera ya usada. */
                eph: pres
            }, null, function (err, bytes) {
                if (err || !bytes) { apuntar(contact, null, false); return; }
                var n = 0;
                try { n = M.send(bytes); } catch (e) { apuntar(contact, null, false); return; }
                apuntar(contact, M.lastId, n > 0);
                if (n > 0 && msg && msg.state === 'pendiente') {
                    msg.state = 'enviado';
                    V.vault.save();
                    fire('state', { pk: contact.pk, msg: msg });
                }
            });
        } catch (e) { apuntar(contact, null, false); }
    }

    Chat.sendText = function (contact, text) {
        text = String(text);
        if (!text.length) { return null; }
        /* Si hace falta presentarse, la efimera se crea ANTES de nada: de ella
           sale el identificador del mensaje, y tiene que ser el mismo en el
           sobre normal y en la presentacion. */
        var pres = tocaPresentarse(contact) ? V.presenta.prepare() : null;
        var mid = pres ? U.fromHex(pres.mid) : S.newMid();
        var midHex = U.toHex(mid);
        var msg = { id: midHex, dir: 'out', kind: 'text', text: text, ts: U.now(), state: 'pendiente' };
        push(contact.pk, msg);

        try {
            var env = S.seal(contact, S.T_TEXT, U.fromString(text), mid);
            var n = M.send(env);
            /* Cual es la copia de este mensaje que hay en la bolsa. Si hay que
               reintentar, se sustituye en vez de anadir otra. */
            msg.eid = M.lastId;
            msg.state = n > 0 ? 'enviado' : 'pendiente';
        } catch (e) {
            msg.state = 'error';
            msg.error = e.message;
        }
        V.vault.save();
        fire('message', { pk: contact.pk, msg: msg });
        /* Al final y sin bloquear: minar la prueba de coste son segundos, y la
           interfaz tiene que ver su mensaje en la pantalla ya. */
        if (pres) { presentar(contact, pres, text, msg); }
        return msg;
    };

    /* Una presentacion propia que se perdio sin llegar a salir del aparato no
       la va a mandar nadie mas, y sin ella los mensajes que estan esperando a
       esa persona no se pueden abrir aunque lleguen. Aqui se vuelve a mandar.

       Va SIN texto a proposito: el mensaje entero ya viaja en el sobre normal
       que se acaba de reintentar ahi arriba, y meterlo tambien dentro de la
       presentacion lo duplicaria, porque el identificador del mensaje sale de la
       efimera y esta presentacion lleva una nueva. Sin texto, la solicitud se
       acepta y el texto aparece entero al abrirse el sobre, que es lo mismo que
       ya pasa con un primer mensaje demasiado largo.

       Una por vuelta de reloj como mucho: minar son segundos de CPU y arrancar
       diez a la vez con la pantalla encendida se nota. */
    function repescar(contactos) {
        for (var i = 0; i < contactos.length; i++) {
            if (!tocaPresentarse(contactos[i])) { continue; }
            presentar(contactos[i], V.presenta.prepare(), '', null);
            return;
        }
    }

    /* Reintento de todo lo que quedo pendiente: lo llama app.js cuando
       aparece un enlace nuevo. */
    Chat.retryPending = function () {
        var all = K.all(), sent = 0, esperando = [];
        for (var i = 0; i < all.length; i++) {
            var c = Chat.get(all[i].pk);
            for (var j = 0; j < c.messages.length; j++) {
                var m = c.messages[j];
                if (m.dir === 'out' && (m.state === 'pendiente' || m.state === 'error')) {
                    if (esperando.indexOf(all[i]) < 0) { esperando.push(all[i]); }
                    try {
                        var env = S.seal(all[i], S.T_TEXT, U.fromString(m.text), U.fromHex(m.id));
                        /* Se le dice a la malla cual era la copia anterior de
                           ESTE mensaje para que la quite: reintentar no puede
                           ir llenando la bolsa de copias del mismo sobre. */
                        if (M.send(env, m.eid) > 0) { m.state = 'enviado'; sent++; }
                        m.eid = M.lastId;
                    } catch (e) {}
                }
            }
        }
        if (sent) { V.vault.save(); fire('sync', sent); }
        repescar(esperando);
        return sent;
    };

    Chat.sendPresence = function (contact) {
        try { M.send(S.seal(contact, S.T_PRESENCE, U.fromString('1'), null, 2)); } catch (e) {}
    };

    Chat.sendProfile = function (contact, name) {
        try { M.send(S.seal(contact, S.T_PROFILE, U.fromString(JSON.stringify({ n: name })))); } catch (e) {}
    };

    function sendReceipt(contact, midHex, kind) {
        if (!V.vault.state.settings.receipts) { return; }
        try {
            M.send(S.seal(contact, S.T_RECEIPT, U.fromString(JSON.stringify({ m: midHex, s: kind })), null, 4));
        } catch (e) {}
    }

    /* ---------------------------------------------------------------------
       Entrada: lo llama la malla cuando un sobre resulta ser nuestro.
       --------------------------------------------------------------------- */
    /* opened.recuperado lo pone M.rescanBag: el sobre no acaba de llegar,
       estaba en la mochila y se ha podido abrir AHORA porque acabamos de dar de
       alta a quien lo mando. En ese caso no se acusa recibo: el acuse no diria
       cuando llego el mensaje, diria el segundo exacto en que le diste de alta
       -o en que aceptaste su solicitud-, que es un dato de tu decision y no del
       reparto. Sale si aceptas y no sale si descartas: un oraculo perfecto.

       La marca viaja DENTRO del sobre abierto a proposito. Como bandera de la
       llamada dependia de que cada sitio que cablea la malla se acordara de
       reenviarla, y el primero que no lo hizo fue una de las propias pruebas de
       este proyecto. */
    Chat.onIncoming = function (opened) {
        var contact = opened.contact;
        var pk = contact.pk;

        if (opened.type === S.T_TEXT) {
            if (findMsg(pk, opened.mid)) { return; }   /* copia repetida por la malla */
            var msg = {
                id: opened.mid, dir: 'in', kind: 'text',
                text: U.toString(opened.body), ts: opened.ts || U.now(), state: 'recibido'
            };
            push(pk, msg);
            Chat.get(pk).unread++;
            if (!opened.recuperado) { sendReceipt(contact, opened.mid, 'd'); }
            fire('message', { pk: pk, msg: msg });
            return;
        }

        if (opened.type === S.T_RECEIPT) {
            var info = null;
            try { info = JSON.parse(U.toString(opened.body)); } catch (e) { return; }
            var target = findMsg(pk, info.m);
            if (target && target.dir === 'out') {
                if (info.s === 'd' && target.state !== 'leido') { target.state = 'entregado'; }
                if (info.s === 'r') { target.state = 'leido'; }
                V.vault.save();
                fire('state', { pk: pk, msg: target });
            }
            return;
        }

        if (opened.type === S.T_PROFILE) {
            try {
                var p = JSON.parse(U.toString(opened.body));
                if (p.n && !contact.nameLocked) {
                    contact.name = String(p.n).substr(0, 40);
                    V.vault.save();
                    fire('contact', contact);
                }
            } catch (e) {}
            return;
        }

        if (opened.type === S.T_PRESENCE) {
            contact.lastSeen = U.now();
            fire('presence', contact);
            return;
        }
    };

    Chat.markRead = function (pkHex) {
        var c = Chat.get(pkHex);
        if (!c.unread) { return; }
        c.unread = 0;
        var contact = K.get(pkHex);
        /* Acuse de lectura solo del ultimo mensaje entrante: basta para la
           interfaz y no convierte la lectura en un chorro de metadatos. */
        for (var i = c.messages.length - 1; i >= 0; i--) {
            if (c.messages[i].dir === 'in') { sendReceipt(contact, c.messages[i].id, 'r'); break; }
        }
        V.vault.save();
        fire('read', pkHex);
    };

    Chat.clear = function (pkHex) {
        var c = Chat.get(pkHex);
        c.messages = []; c.unread = 0;
        V.vault.save();
        fire('clear', pkHex);
    };

    Chat.totalUnread = function () {
        var n = 0, all = K.all();
        for (var i = 0; i < all.length; i++) { n += Chat.get(all[i].pk).unread; }
        return n;
    };
})(BINTIO);
