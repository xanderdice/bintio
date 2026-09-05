/* ==========================================================================
   Pintar y leer codigos QR.

   Pintar: siempre disponible, lo hace qr.js y aqui solo se convierte la
   matriz en un SVG.

   Leer: se usa BarcodeDetector, que viene de serie en los navegadores
   basados en Chromium (que son los que hay en la mayoria de moviles). Donde
   no exista, no se inventa nada: se le dice al usuario que pegue el codigo,
   que funciona en todas partes.
   ========================================================================== */
(function (V) {
    'use strict';
    var D = V.ui;

    var SVG_NS = 'http://www.w3.org/2000/svg';

    /* Niveles de correccion de errores, del que mas protege al que menos.
       Una tarjeta cabe de sobra en M. Una invitacion lleva un SDP entero
       dentro y hay veces que solo entra en L. Se prueban en este orden para
       no rebajar la correccion cuando no hace falta: bajar a L es peor para
       una camara temblando, asi que se hace solo si hace falta. */
    var NIVELES = ['M', 'L'];

    /* Y "hace falta" no es solo que no quepa. Un aparato con wifi, cable,
       VPN y IPv6 mete tantas candidatas de red en el SDP que el codigo se va
       a 109 modulos de lado: en el hueco de 340 px eso son 2,9 pixeles por
       modulo, y ahi ya no lo engancha ninguna camara. Bajar a L en ese caso
       quita bastantes modulos por el mismo texto, y un QR mas grueso que se
       lee vale mas que uno mas protegido que no. El corte esta en 101, que
       es la version 21: por debajo se queda en M. */
    var DEMASIADO_DENSO = 101;

    /* Devuelve true si ha podido pintarlo. Quien llama decide que contar si
       no cabe; aqui solo se deja dicho dentro del recuadro. */
    D.drawQr = function (container, text, label) {
        if (!container) { return false; }
        D.clear(container);

        var code = null;
        for (var n = 0; n < NIVELES.length && !code; n++) {
            try { code = V.qr.encode(text, { level: NIVELES[n] }); }
            catch (e) { code = null; }
            /* Cabe, pero tan apretado que no se va a poder escanear: se
               intenta el siguiente nivel, que da una matriz mas pequena. Si
               tampoco mejora, se queda con lo que haya. */
            if (code && code.size >= DEMASIADO_DENSO && n + 1 < NIVELES.length) {
                var suelto = null;
                try { suelto = V.qr.encode(text, { level: NIVELES[n + 1] }); }
                catch (e2) { suelto = null; }
                if (suelto && suelto.size < code.size) { code = suelto; }
            }
        }
        if (!code) {
            D.qrNote(container, 'Este codigo no cabe en un QR. Copialo y pasalo como texto: funciona igual.');
            return false;
        }

        var quiet = 4;
        var size = code.size + quiet * 2;
        var svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
        svg.setAttribute('shape-rendering', 'crispEdges');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', label || 'Codigo QR');

        var bg = document.createElementNS(SVG_NS, 'rect');
        bg.setAttribute('width', size);
        bg.setAttribute('height', size);
        bg.setAttribute('fill', '#ffffff');
        svg.appendChild(bg);

        /* Un solo camino en vez de mil rectangulos: mucho mas ligero de
           pintar en un movil viejo. */
        var d = '';
        for (var r = 0; r < code.size; r++) {
            for (var c = 0; c < code.size; c++) {
                if (code.modules[r][c]) {
                    d += 'M' + (c + quiet) + ' ' + (r + quiet) + 'h1v1h-1z';
                }
            }
        }
        var path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', d);
        path.setAttribute('fill', '#000000');
        svg.appendChild(path);
        container.appendChild(svg);
        return true;
    };

    /* Un texto en el hueco del QR. Va con su propia clase porque el recuadro
       es blanco pase lo que pase (un QR tiene que serlo) y el color del tema
       ahi dentro seria blanco sobre blanco. */
    D.qrNote = function (container, msg) {
        if (!container) { return; }
        D.clear(container);
        container.appendChild(D.make('div', 'qr-note', msg));
    };

    /* ---------------------------------------------------------------------
       Lectura por camara
       --------------------------------------------------------------------- */
    var stream = null, running = false, detector = null;

    /* Numero de encendido. Cada vez que se pide la camara sube uno, y cada vez
       que se apaga tambien. Sirve para lo unico que importa aqui: que una
       peticion vieja NO pueda encender la camara despues de que alguien haya
       dicho basta.

       Sin esto habia dos formas de dejarla encendida sin que se viera:

         - El permiso llega tarde. Se pulsa Escanear, el navegador pregunta, el
           usuario sale de la pantalla (stopScan apaga lo que hay, que todavia
           es nada) y despues concede el permiso. La promesa resolvia y
           encendia la camara en una pantalla que ya no se ve, sin ningun boton
           para apagarla.
         - Dos pulsaciones seguidas. El segundo getUserMedia pisaba la variable
           del primero y aquel flujo se quedaba encendido hasta cerrar la
           pestana.

       En una aplicacion que promete que nada sale del aparato, una camara
       encendida de mas no es un fallo de interfaz. */
    var gen = 0;

    D.canScan = function () {
        return typeof BarcodeDetector !== 'undefined' &&
               typeof navigator !== 'undefined' && navigator.mediaDevices &&
               navigator.mediaDevices.getUserMedia;
    };

    D.startScan = function (video, onFound, onError) {
        if (!D.canScan()) {
            onError(new Error('Este navegador no sabe leer QR. Pega el codigo a mano.'));
            return;
        }
        try { detector = new BarcodeDetector({ formats: ['qr_code'] }); }
        catch (e) { onError(e); return; }

        /* Se apaga lo que hubiera antes de pedir nada mas: dos pulsaciones
           seguidas no pueden dejar dos camaras abiertas. */
        D.stopScan(video);
        var mia = ++gen;

        navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }, audio: false
        }).then(function (s) {
            /* Ha llegado tarde: mientras el usuario decidia, esta pantalla se
               cerro o se pidio otra camara. Se apaga la que acaban de darnos
               en vez de encenderla a espaldas de nadie. */
            if (mia !== gen) {
                var t = s.getTracks();
                for (var i = 0; i < t.length; i++) { t[i].stop(); }
                return;
            }
            stream = s;
            video.srcObject = s;
            video.play();
            running = true;
            tick(video, onFound);
        })['catch'](function (e) {
            if (mia !== gen) { return; }
            onError(new Error('No se pudo abrir la camara: ' + e.message));
        });
    };

    function tick(video, onFound) {
        if (!running) { return; }
        /* Con la ventana tapada no hay nada que leer. La camara sigue abierta
           -cerrarla obligaria a volver a pedir permiso al volver- pero el
           analisis de imagen, que es lo caro, se queda parado. */
        if (document.hidden === true) {
            setTimeout(function () { tick(video, onFound); }, 500);
            return;
        }
        detector.detect(video).then(function (codes) {
            if (!running) { return; }
            if (codes && codes.length) {
                var value = codes[0].rawValue;
                if (value) { onFound(value); return; }
            }
            setTimeout(function () { tick(video, onFound); }, 220);
        })['catch'](function () {
            if (running) { setTimeout(function () { tick(video, onFound); }, 500); }
        });
    }

    D.stopScan = function (video) {
        /* Sube el numero: cualquier peticion de camara que siga en el aire
           queda invalidada y se apagara sola al llegar. */
        gen++;
        running = false;
        if (stream) {
            var tracks = stream.getTracks();
            for (var i = 0; i < tracks.length; i++) { tracks[i].stop(); }
            stream = null;
        }
        if (video) { video.srcObject = null; }
    };
})(BINTIO);
