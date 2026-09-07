/* ==========================================================================
   Ajustes: identidad, aspecto, malla, copias y borrado.
   ========================================================================== */
(function (V) {
    'use strict';
    var D = V.ui, U = V.util;

    function report(el, rows) {
        D.clear(el);
        for (var i = 0; i < rows.length; i++) {
            var line = D.make('div');
            line.appendChild(D.make('span', rows[i][1] ? 'tag tag--ok' : 'tag tag--warn',
                D.t(rows[i][1] ? 'si' : 'no')));
            line.appendChild(document.createTextNode(' ' + D.t(rows[i][0])));
            el.appendChild(line);
        }
    }

    D.openSettings = function () {
        var st = V.vault.state, s = st.settings;

        D.$('me-name').value = V.app.identity.name || '';
        D.text(D.$('me-fingerprint'), V.app.identity.fingerprint);

        /* El idioma no vive en la boveda -se elige antes de abrirla- asi que
           sale de idioma.js y no de los ajustes guardados. Se repasa aqui, con
           los otros dos, porque aplicarIdioma vuelve a abrir esta pantalla cada
           vez que se cambia y asi el desplegable no se queda senalando al
           idioma anterior. */
        D.$('set-lang').value = D.idioma();
        D.$('set-theme').value = s.theme || 'bintio';
        D.$('set-bloom').value = s.bloom || 'on';
        D.$('set-relay').checked = s.relay !== false;
        D.$('set-receipts').checked = s.receipts !== false;
        D.$('set-typing').checked = s.typing !== false;
        D.$('set-shield').checked = s.shield !== false;
        /* En el ejecutable blindado la frase de arriba se queda corta: ahi la
           ventana no sale en NINGUNA captura, y lo aplica Windows. */
        if (D.pantallaBlindada && D.pantallaBlindada()) {
            D.text(D.$('set-shield-note'),
                D.t('Esta ventana no sale en ninguna captura ni grabacion de pantalla: lo impide Windows, no la pagina. Ademas tapa la conversacion cuando la ventana deja de estar delante y quita el menu del boton derecho. Una camara apuntando a la pantalla se lo lleva todo igual.'));
        }
        /* Este va al reves que los otros dos: !== false los deja encendidos
           cuando la clave no existe, y este tiene que quedarse APAGADO en una
           boveda que se creo antes de que el buzon existiera. */
        D.$('set-inbox').checked = s.openInbox === true;
        D.$('set-stun').value = s.stun || '';

        var bag = V.mesh.bagSize();
        D.text(D.$('bag-info'), D.t('Ahora mismo llevas {n} sobres ajenos ({tam}) que no puedes leer.',
            { n: bag.count, tam: D.bytes(bag.bytes) }));

        var c = V.compat();
        report(D.$('tech-report'), [
            ['Generador aleatorio seguro', c.random],
            ['Enlace directo (WebRTC)', c.webrtc],
            ['Bluetooth (Web Bluetooth)', c.bluetooth],
            ['Lector de QR integrado', c.barcode],
            ['Guardado permanente en disco', V.vault.isPersistent()],
            ['Funciona sin conexion (PWA)', c.serviceWorker],
            ['Comunicacion entre pestanas', c.broadcast]
        ]);

        /* La Llave de Recuperacion se pinta solo al pulsar "Ver la llave", pero
           una vez pintada se quedaba en el nodo hasta recargar: legible desde la
           consola incluso con la boveda ya cerrada. Se borra al abrir Ajustes y
           al cerrar (btn-lock). Es la llave que abre la identidad entera. */
        D.clear(D.$('key-value'));
        D.show(D.$('key-out'), false);
        D.view('view-settings');
    };

    D.initSettings = function () {

        /* El idioma cambia al momento y no espera a ningun boton de guardar: la
           pantalla entera se reescribe delante de quien lo ha pulsado, que es
           la unica forma de comprobar que ha elegido lo que queria.

           Las opciones se ponen aqui y no en el marcado: las sabe idioma.js, que
           es quien lleva la lista. Y se ponen ANTES de escuchar el cambio, que es
           lo unico que hay que respetar del orden: un desplegable vacio no puede
           emitir un cambio, asi que sin esta linea el oyente de abajo era codigo
           al que no se llegaba nunca. */
        D.montarIdiomas(D.$('set-lang'));
        D.on(D.$('set-lang'), 'change', function () {
            D.guardarIdioma(D.$('set-lang').value);
        });

        D.on(D.$('btn-settings'), 'click', function () { D.openSettings(); });
        D.on(D.$('btn-connect'), 'click', function () { D.openConnect(); });
        D.on(D.$('btn-settings-back'), 'click', function () { D.view('view-main'); });

        D.on(D.$('btn-save-name'), 'click', function () {
            var name = (D.$('me-name').value || '').replace(/^\s+|\s+$/g, '');
            if (!name) { D.toast(D.t('Ponte algun nombre'), 'bad'); return; }
            V.vault.state.identity.name = name;
            V.app.identity.name = name;
            V.vault.saveNow();
            /* Avisar a los contactos para que vean el nombre nuevo. */
            var all = V.contacts.all();
            for (var i = 0; i < all.length; i++) { V.chat.sendProfile(all[i], name); }
            D.toast(D.t('Nombre guardado'), 'ok');
        });

        D.on(D.$('set-theme'), 'change', function () {
            V.vault.state.settings.theme = D.$('set-theme').value;
            V.vault.save();
            D.applyTheme(V.vault.state.settings.theme);
        });

        D.on(D.$('set-bloom'), 'change', function () {
            V.vault.state.settings.bloom = D.$('set-bloom').value;
            V.vault.save();
            D.applyBloom(V.vault.state.settings.bloom);
        });

        D.on(D.$('btn-save-net'), 'click', function () {
            var s = V.vault.state.settings;
            s.relay = D.$('set-relay').checked;
            s.receipts = D.$('set-receipts').checked;
            s.typing = D.$('set-typing').checked;
            s.shield = D.$('set-shield').checked;
            if (D.applyShield) { D.applyShield(); }
            var abriendo = D.$('set-inbox').checked && !s.openInbox;
            s.openInbox = D.$('set-inbox').checked;
            s.stun = (D.$('set-stun').value || '').replace(/^\s+|\s+$/g, '');
            V.vault.saveNow();
            /* Al ABRIR el buzon se repasa la mochila: puede haber presentaciones
               guardadas de cuando estaba cerrado, enteras y sin abrir. Sin esto
               se quedaban ahi hasta caducar aunque el usuario acabara de decir
               que si las queria. */
            var recuperadas = 0;
            if (abriendo) { try { recuperadas = V.presenta.retry(); } catch (e) {} }
            if (recuperadas) {
                D.refreshRoster();
                D.toast(D.t(recuperadas === 1
                    ? 'Ajustes guardados. Habia {n} solicitud esperando'
                    : 'Ajustes guardados. Habia {n} solicitudes esperando',
                    { n: recuperadas }), 'ok');
            } else {
                D.toast(D.t('Ajustes guardados'), 'ok');
            }
        });

        D.on(D.$('btn-empty-bag'), 'click', function () {
            if (!window.confirm(D.t('Soltar todos los sobres ajenos que llevas? Algunos mensajes de otras personas podrian no llegar.'))) { return; }
            V.mesh.bagClear();
            D.openSettings();
            D.refreshStatus();
            D.toast(D.t('Mochila vaciada'));
        });

        D.on(D.$('btn-show-key'), 'click', function () {
            var seed = U.fromHex(V.vault.state.identity.seed);
            D.text(D.$('key-value'), V.id.toRecoveryKey(seed));
            D.show(D.$('key-out'), true);
            D.toast(D.t('Escribela en papel. No le hagas una foto.'), 'bad');
        });

        D.on(D.$('btn-backup'), 'click', function () {
            var text = V.vault.exportBackup();
            if (!text) { D.toast(D.t('No hay nada que copiar todavia'), 'bad'); return; }
            D.download('bintio-copia.txt', text);
        });

        D.on(D.$('btn-panic'), 'click', function () {
            if (!window.confirm(D.t('Esto borra la identidad, los contactos y todos los mensajes de este aparato. Sin la Llave de Recuperacion no hay vuelta atras. Seguro?'))) { return; }
            if (!window.confirm(D.t('Ultima oportunidad. Borrar de verdad?'))) { return; }
            V.app.stop();
            V.vault.destroy();
            D.toast(D.t('Borrado. Este aparato ya no sabe nada de ti.'));
            setTimeout(function () { location.reload(); }, 900);
        });
    };
})(BINTIO);
