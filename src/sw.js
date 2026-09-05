/* ==========================================================================
   Trabajador de servicio (service worker).

   Solo hace una cosa: guardar la aplicacion en el aparato para que abra sin
   conexion y sin volver a pedir nada a nadie. NO toca mensajes, NO guarda
   datos del usuario y NO habla con ningun servidor.

   Desde que la aplicacion viaja entera dentro de index.html, lo que guarda es
   UN fichero: ese. Es tambien lo unico que hay que guardar.

   La lista y la version las escribe tools/build.js al compilar.
   ========================================================================== */
var CACHE = 'bintio-__VERSION__';
var FILES = __FILES__;

self.addEventListener('install', function (ev) {
    ev.waitUntil(
        caches.open(CACHE).then(function (c) { return c.addAll(FILES); })
            .then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (ev) {
    ev.waitUntil(
        caches.keys().then(function (names) {
            return Promise.all(names.map(function (n) {
                return n === CACHE ? null : caches['delete'](n);
            }));
        }).then(function () { return self.clients.claim(); })
    );
});

/* La pagina se pide SIEMPRE a la red primero, y solo se tira de cache si no
   hay conexion.

   No es una preferencia. La pagina declara en su CSP el hash sha256 de su
   propio codigo, asi que el documento y el codigo tienen que ser SIEMPRE la
   misma version: van dentro del mismo fichero, y pidiendolo a la red se
   actualiza en cuanto hay una version nueva. Si se sirviera de cache primero,
   quien ya tuviera la aplicacion guardada seguiria viendo la version vieja
   hasta vaciar la cache a mano.

   Lo demas (la tarjeta social, robots.txt) si va de cache primero. No es la
   aplicacion y no pasa nada por servirlo del aparato. */
function esDocumento(req) {
    return req.mode === 'navigate' ||
           req.destination === 'document' ||
           (req.headers.get('accept') || '').indexOf('text/html') >= 0;
}

/* Y lo que es la aplicacion, que no es todo lo que hay en la carpeta.

   Desde que TODO se resuelve en dist/, los siete ejecutables de escritorio y el
   paquete viven al lado del index.html. Quien publique esa carpeta tal cual
   estaria dandole a cada visitante que se baje el .exe dos megas y medio
   guardados en su navegador para siempre, sin haberlo pedido nadie.

   Y hay que preguntarlo SIEMPRE, tambien en las navegaciones. Bajarse un
   ejecutable pinchando un enlace no es una subpeticion: es una navegacion de
   primer nivel, con mode 'navigate' y text/html en el Accept. Esto estuvo un
   rato preguntandose solo cuando la peticion NO era un documento, o sea en
   todos los casos menos en el unico que lo motivaba: el .exe entraba en la
   cache por la rama de documento, y sin conexion esa misma rama devolvia el
   index.html entero con el nombre del ejecutable.

   La raiz cuenta como aplicacion (es el documento), y los binarios de Linux y
   macOS, que no llevan extension ninguna, no: por eso no vale la regla facil
   de "si no tiene punto, es una pagina". */
function esDeLaApp(req) {
    var ruta;
    try { ruta = new URL(req.url).pathname; } catch (e) { return false; }
    if (ruta === '/' || /\/$/.test(ruta)) { return true; }
    return /\.(?:html|css|js|png|svg|webmanifest|txt|ico)$/.test(ruta);
}

self.addEventListener('fetch', function (ev) {
    var req = ev.request;
    if (req.method !== 'GET') { return; }
    /* Nada de fuera: si no es nuestro, ni lo miramos. */
    if (new URL(req.url).origin !== self.location.origin) { return; }
    /* Ni nada que no sea la aplicacion, sea documento o no. */
    if (!esDeLaApp(req)) { return; }

    if (esDocumento(req)) {
        ev.respondWith(
            fetch(req).then(function (res) {
                /* Y solo se guarda si lo que ha llegado es de verdad una pagina:
                   la ruta ya se ha filtrado arriba, pero el que decide que sirve
                   en cada direccion es el servidor, no nosotros. */
                if (res && res.status === 200 && res.type === 'basic' &&
                    (res.headers.get('content-type') || '').indexOf('text/html') >= 0) {
                    var copy = res.clone();
                    caches.open(CACHE).then(function (c) { c.put(req, copy); });
                }
                return res;
            })['catch'](function () {
                return caches.match(req).then(function (hit) {
                    return hit || caches.match('index.html');
                });
            })
        );
        return;
    }

    ev.respondWith(
        caches.match(req).then(function (hit) {
            if (hit) { return hit; }
            return fetch(req).then(function (res) {
                if (res && res.status === 200 && res.type === 'basic') {
                    var copy = res.clone();
                    caches.open(CACHE).then(function (c) { c.put(req, copy); });
                }
                return res;
            })['catch'](function () {
                return caches.match('index.html');
            });
        })
    );
});
