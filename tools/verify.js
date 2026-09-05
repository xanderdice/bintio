/* ==========================================================================
   Auditoria de lo compilado.

   Comprueba sobre el resultado real, no sobre las intenciones:
     - que dist/index.html lleva DENTRO todo lo que ensena (estilos, codigo,
       logos y manifiesto) y no pide un solo fichero a nadie,
     - que los hashes de su politica de seguridad cuadran con su contenido,
     - que no hay rastreadores, ni eval, ni manejadores ni estilos en linea,
     - que el minificado de verdad renombro variables y que lo publicado
       sigue siendo ES5, para que arranque en cualquier navegador,
     - que la ficha, la tarjeta social y el manifiesto estan donde tienen que
       estar para que se pueda instalar y se vea bien al compartirla.

   Si algo de esto falla, no se publica.
   ========================================================================== */
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var DIST = path.join(__dirname, '..', 'dist');
var fails = 0, checks = 0;

function ok(name, cond, extra) {
    checks++;
    if (cond) { console.log('  ok  ' + name); }
    else { fails++; console.log('  FALLA ' + name + (extra ? '  -> ' + extra : '')); }
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.log('No hay nada compilado. Ejecuta antes: npm run build');
    process.exit(1);
}

var page = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
var copia = fs.existsSync(path.join(DIST, 'bintio.html'))
    ? fs.readFileSync(path.join(DIST, 'bintio.html'), 'utf8') : '';

function sha256b64(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('base64');
}

