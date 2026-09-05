/* ==========================================================================
   Compilacion de BINTIO.

   Que hace, en orden:
     1. Junta todo el JavaScript en un solo fichero y lo minifica de verdad
        (renombra funciones y variables, no solo quita espacios).
     2. Junta todo el CSS en un solo fichero y lo minifica.
     3. Escribe UNA pagina con todo dentro: estilos, codigo, logos y
        manifiesto incrustados, y la CSP fijada a los hashes de su propio
        contenido. Sale en dist/index.html y, con el mismo contenido byte a
        byte, en dist/bintio.html para quien busque ese nombre. No pide un
        solo fichero a nadie, asi que vale servida, instalada, de escritorio
        y con doble clic.
     4. Minifica tambien el HTML: sin comentarios, sin saltos de linea y con
        el CSS de dentro apretado. Los hashes de la CSP se calculan DESPUES,
        sobre el documento ya minificado, que es lo que se publica.
     5. Genera los iconos PNG y la tarjeta para redes sociales a partir de
        nada (Node trae zlib, asi que un PNG se puede escribir a mano sin
        dependencias).
     6. Deja el trabajador de servicio con la lista de ficheros y la version,
        y escribe robots.txt (y sitemap.xml, si se sabe el dominio).

   Y una cosa mas, entre el 2 y el 3: los 103 identificadores del documento
   (id="...") salen con un nombre nuevo y aleatorio en CADA compilacion, y el
   JavaScript y el CSS se adaptan solos. Para que un script escrito por un
   tercero contra el DOM de una version deje de funcionar en la siguiente. El
   porque completo, y sobre todo lo que ESTO NO COMPRA, esta en el bloque
   grande de renombrarIds, mas abajo. Lee eso antes de fiarte de esto.

   VARIABLES DE ENTORNO
   --------------------
     BINTIO_URL       la direccion donde se va a publicar, para que las vistas
                      previas sociales lleven rutas absolutas. Sin ella salen
                      relativas, que es lo correcto en local y con el fichero
                      suelto.
     BINTIO_IDSEED    fija la semilla de los nombres nuevos. Sin ella es
                      aleatoria y cada compilacion sale distinta, que es lo
                      que se quiere al publicar. Con ella la compilacion vuelve
                      a ser reproducible byte a byte:

                          BINTIO_IDSEED=lo-que-sea  node tools/build.js

                      La semilla usada se imprime siempre en el informe del
                      final. Quien publique una version deberia anotarla: es
                      lo unico que permite a un tercero reconstruir ese
                      dist/index.html exacto y comprobar que sale de este
                      fuente. Al depurar tambien vale, para que las
                      herramientas del navegador digan lo mismo entre dos
                      compilaciones.

   Sin dependencias en el resultado: lo unico que se instala es terser, y
   solo para comprimir.
   ========================================================================== */
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var crypto = require('crypto');
var H = require('./headers');

var ROOT = path.join(__dirname, '..');
var SRC = path.join(ROOT, 'src');
var DIST = path.join(ROOT, 'dist');
var PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function log(msg) { process.stdout.write(msg + '\n'); }

/* --------------------------------------------------------------------------
   La direccion donde se va a publicar, si se sabe.

   Las redes sociales piden la direccion ENTERA de la imagen de la vista
   previa: con una ruta relativa, unas la resuelven y otras se quedan sin
   imagen. Como aqui nadie sabe en que dominio va a acabar esto, se dice al
   compilar y ya:

       BINTIO_URL=https://bintio.example npm run build

   Sin ella salen rutas relativas, que es lo correcto para localhost, para el
   fichero suelto y para la aplicacion de escritorio.
   -------------------------------------------------------------------------- */
var SITE = String(process.env.BINTIO_URL || PKG.homepage || '').replace(/\/+$/, '');

function absoluteUrls(html) {
    if (!SITE) { return html; }
    /* Igual que en replaceBlock: el dominio lo escribe una persona y podria
       llevar un $, que en una cadena de reemplazo significa otra cosa. Con
       funcion, entra literal. */
    function poner(cola) {
        return function (m, prefijo) { return prefijo + SITE + cola; };
    }
    return html
        .replace(/(<meta property="og:url" content=")[^"]*/, poner('/'))
        .replace(/(<meta property="og:image" content=")[^"]*/, poner('/social.png'))
        .replace(/(<meta name="twitter:image" content=")[^"]*/, poner('/social.png'))
        .replace(/(<link rel="canonical" href=")[^"]*/, poner('/'));
}

function readSorted(dir, ext) {
    return fs.readdirSync(dir)
        .filter(function (f) { return f.slice(-ext.length) === ext; })
        .sort()
        .map(function (f) { return { name: f, code: fs.readFileSync(path.join(dir, f), 'utf8') }; });
}

/* --------------------------------------------------------------------------
   Minificador de CSS.

   Separa SELECTOR de DECLARACION y aprieta cada uno con sus reglas, porque no
   son el mismo idioma. En una declaracion, los dos puntos separan propiedad de
   valor y el espacio sobra. En un selector, un espacio ANTES de dos puntos es
   el combinador descendiente, y quitarlo cambia a que elemento apunta la
   regla:

       :root[data-skin="terminal"] ::-webkit-scrollbar-thumb   la barra de
                                                               cualquier hijo
       :root[data-skin="terminal"]::-webkit-scrollbar-thumb    la del propio
                                                               :root, que no
                                                               tiene ninguna

   La version anterior aplicaba las reglas de la declaracion a todo y se comia
   ese espacio: la barra de desplazamiento con degradado de los siete temas de
   terminal existia al desarrollar y NO existia en lo publicado. Se descubrio
   auditando, no probando, que es justo lo malo de este tipo de fallo.
   -------------------------------------------------------------------------- */
