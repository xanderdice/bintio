/* ==========================================================================
   Videollamada: el video de verdad.

   Una conexion WebRTC APARTE de la del canal de datos, con camara y
   microfono dentro. Aparte por dos motivos: la llamada tiene que poder
   colgarse sin tirar el canal por el que van los mensajes, y las dos personas
   pueden estar unidas por bluetooth o por la malla y no tener canal de datos
   WebRTC entre ellas. La senalizacion no depende de como esten unidas: la
   lleva nucleo/llamada.js dentro de sobres normales.

   Este fichero no decide nada. Le dicen "abre", "ofrece", "responde",
   "cierra" y lo hace. Quien decide es nucleo/llamada.js.

   LA CAMARA SE APAGA DE VERDAD

   Aqui vale la misma regla que en el lector de QR (interfaz/qr.js): un
   permiso que se concede tarde -el usuario colgo mientras el navegador
   preguntaba- no puede encender la camara en una llamada que ya no existe.
   Cada peticion lleva un numero; cerrar sube el numero; lo que llega con un
   numero viejo se apaga en el acto. En un programa que promete que nada sale
   del aparato, una camara encendida de mas es un fallo grave, no de
   interfaz.
   ========================================================================== */
(function (V) {
    'use strict';
    var R = V.transport.rtc, VL = V.transport.videollamada = {};

    var pc = null;       /* la conexion de la llamada en curso */
    var local = null;    /* camara y microfono propios */
    var gen = 0;         /* numero de encendido, ver arriba */

    function nav() { return typeof navigator !== 'undefined' ? navigator : null; }

    VL.available = function () {
        var n = nav();
        return !!(R.available() && n && n.mediaDevices && n.mediaDevices.getUserMedia);
    };

    function apagar(stream) {
        if (!stream) { return; }
        var t = stream.getTracks();
        for (var i = 0; i < t.length; i++) { try { t[i].stop(); } catch (e) {} }
    }

    /* Pedir camara y microfono. Se piden a la vez para que el navegador
       pregunte una sola vez. La resolucion se pide moderada a proposito: es
       una llamada, no una grabacion, y en un enlace directo sin servidor el
       ancho de banda es el de la red que haya. */
    VL.pedirMedios = function (cb) {
        var n = nav();
        if (!VL.available()) { cb(new Error('Este navegador no puede hacer videollamadas')); return; }
        var mia = ++gen;
        n.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
            audio: true
        }).then(function (s) {
            if (mia !== gen) { apagar(s); return; }
            local = s;
            cb(null, s);
        })['catch'](function (e) {
            if (mia !== gen) { return; }
            cb(e || new Error('sin camara'));
        });
    };

    /* Abrir la conexion con los medios locales ya dentro.
         manejadores.remota(stream)   llega el video del otro
         manejadores.caida(estado)    la red se ha ido */
    VL.abrir = function (manejadores) {
        var Ctor = R.PC();
        if (!Ctor || !local) { return false; }
        VL.cerrarConexion();
        pc = new Ctor(R.iceConfig());

        var tracks = local.getTracks(), i;
        if (pc.addTrack) {
            for (i = 0; i < tracks.length; i++) { pc.addTrack(tracks[i], local); }
            pc.ontrack = function (ev) {
                var s = ev.streams && ev.streams[0];
                if (!s && typeof MediaStream !== 'undefined') { s = new MediaStream([ev.track]); }
                if (s) { manejadores.remota(s); }
            };
        } else {
            /* Navegadores viejos: la API anterior, misma idea. */
            pc.addStream(local);
            pc.onaddstream = function (ev) { manejadores.remota(ev.stream); };
        }

        pc.oniceconnectionstatechange = function () {
            if (!pc) { return; }
            var st = pc.iceConnectionState;
            if (st === 'failed' || st === 'closed' || st === 'disconnected') { manejadores.caida(st); }
        };
        return true;
    };

    function descripcion(tipo, sdp) {
        var Desc = R.SD();
        return Desc ? new Desc({ type: tipo, sdp: sdp }) : { type: tipo, sdp: sdp };
    }

    VL.ofrecer = function (cb) {
        if (!pc) { cb(new Error('sin conexion')); return; }
        var mio = pc;
        mio.createOffer(function (desc) {
            mio.setLocalDescription(desc, function () {
                R.waitIce(mio, function () {
                    if (mio !== pc) { return; }   /* se cerro mientras reunia candidatos */
                    cb(null, mio.localDescription.sdp);
                });
            }, cb);
        }, cb);
    };

    VL.responder = function (sdpOferta, cb) {
        if (!pc) { cb(new Error('sin conexion')); return; }
        var mio = pc;
        mio.setRemoteDescription(descripcion('offer', sdpOferta), function () {
            mio.createAnswer(function (desc) {
                mio.setLocalDescription(desc, function () {
                    R.waitIce(mio, function () {
                        if (mio !== pc) { return; }
                        cb(null, mio.localDescription.sdp);
                    });
                }, cb);
            }, cb);
        }, cb);
    };

    VL.aplicarRespuesta = function (sdp, cb) {
        if (!pc) { cb(new Error('sin conexion')); return; }
        pc.setRemoteDescription(descripcion('answer', sdp), function () { cb(null); }, cb);
    };

    /* Silenciar o apagar la camara sin cortar: la pista sigue negociada y se
       vuelve a encender al instante. Apagada, la camara deja de enviar y el
       otro ve negro; el piloto de la camara puede seguir encendido, y por eso
       colgar si la apaga de verdad. */
    VL.silenciar = function (clase, apagado) {
        if (!local) { return false; }
        var pistas = clase === 'video' ? local.getVideoTracks() : local.getAudioTracks();
        for (var i = 0; i < pistas.length; i++) { pistas[i].enabled = !apagado; }
        return pistas.length > 0;
    };

    VL.cerrarConexion = function () {
        if (pc) {
            var viejo = pc;
            pc = null;
            try { viejo.ontrack = null; viejo.onaddstream = null; viejo.oniceconnectionstatechange = null; } catch (e) {}
            try { viejo.close(); } catch (e) {}
        }
    };

    /* Todo fuera: conexion, camara, microfono. Sube el numero de encendido
       para que una camara que llegue tarde se apague sola. */
    VL.cerrar = function () {
        gen++;
        VL.cerrarConexion();
        apagar(local);
        local = null;
    };

    VL.hayMedios = function () { return !!local; };
})(BINTIO);
