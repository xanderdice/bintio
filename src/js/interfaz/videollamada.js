/* ==========================================================================
   Videollamada: la pantalla.

   Tres piezas y este fichero es la ultima: nucleo/llamada.js decide,
   transportes/videollamada.js pone el video, y aqui se pinta y se pulsa. Lo
   que hay que saber para leerlo esta en la cabecera de nucleo/llamada.js.

   La camara se pide en dos momentos distintos, y la diferencia es a
   proposito. Quien LLAMA la pide al pulsar llamar: es su decision, y ademas
   asi se ve a si mismo mientras suena. Quien RECIBE no la pide hasta que
   pulsa aceptar: un timbre que enciende tu camara antes de que digas que si
   es lo contrario de lo que promete este programa.
   ========================================================================== */
(function (V) {
    'use strict';
    var D = V.ui, L = V.llamada, VL = V.transport.videollamada;

    var vistaAntes = null;     /* a donde volver al colgar */
    var pidiendo = false;      /* hay una peticion de camara en el aire */
    var enCola = [];           /* lo que hay que hacer en cuanto haya camara */
    var ofertaEsperando = null;/* la oferta llego antes que la camara */
    var micApagado = false, camApagada = false;

    D.puedeLlamar = function () { return VL.available(); };

    function contacto(estado) { return estado ? V.contacts.get(estado.pk) : null; }

    /* ---------------------------------------------------------------- pintar */
    function frase(estado) {
        if (estado.estado === 'activa') { return D.t('Cifrada de punta a punta'); }
        if (estado.estado === 'conectando') { return D.t('Conectando...'); }
        return estado.papel === 'llamo' ? D.t('Llamando...') : D.t('Te llama');
    }

    function pintar(estado) {
        var c = contacto(estado);
        D.text(D.$('call-name'), c ? c.name : '');
        D.text(D.$('call-fp'), c ? (c.verified ? D.t('huella comprobada') : c.fingerprint) : '');
        D.text(D.$('call-status'), frase(estado));
        var timbre = estado.papel === 'me-llaman' && estado.estado === 'sonando';
        D.show(D.$('call-ring-tools'), timbre);
        D.show(D.$('call-live-tools'), !timbre);
        D.text(D.$('btn-call-mic'), D.t(micApagado ? 'Con sonido' : 'Silenciar'));
        D.text(D.$('btn-call-cam'), D.t(camApagada ? 'Con camara' : 'Sin camara'));
    }

    function abrirVista() {
        if (D.current !== 'view-call') { vistaAntes = D.current; }
        D.view('view-call');
    }

    function cerrarVista() {
        var video = D.$('call-remote'), mio = D.$('call-local');
        if (video) { video.srcObject = null; }
        if (mio) { mio.srcObject = null; }
        if (D.current !== 'view-call') { return; }
        /* Volver a la conversacion tal y como estaba: openChat es quien sabe
           dejarla bien en el movil (la clase show-chat). */
        if (D.activePk && vistaAntes === 'view-main') { D.openChat(D.activePk); }
        else { D.view(vistaAntes && vistaAntes !== 'view-call' ? vistaAntes : 'view-main'); }
        vistaAntes = null;
    }

    /* ---------------------------------------------------------------- camara */
    function conCamara(fn) {
        if (VL.hayMedios()) { fn(); return; }
        enCola.push(fn);
        if (pidiendo) { return; }
        pidiendo = true;
        VL.pedirMedios(function (err, stream) {
            pidiendo = false;
            if (err) {
                D.toast(D.t('No se pudo abrir la camara o el microfono'), 'bad');
                L.colgar('sin-camara');
                return;
            }
            /* La llamada pudo acabar mientras el navegador preguntaba. La
               camara que acaban de darnos no se enciende para nadie. */
            if (!L.actual()) { VL.cerrar(); enCola = []; return; }
            var mio = D.$('call-local');
            if (mio) { mio.srcObject = stream; mio.muted = true; try { mio.play(); } catch (e) {} }
            var cola = enCola;
            enCola = [];
            for (var i = 0; i < cola.length; i++) { try { cola[i](); } catch (e) {} }
        });
    }

    function conectar() {
        var ok = VL.abrir({
            remota: function (stream) {
                var v = D.$('call-remote');
                if (v) { v.srcObject = stream; try { v.play(); } catch (e) {} }
            },
            caida: function () { L.colgar('fallo'); }
        });
        if (!ok) { L.colgar('fallo'); }
        return ok;
    }

    /* Quien llama: en cuanto el otro acepta, reune su descripcion y la manda. */
    function ofrecer() {
        if (!conectar()) { return; }
        VL.ofrecer(function (err, sdp) {
            if (err || !L.ofrecer(sdp)) { L.colgar('fallo'); }
        });
    }

    /* Quien contesta: con la oferta y la camara, responde. */
    function responder(sdp) {
        if (!conectar()) { return; }
        VL.responder(sdp, function (err, mio) {
            if (err || !L.responder(mio)) { L.colgar('fallo'); }
        });
    }

    /* ---------------------------------------------------------------- eventos */
    function cambio(estado) {
        if (!estado) {
            VL.cerrar();
            enCola = [];
            ofertaEsperando = null;
            micApagado = false;
            camApagada = false;
            cerrarVista();
            return;
        }
        abrirVista();
        pintar(estado);

        if (estado.papel === 'llamo' && estado.estado === 'sonando') {
            conCamara(function () {});          /* verse mientras suena */
        }
        if (estado.papel === 'llamo' && estado.estado === 'conectando') {
            conCamara(ofrecer);
        }
        if (estado.papel === 'me-llaman' && estado.estado === 'conectando') {
            conCamara(function () {
                if (ofertaEsperando) { var s = ofertaEsperando; ofertaEsperando = null; responder(s); }
            });
        }
    }

    function sdp(info) {
        if (info.tipo === 'oferta') {
            /* La oferta puede llegar antes de que el navegador haya dado la
               camara. Se guarda y la coge conCamara al terminar. */
            if (VL.hayMedios()) { responder(info.sdp); } else { ofertaEsperando = info.sdp; }
        } else if (info.tipo === 'respuesta') {
            VL.aplicarRespuesta(info.sdp, function (err) { if (err) { L.colgar('fallo'); } });
        }
    }

    function fin(info) {
        var c = V.contacts.get(info.pk), quien = c ? c.name : '';
        var m = info.motivo, llamaba = info.papel === 'llamo';
        /* "Ocupado" y "no puede ahora" son noticias para quien LLAMA. A quien
           acaba de pulsar Rechazar no hay que contarle que el otro no puede:
           el otro es el. */
        if (m === 'ocupado') { if (llamaba) { D.toast(D.t('{quien} esta en otra llamada', { quien: quien })); } }
        else if (m === 'rechazada') { if (llamaba) { D.toast(D.t('{quien} no puede ahora', { quien: quien })); } }
        else if (m === 'sin-respuesta') {
            /* Dos D.t y no uno con el ternario dentro: test/frases.js recoge
               los literales de dentro de un D.t(), y 'llamo' se colaria como
               frase que traducir. */
            D.toast(info.papel === 'llamo'
                ? D.t('{quien} no contesta', { quien: quien })
                : D.t('Llamada perdida de {quien}', { quien: quien }));
        }
        else if (m === 'sin-camara') { /* ya se aviso al pedirla */ }
        else if (m === 'fallo') { D.toast(D.t('La llamada se ha cortado'), 'bad'); }
        else if (m === 'bloqueo') { /* se cerro la boveda: nada que decir */ }
        else if (info.duracion) { D.toast(D.t('Llamada terminada')); }
    }

    /* ---------------------------------------------------------------- botones */
    D.initVideollamada = function () {
        if (!L) { return; }
        L.onChange(function (what, arg) {
            if (what === 'llamada') { cambio(arg); }
            else if (what === 'llamada-sdp') { sdp(arg); }
            else if (what === 'llamada-fin') { fin(arg); }
        });

        D.on(D.$('btn-call'), 'click', function () {
            if (!D.activePk || V.groups.isKey(D.activePk)) { return; }
            var r = L.llamar(D.activePk);
            if (r.error === 'ocupado') { D.toast(D.t('Ya hay una llamada')); }
            else if (r.error === 'sin-vinculo') { D.toast(D.t('Todavia no hay vinculo con esta persona')); }
        });
        D.on(D.$('btn-call-accept'), 'click', function () { L.aceptar(); });
        D.on(D.$('btn-call-decline'), 'click', function () { L.colgar('rechazada'); });
        D.on(D.$('btn-call-hangup'), 'click', function () { L.colgar('colgado'); });
        D.on(D.$('btn-call-mic'), 'click', function () {
            micApagado = !micApagado;
            VL.silenciar('audio', micApagado);
            var e = L.actual(); if (e) { pintar(e); }
        });
        D.on(D.$('btn-call-cam'), 'click', function () {
            camApagada = !camApagada;
            VL.silenciar('video', camApagada);
            var e = L.actual(); if (e) { pintar(e); }
        });
    };
})(BINTIO);