function minifyCss(css) {
    css = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\r/g, '');

    /* Dentro de un selector: espacios a uno solo y nada de tocar los ':'. */
    function selector(s) {
        return s.replace(/\s+/g, ' ')
                .replace(/ *([,>~+]) */g, '$1')
                .replace(/^ +| +$/g, '');
    }

    /* Dentro de una declaracion: aqui si se puede apretar de verdad. No se
       toca el interior de calc() ni las listas de sombras, donde un espacio de
       menos cambia el significado. */
    function declaracion(d) {
        return d.replace(/\s+/g, ' ')
                .replace(/ *([;:,]) */g, '$1')
                .replace(/ ?\( ?/g, '(')
                .replace(/ ?\) ?/g, ')')
                /* Se devuelve el espacio que se acaba de quitar detras de un
                   parentesis. Los signos + * / estan en la lista porque dentro
                   de calc() los operadores necesitan espacio a AMBOS lados:
                   "calc(var(--w)+ 2px)" no es una declaracion apretada, es una
                   declaracion invalida, y el navegador la tira entera. */
                .replace(/\)([a-zA-Z0-9#.:+*\/-])/g, ') $1')
                .replace(/^ +| +$/g, '')
                .replace(/;$/, '');
    }

    /* Un @media o un @supports abren un bloque que contiene REGLAS, no
       declaraciones: hay que seguir tratando lo de dentro como selectores. */
    function anidada(s) { return /^@(media|supports|document|scope|container|layer)\b/.test(s); }

    var out = '', buf = '', pila = [], i, c;
    for (i = 0; i < css.length; i++) {
        c = css.charAt(i);
        if (c === '{') {
            var sel = selector(buf);
            buf = '';
            out += sel + '{';
            pila.push(anidada(sel) ? 'reglas' : 'declaraciones');
        } else if (c === '}') {
            if (pila[pila.length - 1] === 'declaraciones') { out += declaracion(buf); }
            else { out += selector(buf); }
            buf = '';
            pila.pop();
            out += '}';
        } else {
            buf += c;
        }
    }
    out += selector(buf);
    return out.replace(/@media\(/g, '@media (').replace(/and\(/g, 'and (');
}

function sha256b64(text) {
    return 'sha256-' + crypto.createHash('sha256').update(text, 'utf8').digest('base64');
}

/* --------------------------------------------------------------------------
   PNG a mano. Node trae zlib, y un PNG es cabecera + datos comprimidos +
   final, con un CRC por trozo. Cincuenta lineas y nos ahorramos una
   dependencia de dibujo entera.
   -------------------------------------------------------------------------- */
var CRC_TABLE = (function () {
    var t = [], c, n, k;
    for (n = 0; n < 256; n++) {
        c = n;
        for (k = 0; k < 8; k++) { c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); }
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    var c = 0xffffffff;
    for (var i = 0; i < buf.length; i++) { c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); }
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    var len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    var body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    var crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
}

/* Filtrar una linea con uno de los cinco metodos del formato. Filtrar no
   comprime: reescribe cada byte como la diferencia con lo que se puede
   predecir de sus vecinos, y eso es lo que deja al deflate algo que comprimir.
   En un degradado la diferencia con el pixel de al lado es casi siempre cero. */
function filtrarLinea(f, act, prev, bpp, out) {
    var i, izq, arriba, diag, p, pa, pb, pc, pred;
    for (i = 0; i < act.length; i++) {
        izq = i >= bpp ? act[i - bpp] : 0;
        arriba = prev[i];
        diag = i >= bpp ? prev[i - bpp] : 0;
        if (f === 0) { pred = 0; }
        else if (f === 1) { pred = izq; }
        else if (f === 2) { pred = arriba; }
        else if (f === 3) { pred = (izq + arriba) >> 1; }
        else {
            p = izq + arriba - diag;
            pa = Math.abs(p - izq); pb = Math.abs(p - arriba); pc = Math.abs(p - diag);
            pred = pa <= pb && pa <= pc ? izq : (pb <= pc ? arriba : diag);
        }
        out[i] = (act[i] - pred) & 255;
    }
}

/* La regla de siempre para elegir filtro: gana el que deja la linea con la
   suma de valores absolutos mas baja, leyendo cada byte como con signo. No es
   exacta -habria que comprimir las cinco y comparar- pero acierta casi siempre
   y cuesta una pasada en vez de cinco compresiones. */
function costeLinea(buf) {
    var s = 0;
    for (var i = 0; i < buf.length; i++) { s += buf[i] < 128 ? buf[i] : 256 - buf[i]; }
    return s;
}

/* --------------------------------------------------------------------------
   Escribir un PNG a partir de los pixeles.

   Dos cosas que antes no hacia, y que aqui valen mas de cien kilobytes: la
   aplicacion entera viaja dentro de un solo fichero, asi que cada icono va en
   base64 dentro de la pagina y lo que pese se paga en cada visita.

     - Si no hay un solo pixel translucido, el canal alfa sobra y se guarda en
       RGB: una cuarta parte menos de datos que comprimir. Los iconos van sobre
       el fondo de la aplicacion, asi que son opacos todos menos uno.
     - Cada linea se guarda con el filtro que mejor le va, no todas sin filtrar.
       En un degradado esa es la diferencia entre guardar el color de cada pixel
       y guardar un cero detras de otro.
   -------------------------------------------------------------------------- */
function pngDeBuffer(w, h, rgba) {
    var i, y, x, f;
    var opaco = true;
    for (i = 3; i < rgba.length; i += 4) { if (rgba[i] !== 255) { opaco = false; break; } }
    var bpp = opaco ? 3 : 4;
    var ancho = w * bpp;

    var raw = Buffer.alloc(h * (ancho + 1));
    var previa = Buffer.alloc(ancho);
    var actual = Buffer.alloc(ancho);
    var probada = Buffer.alloc(ancho);
    var mejor = Buffer.alloc(ancho);
    var o = 0;

    for (y = 0; y < h; y++) {
        if (opaco) {
            for (x = 0; x < w; x++) {
                var s = (y * w + x) * 4, d = x * 3;
                actual[d] = rgba[s]; actual[d + 1] = rgba[s + 1]; actual[d + 2] = rgba[s + 2];
            }
        } else {
            rgba.copy(actual, 0, y * ancho, (y + 1) * ancho);
        }
        var mejorF = 0, mejorCoste = -1;
        for (f = 0; f < 5; f++) {
            filtrarLinea(f, actual, previa, bpp, probada);
            var c = costeLinea(probada);
            if (mejorCoste < 0 || c < mejorCoste) {
                mejorCoste = c; mejorF = f;
                probada.copy(mejor);
            }
        }
        raw[o++] = mejorF;
        mejor.copy(raw, o);
        o += ancho;
        actual.copy(previa);
    }

    var ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;                 /* 8 bits por canal */
    ihdr[9] = opaco ? 2 : 6;     /* color RGB o RGBA */
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0))
    ]);
}

/* --------------------------------------------------------------------------
   El logo, y solo el logo.

   Aqui habia un alfabeto vectorial hecho a mano -seis letras a base de
   segmentos y arcos- para escribir la marca en la tarjeta social, y una letra
   dibujada aparte para el icono. Ya no: la aplicacion tiene un logo de verdad
   y es la unica imagen que ensena. De src/logo.png salen TODOS los iconos, la
   tarjeta social y el logo de la cabecera; no hay ninguna otra imagen.

   El maestro es un PNG y no el WebP que lo origina porque un PNG se lee con el
   zlib que Node ya trae, y un WebP con perdida no: son mil quinientas lineas
   de bitstream y aqui no entran dependencias. tools/logo.js hace esa
   conversion una vez, con el navegador, y la compilacion avisa si el WebP es
   mas nuevo que el PNG.
   -------------------------------------------------------------------------- */
var BG = [6, 7, 15, 255], ICE = [56, 189, 248, 255], HOT = [224, 249, 255, 255];

/* Deshacer el filtro de una linea de PNG. Son cinco y hay que tenerlos los
   cinco: el codificador elige uno distinto por linea segun le convenga. */
function desfiltrar(filtro, linea, previa, bpp) {
    var i, izq, arriba, diag, p, pa, pb, pc;
    if (filtro === 0) { return; }
    if (filtro === 1) {
        for (i = bpp; i < linea.length; i++) { linea[i] = (linea[i] + linea[i - bpp]) & 255; }
        return;
    }
    if (filtro === 2) {
        for (i = 0; i < linea.length; i++) { linea[i] = (linea[i] + previa[i]) & 255; }
        return;
    }
    if (filtro === 3) {
        for (i = 0; i < linea.length; i++) {
            izq = i >= bpp ? linea[i - bpp] : 0;
            linea[i] = (linea[i] + ((izq + previa[i]) >> 1)) & 255;
        }
        return;
    }
    if (filtro === 4) {                     /* Paeth */
        for (i = 0; i < linea.length; i++) {
            izq = i >= bpp ? linea[i - bpp] : 0;
            arriba = previa[i];
            diag = i >= bpp ? previa[i - bpp] : 0;
            p = izq + arriba - diag;
            pa = Math.abs(p - izq); pb = Math.abs(p - arriba); pc = Math.abs(p - diag);
            linea[i] = (linea[i] + (pa <= pb && pa <= pc ? izq : (pb <= pc ? arriba : diag))) & 255;
        }
        return;
    }
    throw new Error("filtro PNG desconocido: " + filtro);
}

/* Leer un PNG. Solo el que deja tools/logo.js: ocho bits por canal, sin
   entrelazar y en color RGB o RGBA. Lo demas se rechaza con un mensaje que
   dice que hacer, en vez de sacar una imagen con la basura bien ordenada. */
function leerPng(buf) {
    var firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (var k = 0; k < 8; k++) {
        if (buf[k] !== firma[k]) { throw new Error("src/logo.png no es un PNG"); }
    }
    var off = 8, w = 0, h = 0, bits = 0, tipo = 0, entrelazado = 0, idat = [];
    while (off + 8 <= buf.length) {
        var largo = buf.readUInt32BE(off);
        var id = buf.toString("ascii", off + 4, off + 8);
        var datos = buf.subarray(off + 8, off + 8 + largo);
        if (id === "IHDR") {
            w = datos.readUInt32BE(0); h = datos.readUInt32BE(4);
            bits = datos[8]; tipo = datos[9]; entrelazado = datos[12];
        } else if (id === "IDAT") { idat.push(Buffer.from(datos)); }
        else if (id === "IEND") { break; }
        off += 12 + largo;
    }
    if (bits !== 8 || (tipo !== 6 && tipo !== 2) || entrelazado) {
        throw new Error("src/logo.png tiene que ser PNG de 8 bits, sin entrelazar y RGB o RGBA;\n" +
            "  vuelve a generarlo con \"npm run logo\"");
    }
    var canales = tipo === 6 ? 4 : 3;
    var crudo = zlib.inflateSync(Buffer.concat(idat));
    var ancho = w * canales;
    var px = Buffer.alloc(w * h * 4);
    var previa = Buffer.alloc(ancho);
    var p = 0;
    for (var y = 0; y < h; y++) {
        var filtro = crudo[p++];
        var linea = Buffer.from(crudo.subarray(p, p + ancho));
        p += ancho;
        desfiltrar(filtro, linea, previa, canales);
        for (var x = 0; x < w; x++) {
            var s = x * canales, d = (y * w + x) * 4;
            px[d] = linea[s]; px[d + 1] = linea[s + 1]; px[d + 2] = linea[s + 2];
            px[d + 3] = canales === 4 ? linea[s + 3] : 255;
        }
        previa = linea;
    }
    return { w: w, h: h, px: px };
}

