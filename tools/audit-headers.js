/* ==========================================================================
   Auditoria de cabeceras: levanta el servidor de verdad, le pide la pagina y
   puntua la respuesta con las reglas publicadas del Observatorio de Mozilla.

   No comprueba intenciones ni lee el codigo del servidor: mide lo que sale
   por el cable. Si esto dice A+, es porque las cabeceras estaban ahi.

   Se ejecuta en "npm test" y con "npm run audit". Necesita un certificado
   local (npm run cert): sin TLS no se pueden puntuar HSTS ni la redireccion.
   ========================================================================== */
var cp = require('child_process');
var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
/* Puerto propio, distinto del de desarrollo, para poder auditar mientras se
   trabaja. Se puede cambiar (PORT=9100 npm run audit) porque el fallo mas
   comun aqui es encontrarselo cogido por una prueba anterior. */
var PORT = parseInt(process.env.PORT, 10) || 8899;
var REDIRECT_PORT = parseInt(process.env.REDIRECT_PORT, 10) || (PORT + 1);
var HOST = '127.0.0.1';

var hasCerts = fs.existsSync(path.join(ROOT, 'certs', 'cert.pem')) &&
               fs.existsSync(path.join(ROOT, 'certs', 'key.pem'));

function log(m) { process.stdout.write(m + '\n'); }

/* ---------------------------------------------------------------- peticion */
function fetch(secure, port, urlPath, cb) {
    var mod = secure ? https : http;
    var req = mod.request({
        host: HOST, port: port, path: urlPath, method: 'GET',
        rejectUnauthorized: false,
        headers: { 'User-Agent': 'bintio-audit' }
    }, function (res) {
        var body = '';
        res.setEncoding('utf8');
        res.on('data', function (c) { body += c; });
        res.on('end', function () {
            cb(null, { status: res.statusCode, headers: res.headers, body: body });
        });
    });
    req.on('error', cb);
    req.end();
}

/* ---------------------------------------------------------------- reglas
   Cada regla devuelve {puntos, nota}. Los valores son los del Observatorio.
   ------------------------------------------------------------------------ */
function scoreCsp(h) {
    var csp = h['content-security-policy'];
    if (!csp) { return { p: -25, n: 'no hay Content-Security-Policy' }; }
    var lower = csp.toLowerCase();
    if (lower.indexOf("'unsafe-eval'") >= 0) {
        return { p: -20, n: "usa 'unsafe-eval'" };
    }
    /* unsafe-inline solo penaliza en script-src; en style-src es neutro. */
    var scriptSrc = (lower.match(/script-src([^;]*)/) || [])[1] || '';
    if (scriptSrc.indexOf("'unsafe-inline'") >= 0) {
        return { p: -20, n: "script-src permite 'unsafe-inline'" };
    }
    if (lower.indexOf("object-src 'none'") < 0 && lower.indexOf("default-src 'none'") < 0) {
        return { p: 0, n: 'CSP presente pero sin object-src ni default-src cerrados' };
    }
    if (lower.indexOf("default-src 'none'") >= 0) {
        return { p: 10, n: "estricta, con default-src 'none' y sin unsafe-*" };
    }
    return { p: 5, n: 'CSP presente y sin unsafe-*' };
}

function scoreNosniff(h) {
    var v = (h['x-content-type-options'] || '').toLowerCase();
    return v.indexOf('nosniff') >= 0
        ? { p: 0, n: 'nosniff' }
        : { p: -5, n: 'falta X-Content-Type-Options' };
}

function scoreFrames(h) {
    var xfo = (h['x-frame-options'] || '').toLowerCase();
    var csp = (h['content-security-policy'] || '').toLowerCase();
    if (csp.indexOf("frame-ancestors 'none'") >= 0 || csp.indexOf("frame-ancestors 'self'") >= 0) {
        return { p: 0, n: 'protegido con frame-ancestors' + (xfo ? ' y X-Frame-Options' : '') };
    }
    if (xfo === 'deny' || xfo === 'sameorigin') { return { p: 0, n: 'X-Frame-Options ' + xfo }; }
    return { p: -20, n: 'la pagina se puede meter en un marco ajeno' };
}

