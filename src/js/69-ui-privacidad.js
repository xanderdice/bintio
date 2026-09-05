/* ==========================================================================
   Pantalla protegida.

   LO PRIMERO, PORQUE IMPORTA MAS QUE EL CODIGO: desde una pagina web NO se
   puede impedir una captura de pantalla. No existe ninguna API para eso, y no
   es un descuido de los navegadores: la pantalla es del sistema operativo, no
   de la pagina. Impresion de pantalla, la Herramienta de Recortes, OBS, una
   videollamada compartiendo escritorio o un movil apuntando al monitor se
   llevan lo que haya, y ninguna linea de este fichero lo evita.

   Cualquier aplicacion web que diga lo contrario esta mintiendo. Este proyecto
   no va a hacer eso, asi que aqui se hace lo que SI se puede, se dice hasta
   donde llega y se dice donde no llega.

   LO QUE SI SE PUEDE

     1. Tapar en cuanto la ventana pierde el foco. Esto no es cosmetico: en
        Windows, "Impr Pant + Mayus + Win" abre un recorte que se lleva el
        foco ANTES de capturar, asi que lo que acaba en la imagen es la
        cortina. Lo mismo con casi todo lo que obliga a salir de la ventana, y
        con el descuido mas comun de todos: compartir pantalla en una reunion
        y cambiar de aplicacion con la conversacion detras.

     2. La tecla de Impresion de pantalla si llega a la pagina. La captura ya
        esta hecha cuando nos enteramos -no se puede cancelar-, pero va al
        portapapeles, y el portapapeles si se puede pisar. Se pisa, se tapa y
        se avisa. Contra un descuido funciona; contra alguien que quiere la
        foto, no, y por eso el aviso lo dice.

     3. El menu del sistema con el boton derecho, que ademas era la unica via
        de "Guardar imagen como" e "Inspeccionar".

   LO QUE NO SE PUEDE, Y NO SE VA A FINGIR

     - Un grabador que no roba el foco (OBS, cualquier videollamada ya en
       marcha) graba la conversacion entera. No hay nada que hacer desde aqui.
     - Una camara apuntando a la pantalla se lleva todo, siempre.
     - En el ejecutable de Windows si existe la solucion de verdad
       -SetWindowDisplayAffinity con WDA_EXCLUDEFROMCAPTURE, que hace la
       ventana invisible para cualquier grabador-, pero esa llamada SOLO la
       admite el proceso dueno de la ventana: desde fuera devuelve error 5,
       acceso denegado. Esta medido y esta en el README. Por eso no vale ni un
       script al lado del ejecutable ni una extension de Neutralino, que es un
       proceso aparte: tendria que salir de dentro del propio binario, y eso
       es cambiar de envoltorio de escritorio o mantener un fork en C++.

   Por eso el interruptor se llama "pantalla protegida" y no "bloquear
   capturas": lo segundo seria mentira.
   ========================================================================== */