/* Reducir promediando TODA el area de origen que cae en cada pixel nuevo, no
   cogiendo el pixel del medio: de 1254 a 32 hay un factor de cuarenta, y
   muestrear a saltos ahi se come los trazos finos y deja el borde a
   dentelladas.

   El color se promedia multiplicado por su opacidad y se divide al final por
   la opacidad total. Sin eso, los pixeles transparentes del borde -que suelen
   ser negros con alfa cero- arrastran el promedio y el logo sale con una orla
   oscura alrededor. */
function escalar(img, w1, h1) {
    var w0 = img.w, h0 = img.h, src = img.px;
    var out = Buffer.alloc(w1 * h1 * 4);
    for (var y = 0; y < h1; y++) {
        var y0 = Math.floor(y * h0 / h1);
        var y1 = Math.max(y0 + 1, Math.floor((y + 1) * h0 / h1));
        for (var x = 0; x < w1; x++) {
            var x0 = Math.floor(x * w0 / w1);
            var x1 = Math.max(x0 + 1, Math.floor((x + 1) * w0 / w1));
            var r = 0, g = 0, b = 0, a = 0, n = 0;
            for (var v = y0; v < y1; v++) {
                for (var u = x0; u < x1; u++) {
                    var s = (v * w0 + u) * 4, al = src[s + 3];
                    r += src[s] * al; g += src[s + 1] * al; b += src[s + 2] * al;
                    a += al; n++;
                }
            }
            var d = (y * w1 + x) * 4;
            out[d] = a ? Math.round(r / a) : 0;
            out[d + 1] = a ? Math.round(g / a) : 0;
            out[d + 2] = a ? Math.round(b / a) : 0;
            out[d + 3] = Math.round(a / n);
        }
    }
    return { w: w1, h: h1, px: out };
}

/* Pegar una imagen sobre otra respetando la transparencia. */
function pegar(dst, dw, dh, img, ox, oy) {
    for (var y = 0; y < img.h; y++) {
        var dy = oy + y;
        if (dy < 0 || dy >= dh) { continue; }
        for (var x = 0; x < img.w; x++) {
            var dx = ox + x;
            if (dx < 0 || dx >= dw) { continue; }
            var s = (y * img.w + x) * 4, d = (dy * dw + dx) * 4;
            var a = img.px[s + 3] / 255;
            if (!a) { continue; }
            dst[d] = Math.round(img.px[s] * a + dst[d] * (1 - a));
            dst[d + 1] = Math.round(img.px[s + 1] * a + dst[d + 1] * (1 - a));
            dst[d + 2] = Math.round(img.px[s + 2] * a + dst[d + 2] * (1 - a));
            dst[d + 3] = Math.round(255 * a + dst[d + 3] * (1 - a));
        }
    }
}

function lienzo(w, h, color) {
    var px = Buffer.alloc(w * h * 4);
    for (var i = 0; i < px.length; i += 4) {
        px[i] = color[0]; px[i + 1] = color[1]; px[i + 2] = color[2]; px[i + 3] = color[3];
    }
    return px;
}

/* El logo centrado, ocupando la fraccion que se le diga del lado.

   "ocupa" es lo unico que cambia entre un icono normal (casi todo el cuadro) y
   uno recortable de Android, al que el sistema le puede morder las esquinas
   para hacerlo redondo: ahi el dibujo tiene que caber en el circulo de dentro.
   Con fondo null sale transparente, que es lo que quiere la cabecera de la
   aplicacion, donde detras hay ocho temas distintos. */
function iconoLogo(logo, tam, ocupa, fondo) {
    var escala = tam * ocupa / Math.max(logo.w, logo.h);
    var lw = Math.max(1, Math.round(logo.w * escala));
    var lh = Math.max(1, Math.round(logo.h * escala));
    var px = fondo ? lienzo(tam, tam, fondo) : Buffer.alloc(tam * tam * 4);
    pegar(px, tam, tam, escalar(logo, lw, lh),
          Math.round((tam - lw) / 2), Math.round((tam - lh) / 2));
    return pngDeBuffer(tam, tam, px);
}

/* --------------------------------------------------------------------------
   Tarjeta para redes sociales: 1200x630 con el logo.

   Ninguna red social ensena un SVG en la vista previa, y muchas no entienden
   WebP: todas se fian de un PNG (o un JPG) de tamano conocido. El nombre no se
   dibuja: lo pone og:title, y ahi es texto de verdad, que se lee, se traduce y
   se busca.
   -------------------------------------------------------------------------- */
function tarjetaSocial(logo) {
    var w = 1200, h = 630;
    var px = Buffer.alloc(w * h * 4);
    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var u = x / w, v = y / h;
            /* Las mismas dos luces que el fondo de la aplicacion: una fria
               arriba y otra caliente abajo a la derecha. */
            var arriba = Math.max(0, 1 - Math.sqrt(Math.pow((u - 0.5) * 1.5, 2) + Math.pow((v + 0.22) * 2.1, 2)));
            var abajo = Math.max(0, 1 - Math.sqrt(Math.pow((u - 0.94) * 1.7, 2) + Math.pow((v - 1.06) * 2.4, 2)));
            var d = (y * w + x) * 4;
            px[d] = Math.min(255, Math.round(BG[0] + ICE[0] * arriba * 0.16 + 244 * abajo * 0.1));
            px[d + 1] = Math.min(255, Math.round(BG[1] + ICE[1] * arriba * 0.16 + 114 * abajo * 0.1));
            px[d + 2] = Math.min(255, Math.round(BG[2] + ICE[2] * arriba * 0.16 + 182 * abajo * 0.1));
            px[d + 3] = 255;
        }
    }
    var lado = Math.round(h * 0.62);
    pegar(px, w, h, escalar(logo, lado, lado), Math.round((w - lado) / 2), Math.round((h - lado) / 2));
    return pngDeBuffer(w, h, px);
}

/* --------------------------------------------------------------------------
   Los nombres de las variables del javascript minificado.

   Un minificador reparte los nombres cortos siempre igual: a la variable mas
   usada le toca "a", a la siguiente "b". Es una funcion del codigo, asi que
   dos compilaciones del mismo codigo dan los mismos nombres, y quien escribe
   un script contra la version de hoy lo tiene funcionando en la de manana.

   Esto le cambia el reparto: el orden del abecedario se baraja con la semilla
   de la compilacion, asi que la variable mas usada se llama "q" en una version
   y "T" en la siguiente, y con ella cambia el fichero entero. Sirve para lo
   mismo que el renombrado de los ids del documento: no hace nada mas seguro
   por dentro, pero obliga a rehacer el trabajo a quien se agarra a los nombres
   de una version concreta.

   Terser pide un objeto con get(n) y, si estan, reset/consider/sort, que usa
   para ordenar las letras por frecuencia y ganar unos bytes al comprimir. Aqui
   NO se ponen a proposito: el orden tiene que ser el que dice la semilla, no el
   que conviene al compresor. Medido: no cuesta ni un byte en crudo -los nombres
   miden lo mismo, solo cambian las letras- y 452 bytes comprimido, un 1,3%.

   Las dos listas se barajan por separado. Si se barajaran juntas, un nombre
   podria empezar por un digito, y eso no es un identificador.
   -------------------------------------------------------------------------- */
function generadorDeNombres(semilla) {
    var LETRAS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_'.split('');
    var DIGITOS = '0123456789'.split('');
    var byte = chorroDeBytes(semilla);

    function barajar(lista) {
        for (var i = lista.length - 1; i > 0; i--) {
            /* Fisher-Yates. El sesgo del modulo aqui da igual: lo que se busca
               es que no haya dos compilaciones iguales, no una permutacion
               perfectamente uniforme. */
            var j = byte() % (i + 1);
            var t = lista[i]; lista[i] = lista[j]; lista[j] = t;
        }
        return lista;
    }

    var chars = barajar(LETRAS.slice()).concat(barajar(DIGITOS.slice()));

    return {
        get: function (num) {
            /* El mismo recuento que trae terser de serie: la primera letra sale
               de las 54 que pueden abrir un identificador y las siguientes de
               las 64, digitos incluidos. */
            var ret = '', base = 54;
            num++;
            do {
                num--;
                ret += chars[num % base];
                num = Math.floor(num / base);
                base = 64;
            } while (num > 0);
            return ret;
        }
    };
}

/* --------------------------------------------------------------------------
   Minificador de HTML.

   Igual de conservador que el de CSS, y con una regla que no se puede saltar:
   lo que hay dentro de <script>, <style>, <textarea> y <pre> NO se toca. Los
   dos primeros llevan su hash en la politica de seguridad, y un espacio de
   mas ahi dentro convierte la pagina en una pagina que el navegador se niega
   a ejecutar.

   Los saltos de linea entre etiquetas desaparecen; un espacio suelto entre
   dos etiquetas, no: ese lo escribio alguien a proposito y separa palabras.
   -------------------------------------------------------------------------- */
