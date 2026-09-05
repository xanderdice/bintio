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
                 'view-group', 'view-requests', 'view-settings'];
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
        /* La barra de arriba y lo que lleva: son de dentro de la aplicacion.
           En el arranque y en la portada no hay nada que poner en ellos, y el
           nombre lo dice la portada en grande. */
        var inApp = (name !== 'view-boot' && name !== 'view-lock');
        D.show(D.$('menubar'), inApp);
        D.show(D.$('btn-connect'), inApp);
        D.show(D.$('btn-settings'), inApp);
        D.show(D.$('btn-lock'), inApp);
        if (D.onViewChange) { D.onViewChange(name); }
    };

    /* Si esta persona cuenta como conectada.

       Dos minutos desde lo ultimo que llego suyo. El numero estaba escrito dos
       veces -en la lista y en la cabecera de la conversacion- y cada copia
       decidia por su cuenta lo mismo: cambiar el criterio obligaba a acordarse
       de los dos sitios, y el punto verde de la lista podia acabar diciendo
       una cosa y el de arriba otra. */
    var EN_LINEA_MS = 120000;

    D.enLinea = function (contact) {
        return !!(contact && contact.lastSeen && (Date.now() - contact.lastSeen < EN_LINEA_MS));
    };

    /* ------------------------------------------------------------- vinculo

       El estado del vinculo con una persona, en un icono. Son dos anillos: si
       se tocan hay cadena, si estan separados no la hay.

       Tres estados y no dos, porque "no hay vinculo" tiene dos causas muy
       distintas y confundirlas hace que la gente crea que la aplicacion falla:

         vinculado    ha llegado algo suyo y se ha podido abrir, o sea que esta
                      persona te tiene dada de alta. Es lo unico que demuestra
                      que lo que escribas le va a llegar.
         a medias     todavia no ha llegado nada suyo. Puede que no te haya
                      anadido, o puede que aun no os hayais cruzado.
         te ha quitado  te lo ha dicho el. Ya no hay nada que esperar.

       Devuelve un nodo listo para colgar al lado del nombre. */
    /* Que dice cada estado, con todas las letras.

       Vive aqui y no en dos sitios porque estaba escrito DOS veces -una para el
       globo del icono y otra para la ficha de la persona- con la misma idea y
       distintas palabras. Eran seis frases que traducir en vez de tres, seis
       que corregir si cambia el tono, y la puerta abierta a que el globo y la
       ficha dijeran cosas distintas del mismo contacto.

       Se pregunta por las propiedades del contacto y no por la cadena de
       estado de aqui abajo, a proposito: dentro de un D.t(), un 'on' suelto en
       la comparacion lo recoge test/frases.js como si fuera una frase que
       traducir. */
    D.vinculoTexto = function (contact) {
        return D.t(contact.mutuo
            ? 'Vinculado: te tiene anadido, asi que lo que le escribas lo puede abrir.'
            : contact.unlinked
                ? 'Te ha quitado de sus contactos. Lo que le escribas ya no lo puede abrir.'
                : 'Sin vinculo todavia: no ha llegado nada suyo. Hasta que te anada, no puede abrir lo que le escribas.');
    };

    D.vinculo = function (contact) {
        var estado = contact.mutuo ? 'on' : (contact.unlinked ? 'cut' : 'wait');
        var el = D.make('span', 'lnk lnk--' + estado);
        /* Estos son los unicos title de toda la aplicacion, y ademas se copian
           a aria-label ahi abajo: antes iban en espanol crudo, asi que el
           lector de pantalla los decia en espanol aunque la pagina estuviera
           en ingles. */
        el.title = D.vinculoTexto(contact);
        el.setAttribute('aria-label', el.title);
        return el;
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
                D.toast(D.t('Copiado'), 'ok');
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
            D.toast(D.t(ok ? 'Copiado' : 'Copialo a mano desde el recuadro'), ok ? 'ok' : null);
        } catch (e) {
            D.toast(D.t('Copialo a mano desde el recuadro'));
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
            D.toast(D.t('Copia descargada'), 'ok');
        } catch (e) {
            D.toast(D.t('Tu navegador no deja descargar. Copia el texto a mano.'), 'bad');
        }
    };

    /* -------------------------------------------------------- formateo */
    function two(n) { return n < 10 ? '0' + n : '' + n; }

    D.time = function (ts) {
        var d = new Date(ts);
        return two(d.getHours()) + ':' + two(d.getMinutes());
    };
    /* La fecha del separador de dias. Las dos palabras que salen -hoy y ayer-
       se traducen; el formato numerico se deja en dia/mes/ano, que es el de
       aqui y no depende del idioma de la interfaz sino de donde estas. */
    D.day = function (ts) {
        var d = new Date(ts), hoy = new Date();
        if (d.toDateString() === hoy.toDateString()) { return D.t('Hoy'); }
        var ayer = new Date(hoy.getTime() - 86400000);
        if (d.toDateString() === ayer.toDateString()) { return D.t('Ayer'); }
        return two(d.getDate()) + '/' + two(d.getMonth() + 1) + '/' + d.getFullYear();
    };

    /* Cuanto hace, en corto: cabe en la esquina de una fila de la lista. Las
       abreviaturas tambien cambian de idioma -en ingles no se dice "3 d"- y por
       eso van con hueco y no pegando el numero a una letra. */
    D.ago = function (ts) {
        if (!ts) { return ''; }
        var s = Math.floor((Date.now() - ts) / 1000);
        if (s < 90) { return D.t('ahora'); }
        if (s < 3600) { return D.t('{n} min', { n: Math.floor(s / 60) }); }
        if (s < 86400) { return D.t('{n} h', { n: Math.floor(s / 3600) }); }
        return D.t('{n} d', { n: Math.floor(s / 86400) });
    };
    D.bytes = function (n) {
        if (n < 1024) { return n + ' B'; }
        if (n < 1048576) { return Math.round(n / 1024) + ' KB'; }
        return (n / 1048576).toFixed(1) + ' MB';
    };
})(BINTIO);
