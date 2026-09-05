/* ==========================================================================
   El logo: de src/logo.webp a src/logo.png.

   El logo original es un WebP con perdida (VP8 + canal alfa aparte). Decodificar
   eso a mano son mil quinientas lineas de bitstream -decodificador booleano,
   prediccion intra, IDCT, filtro de bucle, y encima el alfa va comprimido con
   el otro formato, el sin perdida- y este proyecto no mete dependencias. Un
   PNG, en cambio, se lee con el zlib que Node ya trae, en sesenta lineas: por
   eso tools/build.js parte del PNG y no del WebP.

   Convertirlo hace falta UNA vez, cuando cambia el logo. Y ya hay en la maquina
   un decodificador de WebP probado por media humanidad: el navegador. Asi que
   esto levanta una pagina en local que lo carga, lo pinta en un lienzo y
   devuelve los pixeles como PNG. Sin instalar nada y sin perder un pixel: el
   WebP es con perdida, pero lo que sale del lienzo es exactamente lo que ese
   fichero significa.

     npm run logo        y abre la direccion que te dice

   El PNG que deja es el maestro: de el salen TODOS los iconos y la tarjeta
   social, en tools/build.js. Si src/logo.webp es mas nuevo que src/logo.png,
   la compilacion avisa.
   ========================================================================== */
var fs = require('fs');
var path = require('path');
var http = require('http');

var ROOT = path.join(__dirname, '..');
var SRC = path.join(ROOT, 'src');
var WEBP = path.join(SRC, 'logo.webp');
var PNG = path.join(SRC, 'logo.png');
var PUERTO = 8790;

function log(m) { process.stdout.write(m + '\n'); }

if (!fs.existsSync(WEBP)) {
    log('');
    log('No hay src/logo.webp. El logo de la aplicacion es ese fichero.');
    log('');
    process.exit(1);
}

var PAGINA = '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<title>Convirtiendo el logo</title>' +
    '<style>body{background:#06070f;color:#e0f9ff;font:16px system-ui,sans-serif;' +
    'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}' +
    'p{max-width:32em;line-height:1.6}</style></head><body>' +
    '<p id="estado">Convirtiendo el logo...</p>' +
    '<script>\n' +
    'var estado = document.getElementById("estado");\n' +
    'var img = new Image();\n' +
    'img.onload = function () {\n' +
    '    var c = document.createElement("canvas");\n' +
    '    c.width = img.naturalWidth; c.height = img.naturalHeight;\n' +
    '    c.getContext("2d").drawImage(img, 0, 0);\n' +
    '    c.toBlob(function (b) {\n' +
    '        if (!b) { estado.textContent = "el lienzo no ha soltado el PNG"; return; }\n' +
    '        fetch("/guardar", { method: "POST", body: b })\n' +
    '            .then(function (r) { return r.text(); })\n' +
    '            .then(function (t) { estado.textContent = t; })\n' +
    '            ["catch"](function (e) { estado.textContent = "no se ha podido guardar: " + e; });\n' +
    '    }, "image/png");\n' +
    '};\n' +
    'img.onerror = function () { estado.textContent = "este navegador no sabe leer WebP; prueba con otro"; };\n' +
    'img.src = "/logo.webp";\n' +
    '</script></body></html>';

var servidor = http.createServer(function (req, res) {
    if (req.method === 'POST' && req.url === '/guardar') {
        var trozos = [];
        req.on('data', function (d) { trozos.push(d); });
        req.on('end', function () {
            var png = Buffer.concat(trozos);
            /* Que sea un PNG de verdad y no una pagina de error: la firma son
               ocho bytes fijos, y comprobarlos aqui evita dejar en src/ un
               fichero roto que reventaria la compilacion mucho mas lejos. */
            var firma = [137, 80, 78, 71, 13, 10, 26, 10];
            var vale = png.length > 33;
            for (var i = 0; vale && i < 8; i++) { if (png[i] !== firma[i]) { vale = false; } }
            if (!vale) {
                res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('lo que ha llegado no es un PNG');
                return;
            }
            fs.writeFileSync(PNG, png);
            var ancho = png.readUInt32BE(16), alto = png.readUInt32BE(20);
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Listo: src/logo.png, ' + ancho + 'x' + alto + '. Ya puedes cerrar esta pagina.');
            log('');
            log('  src/logo.png  ' + ancho + 'x' + alto + '  ' + (png.length / 1024).toFixed(1) + ' KB');
            log('');
            log('  Ahora:  npm run build');
            log('');
            setTimeout(function () { servidor.close(); process.exit(0); }, 200);
        });
        return;
    }
    if (req.url === '/logo.webp') {
        res.writeHead(200, { 'Content-Type': 'image/webp' });
        res.end(fs.readFileSync(WEBP));
        return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGINA);
});

servidor.listen(PUERTO, '127.0.0.1', function () {
    log('');
    log('Conversion del logo. Abre esto en el navegador:');
    log('');
    log('    http://localhost:' + PUERTO + '/');
    log('');
    log('El navegador decodifica el WebP y devuelve el PNG. Se cierra solo.');
    log('');
});
