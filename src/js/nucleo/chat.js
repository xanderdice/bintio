/* ==========================================================================
   Conversaciones.

   Modelo de datos y nada mas: aqui no hay DOM ni transporte. La interfaz se
   suscribe con chat.onChange y repinta lo que haga falta.

   Estados de un mensaje propio:
     pendiente  -> escrito, todavia sin salir del aparato
     enviado    -> ha salido hacia al menos un nodo
     entregado  -> el destinatario ha confirmado que lo tiene
     leido      -> el destinatario lo ha abierto (si tiene los acuses puestos)

   En un grupo son los MISMOS estados, pero contando a todos: "entregado"
   cuando lo tienen todos y "leido" solo cuando lo ha abierto el ultimo. Por el
   camino el mensaje lleva la cuenta (m.d entregados, m.r leidos, m.n cuantos
   son) para que la conversacion pueda decir "leido 2 de 4" en vez de mentir en
   una direccion o en la otra. Quien no esta dado de alta no manda acuses
   nunca, asi que su grupo se queda en "2 de 4" para siempre: eso es la verdad,
   y la conversacion explica por que.
   ========================================================================== */
(function (V) {
    'use strict';
    var U = V.util, S = V.session, K = V.contacts, M = V.mesh, Chat = V.chat;

    var MAX_PER_CHAT = 400;   /* el navegador no es un archivo historico */
    var listeners = [];

    /* ------------------------------------------------------------ escribiendo
       Tres numeros y dos tablas, todo en memoria y nada en la boveda: un "esta
       escribiendo" no es un dato que guardar, es un parpadeo. */
    var TYPING_CADA = 4000;   /* ms: como mucho un aviso propio cada tanto */
    var TYPING_VIVE = 7000;   /* ms que dura en pantalla el de otro */
    var TYPING_VIDA = 15;     /* s de vida del sobre; despues no vale nada */

    var avisado = {};         /* clave -> cuando mandamos el ultimo aviso */
    var escriben = {};        /* clave -> { quien, hasta } */
    var olvido = null;        /* el unico reloj, y solo mientras alguien teclea */

    /* El aviso se apaga solo. Un reloj de un segundo suena a mucho, pero solo
       existe MIENTRAS hay alguien escribiendo y se apaga en cuanto no queda
       nadie: en reposo la aplicacion no tiene ningun temporizador propio. */
    function programarOlvido() {
        if (olvido) { return; }
        olvido = setTimeout(function () {
            olvido = null;
            var ahora = U.now(), queda = false, k;
            for (k in escriben) {
                if (!Object.prototype.hasOwnProperty.call(escriben, k)) { continue; }
                if (escriben[k].hasta <= ahora) { delete escriben[k]; fire('typing', k); }
                else { queda = true; }
            }
            if (queda) { programarOlvido(); }
        }, 1000);
    }

    Chat.onChange = function (fn) { listeners.push(fn); };
    function fire(what, arg) {
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](what, arg); } catch (e) {}
        }
    }

    /* Una solicitud de presentacion no es una conversacion, pero su aviso
       tiene que llegar por el MISMO camino: app.js reemite lo que sale de
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

    /* Conversaciones ordenadas por actividad: personas y grupos en la MISMA
       lista, porque para quien la mira son lo mismo. Cada fila trae resuelto o
       el contacto o el grupo, nunca los dos, y una clave que sirve para todo
       lo demas (abrir, marcar leido, borrar). */
    Chat.list = function () {
        var out = [], all = K.all(), i, c;
        for (i = 0; i < all.length; i++) {
            c = Chat.get(all[i].pk);
            out.push({
                key: all[i].pk, contact: all[i], group: null, chat: c,
                desde: all[i].added,
                last: c.messages.length ? c.messages[c.messages.length - 1] : null
            });
        }
        var gs = V.groups.all();
        for (i = 0; i < gs.length; i++) {
            var key = V.groups.key(gs[i].id);
            c = Chat.get(key);
            out.push({
                key: key, contact: null, group: gs[i], chat: c,
                desde: gs[i].created,
                last: c.messages.length ? c.messages[c.messages.length - 1] : null
            });
        }
        out.sort(function (a, b) {
            var ta = a.last ? a.last.ts : a.desde;
            var tb = b.last ? b.last.ts : b.desde;
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
       solicitud aceptada (presenta.js), que trae su primer mensaje dentro.
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
        /* contact.mutuo lo pone session.js cuando algo suyo se abre aqui:
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
            /* Solo si sigue sin salir. M.send puede entregar el sobre DENTRO de
               esta misma llamada -un enlace local no tiene que esperar a nadie-
               y volver con el acuse ya procesado: sin esta guarda, la linea de
               abajo pisaba un "entregado" recien puesto y lo dejaba en
               "enviado" para siempre, porque el acuse no se repite. */
            if (msg.state === 'pendiente') { msg.state = n > 0 ? 'enviado' : 'pendiente'; }
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
        sent += reintentarGrupos();
        if (sent) { V.vault.save(); fire('sync', sent); }
        repescar(esperando);
        return sent;
    };

    /* Los ultimos de cada grupo, no todos: mas atras de treinta mensajes lo
       que falta ya no es un fallo de reparto, es alguien que lleva semanas sin
       aparecer, y sellarle la conversacion entera cada minuto seria gastar
       bateria en resucitar sobres que ya caducaron.

       Dos casos distintos y los dos hacen falta:
         - el mensaje no salio para nadie: se reparte otra vez entero;
         - salio, pero a uno de la lista no se le pudo sellar porque entonces
           no lo teniamos dado de alta. Ahora si. Ese recibe su copia y de paso
           el grupo deja de estar incompleto para el. */
    var REINTENTO_ATRAS = 30;

    function reintentarGrupos() {
        var gs = V.groups.all(), n = 0, i, j, msgs, desde, m;
        for (i = 0; i < gs.length; i++) {
            msgs = Chat.get(V.groups.key(gs[i].id)).messages;
            desde = Math.max(0, msgs.length - REINTENTO_ATRAS);
            for (j = desde; j < msgs.length; j++) {
                m = msgs[j];
                if (m.dir !== 'out' || m.state === 'leido') { continue; }
                if (m.state === 'pendiente' || m.state === 'error') {
                    if (repartir(gs[i], m, false) > 0) { m.state = 'enviado'; n++; }
                } else if (repartir(gs[i], m, true) > 0) { n++; }
                recontar(gs[i], m);
            }
        }
        return n;
    }

    /* ---------------------------------------------------------------------
       Grupos
       --------------------------------------------------------------------- */

    /* Cuantos lo tienen y cuantos lo han leido, de los que NO somos nosotros.

       El salto a "entregado" y a "leido" pide TODOS, que es lo que se pidio y
       ademas lo unico honrado: en un grupo, "leido" a secas cuando lo ha visto
       uno de cuatro es una mentira util para el que escribe y una trampa para
       los otros tres. Mientras tanto se guarda la cuenta y la conversacion
       ensena "leido 2 de 4", que dice la verdad sin esconderla. */
    function recontar(group, msg) {
        var otros = V.groups.others(group), d = 0, r = 0, i, a;
        for (i = 0; i < otros.length; i++) {
            a = msg.acks && msg.acks[otros[i].pk];
            if (a === 'r') { r++; d++; }
            else if (a === 'd') { d++; }
        }
        msg.d = d; msg.r = r; msg.n = otros.length;
        if (!otros.length) { return; }
        if (r >= otros.length) { msg.state = 'leido'; }
        else if (d >= otros.length) { msg.state = 'entregado'; }
        else if (msg.state === 'leido' || msg.state === 'entregado') {
            /* La lista ha crecido despues de mandarlo: lo que estaba entregado
               a todos ya no lo esta. Volver atras es raro de ver, pero menos
               raro que ensenar "leido" de un mensaje que a uno no le ha
               llegado nunca. */
            msg.state = 'enviado';
        }
    }
    Chat.recontar = recontar;

    /* El cuerpo de un mensaje de grupo: la ficha entera del grupo mas el
       texto. Va junto y no en dos sobres a proposito (ver groups.js): asi
       un grupo se arregla solo con el siguiente mensaje que llegue. */
    function cuerpoGrupo(group, text) {
        var card = V.groups.card(group);
        card.t = text;
        return U.fromString(JSON.stringify(card));
    }

    /* Un sobre por cabeza. Devuelve a cuantos les ha salido de verdad.

       Con "soloNuevos" se salta a todo aquel para quien YA se sello alguna vez,
       aunque no haya acusado nunca. Eso deja un solo caso: alguien de la lista
       a quien entonces no teniamos dado de alta y ahora si. Ese recibe su copia
       y el grupo deja de estar incompleto para el.

       La tentacion era reenviar tambien cuando la copia ya no esta en la
       mochila, y es justo lo que no se puede hacer: pasadas las 72 horas
       TODAS las copias caducan, y un mensaje que nadie va a acusar -porque el
       otro ya no existe, o nunca nos tuvo dados de alta- se volveria a sellar
       y a soltar cada minuto para siempre. Un sobre que no llego en 72 horas
       no va a llegar por insistir; el uno a uno tampoco lo hace. */
    function repartir(group, msg, soloNuevos) {
        var destinos = V.groups.reachable(group), n = 0, i, c, env;
        var body = cuerpoGrupo(group, msg.text);
        var mid = U.fromHex(msg.id);
        if (!msg.eids) { msg.eids = {}; }
        for (i = 0; i < destinos.length; i++) {
            c = destinos[i];
            if (soloNuevos && msg.eids[c.pk]) { continue; }
            try {
                env = S.seal(c, S.T_GTEXT, body, mid);
                if (M.send(env, msg.eids[c.pk]) > 0) { n++; }
                msg.eids[c.pk] = M.lastId;
            } catch (e) {}
        }
        return n;
    }

    Chat.sendGroupText = function (group, text) {
        text = String(text);
        if (!text.length) { return null; }
        var key = V.groups.key(group.id);
        var msg = {
            id: U.toHex(S.newMid()), dir: 'out', kind: 'text', text: text,
            ts: U.now(), state: 'pendiente', g: group.id, acks: {}, eids: {}
        };
        push(key, msg);
        /* Igual que en sendText: si los acuses han llegado durante el reparto,
           el estado ya va por delante y no se toca. */
        if (repartir(group, msg, false) > 0 && msg.state === 'pendiente') { msg.state = 'enviado'; }
        recontar(group, msg);
        V.vault.save();
        fire('message', { pk: key, msg: msg });
        return msg;
    };

    /* ---------------------------------------------------------------------
       Escribiendo
       --------------------------------------------------------------------- */

    /* Sale por los cables abiertos AHORA y no entra en ninguna mochila
       (M.flash). Con ttl 0 tampoco lo reenvia nadie: un "esta escribiendo" que
       da tres saltos y llega dos minutos tarde no es informacion, es ruido con
       el nombre de alguien dentro.

       Se manda uno cada cuatro segundos como mucho, aunque se teclee sin
       parar. En un grupo eso es un sobre por miembro cada cuatro segundos, que
       es el precio de no tener servidor; por eso tiene interruptor propio. */
    Chat.sendTyping = function (key) {
        if (V.vault.state.settings.typing === false) { return; }
        var ahora = U.now();
        if (avisado[key] && ahora - avisado[key] < TYPING_CADA) { return; }
        avisado[key] = ahora;

        try {
            if (V.groups.isKey(key)) {
                var group = V.groups.get(V.groups.idOf(key));
                if (!group) { return; }
                var body = U.fromString(JSON.stringify({ g: group.id }));
                var destinos = V.groups.reachable(group);
                for (var i = 0; i < destinos.length; i++) {
                    M.flash(S.seal(destinos[i], S.T_TYPING, body, null, 0, TYPING_VIDA));
                }
                return;
            }
            var contact = K.get(key);
            if (contact) {
                M.flash(S.seal(contact, S.T_TYPING, null, null, 0, TYPING_VIDA));
            }
        } catch (e) {}
    };

    /* Quien esta escribiendo en esa conversacion, o null. Se comprueba la hora
       aqui y no con un reloj: si nadie mira, da igual lo que haya caducado. */
    Chat.typingIn = function (key) {
        var t = escriben[key];
        if (!t) { return null; }
        if (t.hasta <= U.now()) { delete escriben[key]; return null; }
        return t.quien;
    };

    /* Un sobre suelto de un tipo cualquiera: acuse, presencia, ficha o
       "te he quitado". Los cuatro hacian exactamente lo mismo -sellar, mandar y
       tragarse el error- escrito cuatro veces. Que el error se trague es a
       proposito y por eso esta aqui una vez y explicado: ninguno de los cuatro
       es un mensaje, asi que si no sale no hay nada que contarle a nadie ni
       nada que reintentar; lo que SI es un mensaje va por otro camino y lleva
       su estado. */
    function mandar(contact, tipo, cuerpo, ttl) {
        try { M.send(S.seal(contact, tipo, cuerpo, null, ttl)); } catch (e) {}
    }

    /* ---------------------------------------------------------------------
       Quitar a alguien, avisandole
       --------------------------------------------------------------------- */

    /* Se avisa ANTES de borrar, que es cuando todavia tenemos su clave para
       sellarle algo. El sobre queda en la mochila si no hay camino, asi que le
       llegara aunque ahora mismo no haya ningun enlace.

       Y se avisa siempre, sin interruptor. Los acuses son opcionales porque
       dicen algo de ti -a que hora abriste la aplicacion-; esto no dice nada de
       ti, dice algo de EL: que lo que escriba a partir de ahora ya no se va a
       poder abrir. Callarselo lo dejaria escribiendo a una pared sin saberlo,
       que es exactamente el fallo que el aviso de "contacto a medias" vino a
       arreglar en la otra direccion.

       Devuelve false si esa persona ya no estaba. */
    Chat.unlink = function (pkHex) {
        var contact = K.get(pkHex);
        if (!contact) { return false; }
        mandar(contact, S.T_UNLINK, null, 4);
        K.remove(pkHex);
        fire('contact', null);
        return true;
    };

    Chat.sendPresence = function (contact) {
        mandar(contact, S.T_PRESENCE, U.fromString('1'), 2);
    };

    Chat.sendProfile = function (contact, name) {
        mandar(contact, S.T_PROFILE, U.fromString(JSON.stringify({ n: name })));
    };

    /* El acuse va SIEMPRE a quien escribio, tambien en un grupo: es el unico
       que necesita saberlo y el unico que seguro nos tiene dados de alta -si
       no, su mensaje no se habria podido abrir-. Mandarselo a los demas
       miembros seria contarle a doce personas a que hora abriste la
       aplicacion. */
    function sendReceipt(contact, midHex, kind, gid) {
        if (!V.vault.state.settings.receipts) { return; }
        var cuerpo = { m: midHex, s: kind };
        if (gid) { cuerpo.g = gid; }
        mandar(contact, S.T_RECEIPT, U.fromString(JSON.stringify(cuerpo)), 4);
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

        /* Videollamada: el papeleo lo lleva llamada.js. No se guarda nada y no
           se acusa, como el "escribiendo". */
        if (opened.type === S.T_CALL) {
            if (V.llamada) { V.llamada.recibir(opened); }
            return;
        }

        if (opened.type === S.T_TEXT) {
            if (findMsg(pk, opened.mid)) { return; }   /* copia repetida por la malla */
            var msg = {
                id: opened.mid, dir: 'in', kind: 'text',
                text: U.toString(opened.body), ts: opened.ts || U.now(), state: 'recibido'
            };
            push(pk, msg);
            Chat.get(pk).unread++;
            /* Ya no escribe: acaba de mandarlo. Sin esto el aviso se quedaria
               en pantalla los siete segundos, debajo del mensaje que contradice. */
            delete escriben[pk];
            if (!opened.recuperado) { sendReceipt(contact, opened.mid, 'd'); }
            fire('message', { pk: pk, msg: msg });
            return;
        }

        /* Un mensaje de grupo. La ficha viene dentro y se aplica ANTES de
           colocar el texto: asi el primer mensaje de un grupo nuevo ya llega a
           una conversacion con nombre y con lista. */
        if (opened.type === S.T_GTEXT) {
            var card = null;
            try { card = JSON.parse(U.toString(opened.body)); } catch (e) { return; }
            var group = V.groups.fromCard(card, pk);
            if (!group) { return; }
            var gkey = V.groups.key(group.id);
            if (findMsg(gkey, opened.mid)) { return; }   /* copia repetida por la malla */
            var gmsg = {
                id: opened.mid, dir: 'in', kind: 'text', g: group.id,
                from: pk, fromName: contact.name,
                text: String(card.t === undefined ? '' : card.t),
                ts: opened.ts || U.now(), state: 'recibido'
            };
            push(gkey, gmsg);
            Chat.get(gkey).unread++;
            if (escriben[gkey] && escriben[gkey].pk === pk) { delete escriben[gkey]; }
            if (!opened.recuperado) { sendReceipt(contact, opened.mid, 'd', group.id); }
            fire('message', { pk: gkey, msg: gmsg });
            return;
        }

        /* Escribiendo. No se guarda nada en la boveda y no se acusa: es lo
           unico del protocolo que no deja rastro a proposito. */
        if (opened.type === S.T_TYPING) {
            var tkey = pk;
            if (opened.body && opened.body.length) {
                try {
                    var tb = JSON.parse(U.toString(opened.body));
                    if (tb && tb.g && V.groups.get(tb.g)) { tkey = V.groups.key(tb.g); }
                } catch (e) {}
            }
            escriben[tkey] = { quien: contact.name, pk: pk, hasta: U.now() + TYPING_VIVE };
            fire('typing', tkey);
            programarOlvido();
            return;
        }

        if (opened.type === S.T_RECEIPT) {
            var info = null;
            try { info = JSON.parse(U.toString(opened.body)); } catch (e) { return; }

            /* Acuse de un grupo: no cambia el estado por si solo, suma un voto.
               El estado sale de recontar(), que exige a todos. */
            if (info.g) {
                var grupo = V.groups.get(info.g);
                if (!grupo) { return; }
                var gk = V.groups.key(info.g);
                var suyo = findMsg(gk, info.m);
                if (!suyo || suyo.dir !== 'out') { return; }
                if (info.s === 'r') {
                    /* Leer el ultimo es haber leido los de antes. Se marcan
                       todos los nuestros hasta ese, que es lo que evita mandar
                       -y guardar- un acuse por mensaje sin mentir en ninguno. */
                    var lista = Chat.get(gk).messages, tope = lista.indexOf(suyo), j, mm;
                    for (j = 0; j <= tope; j++) {
                        mm = lista[j];
                        if (mm.dir !== 'out') { continue; }
                        if (!mm.acks) { mm.acks = {}; }
                        mm.acks[pk] = 'r';
                        recontar(grupo, mm);
                    }
                } else {
                    if (!suyo.acks) { suyo.acks = {}; }
                    if (suyo.acks[pk] !== 'r') { suyo.acks[pk] = 'd'; }
                    recontar(grupo, suyo);
                }
                V.vault.save();
                fire('state', { pk: gk, msg: suyo });
                return;
            }

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
                /* El nombre nuevo lo pone el otro lado, asi que se limpia igual
                   que en el alta: sin esto un contacto se renombraba a distancia
                   con saltos de linea o marcas bidi. Si tras limpiar no queda
                   nada, se ignora en vez de dejar el contacto sin nombre. */
                var nuevo = U.nombreLimpio(p && p.n);
                if (nuevo && !contact.nameLocked) {
                    contact.name = nuevo;
                    V.vault.save();
                    fire('contact', contact);
                }
            } catch (e) {}
            return;
        }

        /* Nos han quitado.

           Ojo al orden: S.open acaba de poner mutuo a true, porque un sobre
           que se abre demuestra que quien lo mando nos tenia dados de alta.
           Es verdad y hay que dejarlo pasar; lo que cuenta es lo que dice el
           sobre, y lo dice justo despues. Sin este orden, el ultimo mensaje de
           alguien que te quita te lo dejaria marcado como vinculado.

           No se le borra a el: eso lo decide el usuario. Aqui solo se apunta,
           y la lista y la conversacion lo ensenan. */
        if (opened.type === S.T_UNLINK) {
            /* Y que no valga uno VIEJO repetido. La malla descarta lo repetido
               con un anillo de 800 identificadores en memoria; quien haya
               transportado un sobre tuyo puede desbordarlo con basura y despues
               volver a soltar aquel, que ya no consta como visto. Con un aviso
               de texto no pasa nada -saldria un mensaje duplicado- pero este
               cambia un estado, y volvia a marcar como "te ha quitado" a alguien
               con quien ya te habias reconciliado. Contra eso no hace falta mas
               memoria: basta mirar la hora que trae dentro. Si es anterior a lo
               ultimo que sabemos de esta persona, ya no manda. */
            if (opened.ts && contact.lastSeen && opened.ts < contact.lastSeen) { return; }
            K.desenlazado(contact);
            delete escriben[pk];
            V.vault.save();
            fire('contact', contact);
            return;
        }

        if (opened.type === S.T_PRESENCE) {
            contact.lastSeen = U.now();
            fire('presence', contact);
            return;
        }
    };

    Chat.markRead = function (key) {
        var c = Chat.get(key), i;
        if (!c.unread) { return; }
        c.unread = 0;

        if (V.groups.isKey(key)) {
            /* Un acuse por PERSONA, no por mensaje: el ultimo de cada uno, que
               al otro lado marca ese y todos los suyos anteriores. En un grupo
               de diez con veinte mensajes sin leer eso son diez sobres en vez
               de doscientos, y ni uno dice menos verdad. */
            var group = V.groups.get(V.groups.idOf(key));
            if (group) {
                var ultimo = {}, p, quien;
                for (i = 0; i < c.messages.length; i++) {
                    if (c.messages[i].dir === 'in' && c.messages[i].from) {
                        ultimo[c.messages[i].from] = c.messages[i].id;
                    }
                }
                for (p in ultimo) {
                    if (!Object.prototype.hasOwnProperty.call(ultimo, p)) { continue; }
                    quien = K.get(p);
                    if (quien) { sendReceipt(quien, ultimo[p], 'r', group.id); }
                }
            }
        } else {
            var contact = K.get(key);
            /* Acuse de lectura solo del ultimo mensaje entrante: basta para la
               interfaz y no convierte la lectura en un chorro de metadatos. */
            for (i = c.messages.length - 1; i >= 0; i--) {
                if (c.messages[i].dir === 'in') { sendReceipt(contact, c.messages[i].id, 'r'); break; }
            }
        }
        V.vault.save();
        fire('read', key);
    };

    Chat.clear = function (pkHex) {
        var c = Chat.get(pkHex);
        c.messages = []; c.unread = 0;
        V.vault.save();
        fire('clear', pkHex);
    };

    Chat.totalUnread = function () {
        var n = 0, all = K.all(), gs = V.groups.all(), i;
        for (i = 0; i < all.length; i++) { n += Chat.get(all[i].pk).unread; }
        for (i = 0; i < gs.length; i++) { n += Chat.get(V.groups.key(gs[i].id)).unread; }
        return n;
    };
})(BINTIO);