function minifyHtml(html) {
    var guardado = [];
    html = html.replace(/<(script|style|textarea|pre)\b([^>]*)>([\s\S]*?)<\/\1>/gi, function (m, tag, attrs, cuerpo) {
        /* Lo unico que se toca de dentro es el CSS de un <style>, y con el
           mismo minificador que el resto: un estilo escrito a mano dentro del
           documento tambien tiene que salir apretado. Como los hashes de la
           CSP se calculan despues, sobre el documento ya minificado, esto no
           puede descuadrar nada. */
        if (tag.toLowerCase() === 'style') {
            m = '<style' + attrs + '>' + minifyCss(cuerpo) + '</style>';
        }
        guardado.push(m);
        return '\u0001' + (guardado.length - 1) + '\u0001';
    });
    return html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/>[\t ]*[\r\n]+[\t ]*</g, '><')
        .replace(/[\t ]*[\r\n]+[\t ]*/g, ' ')
        .replace(/ {2,}/g, ' ')
        .replace(/^\s+|\s+$/g, '')
        .replace(/\u0001(\d+)\u0001/g, function (m, i) { return guardado[+i]; });
}

/* ==========================================================================
   NOMBRES NUEVOS PARA LOS IDENTIFICADORES EN CADA COMPILACION

   POR QUE EXISTE ESTO
   -------------------
   Quien quiera automatizar BINTIO desde fuera (una extension del navegador,
   un userscript, un Playwright) escribe lo mas corto que funciona:
   document.getElementById('btn-send'). Si en la version siguiente ese nombre
   ya no existe, su script deja de funcionar y hay que reescribirlo. Eso es lo
   unico que compra este trozo de codigo: subir el coste de mantenimiento de
   quien se cuelga del DOM.

   QUE COMPRA DE VERDAD, Y QUE NO
   ------------------------------
   Lo segundo se dice aqui, y no en el README, para que nadie que lea este
   fichero se confie. Lo que NO cambia entre compilaciones:

     - Las 55 clases de CSS del documento. No se pueden aleatorizar: el HTML y
       el CSS tienen que coincidir en ellas y ademas el JS escribe unas
       cuantas a mano ('hidden', 'is-active', 'list-item', 'sheet',
       'msg msg--' + dir). querySelector('.btn--primary') sigue funcionando en
       todas las versiones, y es un asidero tan bueno como un id.
     - data-theme, data-skin y data-bloom sobre <html> y <body>.
     - La estructura de etiquetas, los type=, los placeholder=, los
       autocomplete= y el texto castellano visible. En particular
       input[autocomplete="current-password"] apunta al campo de contrasena en
       TODAS las compilaciones, y solo hay tres <textarea> en el documento.
     - Y sobre todo: el nombre BINTIO esta reservado del mangle a proposito
       (mas abajo, en la llamada a terser), porque es la puerta de entrada del
       puente de escritorio. BINTIO.ui.openChat(pk) se llama igual en cada
       version, y quien sepa eso no necesita el DOM para nada.

   O sea: esto es ofuscacion, no un limite de seguridad. Sube el coste de un
   script perezoso; no sube el de uno escrito por alguien que mire el HTML una
   vez. Y no protege ningun secreto: las claves, los mensajes y la boveda no
   dependen de como se llamen los div.

   LO QUE CUESTA, Y COMO SE RECUPERA
   ---------------------------------
   Se pierde la reproducibilidad byte a byte. Hasta ahora dos ejecuciones del
   mismo fuente daban el mismo sha256 y cualquiera podia comprobar que lo
   publicado sale de este codigo. Ademas el sello de la cache se saca del
   documento entero (mas abajo, la variable stamp), asi que con nombres nuevos
   cada compilacion obliga al trabajador de servicio a reinstalarse: unos
   45 KB comprimidos de descarga que no hacian falta.

   Por eso existe BINTIO_IDSEED. Fijandola, los nombres vuelven a ser siempre
   los mismos y la compilacion vuelve a ser reproducible byte a byte:

       BINTIO_IDSEED=lo-que-sea  node tools/build.js

   Sin ella la semilla es aleatoria, que es lo que se quiere al publicar. En
   los dos casos la semilla se imprime en el informe del final: quien publique
   una version deberia anotarla, porque es lo unico que permite a un tercero
   reconstruir ese dist/index.html exacto y comprobar que sale de este fuente.
   Al depurar tambien vale: con la semilla fija, las herramientas del
   navegador dicen lo mismo entre dos compilaciones.

   DONDE VA EN EL ORDEN
   --------------------
   Sobre los tres idiomas a la vez y en un solo sitio, justo antes de montar
   el documento. Los hashes sha256 de la CSP y el sello de la cache se
   calculan despues, sobre la pagina ya montada y minificada, asi que se
   ajustan solos: lo que se firma es exactamente lo que se publica. Y no se
   escribe un solo byte en dist/ hasta que la auditoria del final da el visto
   bueno.

   COMO SE APLICA: SIEMPRE ANCLADO
   -------------------------------
   Tres formas, una por idioma, y las tres delimitadas. El anclaje no es
   elegancia, es lo unico que hace esto seguro:

       HTML   id="X", y los atributos que apuntan a un id (for=, aria-*...)
       CSS    #X sin que le siga letra, cifra, _ ni guion
       JS     'X' o "X" como cadena COMPLETA, entre sus comillas

   Sin anclar, un reemplazo de texto plano se estrella en tres sitios reales
   de este proyecto:

     - 14 ids son prefijo de otro: btn-peer de btn-peer-save, new-pass de
       new-pass2, composer de composer-text, btn-back de btn-backup. Con las
       comillas y el lookahead, btn-peer no puede morder dentro de
       btn-peer-save.
     - id="brand-sub" convive con class="brand-sub". Hay 8 reglas que usan la
       CLASE y ninguna que use #brand-sub. Tocando solo id="..." y el literal
       del JS, la clase se queda en paz; un reemplazo global se llevaria por
       delante el subtitulo de la cabecera.
     - id="app" no tiene ni un literal en el JS, pero la palabra app aparece
       71 veces ahi dentro (V.app y compania). Del id "app" solo se toca el
       #app del CSS, que es su unica referencia real.

   El renombrado del HTML se hace sobre src/index.html TAL CUAL, antes de
   meterle dentro el codigo y los estilos. Asi el patron \sid=" no puede
   morder jamas una cadena del JavaScript minificado.

   Terser no toca el contenido de las cadenas: los 166 literales del fuente
   llegan intactos al codigo minificado. Por eso se renombra DESPUES de
   minificar, que es donde estan las cadenas que de verdad se publican, y la
   auditoria comprueba que la cuenta cuadra en vez de darlo por hecho.

   QUE SE QUEDA FUERA
   ------------------
   Nada, hoy, y no es por suerte: se busco a proposito. No hay ni un id que se
   arme en tiempo de ejecucion. Cero concatenaciones, cero el.id = ..., cero
   setAttribute('id'|'for'|'aria-*'), cero getElementsBy*, cero
   querySelector('#...'). document.getElementById sale UNA sola vez en todo el
   proyecto, dentro de D.$ (60-ui-dom.js), y los tres querySelector que hay
   buscan por clase o por atributo. Los nodos que se crean en ejecucion no
   llevan id. Asi que los 103 aparecen siempre como cadena literal completa y
   una tabla viejo -> nuevo los cubre todos.

   Ojo con las formas INDIRECTAS, que si existen y por eso NO basta con
   reescribir las llamadas a D.$(): el array VIEWS de 60-ui-dom.js, las
   comparaciones contra D.current (60-ui-dom.js, 66-ui-connect.js dos veces y
   99-boot.js), el ayudante bar('new-bar', ...) de 63-ui-lock.js y los arrays
   de botones y de estadisticas de 63-ui-lock.js y 64-ui-roster.js. Aqui se
   renombra por LITERAL, no por llamada, asi que todas esas entran solas. Si
   se hubiera hecho por llamada no saltaria ninguna excepcion: simplemente la
   barra de estado dejaria de borrarse al cerrar la boveda, que es justo lo
   que la aplicacion promete no ensenar.

   INTOCABLES esta vacia a proposito. Si algun dia aparece un id que se arma
   en ejecucion, se apunta ahi con su motivo y conserva su nombre de siempre,
   en vez de romperse en silencio.

   SI ALGO NO CUADRA, SE PARA
   --------------------------
   Todas las comprobaciones de auditarPagina() son fatales. Un HTML renombrado
   con un JavaScript sin renombrar es una aplicacion que no arranca, y es un
   fallo mudo. tools/verify.js no lo notaria: ninguna de sus 58 comprobaciones
   mira un id.
   ========================================================================== */

