/* ==========================================================================
   Servidor de desarrollo para la carpeta dist.

   Es lo mas tonto que puede ser un servidor, a proposito: sirve ficheros
   estaticos y nada mas. No registra quien entra, no guarda nada, no habla con
   el exterior. BINTIO no necesita servidor para funcionar; esto existe para
   poder abrirlo en localhost, para instalarlo como aplicacion y para poder
   comprobar las cabeceras de seguridad de verdad.

   POR DEFECTO VA POR HTTP, Y ESTA BIEN.
   -------------------------------------
   http://localhost ya es un "contexto seguro" para todos los navegadores: la
   camara, WebRTC, Web Bluetooth, el trabajador de servicio y crypto.subtle
   funcionan igual que con https. Un certificado de mentira en local solo
   anade un aviso rojo del navegador y ningun beneficio.

   https hace falta en dos casos concretos, y solo entonces:
     --https   para puntuar HSTS y la redireccion (auditoria de cabeceras)
     --lan     para abrirlo desde el movil por la IP de la red: ahi ya no es
               localhost, y sin https el navegador apaga camara y bluetooth.

       node tools/serve.js              http en 127.0.0.1:8787
       node tools/serve.js --lan        ademas escucha en toda la red local
       node tools/serve.js --https      https con el certificado de certs/
       node tools/serve.js --port 9000  otro puerto
   ========================================================================== */
var http = require('http');
var https = require('https');
var fs = require('fs');
var os = require('os');
var path = require('path');
var H = require('./headers');

var ROOT = path.join(__dirname, '..');
var DIST = path.join(ROOT, 'dist');
var CERT_DIR = path.join(ROOT, 'certs');

var ARGS = process.argv.slice(2);

function flag(name) { return ARGS.indexOf('--' + name) >= 0; }
function value(name, fallback) {
    var i = ARGS.indexOf('--' + name);
    if (i >= 0 && ARGS[i + 1] && ARGS[i + 1].charAt(0) !== '-') { return ARGS[i + 1]; }
    for (var j = 0; j < ARGS.length; j++) {
        if (ARGS[j].indexOf('--' + name + '=') === 0) { return ARGS[j].split('=')[1]; }
    }
    return fallback;
}

var WANT_TLS = flag('https');
var LAN = flag('lan');
var PORT = parseInt(value('port', process.env.PORT), 10) || 8787;
var REDIRECT_PORT = parseInt(process.env.REDIRECT_PORT, 10) || (PORT + 1);
var HOST = value('host', process.env.HOST) || (LAN ? '0.0.0.0' : '127.0.0.1');

var TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.txt': 'text/plain; charset=utf-8',
    '.htaccess': 'text/plain; charset=utf-8',
    '.conf': 'text/plain; charset=utf-8'
};

function tlsOptions() {
    if (!WANT_TLS) { return null; }
    var key = path.join(CERT_DIR, 'key.pem');
    var cert = path.join(CERT_DIR, 'cert.pem');
    if (fs.existsSync(key) && fs.existsSync(cert)) {
        try { return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) }; }
        catch (e) { return null; }
    }
    return null;
}

/* Las direcciones IPv4 de las tarjetas de red, para poder abrirlo desde el
   movil sin tener que buscarlas a mano. */
function lanAddresses() {
    var out = [];
    var nets = os.networkInterfaces();
    Object.keys(nets).forEach(function (name) {
        (nets[name] || []).forEach(function (net) {
            var v4 = net.family === 'IPv4' || net.family === 4;
            if (v4 && !net.internal) { out.push(net.address); }
        });
    });
    return out;
}

function handler(secure) {
    return function (req, res) {
        var url = req.url.split('?')[0];
        if (url === '/') { url = '/index.html'; }

        /* Nada de subir por el arbol de directorios. */
        var decoded;
        try { decoded = decodeURIComponent(url); } catch (e) { decoded = url; }
        var file = path.join(DIST, path.normalize(decoded).replace(/^([/\\])+/, ''));
        if (file.indexOf(DIST) !== 0) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('no');
            return;
        }

        fs.readFile(file, function (err, data) {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('No existe: ' + url + '\nHas ejecutado "npm run build"?');
                return;
            }
            var ext = path.extname(file).toLowerCase();
            var isHtml = ext === '.html';
            var headers = H.securityHeaders({
                tls: secure,
                html: isHtml ? data.toString('utf8') : null
            });
            headers['Content-Type'] = TYPES[ext] || 'application/octet-stream';
            res.writeHead(200, headers);
            res.end(data);
        });
    };
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    process.stdout.write('No hay nada en dist/. Ejecuta primero: npm run build\n');
    process.exit(1);
}

function say(m) { process.stdout.write(m + '\n'); }

/* Un nombre que se pueda pegar en la barra del navegador: 0.0.0.0 no vale. */
function pretty(host) { return (host === '0.0.0.0' || host === '::') ? 'localhost' : host; }

function banner(scheme) {
    say('');
    say('  BINTIO en ' + scheme + '://' + pretty(HOST) + ':' + PORT);
    if (!LAN) { return; }
    var ips = lanAddresses();
    if (!ips.length) {
        say('  No encuentro ninguna direccion de red local.');
        return;
    }
    say('  Desde otro aparato de la misma red:');
    for (var i = 0; i < ips.length; i++) {
        say('    ' + scheme + '://' + ips[i] + ':' + PORT);
    }
    if (scheme === 'http') {
        say('  (por IP y sin https el navegador apaga la camara, el bluetooth');
        say('   y el modo sin conexion: para el movil usa "npm run start:lan")');
    }
}

var tls = tlsOptions();

if (tls) {
    https.createServer(tls, handler(true)).listen(PORT, HOST, function () {
        banner('https');
        say('  Certificado propio: el navegador avisara una vez. Es normal.');
    });
    /* El redirector existe para que la nota de seguridad sea real: sin
       redireccion de http a https, el Observatorio descuenta 20 puntos. */
    http.createServer(function (req, res) {
        res.writeHead(301, {
            'Location': 'https://' + pretty(HOST) + ':' + PORT + req.url,
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Content-Type-Options': 'nosniff'
        });
        res.end('Usa https.');
    }).listen(REDIRECT_PORT, HOST, function () {
        say('  http://' + pretty(HOST) + ':' + REDIRECT_PORT + ' redirige a https');
        say('  Sin servidor y sin nada: abre dist/bintio.html con doble clic');
        say('  Ctrl+C para parar');
        say('');
    });
} else {
    if (WANT_TLS) {
        say('');
        say('  Pediste --https pero no hay certificado en certs/.');
        say('  Generalo con "npm run cert" (necesita openssl).');
        say('  Sigo por http, que en localhost vale exactamente igual.');
    }
    http.createServer(handler(false)).listen(PORT, HOST, function () {
        banner('http');
        say('  http en localhost ya es contexto seguro: camara, WebRTC,');
        say('  bluetooth y modo sin conexion funcionan sin certificado.');
        say('  Sin servidor y sin nada: abre dist/bintio.html con doble clic');
        say('  Ctrl+C para parar');
        say('');
    });
}
