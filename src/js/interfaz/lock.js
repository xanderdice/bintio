/* ==========================================================================
   Pantalla de acceso: crear identidad, abrir la boveda o recuperar.

   Los textos van sin acentos, como en todo el proyecto, pero la ene con
   virgulilla si se escribe: "ano" y "anio" no son la misma palabra. Se
   pone con el escape \u00f1 en vez de con la letra suelta, para que el
   fichero siga siendo ASCII puro y no dependa de que nadie lo guarde con
   la codificacion equivocada. En el HTML se hace igual, con &ntilde;.
   ========================================================================== */
(function (V) {
    'use strict';
    var D = V.ui, U = V.util;

    function bar(id, value) {
        var el = D.$(id);
        if (el && el.firstChild) { el.firstChild.style.width = Math.round(value * 100) + '%'; }
    }

    function busy(on) {
        var ids = ['btn-create', 'btn-open', 'btn-restore'];
        for (var i = 0; i < ids.length; i++) {
            var b = D.$(ids[i]);
            if (b) { b.disabled = !!on; }
        }
    }

    /* La pantalla de acceso tiene cuatro bloques y siempre se ve UNO. Estaban
       listados en tres sitios distintos -abrir, recuperar y empezar de cero- y
       cada sitio tenia que acordarse de apagar los otros tres; el bloque de
       "empezar de cero", al anadirse, se olvido en dos de ellos y salia encima
       del formulario de contrasena. Con la lista en un solo sitio eso no puede
       volver a pasar. */
    var BLOQUES = ['lock-new', 'lock-open', 'lock-restore', 'lock-wipe'];

    function soloBloque(cual) {
        for (var i = 0; i < BLOQUES.length; i++) {
            D.show(D.$(BLOQUES[i]), BLOQUES[i] === cual);
        }
    }

    /* Vaciar todo lo que se escribio en la pantalla de acceso.

       Los campos ocultos NO se vacian solos: un display:none deja el valor
       dentro. Asi, tras cerrar la boveda, la contrasena seguia en new-pass o en
       restore-pass y la Llave de Recuperacion en restore-key, en claro,
       legibles desde la consola o una extension -y esa contrasena vuelve a
       abrir la boveda-. El cierre con contrasena no protege nada si la
       contrasena se queda en el DOM. Se llama al entrar en la pantalla y al
       terminar cada intento, salga bien o mal. */
    var CAMPOS = ['new-name', 'new-pass', 'new-pass2', 'open-pass', 'restore-key', 'restore-pass'];
    function limpiarCampos() {
        for (var i = 0; i < CAMPOS.length; i++) {
            var el = D.$(CAMPOS[i]);
            if (el) { el.value = ''; }
        }
    }

    D.showLock = function () {
        limpiarCampos();
        var exists = V.vault.exists();
        soloBloque(exists ? 'lock-open' : 'lock-new');
        D.view('view-lock');
        /* Si ya existe la bóveda muestra el nombre del usuario para que no
           sea un dato sin contexto. */
        var elName = D.$('identity-name');
        if (elName) {
            try {
                if (exists && V.vault.state.identity && V.vault.state.identity.name) {
                    elName.textContent = V.vault.state.identity.name;
                } else {
                    elName.textContent = '';
                }
            } catch (e) { /* ignore */ }
        }
        var f = D.$(exists ? 'open-pass' : 'new-name');
        if (f) { try { f.focus(); } catch (e) {} }
    };

    function opened() {
        /* Ya estamos dentro: no queda ninguna razon para conservar la
           contrasena ni la llave escritas en la pantalla de acceso. */
        limpiarCampos();
        D.applySettings();
        V.app.start();
        D.view('view-main');
        D.refreshRoster();
        D.refreshStatus();
    };

    D.initLock = function () {

        D.on(D.$('btn-create'), 'click', function () {
            var name = (D.$('new-name').value || '').replace(/^\s+|\s+$/g, '');
            var p1 = D.$('new-pass').value, p2 = D.$('new-pass2').value;
            if (p1.length < 8) { D.toast(D.t('La contrase\u00f1a necesita ocho caracteres como minimo'), 'bad'); return; }
            if (p1 !== p2) { D.toast(D.t('Las dos contrase\u00f1as no coinciden'), 'bad'); return; }
            busy(true);
            V.vault.create(p1, function (p) { bar('new-bar', p); }, function (err) {
                busy(false);
                if (err) { D.toast(err.message, 'bad'); return; }
                if (name) {
                    var fresh = V.id.create();
                    V.vault.state.identity = { seed: U.toHex(fresh.seed), name: name };
                }
                V.vault.saveNow();
                opened();
                D.toast(D.t('Identidad creada. Guarda tu Llave de Recuperacion desde Ajustes.'), 'ok');
            });
        });

        D.on(D.$('btn-open'), 'click', function () {
            var pass = D.$('open-pass').value;
            if (!pass) { return; }
            busy(true);
            V.vault.unlock(pass, function (p) { bar('open-bar', p); }, function (err) {
                busy(false);
                bar('open-bar', 0);
                if (err) { D.toast(err.message, 'bad'); return; }
                D.$('open-pass').value = '';
                opened();
            });
        });

        D.on(D.$('open-pass'), 'keydown', function (ev) {
            if (ev.keyCode === 13) { D.$('btn-open').click(); }
        });

        function showRestore() { soloBloque('lock-restore'); }
        D.on(D.$('btn-show-restore'), 'click', showRestore);
        D.on(D.$('btn-show-restore2'), 'click', showRestore);
        D.on(D.$('btn-restore-cancel'), 'click', function () { D.showLock(); });

        /* ------------------------------------------------- empezar de cero

           La unica salida cuando se ha perdido la contrasena y no hay copia.
           No la pide -seria absurdo pedir justo lo que no se tiene- y por eso
           mismo la pregunta se hace despacio y en pantalla completa.

           Que no pida contrasena tiene un precio y conviene decirlo: cualquiera
           que coja el aparato desbloqueado puede borrarlo. No puede LEER nada,
           que es lo que esta aplicacion protege, pero si puede destruirlo. A
           cambio, sin esto una boveda que no se abre convierte el aparato en un
           ladrillo para siempre, porque aqui no hay ningun servidor que
           restablezca nada. */
        D.on(D.$('btn-show-wipe'), 'click', function () { soloBloque('lock-wipe'); });

        D.on(D.$('btn-wipe-no'), 'click', function () { D.showLock(); });

        D.on(D.$('btn-wipe-yes'), 'click', function () {
            /* Por si la boveda estuviera abierta: parar antes de borrar, para
               que no quede un reloj de mantenimiento escribiendo en algo que
               ya no existe. En la pantalla de acceso no lo esta, y por eso va
               protegido en vez de darlo por hecho. */
            try { V.app.stop(); } catch (e) {}
            V.vault.destroy();
            D.toast(D.t('Borrado. Este aparato ya no sabe nada de ti.'));
            /* Se recarga en vez de repintar: asi no queda ni un contacto en la
               cache de memoria, ni un sobre visto en la malla, ni un enlace
               abierto de la sesion anterior. Empezar de cero de verdad. */
            setTimeout(function () { location.reload(); }, 900);
        });

        D.on(D.$('btn-restore'), 'click', function () {
            var text = (D.$('restore-key').value || '').replace(/^\s+|\s+$/g, '');
            var pass = D.$('restore-pass').value;
            if (!text) { D.toast(D.t('Pega la llave o la copia'), 'bad'); return; }
            if (pass.length < 8) { D.toast(D.t('La contrase\u00f1a necesita ocho caracteres'), 'bad'); return; }
            busy(true);

            /* Una copia completa empieza por V1. ; cualquier otra cosa se
               intenta leer como Llave de Recuperacion. */
            if (text.substr(0, 3) === 'V1.') {
                V.vault.importBackup(text, pass, function (p) { bar('restore-bar', p); }, function (err) {
                    busy(false);
                    if (err) { D.toast(err.message, 'bad'); return; }
                    opened();
                    D.toast(D.t('Copia restaurada'), 'ok');
                });
                return;
            }

            var identity = V.id.fromRecoveryKey(text);
            if (!identity) {
                busy(false);
                D.toast(D.t('Esa llave no es valida (mira si falta algun caracter)'), 'bad');
                return;
            }
            V.vault.create(pass, function (p) { bar('restore-bar', p); }, function (err) {
                busy(false);
                if (err) { D.toast(err.message, 'bad'); return; }
                V.vault.state.identity = {
                    seed: U.toHex(identity.seed),
                    name: V.id.suggestName(identity.pk)
                };
                V.vault.saveNow();
                opened();
                D.toast(D.t('Identidad recuperada. Los contactos hay que volver a a\u00f1adirlos.'), 'ok');
            });
        });

        D.on(D.$('btn-lock'), 'click', function () {
            V.app.stop();
            /* La Llave de Recuperacion pudo quedar pintada en Ajustes: fuera
               antes de soltar la pantalla, que cerrar es cerrar. */
            D.clear(D.$('key-value'));
            D.showLock();      /* limpia los campos: ver limpiarCampos() */
            /* Que la barra de abajo se vacie YA, no en el siguiente repaso de
               los cuatro segundos: hasta entonces seguirian ahi los contactos
               y el tamano de la boveda de quien acaba de cerrar. */
            D.refreshStatus();
            D.toast(D.t('Cerrado. Hace falta la contrase\u00f1a para volver a entrar.'));
        });
    };
})(BINTIO);