/* Ids que no se renombran nunca, con el motivo escrito al lado. Vacia hoy:
   ningun id de este proyecto se construye en tiempo de ejecucion. */
var INTOCABLES = {};

/* Atributos de HTML cuyo valor es UN id. usemap no esta: apunta al name de un
   <map>, que no es un id. */
var ATRIBUTO_UN_ID = ['for', 'list', 'form', 'popovertarget', 'anchor',
    'aria-activedescendant', 'aria-details', 'aria-errormessage'];

/* Atributos cuyo valor es una LISTA de ids separados por espacios. */
var ATRIBUTO_VARIOS_IDS = ['aria-labelledby', 'aria-describedby', 'aria-controls',
    'aria-owns', 'aria-flowto', 'headers'];

var LETRAS = 'abcdefghijklmnopqrstuvwxyz';
var LETRAS_Y_CIFRAS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/* Siete caracteres, y no seis ni ocho, por una razon tonta pero real: en el
   CSS conviven los selectores #id con los colores #fff y #b9c8dc, y un color
   valido tiene 3, 4, 6 u 8 digitos. Con 7 no hay forma de confundir un nombre
   nuevo con un color al revisar a mano lo publicado. */
var LARGO_NOMBRE = 7;

/* --------------------------------------------------------------------------
   La semilla de la compilacion.

   Una sola para todo lo que cambia de un build a otro: los identificadores del
   documento y los nombres de las variables del javascript. Vive aqui arriba, y
   no dentro de quien la usa, porque el minificador la necesita antes de que
   exista nada que renombrar.

   Con BINTIO_IDSEED puesta, la compilacion se repite byte a byte. Sin ella, la
   siguiente version no se parece a esta por dentro.
   -------------------------------------------------------------------------- */
var SEMILLA = process.env.BINTIO_IDSEED || crypto.randomBytes(16).toString('hex');
var SEMILLA_FIJADA = !!process.env.BINTIO_IDSEED;

function escaparRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function veces(n) { return n === 1 ? '1 vez' : n + ' veces'; }

function contar(texto, patron) {
    var re = new RegExp(patron, 'g'), n = 0;
    while (re.exec(texto)) { n++; }
    return n;
}

/* Las dos formas ancladas que se usan fuera del HTML, en un solo sitio para
   que el renombrado y la auditoria no puedan discrepar. */
function patronLiteralJs(nombre) { return '([\'"])' + escaparRe(nombre) + '\\1'; }
function patronSelectorCss(nombre) { return '#' + escaparRe(nombre) + '(?![\\w-])'; }

/* Bytes a partir de una semilla. No hace falta un generador de verdad: sha256
   de "semilla:0", "semilla:1"... da un chorro determinista, sin dependencias
   y sin estado global. */
function chorroDeBytes(semilla) {
    var bloque = crypto.createHash('sha256').update(semilla + ':0').digest();
    var pos = 0, vuelta = 0;
    return function () {
        if (pos >= bloque.length) {
            vuelta++;
            bloque = crypto.createHash('sha256').update(semilla + ':' + vuelta).digest();
            pos = 0;
        }
        return bloque[pos++];
    };
}

/* Se descartan los bytes de la cola incompleta. Con 26 letras y 256 valores,
   aceptarlos todos haria las seis primeras letras mas probables que el resto.
   Esto no es criptografia, pero el sesgo se quita en una linea. */
function sacar(byte, alfabeto) {
    var tope = Math.floor(256 / alfabeto.length) * alfabeto.length, b;
    do { b = byte(); } while (b >= tope);
    return alfabeto.charAt(b % alfabeto.length);
}

/* Primer caracter siempre letra: #7ab no es un selector de CSS valido y las
   reglas se caerian sin decir nada. Y como solo salen letras y cifras, un
   nombre nuevo no puede fabricar un "-->", ni un <, ni un " ni un &, que es
   lo que descuadraria al minificador de HTML. */
function nombreNuevo(byte) {
    var s = sacar(byte, LETRAS);
    for (var i = 1; i < LARGO_NOMBRE; i++) { s += sacar(byte, LETRAS_Y_CIFRAS); }
    return s;
}

function pararRenombrado(semilla, problemas) {
    log('');
    log('ERROR: el renombrado de identificadores no cuadra. No se publica nada.');
    for (var i = 0; i < problemas.length; i++) { log('    - ' + problemas[i]); }
    log('');
    log('  Para repetir esta misma compilacion y mirarla con calma:');
    log('    BINTIO_IDSEED=' + semilla + ' node tools/build.js');
    log('');
    throw new Error('renombrado de identificadores incoherente: ' + problemas.length +
        (problemas.length === 1 ? ' fallo' : ' fallos'));
}

/* --------------------------------------------------------------------------
   piezas = { html: el fuente tal cual, js: minificado, css: minificado }
   Devuelve las tres ya renombradas y el plan, que la auditoria del final
   necesita para comprobar la pagina montada contra lo que se esperaba.
   -------------------------------------------------------------------------- */
function renombrarIds(piezas) {
    /* Un chorro propio: si los ids y los nombres del javascript salieran del
       mismo, cambiar el numero de ids moveria todos los nombres del codigo, y
       al reves. Cada uno con su etiqueta y no se estorban. */
    var semilla = SEMILLA;
    var fijada = SEMILLA_FIJADA;
    var byte = chorroDeBytes(semilla + '/ids');
    var problemas = [];
    var html = piezas.html, js = piezas.js, css = piezas.css;
    var i, m;

    /* ------------------------------------------- los ids del documento */
    var ids = [], vistos = {}, re = /\sid="([^"]*)"/g;
    while ((m = re.exec(html))) {
        if (vistos[m[1]]) { problemas.push('el id "' + m[1] + '" esta repetido en src/index.html'); }
        vistos[m[1]] = true;
        ids.push(m[1]);
    }
    if (!ids.length) { problemas.push('src/index.html no tiene ni un id: algo va muy mal'); }
    if (problemas.length) { pararRenombrado(semilla, problemas); }

    /* Que atributos apuntan a que id, para no tomar por muerto un id al que
       solo llama un <label for=>. */
    var apuntados = {};
    ATRIBUTO_UN_ID.concat(ATRIBUTO_VARIOS_IDS).forEach(function (attr) {
        var r = new RegExp('\\s' + attr + '="([^"]*)"', 'g'), x;
        while ((x = r.exec(html))) {
            x[1].split(/\s+/).forEach(function (t) { if (t) { apuntados[t] = attr; } });
        }
    });

    /* ------------------------------------------------------- la tabla */
    /* Ningun nombre nuevo puede existir ya en ninguno de los tres idiomas, ni
       siquiera como trozo de otra palabra. Es mas estricto de lo necesario y
       sale gratis: asi un nombre nuevo no puede chocar con una clase, con una
       cadena del codigo, con un color del CSS ni con otro id. */
    var todo = html + '\n' + js + '\n' + css;
    var mapa = {}, usados = {};
    for (i = 0; i < ids.length; i++) {
        var viejo = ids[i];
        if (INTOCABLES[viejo] || mapa[viejo]) { continue; }

        /* Un id que no se use ni desde el JS, ni desde el CSS, ni desde un
           atributo es un id que este fichero no entiende: o sobra, o hay una
           forma nueva de nombrarlo que aqui no se contempla. En vez de
           renombrarlo a ciegas, se para. Es la unica defensa contra el codigo
           que se escriba manana. */
        var enJs = contar(js, patronLiteralJs(viejo));
        var enCss = contar(css, patronSelectorCss(viejo));
        if (!enJs && !enCss && !apuntados[viejo]) {
            problemas.push('el id "' + viejo + '" no se usa desde el JS, ni desde el CSS, ni ' +
                'desde ningun atributo. O sobra, o lo nombra una forma que este renombrador ' +
                'no conoce. Quitalo del HTML, o apuntalo en INTOCABLES con el motivo.');
            continue;
        }

        var nuevo = '', intentos = 0;
        while (intentos < 1000) {
            nuevo = nombreNuevo(byte);
            intentos++;
            if (!usados[nuevo] && todo.indexOf(nuevo) < 0) { break; }
            nuevo = '';
        }
        if (!nuevo) {
            problemas.push('no salen nombres libres para "' + viejo + '"');
            continue;
        }

        usados[nuevo] = true;
        mapa[viejo] = nuevo;
    }
    if (problemas.length) { pararRenombrado(semilla, problemas); }

    /* Se apunta lo que hay ANTES para poder exigir despues la misma cuenta.
       Es la comprobacion que separa "renombrado" de "medio renombrado". */
    var esperado = {};
    Object.keys(mapa).forEach(function (v) {
        esperado[v] = {
            nuevo: mapa[v],
            js: contar(js, patronLiteralJs(v)),
            css: contar(css, patronSelectorCss(v))
        };
    });

    /* Una sola pasada con todos los nombres a la vez: yendo de uno en uno, un
       id que se llamara como el nombre nuevo de otro se renombraria dos
       veces. De mas largo a mas corto, aunque con el anclaje ya no haga
       falta. */
    var viejos = Object.keys(mapa).sort(function (a, b) {
        return b.length - a.length || (a < b ? -1 : (a > b ? 1 : 0));
    });
    var alternativa = viejos.map(escaparRe).join('|');

    /* ------------------------------------------------------------- JS */
    js = js.replace(new RegExp('([\'"])(' + alternativa + ')\\1', 'g'),
        function (t, comilla, nombre) { return comilla + mapa[nombre] + comilla; });

    /* ------------------------------------------------------------ CSS */
    css = css.replace(new RegExp('#(' + alternativa + ')(?![\\w-])', 'g'),
        function (t, nombre) { return '#' + mapa[nombre]; });

    /* ----------------------------------------------------------- HTML */
    html = html.replace(/(\sid=")([^"]*)(")/g, function (t, a, nombre, c) {
        if (INTOCABLES[nombre]) { return t; }
        if (!mapa[nombre]) {
            problemas.push('id="' + nombre + '" no esta en la tabla');
            return t;
        }
        return a + mapa[nombre] + c;
    });

    ATRIBUTO_UN_ID.forEach(function (attr) {
        html = html.replace(new RegExp('(\\s' + attr + '=")([^"]*)(")', 'g'),
            function (t, a, valor, c) {
                var v = valor.replace(/^\s+|\s+$/g, '');
                if (!v || INTOCABLES[v]) { return t; }
                if (!mapa[v]) {
                    problemas.push(attr + '="' + valor + '" no apunta a ningun id del documento');
                    return t;
                }
                return a + mapa[v] + c;
            });
    });

    ATRIBUTO_VARIOS_IDS.forEach(function (attr) {
        html = html.replace(new RegExp('(\\s' + attr + '=")([^"]*)(")', 'g'),
            function (t, a, valor, c) {
                var fuera = [];
                valor.split(/\s+/).forEach(function (tok) {
                    if (!tok) { return; }
                    if (INTOCABLES[tok]) { fuera.push(tok); return; }
                    if (!mapa[tok]) {
                        problemas.push(attr + ' apunta a "' + tok + '", que no es un id del documento');
                        fuera.push(tok);
                        return;
                    }
                    fuera.push(mapa[tok]);
                });
                return a + fuera.join(' ') + c;
            });
    });

    /* Anclas internas. Hoy no hay ni una, pero el dia que alguien escriba
       href="#view-main" tiene que seguir apuntando a algun sitio. */
    html = html.replace(/(\shref="#)([^"]*)(")/g, function (t, a, nombre, c) {
        if (!nombre || INTOCABLES[nombre]) { return t; }
        if (!mapa[nombre]) {
            problemas.push('href="#' + nombre + '" no apunta a ningun id del documento');
            return t;
        }
        return a + mapa[nombre] + c;
    });

    if (problemas.length) { pararRenombrado(semilla, problemas); }

    return {
        html: html, js: js, css: css,
        plan: { semilla: semilla, fijada: fijada, esperado: esperado, cuantos: viejos.length }
    };
}

