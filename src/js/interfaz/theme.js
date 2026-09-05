/* ==========================================================================
   Temas y efectos.

   El tema se guarda dentro de la boveda cifrada, no en una cookie ni en un
   almacen aparte: hasta la eleccion de color es asunto privado.
   Mientras la boveda esta cerrada se usa el tema de casa, que es BINTIO.

   Cada tema, ademas de su color, tiene un ACABADO. Solo hay dos y se pone en
   <html data-skin>: el de casa ("studio", limpio y comercial) y el de los
   demas ("terminal", el CRT de siempre). La lista de aqui abajo es el unico
   sitio donde se decide cual lleva cada uno.
   ========================================================================== */
(function (V) {
    'use strict';
    var D = V.ui;

    var THEMES = ['bintio', 'neon', 'ice', 'matrix', 'ember', 'violet', 'carbon', 'paper'];
    var DEFAULT = 'bintio';

    /* Todos menos el de casa se pintan con el acabado de terminal. */
    var TERMINAL = ['neon', 'ice', 'matrix', 'ember', 'violet', 'carbon', 'paper'];

    /* El color que el sistema operativo pinta alrededor de la aplicacion
       instalada: tiene que ser el mismo del tema, o se ve una franja de otro
       color en la barra del movil. */
    var BAR = {
        bintio: '#0a0d1a',
        neon: '#0d0407',
        ice: '#04070a',
        matrix: '#050805',
        ember: '#0b0703',
        violet: '#07050e',
        carbon: '#0c0d0e',
        paper: '#eef1f3'
    };

    function has(list, name) {
        for (var i = 0; i < list.length; i++) { if (list[i] === name) { return true; } }
        return false;
    }

    D.applyTheme = function (name) {
        if (!has(THEMES, name)) { name = DEFAULT; }
        document.documentElement.setAttribute('data-theme', name);
        document.documentElement.setAttribute('data-skin', has(TERMINAL, name) ? 'terminal' : 'studio');
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) { meta.setAttribute('content', BAR[name] || BAR[DEFAULT]); }
    };

    D.applyBloom = function (mode) {
        if (mode !== 'soft' && mode !== 'off') { mode = 'on'; }
        document.body.setAttribute('data-bloom', mode);
        /* Sin efectos tampoco tiene sentido el barrido de lineas. */
        document.body.className = mode === 'off'
            ? (document.body.className + ' no-scanlines').replace(/\s+/g, ' ')
            : document.body.className.replace(/\bno-scanlines\b/g, '').replace(/\s+/g, ' ');
    };

    D.applySettings = function () {
        var s = (V.vault.state && V.vault.state.settings) || {};
        D.applyTheme(s.theme || DEFAULT);
        D.applyBloom(s.bloom || 'on');
    };
})(BINTIO);
