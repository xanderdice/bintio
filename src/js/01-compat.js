/* ==========================================================================
   Compatibilidad con navegadores viejos.
   Solo lo imprescindible para que el arranque no explote antes de poder
   mostrar la pantalla de "tu navegador no puede".
   ========================================================================== */
(function (V) {
    'use strict';

    /* Promise minima (A+ suficiente para nuestro uso: then/catch/all/resolve).
       Navegadores sin Promise nativa: IE11, Android 4.x. */
    if (typeof window !== 'undefined' && !window.Promise) {
        var P = function (executor) {
            var self = this;
            self._s = 0; /* 0 pendiente, 1 cumplida, 2 rechazada */
            self._v = undefined;
            self._q = [];
            function settle(state, value) {
                if (self._s) { return; }
                if (state === 1 && value && typeof value.then === 'function') {
                    value.then(function (v) { settle(1, v); }, function (e) { settle(2, e); });
                    return;
                }
                self._s = state; self._v = value;
                for (var i = 0; i < self._q.length; i++) { self._q[i](); }
                self._q = [];
            }
            try {
                executor(function (v) { settle(1, v); }, function (e) { settle(2, e); });
            } catch (e) { settle(2, e); }
        };
        P.prototype.then = function (onOk, onErr) {
            var self = this;
            return new P(function (res, rej) {
                function run() {
                    var cb = self._s === 1 ? onOk : onErr;
                    if (typeof cb !== 'function') {
                        if (self._s === 1) { res(self._v); } else { rej(self._v); }
                        return;
                    }
                    try { res(cb(self._v)); } catch (e) { rej(e); }
                }
                if (self._s) { setTimeout(run, 0); } else { self._q.push(function () { setTimeout(run, 0); }); }
            });
        };
        P.prototype['catch'] = function (fn) { return this.then(null, fn); };
        P.resolve = function (v) { return new P(function (r) { r(v); }); };
        P.reject = function (e) { return new P(function (_, r) { r(e); }); };
        P.all = function (list) {
            return new P(function (res, rej) {
                var out = [], left = list.length;
                if (!left) { res(out); return; }
                for (var i = 0; i < list.length; i++) {
                    (function (i) {
                        P.resolve(list[i]).then(function (v) {
                            out[i] = v; left--; if (!left) { res(out); }
                        }, rej);
                    })(i);
                }
            });
        };
        window.Promise = P;
    }

    /* Array.prototype.indexOf / forEach / map / filter existen desde ES5 en
       todo lo que nos interesa. Lo que si falta a veces: */
    if (!Date.now) { Date.now = function () { return new Date().getTime(); }; }
    if (typeof window !== 'undefined' && !window.console) {
        window.console = { log: function () {}, warn: function () {}, error: function () {} };
    }

    /* Informe de capacidades: la interfaz lo usa para explicar al usuario
       exactamente que puede y que no puede hacer en este dispositivo. */
    V.compat = function () {
        var w = typeof window !== 'undefined' ? window : {};
        var g = (w.crypto && w.crypto.getRandomValues) ? true
              : (w.msCrypto && w.msCrypto.getRandomValues) ? true : false;
        return {
            typedArrays: typeof Uint8Array !== 'undefined' && typeof Float64Array !== 'undefined',
            random: g,
            webrtc: !!(w.RTCPeerConnection || w.webkitRTCPeerConnection || w.mozRTCPeerConnection),
            bluetooth: !!(w.navigator && w.navigator.bluetooth),
            serviceWorker: !!(w.navigator && w.navigator.serviceWorker),
            broadcast: typeof w.BroadcastChannel !== 'undefined',
            indexeddb: !!(w.indexedDB),
            localstorage: (function () {
                try { w.localStorage.setItem('_v', '1'); w.localStorage.removeItem('_v'); return true; }
                catch (e) { return false; }
            })(),
            subtle: !!(w.crypto && (w.crypto.subtle || w.crypto.webkitSubtle)),
            barcode: typeof w.BarcodeDetector !== 'undefined',
            fileProtocol: (w.location && w.location.protocol === 'file:') || false
        };
    };
})(BINTIO);