/* --------------------------------------------------------------------------
   Auditoria sobre la pagina ya montada, minificada y con su CSP puesta: o
   sea, sobre los bytes exactos que se van a escribir. Hasta que esto pasa no
   se toca dist/.
   -------------------------------------------------------------------------- */
function auditarPagina(page, plan) {
    var problemas = [];
    var esperado = plan.esperado;
    var viejos = Object.keys(esperado);
    var dentroJs = (page.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
    var dentroCss = (page.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
    var m;

    /* 1. dos ids distintos no pueden haber ido a parar al mismo nombre */
    var porNombre = {};
    viejos.forEach(function (v) {
        var n = esperado[v].nuevo;
        if (porNombre[n]) {
            problemas.push('"' + porNombre[n] + '" y "' + v + '" se llaman ahora igual: "' + n + '"');
        }
        porNombre[n] = v;
    });

    /* 2. los ids de la pagina son exactamente los nombres nuevos, sin
       repetidos y sin que se haya colado ninguno de los viejos */
    var enPagina = {}, cuenta = 0, re = /\sid="([^"]*)"/g;
    while ((m = re.exec(page))) {
        if (enPagina[m[1]]) { problemas.push('el id "' + m[1] + '" sale dos veces en la pagina'); }
        enPagina[m[1]] = true;
        cuenta++;
    }
    if (cuenta !== viejos.length) {
        problemas.push('la pagina tiene ' + cuenta + ' ids y la tabla ' + viejos.length);
    }
    viejos.forEach(function (v) {
        if (!enPagina[esperado[v].nuevo]) {
            problemas.push('"' + v + '" tenia que salir como "' + esperado[v].nuevo + '" y no esta');
        }
        if (enPagina[v]) { problemas.push('id="' + v + '" sigue con su nombre original'); }
    });

    /* 3. misma cuenta que antes en el JS y en el CSS, y ni un nombre viejo
       suelto. Un HTML renombrado con un JS a medias es una aplicacion que no
       arranca, y no salta ninguna excepcion: deja de funcionar y ya. */
    viejos.forEach(function (v) {
        var e = esperado[v];
        var quedaJs = contar(dentroJs, patronLiteralJs(v));
        var quedaCss = contar(dentroCss, patronSelectorCss(v));
        var ahoraJs = contar(dentroJs, patronLiteralJs(e.nuevo));
        var ahoraCss = contar(dentroCss, patronSelectorCss(e.nuevo));
        if (quedaJs) { problemas.push('el codigo aun busca "' + v + '" ' + veces(quedaJs)); }
        if (quedaCss) { problemas.push('el estilo aun tiene el selector #' + v); }
        if (ahoraJs !== e.js) {
            problemas.push('"' + v + '" -> "' + e.nuevo + '": el codigo lo nombraba ' +
                veces(e.js) + ' y ahora ' + veces(ahoraJs));
        }
        if (ahoraCss !== e.css) {
            problemas.push('"' + v + '" -> "' + e.nuevo + '": el estilo lo nombraba ' +
                veces(e.css) + ' y ahora ' + veces(ahoraCss));
        }
    });

    /* 4. ningun atributo que apunte a un id se queda colgado. Si un for= se
       queda con el nombre viejo no peta nada: la etiqueta deja de enfocar su
       campo y un lector de pantalla se queda sin poder decir que es. Con los
       campos de contrasena, la llave de recuperacion y la clave de encuentro,
       es el peor sitio posible para un fallo mudo. */
    ATRIBUTO_UN_ID.concat(ATRIBUTO_VARIOS_IDS).forEach(function (attr) {
        var r = new RegExp('\\s' + attr + '="([^"]*)"', 'g'), x;
        while ((x = r.exec(page))) {
            x[1].split(/\s+/).forEach(function (tok) {
                if (!tok || INTOCABLES[tok]) { return; }
                if (!enPagina[tok]) {
                    problemas.push(attr + '="' + tok + '" no apunta a ningun id de la pagina');
                }
            });
        }
    });

    if (problemas.length) { pararRenombrado(plan.semilla, problemas); }
}

/* -------------------------------------------------------------------------- */
/* dist/ se vacia entera en cada compilacion, y no se salva nada: aqui dentro
   ya no vive nada que no genere este fichero. La biblioteca de Neutralino, que
   antes se quedaba aqui, vive ahora en desktop/ con el resto del escritorio. */
var KEEP = [];

/* Lo que deja tools/desktop.js en dist/ no se toca al recompilar la web: los
   ejecutables, el resources.neu y el zip son suyos.

   La regla NO se escribe aqui. Estaba escrita aqui, decia solo "lo que acabe en
   -release.zip", y cuando el empaquetador dejo de escribir en dist/bintio/ para
   escribir plano en dist/, esta copia se quedo vieja y el barrido de abajo se
   llevaba los siete ejecutables y el resources.neu en cada compilacion de la
   web. En silencio. Ahora la regla vive en tools/salida.js y la usan los dos. */
var esDelEscritorio = require('./salida').esDelEscritorio;

/* Los ejecutables de dist/ son de la ultima vez que se empaqueto el escritorio.
   Compilar solo la web les cambia el suelo debajo: el index.html nuevo lleva
   otros ids y otros nombres de variables (semilla nueva), asi que el que va
   dentro del resources.neu de al lado ya no es el mismo. No se borran -el
   usuario quiere el ejecutable en dist/, y borrarlo por si acaso es peor- pero
   callarselo tambien: quien publique esa carpeta estaria sirviendo una version
   por la web y repartiendo otra por el zip.

   Con --con-escritorio no se avisa: es la senal de que el empaquetador viene
   detras en el mismo comando y va a rehacerlos ahora mismo. */