var csp = (page.match(/Content-Security-Policy" content="([^"]*)"/) || [])[1] || '';
var appJs = (page.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
var appCss = (page.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';

/* ------------------------------------------------------------ todo dentro */
console.log('Un solo fichero (dist/index.html)');

ok('lleva su codigo dentro', appJs.length > 10000);
ok('lleva sus estilos dentro', appCss.length > 5000);
/* El logo va incrustado en tres sitios y los tres hacen falta: la pestana
   pide uno pequeno, la instalacion uno grande, y la interfaz lo pinta desde
   los estilos. Si alguno se quedara fuera, la pagina seguiria funcionando y
   pediria una imagen a la red, que es lo unico que aqui no puede pasar. */
ok('lleva el logo de la pestana dentro',
   /<link rel="icon" type="image\/png" sizes="32x32" href="data:image\/png;base64,/.test(page));
ok('lleva el logo de la pestana en doble densidad',
   /<link rel="icon" type="image\/png" sizes="64x64" href="data:image\/png;base64,/.test(page));
ok('lleva el logo de la interfaz en los estilos',
   /--logo:url\("data:image\/png;base64,/.test(appCss));
ok('lleva el icono de iOS dentro', /<link rel="apple-touch-icon"[^>]*href="data:image\/png/.test(page));
ok('lleva el manifiesto dentro', /<link rel="manifest" href="data:application\/manifest\+json/.test(page));

/* Cualquier src o href que no sea data: seria una llamada al exterior. El
   enlace canonico no cuenta: no se descarga, solo dice donde vive la pagina. */
var refs = page.replace(/<link rel="canonical"[^>]*>/g, '').match(/(?:src|href)="([^"]*)"/g) || [];
var externas = refs.filter(function (r) {
    var v = r.split('"')[1];
    return v && v.indexOf('data:') !== 0 && v.indexOf('#') !== 0 && v !== '';
});
ok('no pide un solo fichero a nadie', externas.length === 0, externas.join(' '));
ok('bintio.html es exactamente el mismo fichero', copia === page);

/* ------------------------------------------------------------- politica */
console.log('Politica de seguridad');
ok('la CSP fija el hash de su propio codigo',
   csp.indexOf("script-src 'sha256-" + sha256b64(appJs) + "'") >= 0);
ok('la CSP fija el hash de sus propios estilos',
   csp.indexOf("style-src 'sha256-" + sha256b64(appCss) + "'") >= 0);
ok('la CSP no permite nada por defecto', csp.indexOf("default-src 'none'") === 0);
ok('la CSP no usa unsafe-inline ni unsafe-eval', csp.indexOf('unsafe-') < 0);
ok('la CSP prohibe objetos y formularios',
   csp.indexOf("object-src 'none'") >= 0 && csp.indexOf("form-action 'none'") >= 0);
ok('la CSP deja registrar el trabajador de servicio', csp.indexOf("worker-src 'self'") >= 0);
ok('la CSP acepta el manifiesto incrustado', /manifest-src[^;]*data:/.test(csp));

/* -------------------------------------------------------------- documento */
console.log('HTML minificado');
ok('sin un solo comentario', page.indexOf('<!--') < 0);
ok('en una sola linea', page.split('\n').length <= 2, page.split('\n').length + ' lineas');
ok('sin saltos de linea sueltos entre etiquetas', !/>\s*\n\s*</.test(page));
ok('sin manejadores en linea', !/ on[a-z]+="/.test(page));
ok('sin estilos en linea', !/ style="/.test(page));

/* ---------------------------------------------------------------- ficha */
console.log('Ficha y redes sociales');
function meta(html, attr, name) {
    var re = new RegExp('<meta ' + attr + '="' + name + '" content="([^"]*)"');
    return (html.match(re) || [])[1] || '';
}
ok('descripcion para buscadores', meta(page, 'name', 'description').length > 60);
ok('autor y palabras clave', !!meta(page, 'name', 'author') && !!meta(page, 'name', 'keywords'));
ok('robots deja indexar y pide vista previa grande',
   /index/.test(meta(page, 'name', 'robots')) && /max-image-preview/.test(meta(page, 'name', 'robots')));
ok('titulo con la promesa, no solo la marca', /<title>[^<]{25,}<\/title>/.test(page));
ok('Open Graph completo',
   !!meta(page, 'property', 'og:title') && !!meta(page, 'property', 'og:description') &&
   !!meta(page, 'property', 'og:image') && meta(page, 'property', 'og:type') === 'website');
ok('la vista previa declara 1200x630',
   meta(page, 'property', 'og:image:width') === '1200' &&
   meta(page, 'property', 'og:image:height') === '630');
ok('tarjeta de Twitter grande',
   meta(page, 'name', 'twitter:card') === 'summary_large_image' && !!meta(page, 'name', 'twitter:image'));

/* Un PNG dice su tamano en los ocho bytes que siguen a la cabecera IHDR. */
var social = path.join(DIST, 'social.png');
ok('la imagen social existe', fs.existsSync(social));
if (fs.existsSync(social)) {
    var spng = fs.readFileSync(social);
    ok('y es un PNG de 1200x630 de verdad',
       spng.readUInt32BE(16) === 1200 && spng.readUInt32BE(20) === 630,
       spng.readUInt32BE(16) + 'x' + spng.readUInt32BE(20));
}
ok('robots.txt generado', fs.existsSync(path.join(DIST, 'robots.txt')));

/* ------------------------------------------------------------- privacidad */
console.log('Privacidad y seguridad del codigo');
var TRACKERS = ['google-analytics', 'googletagmanager', 'facebook.net', 'doubleclick',
                'hotjar', 'segment.io', 'sentry.io', 'mixpanel', 'analytics', 'gtag',
                'fbq(', 'plausible', 'matomo', 'clarity.ms'];
var found = TRACKERS.filter(function (t) { return appJs.indexOf(t) >= 0; });
ok('cero rastreadores', found.length === 0, found.join(' '));

var urls = appJs.match(/https?:\/\/[a-zA-Z0-9.-]+/g) || [];
var externalUrls = urls.filter(function (u) {
    return u.indexOf('http://www.w3.org') !== 0;   /* el espacio de nombres de SVG no es una peticion */
});
ok('ninguna direccion de internet incrustada', externalUrls.length === 0, externalUrls.join(' '));

ok('no usa eval', appJs.indexOf('eval(') < 0);
ok('no usa Function como constructor', !/new Function\s*\(/.test(appJs));

/* La defensa de fondo contra XSS no es la politica de seguridad: es no tener
   nunca una via para convertir texto en etiquetas. Si alguna de estas
   aparece, un nombre de contacto o un mensaje recibido podria inyectar HTML
   y la CSP seria lo unico que quedaria en pie. */
var INYECCION = ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'srcdoc'];
var usadas = INYECCION.filter(function (m) { return appJs.indexOf(m) >= 0; });
ok('nunca convierte texto en HTML', usadas.length === 0, usadas.join(', '));
ok('no crea elementos script desde el codigo', appJs.indexOf("createElement('script')") < 0 &&
   appJs.indexOf('createElement("script")') < 0);

/* -------------------------------------------------------------- cabeceras */
console.log('Cabeceras para publicar');
var HEAD = require('./headers');
['_headers', '.htaccess', 'nginx.conf'].forEach(function (f) {
    ok('dist/' + f + ' generado', fs.existsSync(path.join(DIST, f)));
});
var netlify = fs.existsSync(path.join(DIST, '_headers'))
    ? fs.readFileSync(path.join(DIST, '_headers'), 'utf8') : '';
ok('llevan HSTS de al menos seis meses', /max-age=63072000/.test(netlify));
ok('llevan la misma CSP que el documento', netlify.indexOf(HEAD.cspFor(page)) >= 0);
ok('la CSP publicada prohibe los marcos ajenos',
   HEAD.cspFor(page).indexOf("frame-ancestors 'none'") >= 0);

/* --------------------------------------------------------------- minificado */
console.log('Minificado');
ok('todo el javascript en una sola linea larga', appJs.split('\n').length <= 3,
   appJs.split('\n').length + ' lineas');
/* Nombres de funciones INTERNAS del codigo fuente. Si alguno sobrevive, el
   renombrado no se ha hecho. Ojo: aqui no valen los nombres publicos (los
   que cuelgan de un objeto, como crypto.pbkdf2Slow): esos son propiedades y
   renombrarlos romperia el programa, asi que terser los respeta a proposito. */
var NOMBRES = ['rotateOnNewPeerKey', 'scalarmult', 'placeAlignment', 'bagAdd',
               'capacityBytes', 'dictPack', 'newRatchetKey', 'legacyCopy'];
var quedan = NOMBRES.filter(function (n) { return appJs.indexOf(n) >= 0; });
ok('renombra funciones y variables internas', quedan.length === 0, quedan.join(' '));
/* Se busca la DECLARACION, no la palabra. Buscar la palabra no comprobaba
   nada: el propio build estampa "BINTIO 1.0.0" en el preambulo del fichero,
   asi que la comprobacion salia bien aunque terser se hubiera cargado el
   global por tener mal la lista "reserved" y la aplicacion no arrancara. */
ok('conserva el punto de entrada BINTIO', /var BINTIO *=/.test(appJs));

/* ---------------------------------------------------------- compatibilidad
   BINTIO tiene que arrancar en cualquier navegador de los ultimos diez anos,
   y eso no se consigue prometiendolo en el README: se consigue no publicando
   ni una sola linea de sintaxis moderna. Terser no traduce, solo comprime, asi
   que si alguien escribe una flecha en src/ acaba tal cual en la calle. Aqui
   se mira lo que sale publicado. */
console.log('Compatibilidad');
var MODERNO = [
    ['funciones flecha', /=>/],
    ['let o const', /\b(?:let|const)\s+[A-Za-z_$]/],
    ['clases', /\bclass\s+[A-Za-z_$]/],
    ['plantillas de texto', /`/],
    ['async o await', /\b(?:async|await)\s/],
    ['modulos ES', /\b(?:export|import)\s/]
];
var modernas = MODERNO.filter(function (p) { return p[1].test(appJs); })
                      .map(function (p) { return p[0]; });
ok('el javascript publicado es ES5 de principio a fin', modernas.length === 0, modernas.join(', '));
ok('el documento declara la codificacion en los primeros 1024 bytes',
   page.substr(0, 1024).indexOf('charset="utf-8"') >= 0 ||
   page.substr(0, 1024).indexOf('charset=utf-8') >= 0);
ok('el documento se presenta a los Internet Explorer viejos',
   page.indexOf('X-UA-Compatible') >= 0);

/* --------------------------------------------------------------------- PWA
   El manifiesto ya no es un fichero: viaja dentro del enlace, en base64. Se
   saca de ahi y se comprueba igual que antes, que es lo que hara el
   navegador. */
console.log('Aplicacion instalable');
var manUri = (page.match(/<link rel="manifest" href="data:application\/manifest\+json;base64,([^"]*)"/) || [])[1];
ok('el manifiesto se puede leer', !!manUri);
if (manUri) {
    var man = JSON.parse(Buffer.from(manUri, 'base64').toString('utf8'));
    ok('tiene nombre, descripcion y modo',
       !!man.name && !!man.short_name && !!man.description && !!man.display);
    ok('no fija start_url ni scope', !man.start_url && !man.scope);
    /* Dos iconos, y no mas: uno de 192 y otro de 512 que ademas hace de
       recortable. Cada uno viaja en base64 dentro de la pagina, asi que un
       icono de sobra no es un fichero de sobra en un servidor, son
       kilobytes en cada visita. Lo que se comprueba es que esten TODOS
       dentro. */
    ok('lleva sus iconos incrustados', man.icons.length >= 2 && man.icons.every(function (i) {
        return i.src.indexOf('data:') === 0;
    }));
    ok('lleva icono de 192 y de 512', man.icons.some(function (i) { return i.sizes === '192x192'; }) &&
       man.icons.some(function (i) { return i.sizes === '512x512'; }));
    /* Recortable: Android le muerde las esquinas para redondearlo. Se busca la
       palabra dentro del campo y no el campo entero, porque el mismo icono
       lleva las dos marcas: "any maskable" es un fichero que vale para los dos
       usos, y tenerlo dos veces eran setenta y cinco kilobytes de mas. */
    ok('lleva icono recortable para Android', man.icons.some(function (i) {
        return String(i.purpose || '').indexOf('maskable') >= 0;
    }));
    ok('el color de la barra cuadra con el del documento',
       page.indexOf('content="' + man.theme_color + '"') >= 0, man.theme_color);
}
var sw = fs.existsSync(path.join(DIST, 'sw.js'))
    ? fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8') : '';
ok('el trabajador de servicio existe', !!sw);
ok('tiene version', sw.indexOf('__VERSION__') < 0);
ok('guarda el documento entero para abrir sin conexion',
   sw.indexOf('__FILES__') < 0 && sw.indexOf('index.html') >= 0);
ok('la pagina lo registra solo cuando viene de un servidor',
   appJs.indexOf('sw.js') >= 0 && /https?:/.test(appJs));

console.log('');
console.log(fails ? fails + ' FALLOS de ' + checks + ' comprobaciones'
                  : 'TODO CORRECTO: ' + checks + ' comprobaciones');
process.exit(fails ? 1 : 0);
