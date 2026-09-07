/* ==========================================================================
   Videollamada: el papeleo, sin video.

   Aqui no hay camara, ni WebRTC, ni pantalla: hay una maquina de estados que
   sabe en que punto esta una llamada y que sobre toca mandar. El video lo
   pone transportes/videollamada.js y la pantalla interfaz/videollamada.js;
   este fichero solo decide, y por eso se puede probar entero en node.

   POR QUE ES DE PUNTA A PUNTA, Y DE QUIEN DEPENDE

   El video de WebRTC viaja cifrado siempre (DTLS-SRTP), pero eso por si solo
   no vale: quien controle el intercambio de descripciones (SDP) puede
   ponerse en medio y cifrar dos tramos en vez de uno. Todas las aplicaciones
   de videollamada tienen ese punto debil en su servidor de senalizacion.

   Aqui NO hay servidor de senalizacion. Las descripciones viajan DENTRO de
   sobres sellados por session.js, que solo puede abrir esa persona y que solo
   esa persona puede haber sellado (ss2 lo garantiza: hace falta su clave
   estatica). La huella DTLS que va en el SDP queda asi autenticada por la
   misma criptografia que autentica un mensaje. Un intermediario no puede
   cambiarla sin romper el sobre. La seguridad de la llamada es exactamente
   la de la identidad del contacto: si comprobaste su huella, la llamada es
   con esa persona.

   LO QUE VIAJA

   Todo va en sobres T_CALL con un cuerpo JSON pequeno:

     { c: id, a: 'ring' }           te llamo (sin SDP: primero se pregunta)
     { c: id, a: 'ok' }             acepto
     { c: id, a: 'offer',  s: sdp } mi descripcion, con mi huella DTLS
     { c: id, a: 'answer', s: sdp } la mia
     { c: id, a: 'bye', r: motivo } cuelgo, o no puedo, o no quiero

   El timbre va SIN descripcion a proposito. Reunir candidatos de red para el
   SDP revela las direcciones IP del aparato, y eso no se hace hasta que el
   otro ha dicho que si: quien recibe una llamada y la rechaza no ha soltado
   nada, y quien llama tampoco hasta que le contestan.

   Los sobres viven 40 segundos y no dan saltos (ttl 0). Con eso no entran en
   ninguna mochila -la mochila no guarda nada que caduque en menos de un
   minuto- y solo salen por los cables abiertos en ese instante. Es lo
   correcto: una llamada solo tiene sentido con camino vivo, y un timbre
   guardado que suena tres horas despues seria un fallo, no una funcion.
   ========================================================================== */