function avisarDelEscritorio() {
    if (process.argv.indexOf('--con-escritorio') >= 0) { return; }
    if (!fs.existsSync(DIST)) { return; }
    var restos = fs.readdirSync(DIST).filter(esDelEscritorio);
    if (!restos.length) { return; }
    log('');
    log('  AVISO: en dist/ hay ' + restos.length + ' ficheros del escritorio de OTRA');
    log('  compilacion (otros ids y otros nombres de variables). Rehazlos con:');
    log('      npm run desktop:build');
}

function ensureDist() {
    if (fs.existsSync(DIST)) {
        fs.readdirSync(DIST).forEach(function (f) {
            if (KEEP.indexOf(f) >= 0 || esDelEscritorio(f)) { return; }
            var p = path.join(DIST, f);
            if (fs.statSync(p).isFile()) { fs.unlinkSync(p); }
        });
    } else {
        fs.mkdirSync(DIST, { recursive: true });
    }
}

function build() {
    var t0 = Date.now();

    /* ---------------------------------------------------------------- JS */
    var jsFiles = readSorted(path.join(SRC, 'js'), '.js');
    var jsSource = jsFiles.map(function (f) {
        return '/* ' + f.name + ' */\n' + f.code;
    }).join('\n');
    var jsRawLength = jsSource.length;

    var terser;
    try { terser = require('terser'); }
    catch (e) {
        log('ERROR: falta terser. Ejecuta "npm install" antes de compilar.');
        process.exit(1);
    }

    return terser.minify(jsSource, {
        ecma: 5,
        compress: { passes: 2, toplevel: true, drop_debugger: true },
        /* Renombra funciones y variables, incluidas las de nivel superior.
           Se salva el nombre BINTIO: es la unica puerta de entrada desde
           fuera (el puente de escritorio, una consola, un nodo propio). */
        mangle: {
            toplevel: true,
            reserved: ['BINTIO'],
            /* Los nombres, distintos en cada compilacion. Ver arriba. */
            nth_identifier: generadorDeNombres(SEMILLA + '/js')
        },
        format: {
            comments: false,
            preamble: '/* BINTIO ' + PKG.version + ' - sin servidores, sin rastreadores. Codigo: MIT. */'
        },
        sourceMap: false
    }).then(function (out) {
        if (out.error) { throw out.error; }
        var js = out.code;

        /* --------------------------------------------------------- CSS */
        var cssFiles = readSorted(path.join(SRC, 'css'), '.css');
        var cssRaw = cssFiles.map(function (f) { return f.code; }).join('\n');
        var css = minifyCss(cssRaw);

        /* ------------------------------------------------------- HTML */
        var html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

        /* ------------------------------------------- ids nuevos
           Aqui, y no antes ni despues: es el unico punto donde los tres
           idiomas estan a la vez sobre la mesa y todavia no se ha montado
           nada. Todo lo que viene detras (los hashes de la CSP, el sello de
           la cache, las cabeceras, la copia bintio.html) sale del documento
           ya renombrado y se ajusta solo. El porque de todo esto esta arriba,
           en el bloque de renombrarIds. */
        var renombrado = renombrarIds({ html: html, js: js, css: css });
        html = renombrado.html;
        js = renombrado.js;
        css = renombrado.css;
        /* El reemplazo va envuelto en una funcion y no como cadena, y esto no
           es estilo: es una mina que ya exploto una vez.

           En el segundo argumento de String.replace, las secuencias $&, $', $`
           y $$ NO son texto, son patrones de sustitucion ($1..$9 aqui no:
           este regex no tiene grupos). Lo que se mete aqui es el JavaScript
           minificado, y terser usa $ como nombre de variable. El dia que a una variable llamada $ le siga un &&, ese
           "$&" inserta el bloque de etiquetas entero en mitad del codigo: el
           build dice que todo ha ido bien y lo publicado sale roto.

           Con una funcion, el contenido se inserta literal y no se interpreta
           nada. */
        function replaceBlock(text, tag, content) {
            var re = new RegExp('<!-- BUILD:' + tag + ' -->[\\s\\S]*?<!-- /BUILD:' + tag + ' -->');
            return text.replace(re, function () { return content; });
        }

        function dataUri(tipo, buf) { return 'data:' + tipo + ';base64,' + buf.toString('base64'); }

        /* -------------------------------------------------------- logo
           Una sola imagen para toda la aplicacion, en los tamanos que cada
           sitio pide. Todo viaja dentro de la pagina; los mismos ficheros se
           escriben ademas sueltos en dist/ porque el empaquetador de
           escritorio necesita un PNG para el icono del ejecutable, y porque la
           tarjeta social tiene que ser una direccion de verdad: ningun
           rastreador de redes sociales sigue un data:. */
        var rutaLogo = path.join(SRC, 'logo.png');
        var rutaWebp = path.join(SRC, 'logo.webp');
        if (!fs.existsSync(rutaLogo)) {
            throw new Error('falta src/logo.png. Sale de src/logo.webp con "npm run logo"');
        }
        /* El WebP es el original y el PNG su copia legible desde aqui. Si el
           original es mas nuevo, la copia esta vieja y la aplicacion entera
           saldria con el logo de antes sin que nadie se entere. */
        if (fs.existsSync(rutaWebp) &&
            fs.statSync(rutaWebp).mtimeMs > fs.statSync(rutaLogo).mtimeMs + 1000) {
            throw new Error('src/logo.webp es mas nuevo que src/logo.png.\n' +
                '  Vuelve a convertirlo:  npm run logo');
        }
        var logo = leerPng(fs.readFileSync(rutaLogo));
        var png192 = iconoLogo(logo, 192, 0.84, BG);
        /* Un solo icono de 512 para las dos cosas, con la marca "any maskable".
           Antes habia dos, uno entero y otro con margen para que Android
           pueda morderle las esquinas al redondearlo, y eran setenta y cinco
           kilobytes de la misma imagen dos veces dentro de la pagina. Con el
           margen del recortable puesto -el dibujo cabe en el circulo de
           dentro- el mismo fichero vale para los dos usos: donde no se
           recorta se ve un poco mas de aire alrededor, y ya. */
        var pngMask = iconoLogo(logo, 512, 0.64, BG);
        var pngApple = iconoLogo(logo, 180, 0.82, BG);
        /* La pestana: a 32 pixeles el fondo de la aplicacion da mas contraste
           que la transparencia, que en una pestana clara desaparece. */
        var pngFav = iconoLogo(logo, 32, 0.92, BG);
        var pngFav2x = iconoLogo(logo, 64, 0.92, BG);
        /* El de la interfaz va SIN fondo: detras hay ocho temas, y uno de
           ellos es papel. A 192 se ve fino en pantallas de doble densidad. */
        var pngUi = iconoLogo(logo, 192, 1, null);
        var pngSocial = tarjetaSocial(logo);

        /* El logo entra en la hoja de estilos como variable, no en el marcado:
           asi la imagen viaja UNA vez aunque se pinte en la cabecera y en la
           portada. Se anade al final, ya minificado y con los ids nuevos
           puestos, para no pasear cien kilobytes de base64 por el minificador
           ni por el renombrador, que no tienen nada que hacer ahi. */
        css += ':root{--logo:url("' + dataUri('image/png', pngUi) + '")}';

        /* --------------------------------------------------- manifiesto
           El manifiesto tambien va dentro, en el propio enlace, con los
           iconos incrustados. Se le quitan start_url, scope e id: en una
           direccion data: no hay nada contra lo que resolverlos, y sin ellos
           el navegador usa por defecto la direccion del documento, que es
           exactamente lo que se quiere. Cuando la pagina se sirve, 99-boot.js
           lo rehace como blob con esas tres claves ya absolutas.

           El JSON sale en ASCII puro (lo de fuera va escapado) para que en el
           navegador baste un atob y no haya que arrastrar un decodificador de
           UTF-8 solo para esto. */
        var man = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.webmanifest'), 'utf8'));
        delete man.start_url;
        delete man.scope;
        delete man.id;
        man.icons = [
            { src: dataUri('image/png', png192), sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: dataUri('image/png', pngMask), sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ];
        var manifestJson = JSON.stringify(man).replace(/[^\x20-\x7e]/g, function (c) {
            return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
        });
        var manifestUri = 'data:application/manifest+json;base64,' +
            Buffer.from(manifestJson, 'utf8').toString('base64');

        /* ------------------------------------------------- el documento
           Un solo fichero: estilos, codigo, logos y manifiesto dentro. No
           queda ni un src ni un href que pida nada a nadie, asi que la CSP se
           cierra a los hashes de su propio contenido. Y no hace falta
           integridad de subrecursos, porque no hay subrecursos. */
        var page = replaceBlock(html, 'CSS', '<style>' + css + '</style>');
        page = replaceBlock(page, 'JS', '<script>' + js + '</script>');
        page = page
            .replace(/<link rel="manifest"[^>]*>/,
                '<link rel="manifest" href="' + manifestUri + '">')
            .replace(/<link rel="icon"[^>]*>/,
                '<link rel="icon" type="image/png" sizes="32x32" href="' + dataUri('image/png', pngFav) + '">' +
                '<link rel="icon" type="image/png" sizes="64x64" href="' + dataUri('image/png', pngFav2x) + '">')
            .replace(/<link rel="apple-touch-icon"[^>]*>/,
                '<link rel="apple-touch-icon" href="' + dataUri('image/png', pngApple) + '">')
            .replace(/(<meta name="msapplication-TileImage" content=")[^"]*/,
                '$1' + dataUri('image/png', png192));
        /* El enlace canonico solo tiene sentido si se sabe donde se publica.
           Sin dominio se cae, que es mejor que un canonico apuntando a ".". */
        if (!SITE) { page = page.replace(/<link rel="canonical"[^>]*>/, ''); }
        page = absoluteUrls(minifyHtml(page));

        /* Los hashes se sacan del documento ya minificado, no de las variables
           de aqui arriba: lo que tiene que cuadrar es lo que se publica. Si
           algun dia el minificador de HTML toca un byte de mas ahi dentro, la
           CSP lo seguira reflejando en vez de romper la pagina en silencio. */
        var dentroJs = (page.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
        var dentroCss = (page.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
        var csp = "default-src 'none'; script-src '" + sha256b64(dentroJs) + "'; style-src '" +
            sha256b64(dentroCss) + "'; img-src 'self' data: blob:; media-src 'self' blob: mediastream:; " +
            "connect-src 'self'; font-src 'self'; manifest-src 'self' data: blob:; worker-src 'self'; " +
            "base-uri 'none'; form-action 'none'; object-src 'none'";
        /* frame-ancestors no se pone aqui: en una etiqueta meta el navegador
           lo ignora y ademas ensucia la consola. Va en la cabecera que manda
           tools/serve.js, que es donde si tiene efecto. */
        page = page.replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]*(">)/,
            '$1' + csp + '$2');

        /* Ultimo momento posible: la pagina ya esta montada, minificada y
           firmada, o sea que esto se comprueba sobre los bytes exactos que se
           van a escribir. Si algo no cuadra, aqui se para y dist/ se queda
           como estaba en vez de publicar una pagina que no arranca. */
        auditarPagina(page, renombrado.plan);

        /* ------------------------------------------------------ salida
           dist/ se vacia AQUI y no al empezar. Estaba al principio de build(),
           asi que un fallo posterior dejaba la carpeta vacia mientras el
           mensaje de error prometia lo contrario. Ahora lo que hay publicado
           sobrevive intacto a una compilacion que no llega a terminar. */
        ensureDist();
        fs.writeFileSync(path.join(DIST, 'index.html'), page);
        /* El mismo fichero con el nombre de siempre, para quien se lo lleve en
           un USB o lo mande por correo y busque "bintio.html". */
        fs.writeFileSync(path.join(DIST, 'bintio.html'), page);

        fs.writeFileSync(path.join(DIST, 'icon-192.png'), png192);
        fs.writeFileSync(path.join(DIST, 'icon-512.png'), pngMask);
        fs.writeFileSync(path.join(DIST, 'apple-touch-icon.png'), pngApple);
        fs.writeFileSync(path.join(DIST, 'social.png'), pngSocial);

        /* Para los buscadores. Va aparte del <meta name="robots"> porque no
           todos los rastreadores leen el documento antes de decidir. */
        fs.writeFileSync(path.join(DIST, 'robots.txt'),
            'User-agent: *\nAllow: /\n' + (SITE ? 'Sitemap: ' + SITE + '/sitemap.xml\n' : ''));
        if (SITE) {
            fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
                '<?xml version="1.0" encoding="UTF-8"?>' +
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
                '<url><loc>' + SITE + '/</loc><changefreq>weekly</changefreq></url>' +
                '</urlset>\n');
        }

        /* Cabeceras listas para pegar en un alojamiento de verdad. Sin esto,
           quien publique dist/ en un servidor cualquiera perderia justo la
           mitad de la seguridad, que es la que no vive en el documento. */
        var deploy = H.deployConfigs(H.cspFor(page));
        fs.writeFileSync(path.join(DIST, '_headers'), deploy.netlify);
        fs.writeFileSync(path.join(DIST, '.htaccess'), deploy.htaccess);
        fs.writeFileSync(path.join(DIST, 'nginx.conf'), deploy.nginx);

        /* Lo unico que no se puede meter dentro del documento: el codigo de un
           trabajador de servicio tiene que venir de una direccion http o
           https, y ningun navegador acepta registrarlo desde blob: ni desde
           data:. Un kilobyte al lado, y solo hace falta si se publica en un
           servidor: con el fichero suelto no hay nada que cachear. */
        /* El nombre de la cache sale del documento ENTERO, no solo del js y el
           css. Desde que la aplicacion vive dentro del HTML, un cambio en el
           marcado, en un texto o en un icono no tocaba ni el js ni el css: el
           resumen salia identico, sw.js salia byte a byte igual, y entonces el
           navegador ni siquiera considera que haya una version nueva del
           trabajador. Consecuencia: la cache vieja no se borraba nunca y un
           cambio futuro en sw.js no habria llegado jamas a quien ya lo tuviera
           instalado. */
        var stamp = crypto.createHash('sha256').update(page).digest('hex').substr(0, 8);

        var sw = fs.readFileSync(path.join(SRC, 'sw.js'), 'utf8')
            .replace('__VERSION__', PKG.version + '-' + stamp)
            .replace('__FILES__', JSON.stringify(['index.html']));
        fs.writeFileSync(path.join(DIST, 'sw.js'), sw);

        /* ------------------------------------------------------ informe */
        function kb(n) { return (n / 1024).toFixed(1) + ' KB'; }
        log('');
        log('BINTIO ' + PKG.version + ' compilado en ' + (Date.now() - t0) + ' ms');
        log('  javascript  ' + jsFiles.length + ' ficheros  ' + kb(jsRawLength) + ' -> ' + kb(js.length) +
            '  (' + Math.round(100 - js.length * 100 / jsRawLength) + '% menos)');
        log('  css         ' + cssFiles.length + ' ficheros  ' + kb(cssRaw.length) + ' -> ' + kb(css.length) +
            '  (' + Math.round(100 - css.length * 100 / cssRaw.length) + '% menos)');
        log('  marcado     ' + kb(html.length) + ' -> ' + kb(page.length) +
            '  con estilos, codigo y logos dentro (sin un comentario, en una linea)');
        log('  index.html  ' + kb(page.length) + '   TODO dentro: estilos, codigo, logos y manifiesto');
        log('  bintio.html ' + kb(page.length) + '   el mismo fichero, con el nombre de siempre');
        log('  sw.js       ' + kb(sw.length) + '   lo unico que no se puede incrustar');
        log('  pwa         manifiesto incrustado con sus ' + man.icons.length + ' iconos dentro');
        log('  social      social.png 1200x630, robots.txt' + (SITE ? ' y sitemap.xml' : ''));
        log('  cabeceras   _headers, .htaccess y nginx.conf listos para publicar');
        avisarDelEscritorio();
        log('  ids         ' + renombrado.plan.cuantos + ' identificadores con nombre nuevo' +
            (renombrado.plan.fijada ? '   (semilla fijada a mano)' : '   (semilla al azar)'));
        log('  semilla     ' + renombrado.plan.semilla);
        log('              Apuntala: BINTIO_IDSEED=' + renombrado.plan.semilla + ' repite');
        log('              esta compilacion byte a byte. Sin ella, otros nombres.');
        log('');
        if (SITE) {
            log('  Direccion de publicacion: ' + SITE);
        } else {
            log('  Sin BINTIO_URL: las vistas previas sociales van con rutas relativas.');
            log('  Para publicar de verdad:  BINTIO_URL=https://tu.dominio npm run build');
        }
        log('');
        log('  dist/ listo.');
        log('    npm start          http://localhost:8787   (http basta en local)');
        log('    dist/bintio.html   doble clic, sin servidor de ninguna clase');
        log('');
    });
}

build()['catch'](function (err) {
    log('ERROR compilando: ' + (err && err.message ? err.message : err));
    process.exit(1);
});
