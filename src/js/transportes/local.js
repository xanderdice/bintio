/* ==========================================================================
   Transporte LOCAL: otras pestanas o ventanas del mismo navegador.

   Parece un juguete y no lo es. Sirve para dos cosas reales:
     - probar la malla sin dos aparatos,
     - que un mensaje siga saliendo aunque la pestana con la conexion buena
       este en segundo plano.

   Y para una que NO sirve, dicho aqui porque cuesta horas descubrirlo solo:
   esto NO enlaza la ventana de escritorio con la pestana del navegador.
   BroadcastChannel (y el respaldo por el evento 'storage') no cruzan ni el
   origen ni el navegador, y la ventana de escritorio es OTRO motor con su
   propio almacen: aunque sirva en un puerto fijo, su bus y el de Chrome son
   dos buses distintos. Entre escritorio y navegador solo hay dos caminos: el
   enlace directo por WebRTC (el codigo de Conectar) o Bluetooth.

   Usa BroadcastChannel donde existe; donde no (Safari viejo, file: en
   algunos navegadores), cae al truco clasico del evento 'storage'.
   ========================================================================== */
(function (V) {
    'use strict';
    var U = V.util, T = V.transport;
    var L = V.transport.local = {};

    var CHANNEL = 'bintio.mesh.v1';
    var STORAGE_KEY = 'bintio.bus.v1';
    var myId = null;
    var bc = null;
    var known = {};   /* id de pestana -> peer */
    var started = false;

    function post(obj) {
        obj.from = myId;
        if (bc) {
            try { bc.postMessage(obj); return; } catch (e) {}
        }
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(obj) + '|' + Math.random());
        } catch (e) {}
    }

    function peerFor(id) {
        if (known[id]) { return known[id]; }
        var p = {
            id: 'local:' + id,
            kind: 'local',
            label: 'Pestana ' + id.substr(0, 4),
            send: function (bytes) { post({ t: 'd', to: id, d: U.toB64(bytes) }); },
            close: function () { delete known[id]; T.removePeer('local:' + id); }
        };
        known[id] = p;
        T.addPeer(p);
        return p;
    }

    function onMessage(obj) {
        if (!obj || obj.from === myId) { return; }
        if (obj.t === 'hi') {
            peerFor(obj.from);
            post({ t: 'yo', to: obj.from });
        } else if (obj.t === 'yo') {
            if (obj.to === myId) { peerFor(obj.from); }
        } else if (obj.t === 'bye') {
            if (known[obj.from]) { known[obj.from].close(); }
        } else if (obj.t === 'd') {
            if (obj.to !== myId) { return; }
            var p = peerFor(obj.from);
            T.receive(U.fromB64(obj.d), p);
        }
    }

    L.start = function () {
        if (started) { return; }
        started = true;
        myId = V.crypto.randomHex(6);

        if (typeof BroadcastChannel !== 'undefined') {
            try {
                bc = new BroadcastChannel(CHANNEL);
                bc.onmessage = function (ev) { onMessage(ev.data); };
            } catch (e) { bc = null; }
        }
        if (!bc && typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('storage', function (ev) {
                if (ev.key !== STORAGE_KEY || !ev.newValue) { return; }
                try { onMessage(JSON.parse(ev.newValue.split('|')[0])); } catch (e) {}
            }, false);
        }
        if (typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('unload', function () { post({ t: 'bye' }); }, false);
        }
        post({ t: 'hi' });
    };

    L.stop = function () {
        post({ t: 'bye' });
        if (bc) { try { bc.close(); } catch (e) {} bc = null; }
        for (var k in known) {
            if (Object.prototype.hasOwnProperty.call(known, k)) { T.removePeer('local:' + k); }
        }
        known = {};
        started = false;
    };
})(BINTIO);
