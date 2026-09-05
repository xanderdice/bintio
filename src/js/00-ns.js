/* ==========================================================================
   BINTIO — espacio de nombres global
   --------------------------------------------------------------------------
   Todo el codigo vive colgado de un unico objeto global. No hay modulos ES,
   no hay bundler magico: el build concatena los ficheros por orden de nombre
   y cada fichero se envuelve en su propia funcion anonima.

   Regla de oro del proyecto:
     - js/1x, 2x, 3x  -> nucleo puro. NO tocan el DOM. NO conocen la interfaz.
     - js/4x          -> transportes. Hablan con la red. NO tocan el DOM.
     - js/5x          -> controlador. Une nucleo y transportes.
     - js/6x          -> interfaz. SOLO toca el DOM. NO hace criptografia.
   Si un fichero rompe su regla, esta en el sitio equivocado.
   ========================================================================== */
var BINTIO = (function () {
    'use strict';
    return {
        /* Version del protocolo de sobre. Se sube solo si cambia el formato
           binario en el cable; la version de la app va en package.json. */
        PROTO: 1,
        NAME: 'BINTIO',
        /* Cada modulo se registra aqui abajo. */
        util: {}, crypto: {}, id: {}, vault: {}, contacts: {},
        envelope: {}, mesh: {}, chat: {}, groups: {}, transport: {}, invite: {},
        qr: {}, app: {}, ui: {}
    };
})();
