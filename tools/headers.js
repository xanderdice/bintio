/* ==========================================================================
   Cabeceras de seguridad: una sola fuente de verdad.

   Lo usan tres sitios y por eso vive aparte:
     - tools/serve.js          las manda en cada respuesta
     - tools/build.js          las escribe como configuracion lista para
                               Netlify, Apache y nginx dentro de dist/
     - tools/audit-headers.js  las comprueba de verdad, pidiendo la pagina

   El objetivo declarado es sacar A+ en el Observatorio de Mozilla, que puntua
   asi (base 100):
       CSP estricta con default-src 'none' y sin unsafe-*   +10
       Referrer-Policy privada                               +5
       Integridad de subrecursos (SRI)                       +5
       HSTS de seis meses o mas                              +5
       Falta X-Content-Type-Options                          -5
       Falta proteccion contra marcos                       -20
       Falta HSTS en un sitio https                         -20
       Sin redireccion de http a https                      -20
       CSP ausente                                          -25
   125 puntos es el techo, y 100 ya es A+.
   ========================================================================== */

/* La politica por defecto para todo lo que no es una pagina HTML.
   Las paginas traen la suya dentro, y serve.js la lee de ahi para que la
   cabecera y la etiqueta digan siempre lo mismo. */
var CSP_BASE =
    "default-src 'none'; " +
    "script-src 'self'; " +
    "style-src 'self'; " +
    "img-src 'self' data: blob:; " +
    "media-src 'self' blob: mediastream:; " +
    "connect-src 'self'; " +
    "font-src 'self'; " +
    "manifest-src 'self'; " +
    "worker-src 'self'; " +
    "base-uri 'none'; " +
    "form-action 'none'; " +
    "object-src 'none'";

/* frame-ancestors solo funciona como cabecera; dentro de una etiqueta meta el
   navegador lo ignora y ademas ensucia la consola. */
var FRAME_ANCESTORS = "frame-ancestors 'none'";

/* Permisos del navegador. Solo nombres reconocidos: una funcion inventada
   hace que Chrome escupa "Unrecognized feature" en la consola, que es
   justo el tipo de cabecera rara que no queremos.
   camera=(self) es obligatorio: sin eso no se puede leer un QR. */
var PERMISSIONS =
    'accelerometer=(), autoplay=(), camera=(self), display-capture=(), ' +
    'encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), ' +
    'magnetometer=(), microphone=(), midi=(), payment=(), usb=()';

function cspFor(html) {
    if (!html) { return CSP_BASE + '; ' + FRAME_ANCESTORS; }
    var m = String(html).match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/);
    return (m ? m[1] : CSP_BASE) + '; ' + FRAME_ANCESTORS;
}

/* opts: { tls: boolean, html: string|null } */
function securityHeaders(opts) {
    opts = opts || {};
    var h = {
        'Content-Security-Policy': cspFor(opts.html),
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': PERMISSIONS,
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cache-Control': 'no-cache'
    };
    /* HSTS solo tiene sentido sobre TLS: por http el navegador la ignora y
       anunciarla igualmente es ruido. */
    if (opts.tls) {
        h['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains; preload';
    }
    return h;
}

/* -------------------------------------------------------------------------
   Configuraciones listas para pegar en un alojamiento de verdad. Se escriben
   dentro de dist/ para que quien publique esto no tenga que adivinar nada.
   ------------------------------------------------------------------------- */
function deployConfigs(csp) {
    var list = [
        ['Content-Security-Policy', csp],
        ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
        ['X-Content-Type-Options', 'nosniff'],
        ['X-Frame-Options', 'DENY'],
        ['Referrer-Policy', 'no-referrer'],
        ['Permissions-Policy', PERMISSIONS],
        ['Cross-Origin-Opener-Policy', 'same-origin'],
        ['Cross-Origin-Resource-Policy', 'same-origin'],
        ['Cross-Origin-Embedder-Policy', 'require-corp']
    ];

    /* La aplicacion entera vive dentro de index.html y el trabajador de
       servicio se actualiza solo si el navegador ve un sw.js distinto. Sin
       decir nada de frescura, un alojamiento cualquiera deja al navegador
       inventarsela (suele ser un 10% de la edad del fichero), y durante esa
       ventana la peticion a la red del trabajador puede devolver el index
       VIEJO del disco... y guardarlo en cache como si fuera el nuevo. Dos
       lineas evitan que una version nueva se quede sin llegar. */
    var noCache = 'no-cache, must-revalidate';

    var netlify = '# Cabeceras de BINTIO para Netlify y Cloudflare Pages.\n' +
        '# Copiar este fichero a la raiz de lo publicado.\n/*\n' +
        list.map(function (p) { return '  ' + p[0] + ': ' + p[1]; }).join('\n') + '\n' +
        '\n# La aplicacion y su trabajador de servicio se piden siempre:\n' +
        '# son el mecanismo por el que llega una version nueva.\n' +
        '/index.html\n  Cache-Control: ' + noCache + '\n' +
        '/bintio.html\n  Cache-Control: ' + noCache + '\n' +
        '/sw.js\n  Cache-Control: ' + noCache + '\n';

    var htaccess = '# Cabeceras de BINTIO para Apache.\n<IfModule mod_headers.c>\n' +
        list.map(function (p) {
            return '  Header always set ' + p[0] + ' "' + p[1].replace(/"/g, '\\"') + '"';
        }).join('\n') +
        '\n</IfModule>\n\n' +
        '# La aplicacion y su trabajador de servicio se piden siempre.\n' +
        '<IfModule mod_headers.c>\n' +
        '  <FilesMatch "(index\\.html|bintio\\.html|sw\\.js)$">\n' +
        '    Header always set Cache-Control "' + noCache + '"\n' +
        '  </FilesMatch>\n</IfModule>\n\n' +
        '# Todo por https, que si no HSTS no sirve de nada.\n' +
        '<IfModule mod_rewrite.c>\n  RewriteEngine On\n' +
        '  RewriteCond %{HTTPS} off\n' +
        '  RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]\n</IfModule>\n';

    var nginx = '# Cabeceras de BINTIO para nginx. Va dentro del bloque server{}.\n' +
        list.map(function (p) {
            return 'add_header ' + p[0] + ' "' + p[1].replace(/"/g, '\\"') + '" always;';
        }).join('\n') +
        '\n\n# La aplicacion y su trabajador de servicio se piden siempre.\n' +
        'location ~* (index\\.html|bintio\\.html|sw\\.js)$ { add_header Cache-Control "' +
        noCache + '" always; }\n' +
        '\n# Y el redirector, en su propio server{}:\n' +
        '# server { listen 80; server_name _; return 301 https://$host$request_uri; }\n';

    return { netlify: netlify, htaccess: htaccess, nginx: nginx };
}

module.exports = {
    CSP_BASE: CSP_BASE,
    FRAME_ANCESTORS: FRAME_ANCESTORS,
    PERMISSIONS: PERMISSIONS,
    cspFor: cspFor,
    securityHeaders: securityHeaders,
    deployConfigs: deployConfigs
};
