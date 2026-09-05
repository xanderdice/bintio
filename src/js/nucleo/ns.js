/* ==========================================================================
   BINTIO — espacio de nombres global
   --------------------------------------------------------------------------
   Todo el codigo vive colgado de un unico objeto global. No hay modulos ES,
   no hay bundler magico: el build concatena los ficheros y cada uno se envuelve
   en su propia funcion anonima. En que ORDEN los concatena lo dice la lista de
   etiquetas <script> de src/index.html, que es tambien la unica lista que hay.

   Regla de oro del proyecto, y la carpeta ya la dice:
     - js/nucleo/       la aplicacion de verdad. NO toca el DOM ni la red.
     - js/transportes/  hablan con la red. Tampoco tocan el DOM.
     - js/app/          el controlador. Une el nucleo con los transportes.
     - js/interfaz/     SOLO toca el DOM. NO hace criptografia.
   Si un fichero rompe su regla, esta en la carpeta equivocada.
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