function scoreReferrer(h) {
    var v = (h['referrer-policy'] || '').toLowerCase().replace(/\s/g, '');
    var privadas = ['no-referrer', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin'];
    if (privadas.indexOf(v) >= 0) { return { p: 5, n: v }; }
    if (v) { return { p: 0, n: 'presente pero poco estricta: ' + v }; }
    return { p: 0, n: 'sin Referrer-Policy' };
}

function scoreHsts(h, secure) {
    if (!secure) { return { p: 0, n: 'no evaluable sin https', skip: true }; }
    var v = h['strict-transport-security'];
    if (!v) { return { p: -20, n: 'sitio https sin HSTS' }; }
    var m = v.match(/max-age\s*=\s*(\d+)/i);
    var age = m ? parseInt(m[1], 10) : 0;
    if (age < 15768000) { return { p: -10, n: 'HSTS de menos de seis meses' }; }
    return { p: 5, n: 'max-age ' + age + (/includeSubDomains/i.test(v) ? ', con subdominios' : '') };
}

function scoreCookies(h) {
    return h['set-cookie']
        ? { p: -5, n: 'pone cookies' }
        : { p: 0, n: 'no pone ni una cookie' };
}

function scoreCors(h) {
    var v = h['access-control-allow-origin'];
    if (v === '*') { return { p: -5, n: 'comparte con cualquier origen' }; }
    return { p: 0, n: 'no comparte con nadie' };
}

function scoreSri(body) {
    var tags = body.match(/<script[^>]*src=[^>]*>/gi) || [];
    if (!tags.length) { return { p: 0, n: 'no carga scripts externos' }; }
    var conIntegridad = tags.filter(function (t) { return /integrity=/i.test(t); });
    if (conIntegridad.length === tags.length) {
        return { p: 5, n: tags.length === 1 ? 'el unico script lleva integrity' : 'los ' + tags.length + ' scripts llevan integrity' };
    }
    return { p: -5, n: (tags.length - conIntegridad.length) + ' scripts sin integrity' };
}

function scoreRedirect(res, secure) {
    if (!secure) { return { p: 0, n: 'no evaluable sin https', skip: true }; }
    if (!res) { return { p: -20, n: 'http no redirige a https' }; }
    if (res.status !== 301 && res.status !== 308) {
        return { p: -20, n: 'http responde ' + res.status + ' en vez de redirigir' };
    }
    var loc = res.headers.location || '';
    return loc.indexOf('https://') === 0
        ? { p: 0, n: 'http ' + res.status + ' -> https' }
        : { p: -20, n: 'redirige, pero no a https' };
}

function grade(score) {
    if (score >= 100) { return 'A+'; }
    if (score >= 90) { return 'A'; }
    if (score >= 85) { return 'A-'; }
    if (score >= 80) { return 'B+'; }
    if (score >= 75) { return 'B'; }
    if (score >= 70) { return 'B-'; }
    if (score >= 65) { return 'C+'; }
    if (score >= 60) { return 'C'; }
    if (score >= 55) { return 'C-'; }
    if (score >= 50) { return 'D+'; }
    if (score >= 45) { return 'D'; }
    if (score >= 40) { return 'D-'; }
    return 'F';
}

/* ------------------------------------------------------------------ marcha */
var serveArgs = [path.join(__dirname, 'serve.js')];
/* La auditoria mide HSTS y la redireccion, y las dos solo existen sobre TLS.
   Por eso aqui SI se pide https: es el unico sitio del proyecto que lo
   necesita. El servidor de todos los dias sigue yendo por http. */
if (hasCerts) { serveArgs.push('--https'); }

var server = cp.spawn(process.execPath, serveArgs, {
    env: Object.assign({}, process.env, {
        PORT: String(PORT), REDIRECT_PORT: String(REDIRECT_PORT), HOST: HOST
    }),
    stdio: ['ignore', 'pipe', 'pipe']
});

var arrancado = false;
server.stdout.on('data', function (d) {
    if (arrancado) { return; }
    if (String(d).indexOf('BINTIO en') >= 0) { arrancado = true; setTimeout(medir, 250); }
});
/* El fallo mas comun de aqui no es que el servidor tarde: es que el puerto ya
   esta cogido por otra prueba que se quedo viva. Sin esto, lo que se lee es un
   volcado de EADDRINUSE de Node y un "no arranco a tiempo" ocho segundos
   despues, que no dice como arreglarlo. */
var ocupado = false;
server.stderr.on('data', function (d) {
    var s = String(d);
    if (s.indexOf('EADDRINUSE') >= 0) { ocupado = true; }
    process.stderr.write(s);
});
setTimeout(function () {
    if (arrancado) { return; }
    fin(1, ocupado
        ? 'El puerto ' + PORT + ' ya esta cogido por otro proceso.\n' +
          'Suele ser un servidor de una prueba anterior que se quedo vivo.\n' +
          'Cierralo y repite, o usa otro puerto:  PORT=9100 npm run audit'
        : 'El servidor no arranco a tiempo.');
}, 8000);

function fin(code, msg) {
    if (msg) { log(msg); }
    try { server.kill(); } catch (e) {}
    process.exit(code);
}

function medir() {
    fetch(hasCerts, PORT, '/', function (err, res) {
        if (err) { fin(1, 'No se pudo pedir la pagina: ' + err.message); return; }

        function evaluar(redir) {
            var h = res.headers;
            var pruebas = [
                ['Content-Security-Policy', scoreCsp(h)],
                ['Proteccion contra marcos', scoreFrames(h)],
                ['X-Content-Type-Options', scoreNosniff(h)],
                ['Referrer-Policy', scoreReferrer(h)],
                ['HSTS', scoreHsts(h, hasCerts)],
                ['Redireccion a https', scoreRedirect(redir, hasCerts)],
                ['Integridad de subrecursos', scoreSri(res.body)],
                ['Cookies', scoreCookies(h)],
                ['Comparticion entre origenes', scoreCors(h)]
            ];

            var total = 100;
            log('');
            log('AUDITORIA DE CABECERAS  (' + (hasCerts ? 'https' : 'http') + '://' + HOST + ':' + PORT + ')');
            log('');
            pruebas.forEach(function (p) {
                total += p[1].p;
                var signo = p[1].skip ? '  ' : (p[1].p > 0 ? '+' + p[1].p : (p[1].p < 0 ? String(p[1].p) : ' 0'));
                var pad = '                             '.substr(0, 29 - p[0].length);
                log('  ' + (p[1].p < 0 ? 'MAL ' : ' ok ') + p[0] + pad + signo + '   ' + p[1].n);
            });

            var nota = grade(total);
            log('');
            log('  PUNTUACION ' + total + '   NOTA ' + nota);

            /* Cabeceras raras: cualquier cosa que delate al servidor o que no
               pinte nada en una respuesta estatica. */
            var sospechosas = ['server', 'x-powered-by', 'x-aspnet-version', 'via', 'x-runtime'];
            var vistas = sospechosas.filter(function (k) { return res.headers[k]; });
            log('  Cabeceras delatoras: ' + (vistas.length ? vistas.join(', ') : 'ninguna'));
            log('');

            if (!hasCerts) {
                log('  AVISO: sin certificado no se pueden puntuar HSTS ni la redireccion.');
                log('  Genera uno con "npm run cert" para la nota completa.');
                log('');
                fin(0);
                return;
            }
            fin(nota === 'A+' ? 0 : 1,
                nota === 'A+' ? null : '  No llega a A+. No se sirve nada hasta arreglarlo.');
        }

        if (!hasCerts) { evaluar(null); return; }
        fetch(false, REDIRECT_PORT, '/', function (e2, r2) { evaluar(e2 ? null : r2); });
    });
}
