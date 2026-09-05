/* ==========================================================================
   Arranque.

   Orden: comprobar el aparato -> montar la interfaz -> abrir la boveda.
   Si algo imprescindible falta, se dice claramente y no se sigue: mas vale
   una pantalla honesta que un cifrado de mentira.
   ========================================================================== */
(function (V) {
    'use strict';
    var D = V.ui;

    function compatReport() {
        var c = V.compat();
        var box = D.$('compat-report');
        D.clear(box);

        var fatal = [];
        if (!c.typedArrays) { fatal.push(D.t('Tu navegador no tiene Uint8Array (es de antes de 2011).')); }
        if (!c.random) { fatal.push(D.t('Tu navegador no puede generar numeros aleatorios seguros.')); }

        if (fatal.length) {
            box.appendChild(D.make('p', null, D.t('BINTIO no puede funcionar aqui, y prefiere decirtelo a fingir:')));
            for (var i = 0; i < fatal.length; i++) { box.appendChild(D.make('p', 'dim', fatal[i])); }
            box.appendChild(D.make('p', 'dim',
                D.t('Prueba con Firefox, Chrome, Edge o Safari en una version de los ultimos diez anos.')));
            return false;
        }

        var avisos = [];
        if (!c.webrtc) { avisos.push(D.t('Sin WebRTC: no habra enlace directo, pero si malla y tarjetas.')); }
        if (!c.bluetooth) { avisos.push(D.t('Sin Web Bluetooth: no podras engancharte a nodos por Bluetooth desde este navegador.')); }
        if (!c.localstorage) { avisos.push(D.t('Sin almacenamiento: lo que hagas se perdera al cerrar la pestana.')); }
        if (c.fileProtocol) { avisos.push(D.t('Abierto como fichero local: funciona, pero sin instalacion ni modo sin conexion.')); }

        box.appendChild(D.make('p', null, D.t('Todo listo.')));
        for (var j = 0; j < avisos.length; j++) { box.appendChild(D.make('p', 'dim', avisos[j])); }
        return true;
    }

    function wireApp() {
        V.app.on(function (what) {
            if (what === 'message' || what === 'state' || what === 'read' || what === 'clear') {
                if (D.current === 'view-main') { D.renderMessages(); }
                D.refreshRoster();
            }
            if (what === 'link' || what === 'tick' || what === 'sync') {
                D.refreshStatus();
                D.refreshRoster();
            }
            /* "Esta escribiendo" entra y sale cada pocos segundos, asi que
               repinta lo justo: el renglon de la conversacion abierta y la
               lista, donde tambien se lee sin abrir nada. Los mensajes no se
               tocan: no ha cambiado ninguno. */
            if (what === 'typing') {
                D.paintTyping();
                D.refreshRoster();
                return;
            }
            /* 'request' entra por aqui porque presenta.js lo emite por
               V.chat y app.js reemite lo que sale de ahi. Un segundo canal
               seria un segundo sitio que enganchar. */
            if (what === 'contact' || what === 'presence' || what === 'request') { D.refreshRoster(); }
        });

        /* Un mensaje entrante mientras la ventana esta detras: avisar sin
           pedir permisos raros ni mandar nada a ningun sitio. */
        V.chat.onChange(function (what, arg) {
            /* Una presentacion no es un mensaje: no entra en ninguna
               conversacion y no cuenta en el titulo de la pestana, que cuenta
               mensajes sin leer. Se avisa igualmente porque en movil, con una
               conversacion abierta, el panel de la lista esta oculto y la fila
               que avisa no se ve. 'update' tambien: es una presentacion nueva
               de quien ya estaba esperando, no una copia repetida por la malla
               -de esas se encarga el filtro de sobres ya vistos-. */
            if (what === 'request' && arg && (arg.what === 'new' || arg.what === 'update')) {
                D.toast(D.t('Quieren escribirte. Lo tienes arriba, en Conversaciones.'));
                return;
            }
            if (what !== 'message' || !arg || arg.msg.dir !== 'in') { return; }
            if (D.activePk === arg.pk && document.hasFocus && document.hasFocus()) { return; }
            /* En un grupo, quien escribe y donde: "Mensaje de Quim" a secas
               deja sin saber en cual de las cuatro conversaciones mirar. */
            var quien;
            if (V.groups.isKey(arg.pk)) {
                var g = V.groups.get(V.groups.idOf(arg.pk));
                quien = D.t('{quien} en {grupo}', {
                    quien: arg.msg.fromName || D.t('alguien'),
                    grupo: g ? g.name : D.t('un grupo')
                });
            } else {
                var c = V.contacts.get(arg.pk);
                quien = c ? c.name : D.t('alguien');
            }
            D.toast(D.t('Mensaje de {quien}', { quien: quien }));
            try { document.title = '(' + V.chat.totalUnread() + ') BINTIO'; } catch (e) {}
        });

        D.on(window, 'focus', function () {
            try { document.title = 'BINTIO'; } catch (e) {}
        });

        /* Guardar antes de que se cierre: nada a medias en disco. */
        D.on(window, 'beforeunload', function () {
            try { V.vault.saveNow(); } catch (e) {}
        });
    }

    /* Un codigo pegado detras de la almohadilla se usa nada mas abrir. */
    function consumeHash() {
        var code = V.invite.fromLocation(location.href);
        if (!code || code.substr(0, 2) !== V.invite.TAG) { return; }
        try { history.replaceState(null, '', location.pathname + location.search); }
        catch (e) { location.hash = ''; }
        setTimeout(function () {
            D.openConnect();
            D.$('paste-code').value = code;
            D.toast(D.t('Han compartido un codigo contigo: revisalo y pulsa Usar codigo'));
        }, 300);
    }

    /* ==================================================================== PWA
       La aplicacion entera viaja dentro de un solo index.html: estilos,
       codigo, logos y manifiesto. De lo que hace falta para ser una PWA solo
       quedan dos cabos, y son los dos que el navegador NO deja meter dentro:

         - El trabajador de servicio. Su codigo TIENE que venir de una
           direccion http o https; registrarlo desde blob: o desde data: lo
           rechaza cualquier navegador ("The URL protocol of the script is not
           supported"). No es una limitacion de aqui, es la especificacion.
           Por eso sw.js sigue siendo un fichero de un kilobyte al lado, y por
           eso solo se intenta cuando la pagina viene de un servidor.

         - El manifiesto SI viaja dentro, en el propio enlace, como data:. Lo
           que pasa es que una direccion data: no tiene origen, y para poder
           instalar la aplicacion el navegador necesita que el manifiesto sea
           del mismo origen que la pagina. Asi que al arrancar se rehace como
           blob: (que si lo es) y con start_url y scope absolutos, que es lo
           que no se puede saber al compilar.

       Con el fichero suelto (file://) no se hace ninguna de las dos cosas: no
       hay origen, no hay instalacion y no hace falta cache porque no hay nada
       que descargar. */
    function servido() {
        return location.protocol === 'http:' || location.protocol === 'https:';
    }

    function registerWorker() {
        if (!navigator.serviceWorker || !servido()) { return; }
        try {
            navigator.serviceWorker.register('sw.js')['catch'](function () {});
        } catch (e) {}
    }

    function anchorManifest() {
        if (!servido() || !window.Blob || !window.URL || !URL.createObjectURL) { return; }
        var link = document.querySelector('link[rel="manifest"]');
        if (!link) { return; }
        var href = link.getAttribute('href') || '';
        var coma = href.indexOf(',');
        if (href.substr(0, 5) !== 'data:' || coma < 0) { return; }
        try {
            /* El manifiesto que incrusta tools/build.js va en base64 y solo
               con caracteres ASCII (lo que no lo es va escapado como \uXXXX
               dentro del propio JSON), asi que atob basta y no hace falta
               arrastrar aqui un decodificador de UTF-8. */
            var crudo = href.slice(coma + 1);
            var texto = href.slice(0, coma).indexOf('base64') >= 0
                ? atob(crudo)
                : decodeURIComponent(crudo);
            var m = JSON.parse(texto);
            var aqui = location.href.split('#')[0].split('?')[0];
            m.start_url = aqui;
            m.scope = aqui.replace(/[^/]*$/, '');
            m.id = m.scope;
            link.setAttribute('href', URL.createObjectURL(
                new Blob([JSON.stringify(m)], { type: 'application/manifest+json' })));
        } catch (e) {}
    }

    function boot() {
        /* Lo primero de todo, antes de pintar nada: el idioma. Asi la pantalla
           de acceso ya sale en el que toca en vez de cambiar delante de quien
           la esta leyendo. */
        D.aplicarIdioma(D.idiomaGuardado());

        D.initLock();
        D.initChat();
        D.initConnect();
        D.initSettings();
        D.initRequests();
        D.initPrivacidad();
        wireApp();
        registerWorker();
        anchorManifest();
        D.on(document, 'visibilitychange', latido);

        if (!compatReport()) { return; }

        setTimeout(function () {
            /* Desbloqueo rapido: solo si la misma pestana ya lo estaba. */
            if (V.vault.exists() && V.vault.resumeSession()) {
                D.applySettings();
                V.app.start();
                D.view('view-main');
                D.refreshRoster();
                D.refreshStatus();
            } else {
                D.showLock();
            }
            consumeHash();
        }, 450);

        latido();
    }

    /* ================================================================ LATIDO
       El unico reloj de la interfaz: repasar la barra de abajo.

       Aqui no hay ni una consulta periodica de mensajes. Nada de "mirar si ha
       llegado algo" cada pocos segundos, que es de donde sale casi toda la
       bateria que gastan las aplicaciones de mensajeria. Lo que llega despierta
       a la interfaz por evento -el canal de datos, el bluetooth o el
       BroadcastChannel entre pestanas- y lo unico que corre solo es el minuto
       de mantenimiento de app.js, que es el suelo al que los navegadores
       estrangulan cualquier temporizador en segundo plano.

       Quedaba este repaso de cuatro segundos, y corria siempre: con la ventana
       tapada, minimizada o el movil en el bolsillo son novecientos despertares
       a la hora para redibujar algo que nadie esta mirando. Asi que se PARA
       mientras la pagina esta oculta y se reanuda al volver, con un repaso
       inmediato para que no se vean numeros viejos ni un parpadeo.

       Si el navegador es tan viejo que no sabe decir si la pagina se ve,
       document.hidden no es true y todo sigue como antes. */
    var reloj = null;

    function latido() {
        if (document.hidden === true) {
            if (reloj) { clearInterval(reloj); reloj = null; }
            return;
        }
        D.refreshStatus();
        if (!reloj) { reloj = setInterval(function () { D.refreshStatus(); }, 4000); }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(boot, 0);
    } else {
        D.on(document, 'DOMContentLoaded', boot);
    }
})(BINTIO);
