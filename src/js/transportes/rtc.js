/* ==========================================================================
   Transporte WebRTC: enlace directo entre dos aparatos.

   NO hay servidor de senalizacion. El "papeleo" de WebRTC (las dos
   descripciones SDP) se convierte en dos codigos de texto que los usuarios
   se pasan por donde quieran: un mensaje, un papel, un QR, un correo. En
   cuanto el canal esta abierto, ese intermediario deja de existir.

   Por defecto tampoco hay servidores STUN: sin ellos funcionan la misma red
   local, el cable y el punto de acceso compartido, que es exactamente donde
   este programa tiene sentido. Quien quiera atravesar internet puede poner
   su propio STUN en ajustes; es una decision del usuario, no nuestra.
   ========================================================================== */
(function (V) {
    'use strict';
    var U = V.util, T = V.transport;
    var R = V.transport.rtc = {};

    var GATHER_MS = 2500;      /* cuanto esperamos a que aparezcan candidatos */
    var sessions = {};         /* id local -> {pc, dc, role} */

    function PC() {
        var w = typeof window !== 'undefined' ? window : {};
        return w.RTCPeerConnection || w.webkitRTCPeerConnection || w.mozRTCPeerConnection || null;
    }
    function SD() {
        var w = typeof window !== 'undefined' ? window : {};
        return w.RTCSessionDescription || w.mozRTCSessionDescription || null;
    }

    R.available = function () { return !!PC(); };

    function iceConfig() {
        var s = V.vault.state && V.vault.state.settings;
        var urls = (s && s.stun) ? String(s.stun).split(/[\s,]+/) : [];
        var servers = [];
        for (var i = 0; i < urls.length; i++) {
            if (urls[i]) { servers.push({ urls: urls[i] }); }
        }
        return { iceServers: servers };
    }

    function newConnection(id, role) {
        var Ctor = PC();
        if (!Ctor) { throw new Error('Este navegador no tiene WebRTC'); }
        var pc = new Ctor(iceConfig());
        var s = { pc: pc, dc: null, role: role, id: id };
        sessions[id] = s;

        pc.oniceconnectionstatechange = function () {
            var st = pc.iceConnectionState;
            if (st === 'failed' || st === 'closed' || st === 'disconnected') {
                T.removePeer('rtc:' + id);
            }
        };
        return s;
    }

    function wire(s) {
        var dc = s.dc;
        dc.binaryType = 'arraybuffer';
        dc.onopen = function () {
            var peer = {
                id: 'rtc:' + s.id,
                kind: 'rtc',
                label: 'Enlace directo',
                send: function (bytes) {
                    if (dc.readyState !== 'open') { throw new Error('canal cerrado'); }
                    dc.send(bytes.buffer ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) : bytes);
                },
                close: function () { try { dc.close(); s.pc.close(); } catch (e) {} }
            };
            T.addPeer(peer);
        };
        dc.onmessage = function (ev) {
            var data = ev.data;
            if (typeof data === 'string') { return; }   /* solo binario */
            var bytes = new Uint8Array(data);
            var peer = null, list = T.peers();
            for (var i = 0; i < list.length; i++) {
                if (list[i].id === 'rtc:' + s.id) { peer = list[i]; }
            }
            T.receive(bytes, peer || { id: 'rtc:' + s.id, send: function () {} });
        };
        dc.onclose = function () { T.removePeer('rtc:' + s.id); };
    }

    /* Espera a que se recojan candidatos de red, con tope de tiempo: si la
       red es lenta seguimos con lo que haya en vez de quedarnos colgados. */
    function waitIce(pc, done) {
        if (pc.iceGatheringState === 'complete') { done(); return; }
        var fired = false;
        function finish() {
            if (fired) { return; }
            fired = true;
            done();
        }
        pc.onicegatheringstatechange = function () {
            if (pc.iceGatheringState === 'complete') { finish(); }
        };
        pc.onicecandidate = function (ev) {
            if (!ev.candidate) { finish(); }
        };
        setTimeout(finish, GATHER_MS);
    }

    /* ---------------------------------------------------------------------
       Lado A: crear la invitacion.
       --------------------------------------------------------------------- */
    R.createOffer = function (cb) {
        /* Solo puede haber UNA invitacion esperando respuesta, y esto no es
           una simplificacion: es lo unico correcto que se puede hacer hoy.
           La respuesta que llega de vuelta no dice a que invitacion contesta
           (el codigo no lleva identificador, ver invite.js:240), asi que
           con dos invitaciones vivas acceptAnswer tendria que adivinar, y
           adivinar mal significa aplicarle la respuesta a la conexion
           equivocada: no falla con un error claro, se queda colgada.

           Asi que al crear una nueva se cierra la anterior que siguiera
           esperando. La consecuencia hay que saberla: una invitacion que
           pasaste antes deja de valer en cuanto creas otra. Por eso
           app.js reutiliza la que ya hay en vez de crear una por cada vez
           que se abre la pantalla. */
        R.dropPendingOffer();

        var id = V.crypto.randomHex(4);
        var s;
        try { s = newConnection(id, 'offer'); } catch (e) { cb(e); return; }
        s.dc = s.pc.createDataChannel('bintio', { ordered: true });
        wire(s);
        s.pc.createOffer(function (desc) {
            s.pc.setLocalDescription(desc, function () {
                waitIce(s.pc, function () { cb(null, s.pc.localDescription.sdp, id); });
            }, cb);
        }, cb);
    };

    /* ---------------------------------------------------------------------
       Lado B: aceptar una invitacion y devolver la respuesta.
       --------------------------------------------------------------------- */
    R.acceptOffer = function (sdp, cb) {
        var id = V.crypto.randomHex(4);
        var s;
        try { s = newConnection(id, 'answer'); } catch (e) { cb(e); return; }
        s.pc.ondatachannel = function (ev) { s.dc = ev.channel; wire(s); };
        var Desc = SD();
        var remote = Desc ? new Desc({ type: 'offer', sdp: sdp }) : { type: 'offer', sdp: sdp };
        s.pc.setRemoteDescription(remote, function () {
            s.pc.createAnswer(function (desc) {
                s.pc.setLocalDescription(desc, function () {
                    waitIce(s.pc, function () { cb(null, s.pc.localDescription.sdp, id); });
                }, cb);
            }, cb);
        }, cb);
    };

    /* ---------------------------------------------------------------------
       Lado A otra vez: pegar la respuesta y quedar conectados.
       --------------------------------------------------------------------- */
    R.acceptAnswer = function (sdp, cb) {
        var pending = null;
        for (var k in sessions) {
            if (Object.prototype.hasOwnProperty.call(sessions, k) &&
                sessions[k].role === 'offer' &&
                sessions[k].pc.signalingState === 'have-local-offer') {
                pending = sessions[k];
            }
        }
        if (!pending) { cb(new Error('No hay ninguna invitacion esperando respuesta')); return; }
        var Desc = SD();
        var remote = Desc ? new Desc({ type: 'answer', sdp: sdp }) : { type: 'answer', sdp: sdp };
        pending.pc.setRemoteDescription(remote, function () { cb(null); }, cb);
    };

    /* Hay una invitacion viva esperando que le contesten? La interfaz lo
       pregunta para no fabricar una nueva y dejar muerta la que el usuario
       acaba de pasar por WhatsApp. */
    R.hasPendingOffer = function () {
        for (var k in sessions) {
            if (Object.prototype.hasOwnProperty.call(sessions, k) &&
                sessions[k].role === 'offer' &&
                sessions[k].pc.signalingState === 'have-local-offer') {
                return true;
            }
        }
        return false;
    };

    R.dropPendingOffer = function () {
        for (var k in sessions) {
            if (Object.prototype.hasOwnProperty.call(sessions, k) &&
                sessions[k].role === 'offer' &&
                sessions[k].pc.signalingState === 'have-local-offer') {
                try { sessions[k].pc.close(); } catch (e) {}
                delete sessions[k];
            }
        }
    };

    R.closeAll = function () {
        for (var k in sessions) {
            if (Object.prototype.hasOwnProperty.call(sessions, k)) {
                try { sessions[k].pc.close(); } catch (e) {}
            }
        }
        sessions = {};
    };
})(BINTIO);
