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
            line.appendChild(D.make('span', rows[i][1] ? 'tag tag--ok' : 'tag tag--warn', rows[i][1] ? 'si' : 'no'));
            line.appendChild(document.createTextNode(' ' + rows[i][0]));
            el.appendChild(line);
        }
    }

    D.openSettings = function () {
        var st = V.vault.state, s = st.settings;

        D.$('me-name').value = V.app.identity.name || '';
        D.text(D.$('me-fingerprint'), V.app.identity.fingerprint);

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
                'Esta ventana no sale en ninguna captura ni grabacion de pantalla: lo impide Windows, ' +
                'no la pagina. Ademas tapa la conversacion cuando la ventana deja de estar delante y ' +
                'quita el menu del boton derecho. Una camara apuntando a la pantalla se lo lleva todo igual.');
        }
        /* Este va al reves que los otros dos: !== false los deja encendidos
           cuando la clave no existe, y este tiene que quedarse APAGADO en una
           boveda que se creo antes de que el buzon existiera. */
        D.$('set-inbox').checked = s.openInbox === true;
        D.$('set-stun').value = s.stun || '';

        var bag = V.mesh.bagSize();
        D.text(D.$('bag-info'), 'Ahora mismo llevas ' + bag.count + ' sobres ajenos (' +
            D.bytes(bag.bytes) + ') que no puedes leer.');

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

        D.show(D.$('key-out'), false);
        D.view('view-settings');
    };

    D.initSettings = function () {

        D.on(D.$('btn-settings'), 'click', function () { D.openSettings(); });
        D.on(D.$('btn-connect'), 'click', function () { D.openConnect(); });
        D.on(D.$('btn-settings-back'), 'click', function () { D.view('view-main'); });

        D.on(D.$('btn-save-name'), 'click', function () {
            var name = (D.$('me-name').value || '').replace(/^\s+|\s+$/g, '');
            if (!name) { D.toast('Ponte algun nombre', 'bad'); return; }
            V.vault.state.identity.name = name;
            V.app.identity.name = name;
            V.vault.saveNow();
            /* Avisar a los contactos para que vean el nombre nuevo. */
            var all = V.contacts.all();
            for (var i = 0; i < all.length; i++) { V.chat.sendProfile(all[i], name); }
            D.toast('Nombre guardado', 'ok');
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
                D.toast('Ajustes guardados. Habia ' + recuperadas +
                    (recuperadas === 1 ? ' solicitud esperando' : ' solicitudes esperando'), 'ok');
            } else {
                D.toast('Ajustes guardados', 'ok');
            }
        });

        D.on(D.$('btn-empty-bag'), 'click', function () {
            if (!window.confirm('Soltar todos los sobres ajenos que llevas? Algunos mensajes de otras personas podrian no llegar.')) { return; }
            V.mesh.bagClear();
            D.openSettings();
            D.refreshStatus();
            D.toast('Mochila vaciada');
        });

        D.on(D.$('btn-show-key'), 'click', function () {
            var seed = U.fromHex(V.vault.state.identity.seed);
            D.text(D.$('key-value'), V.id.toRecoveryKey(seed));
            D.show(D.$('key-out'), true);
            D.toast('Escribela en papel. No le hagas una foto.', 'bad');
        });

        D.on(D.$('btn-backup'), 'click', function () {
            var text = V.vault.exportBackup();
            if (!text) { D.toast('No hay nada que copiar todavia', 'bad'); return; }
            D.download('bintio-copia.txt', text);
        });

        D.on(D.$('btn-panic'), 'click', function () {
            if (!window.confirm('Esto borra la identidad, los contactos y todos los mensajes de este aparato. Sin la Llave de Recuperacion no hay vuelta atras. Seguro?')) { return; }
            if (!window.confirm('Ultima oportunidad. Borrar de verdad?')) { return; }
            V.app.stop();
            V.vault.destroy();
            D.toast('Borrado. Este aparato ya no sabe nada de ti.');
            setTimeout(function () { location.reload(); }, 900);
        });
    };
})(BINTIO);