(function (V) {
    'use strict';
    var U = V.util, S = V.session, K = V.contacts, M = V.mesh, L = V.llamada = {};

    /* Tiempos. Son propiedades y no constantes para que una prueba pueda
       acortarlos: nadie quiere esperar 45 segundos a que suene un timbre. */
    L.VIDA = 40;              /* s de vida del sobre; por debajo del minuto no se guarda */
    L.TIMBRE_MS = 45000;      /* cuanto suena antes de darse por no contestada */
    L.ENLACE_MS = 30000;      /* cuanto se espera a que el video conecte una vez aceptada */
    L.MAX_SDP = 32768;        /* una descripcion real ocupa unos pocos KB */

    var actual = null;        /* { id, pk, papel, estado, desde, activaDesde } */
    var reloj = null;         /* el unico temporizador, y solo mientras hay llamada */
    var listeners = [];

    L.onChange = function (fn) { listeners.push(fn); };
    function fire(what, arg) {
        for (var i = 0; i < listeners.length; i++) {
            try { listeners[i](what, arg); } catch (e) {}
        }
    }

    /* Lo que hay ahora, en copia: nadie de fuera toca el estado. */
    L.actual = function () {
        if (!actual) { return null; }
        return {
            id: actual.id, pk: actual.pk, papel: actual.papel, estado: actual.estado,
            desde: actual.desde, activaDesde: actual.activaDesde || 0
        };
    };

    /* Solo cables abiertos (ttl 0) y vida corta: nunca en una mochila. El
       error se traga por lo mismo que en chat.js: no es un mensaje, no hay
       nada que reintentar; si no sale, el timbre caduca solo.

       REGLA DE ESTE FICHERO: mandar es siempre LO ULTIMO que se hace. Un
       cable puede entregar la respuesta del otro en el mismo instante -entre
       dos pestanas del mismo navegador pasa asi-, y esa respuesta puede ser
       un "ocupado" que deja la llamada a cero antes de que la funcion que la
       creo haya terminado. Si se toca el estado despues de mandar, se toca
       un null. Lo encontro la prueba, no un usuario. */
    function mandar(contact, cuerpo) {
        try {
            M.flash(S.seal(contact, S.T_CALL, U.fromString(JSON.stringify(cuerpo)), null, 0, L.VIDA));
        } catch (e) {}
    }

    function parar() { if (reloj) { clearTimeout(reloj); reloj = null; } }
    function programar(ms, motivo) {
        parar();
        reloj = setTimeout(function () { reloj = null; L.colgar(motivo); }, ms);
    }

    function poner(estado) {
        if (!actual) { return; }
        actual.estado = estado;
        if (estado === 'activa') { actual.activaDesde = U.now(); }
        fire('llamada', L.actual());
    }

    /* Una descripcion SDP de verdad: texto, de un tamano razonable, y que
       empieza como empiezan todas. Lo que no cumpla eso no llega al
       navegador: setRemoteDescription es codigo del navegador leyendo texto
       ajeno, y aqui es donde se le pone la puerta. */
    L.sdpValido = function (s) {
        return typeof s === 'string' && s.length > 0 && s.length <= L.MAX_SDP && s.indexOf('v=0') === 0;
    };

    /* Un identificador de llamada como los que fabrica U.rid: 16 hex. */
    function idValido(c) { return typeof c === 'string' && /^[0-9a-f]{16}$/.test(c); }

    /* ---------------------------------------------------------------------
       Lo que hace quien llama y quien contesta
       --------------------------------------------------------------------- */

    L.llamar = function (pkHex) {
        /* Estar en una llamada manda sobre todo lo demas: da igual a quien se
           intente llamar. */
        if (actual) { return { error: 'ocupado' }; }
        var c = K.get(pkHex);
        if (!c) { return { error: 'desconocido' }; }
        /* Sin vinculo, el otro no puede abrir el timbre: no tiene sentido
           sonar a una pared. La interfaz ya esconde el boton; esto es la red
           de seguridad. */
        if (!c.mutuo) { return { error: 'sin-vinculo' }; }
        var id = U.rid();
        actual = { id: id, pk: pkHex, papel: 'llamo', estado: 'sonando', desde: U.now() };
        programar(L.TIMBRE_MS, 'sin-respuesta');
        fire('llamada', L.actual());
        mandar(c, { c: id, a: 'ring' });
        return { ok: true, id: id };
    };

    L.aceptar = function () {
        if (!actual || actual.papel !== 'me-llaman' || actual.estado !== 'sonando') { return false; }
        var c = K.get(actual.pk);
        if (!c) { L.colgar('fallo'); return false; }
        var id = actual.id;
        poner('conectando');
        programar(L.ENLACE_MS, 'fallo');
        mandar(c, { c: id, a: 'ok' });
        return true;
    };

    /* Quien llama, con su descripcion ya reunida. */
    L.ofrecer = function (sdp) {
        if (!actual || actual.papel !== 'llamo' || actual.estado !== 'conectando') { return false; }
        if (!L.sdpValido(sdp)) { return false; }
        mandar(K.get(actual.pk), { c: actual.id, a: 'offer', s: sdp });
        return true;
    };

    /* Quien contesta, con la suya. A partir de aqui la llamada esta activa
       por su lado; por el del otro, en cuanto le llegue. */
    L.responder = function (sdp) {
        if (!actual || actual.papel !== 'me-llaman' || actual.estado !== 'conectando') { return false; }
        if (!L.sdpValido(sdp)) { return false; }
        var c = K.get(actual.pk), id = actual.id;
        parar();
        poner('activa');
        mandar(c, { c: id, a: 'answer', s: sdp });
        return true;
    };

    /* Colgar, rechazar, o rendirse: todo acaba aqui. El motivo se le manda al
       otro para que su pantalla diga la verdad -"ocupado" no es lo mismo que
       "no contesta"- salvo cuando es el quien ha colgado, que ya lo sabe. */
    function terminar(motivo, avisar) {
        if (!actual) { return false; }
        var fue = actual, c = K.get(fue.pk);
        parar();
        actual = null;
        if (avisar && c) { mandar(c, { c: fue.id, a: 'bye', r: motivo }); }
        fire('llamada', null);
        fire('llamada-fin', {
            pk: fue.pk, papel: fue.papel, estado: fue.estado, motivo: motivo,
            duracion: fue.activaDesde ? U.now() - fue.activaDesde : 0
        });
        return true;
    }
    L.colgar = function (motivo) { return terminar(motivo || 'colgado', true); };

    /* ---------------------------------------------------------------------
       Entrada: lo llama chat.js cuando un sobre T_CALL resulta ser nuestro.
       Todo lo que llega aqui lo sello un contacto -session.js no abre otra
       cosa-, pero un contacto puede tener una version rota, o mala idea.
       --------------------------------------------------------------------- */
    L.recibir = function (opened) {
        /* Un sobre que estaba guardado y se abre ahora no es una llamada, es
           un timbre de hace horas. No puede pasar -no viven lo bastante para
           entrar en una mochila- pero si pasara, se ignora. */
        if (opened.recuperado) { return; }
        var contact = opened.contact, info = null;
        try { info = JSON.parse(U.toString(opened.body)); } catch (e) { return; }
        if (!info || typeof info !== 'object' || !idValido(info.c) || typeof info.a !== 'string') { return; }

        if (info.a === 'ring') {
            if (actual) {
                /* Los dos han pulsado llamar a la vez. Sin regla, cada uno
                   veria al otro "ocupado" y ninguna llamada saldria. La regla:
                   sigue llamando el de la clave mas baja, y el otro se rinde y
                   coge el timbre que le llega. Es deterministica y los dos la
                   aplican sin hablar, que es lo que hace que salga UNA llamada
                   y no cero ni dos. */
                var cruce = actual.papel === 'llamo' && actual.estado === 'sonando' && actual.pk === contact.pk;
                if (cruce && U.toHex(K.me().pk) < contact.pk) { return; }
                if (cruce) {
                    parar();
                    actual = null;
                } else {
                    mandar(contact, { c: info.c, a: 'bye', r: 'ocupado' });
                    return;
                }
            }
            actual = { id: info.c, pk: contact.pk, papel: 'me-llaman', estado: 'sonando', desde: U.now() };
            programar(L.TIMBRE_MS, 'sin-respuesta');
            fire('llamada', L.actual());
            return;
        }

        /* Lo demas solo vale para LA llamada en curso, de ESA persona. Un
           sobre con otro identificador, o de otro contacto, no toca nada:
           ni cuelga, ni acepta, ni cambia una descripcion. */
        if (!actual || actual.id !== info.c || actual.pk !== contact.pk) { return; }

        if (info.a === 'ok' && actual.papel === 'llamo' && actual.estado === 'sonando') {
            poner('conectando');
            programar(L.ENLACE_MS, 'fallo');
            return;
        }
        if (info.a === 'offer' && actual.papel === 'me-llaman' && actual.estado === 'conectando') {
            if (!L.sdpValido(info.s)) { return; }
            fire('llamada-sdp', { tipo: 'oferta', sdp: info.s });
            return;
        }
        if (info.a === 'answer' && actual.papel === 'llamo' && actual.estado === 'conectando') {
            if (!L.sdpValido(info.s)) { return; }
            parar();
            poner('activa');
            fire('llamada-sdp', { tipo: 'respuesta', sdp: info.s });
            return;
        }
        if (info.a === 'bye') {
            var motivo = typeof info.r === 'string' && /^[a-z-]{1,20}$/.test(info.r) ? info.r : 'colgado';
            terminar(motivo, false);
        }
    };
})(BINTIO);