(function (V) {
    'use strict';
    var D = V.ui;

    /* Lo que se queda la cortina puesta despues de una captura. Suficiente
       para que una segunda pulsacion seguida tampoco pille nada. */
    var TRAS_CAPTURA_MS = 2500;

    var quitar = null;      /* reloj que destapa tras una captura */
    var ultimaTecla = 0;    /* para no contar dos veces keydown y keyup */

    function encendida() {
        var s = V.vault.state && V.vault.state.settings;
        /* Como los demas interruptores: solo el false explicito lo apaga, para
           que una boveda creada antes de que esto existiera lo tenga puesto. */
        return !s || s.shield !== false;
    }

    /* Solo hay algo que tapar cuando la boveda esta abierta. En el arranque y
       en la pantalla de acceso no hay nada dentro, y una cortina ahi solo
       seria una pantalla negra sin explicacion al abrir la aplicacion. */
    function hayAlgoQueTapar() {
        return !!(V.app && V.app.ready) && encendida();
    }

    function tapar(nota) {
        var el = D.$('shield');
        if (!el) { return; }
        D.text(D.$('shield-note'), nota || '');
        D.show(el, true);
    }

    function destapar() {
        var el = D.$('shield');
        if (!el) { return; }
        if (quitar) { clearTimeout(quitar); quitar = null; }
        D.show(el, false);
    }

    /* La ventana deja de estar delante: tapar. Vale para alt+tab, para
       minimizar, para cambiar de pestana y para las herramientas de recorte,
       que se llevan el foco antes de disparar. */
    function fuera() {
        if (!hayAlgoQueTapar()) { return; }
        tapar('Vuelve a la ventana para seguir.');
    }

    function dentro() {
        if (quitar) { return; }   /* la de una captura se quita sola */
        destapar();
    }

    /* Impresion de pantalla. La captura ya esta hecha: lo unico que queda es
       que no sirva de mucho y que quien la ha hecho sepa que se ha visto. */
    function tecla(ev) {
        var k = ev.key || '';
        var codigo = ev.keyCode || ev.which;
        /* 44 es Impr Pant en los navegadores que no traen ev.key. */
        if (k !== 'PrintScreen' && codigo !== 44) { return; }
        if (!hayAlgoQueTapar()) { return; }

        var ahora = (new Date()).getTime();
        if (ahora - ultimaTecla < 400) { return; }   /* keydown y keyup son la misma */
        ultimaTecla = ahora;

        /* El portapapeles es donde acaba la captura, y ahi si se puede
           escribir: la pulsacion cuenta como gesto del usuario, que es lo que
           el navegador exige. Si falla -sin permiso, sin foco, en file://- no
           pasa nada mas que quedarse sin esta parte. */
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(' ')['catch'](function () {});
            }
        } catch (e) {}

        tapar('Se ha borrado lo que quedo en el portapapeles. Una captura de pantalla no se puede impedir desde aqui: si alguien la quiere, la consigue.');
        if (quitar) { clearTimeout(quitar); }
        quitar = setTimeout(function () { quitar = null; destapar(); }, TRAS_CAPTURA_MS);
    }

    /* Si esto corre dentro del ejecutable de Windows que blinda su propia
       ventana (tools/protegido). Ahi la captura SI esta impedida de verdad, por
       el sistema operativo, y el texto de Ajustes tiene que decirlo: en un sitio
       "no impide una captura" y en el otro "esta ventana no sale en ninguna",
       porque las dos frases son ciertas donde toca y mentira donde no. */
    D.pantallaBlindada = function () {
        try { return /BINTIO-Protegido/.test(navigator.userAgent || ''); }
        catch (e) { return false; }
    };

    /* Que el interruptor se note al momento, sin recargar. */
    D.applyShield = function () {
        if (!encendida()) { destapar(); return; }
        if (!document.hasFocus || document.hasFocus()) { return; }
        fuera();
    };

    D.initPrivacidad = function () {
        /* ------------------------------------------------ el boton derecho

           Fuera el menu del sistema. Aqui no hay nada que "guardar como" -la
           unica imagen es el logo- y lo que si habia era una via comoda para
           inspeccionar la pagina por encima del hombro de alguien.

           Con una excepcion, y no es un descuido: en un campo de texto ESE
           menu es como se pega. En el movil no hay boton derecho pero la
           pulsacion larga dispara el mismo evento, y sin el no habria manera
           de pegar el codigo de una invitacion, que es justo el primer paso
           de la aplicacion. Un menu de pegar sobre un campo vacio no ensena
           nada de nadie. */
        D.on(document, 'contextmenu', function (ev) {
            var e = ev || window.event;
            var t = e.target || e.srcElement;
            var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
            if (tag === 'input' || tag === 'textarea' ||
                (t && t.getAttribute && t.getAttribute('contenteditable'))) { return true; }
            if (e.preventDefault) { e.preventDefault(); } else { e.returnValue = false; }
            return false;
        });

        D.on(window, 'blur', fuera);
        D.on(window, 'focus', dentro);
        D.on(document, 'visibilitychange', function () {
            if (document.hidden === true) { fuera(); } else { dentro(); }
        });
        D.on(document, 'keydown', tecla);
        D.on(document, 'keyup', tecla);
    };
})(BINTIO);
