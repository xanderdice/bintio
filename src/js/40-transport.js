/* ==========================================================================
   Registro de transportes.

   Un TRANSPORTE es cualquier cosa capaz de mover bytes hasta otro aparato.
   La malla no sabe si detras hay WebRTC, Bluetooth o dos pestanas del mismo
   navegador: solo ve "enlaces" con este contrato minimo.

       peer = {
           id:    cadena unica
           kind:  'rtc' | 'ble' | 'local'
           label: texto para la interfaz
           send:  function (Uint8Array)
           close: function ()
       }

   Anadir un transporte nuevo es escribir un fichero 4x que llame a
   transport.addPeer cuando consiga un enlace. Nada mas.
   ========================================================================== */
(function (V) {
    'use strict';
    var T = V.transport;

    var peers = [];
    var listeners = {};

    T.peers = function () { return peers.slice(); };
    T.count = function () { return peers.length; };
    T.countByKind = function (kind) {
        var n = 0;
        for (var i = 0; i < peers.length; i++) { if (peers[i].kind === kind) { n++; } }
        return n;
    };

    T.on = function (evt, fn) {
        if (!listeners[evt]) { listeners[evt] = []; }
        listeners[evt].push(fn);
    };
    T.emit = function (evt, arg) {
        var l = listeners[evt] || [];
        for (var i = 0; i < l.length; i++) {
            try { l[i](arg); } catch (e) { if (typeof console !== 'undefined') { console.error(e); } }
        }
    };

    T.addPeer = function (peer) {
        for (var i = 0; i < peers.length; i++) {
            if (peers[i].id === peer.id) { return peers[i]; }
        }
        peers.push(peer);
        T.emit('peer', peer);
        /* Al conocerse: ofrecer lo que llevamos en la bolsa y ponerse al dia. */
        try { V.mesh.greet(peer); } catch (e) {}
        return peer;
    };

    T.removePeer = function (id) {
        for (var i = peers.length - 1; i >= 0; i--) {
            if (peers[i].id === id) {
                var p = peers.splice(i, 1)[0];
                T.emit('gone', p);
            }
        }
    };

    /* Punto unico de entrada de datos: todos los transportes llaman aqui. */
    T.receive = function (bytes, peer) {
        try { V.mesh.handleFrame(bytes, peer); }
        catch (e) { if (typeof console !== 'undefined') { console.error('marco invalido', e); } }
    };

    T.closeAll = function () {
        var copy = peers.slice();
        for (var i = 0; i < copy.length; i++) {
            try { copy[i].close(); } catch (e) {}
        }
        peers = [];
    };
})(BINTIO);
