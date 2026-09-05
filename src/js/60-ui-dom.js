/* ==========================================================================
   Interfaz: utilidades de pantalla.

   A partir de aqui empieza la parte que toca el DOM. Ningun fichero 6x hace
   criptografia ni habla con la red: pide las cosas al controlador (50-app) y
   pinta lo que le devuelve.
   ========================================================================== */
(function (V) {
    'use strict';
    var D = V.ui;

    D.$ = function (id) { return document.getElementById(id); };

    D.on = function (el, evt, fn) {
        if (!el) { return; }
        if (el.addEventListener) { el.addEventListener(evt, fn, false); }
        else if (el.attachEvent) { el.attachEvent('on' + evt, fn); }   /* navegadores muy viejos */
    };

    /* Se quita siempre antes de poner, para que llamarla veinte veces no deje
       veinte veces la palabra "hidden" en el atributo. */
    D.show = function (el, yes) {
        if (!el) { return; }
        var base = el.className.replace(/\bhidden\b/g, '').replace(/\s+/g, ' ').replace(/^ | $/g, '');
        el.className = (yes === false) ? (base + ' hidden') : base;
    };

    D.text = function (el, s) { if (el) { el.textContent = String(s); } };

    D.clear = function (el) { while (el && el.firstChild) { el.removeChild(el.firstChild); } };

    /* Crear nodos sin innerHTML: asi ningun texto de otra persona puede
       convertirse en etiquetas dentro de nuestra pagina. */
    D.make = function (tag, cls, text) {
        var el = document.createElement(tag);
        if (cls) { el.className = cls; }
        if (text !== undefined && text !== null) { el.textContent = String(text); }
        return el;
    };

    /* ------------------------------------------------------------- vistas */
    var VIEWS = ['view-boot', 'view-lock', 'view-main', 'view-connect', 'view-peer',
                 'view-requests', 'view-settings'];
    D.current = 'view-boot';

    D.view = function (name) {
        for (var i = 0; i < VIEWS.length; i++) {
            var el = D.$(VIEWS[i]);
            if (!el) { continue; }
            el.className = 'view' + (VIEWS[i] === name ? ' is-active' : '');
        }
        D.current = name;
        /* Cada vista se abre por arriba. Sin esto se hereda el desplazamiento
           de la vez anterior: se sale de Conectar con la pagina abajo del todo
           y al volver a entrar lo primero que se ve es el final, con el titulo
           y el codigo fuera de pantalla. Parecia que faltaba media pantalla. */
        var hoja = D.$(name) ? D.$(name).querySelector('.sheet') : null;
        if (hoja) { hoja.scrollTop = 0; }
        var inApp = (name !== 'view-boot' && name !== 'view-lock');
        D.show(D.$('btn-connect'), inApp);
        D.show(D.$('btn-settings'), inApp);
        D.show(D.$('btn-lock'), inApp);
        if (D.onViewChange) { D.onViewChange(name); }
    };

    /* ------------------------------------------------------------- avisos */
    D.toast = function (msg, kind) {
        var box = D.$('toasts');
        if (!box) { return; }
        var t = D.make('div', 'toast' + (kind ? ' toast--' + kind : ''), msg);
        box.appendChild(t);
        setTimeout(function () {
            if (t.parentNode) { t.parentNode.removeChild(t); }
        }, kind === 'bad' ? 5200 : 3200);
    };

    /* ------------------------------------------------------- portapapeles */
    D.copy = function (text) {
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                D.toast('Copiado', 'ok');
            })['catch'](function () { legacyCopy(text); });
            return;
        }
        legacyCopy(text);
    };
    function legacyCopy(text) {
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', 'readonly');
            ta.className = 'code';
            document.body.appendChild(ta);
            ta.select();
            var ok = document.execCommand && document.execCommand('copy');
            document.body.removeChild(ta);
            D.toast(ok ? 'Copiado' : 'Copialo a mano desde el recuadro', ok ? 'ok' : null);
        } catch (e) {
            D.toast('Copialo a mano desde el recuadro');
        }
    }

    D.share = function (text, title) {
        if (typeof navigator !== 'undefined' && navigator.share) {
            navigator.share({ title: title || 'BINTIO', text: text })['catch'](function () {});
            return true;
        }
        D.copy(text);
        return false;
    };

    D.download = function (filename, text) {
        try {
            var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
            D.toast('Copia descargada', 'ok');
        } catch (e) {
            D.toast('Tu navegador no deja descargar. Copia el texto a mano.', 'bad');
        }
    };

    /* -------------------------------------------------------- formateo */
    function two(n) { return n < 10 ? '0' + n : '' + n; }

    D.time = function (ts) {
        var d = new Date(ts);
        return two(d.getHours()) + ':' + two(d.getMinutes());
    };
    D.day = function (ts) {
        var d = new Date(ts), hoy = new Date();
        if (d.toDateString() === hoy.toDateString()) { return 'Hoy'; }
        var ayer = new Date(hoy.getTime() - 86400000);
        if (d.toDateString() === ayer.toDateString()) { return 'Ayer'; }
        return two(d.getDate()) + '/' + two(d.getMonth() + 1) + '/' + d.getFullYear();
    };
    D.ago = function (ts) {
        if (!ts) { return ''; }
        var s = Math.floor((Date.now() - ts) / 1000);
        if (s < 90) { return 'ahora'; }
        if (s < 3600) { return Math.floor(s / 60) + ' min'; }
        if (s < 86400) { return Math.floor(s / 3600) + ' h'; }
        return Math.floor(s / 86400) + ' d';
    };
    D.bytes = function (n) {
        if (n < 1024) { return n + ' B'; }
        if (n < 1048576) { return Math.round(n / 1024) + ' KB'; }
        return (n / 1048576).toFixed(1) + ' MB';
    };
})(BINTIO);
