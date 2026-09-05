/* ==========================================================================
   De donde salen las frases que hay que traducir.

   Un solo sitio que sepa buscarlas, porque lo usan dos: test/idioma.test.js,
   que falla si alguna no esta traducida, y quien quiera sacar la lista para
   ponerse a traducir.

   Solo hay dos formas de marcar un texto y las dos son explicitas:

     en el marcado    <p data-t>lo que sea</p>   (tambien data-t-ph y -title)
     en el codigo     D.t('lo que sea')

   Y una tercera cosa que se busca sin que nadie la marque: los textos que se
   pintan SIN pasar por D.t. Esos son el fallo de verdad -saldrian siempre en
   espanol y nadie se daria cuenta-, asi que se listan aparte.
   ========================================================================== */
var fs = require('fs');
var path = require('path');

var SRC = path.join(__dirname, '..', 'src');

function ficheros(dir, out) {
    fs.readdirSync(dir).forEach(function (f) {
        var p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) { ficheros(p, out); }
        else if (/\.js$/.test(f)) { out.push(p); }
    });
    return out;
}

/* Los ficheros que pintan: la interfaz y el controlador. El nucleo no pinta,
   pero SI escribe mensajes de error que la interfaz ensena; esos se traducen
   donde se ensenan, no donde se escriben. */
function ficherosDeInterfaz() {
    return ficheros(path.join(SRC, 'js', 'interfaz'), [])
        .concat([path.join(SRC, 'js', 'app', 'app.js')]);
}

/* Lo que hay dentro de un D.t(...).

   No basta con mirar lo que va justo detras del parentesis: media docena de
   sitios eligen entre dos frases ahi mismo

       D.t(group ? 'Grupo' : 'Nuevo grupo')

   y las dos hay que traducirlas. Asi que se lee el argumento entero -hasta el
   parentesis que cierra, contando los de dentro- y se sacan todos los grupos
   de literales que haya. Un grupo es una frase: 'esto ' + 'y esto' es una
   sola, y las dos ramas de un ternario son dos. */
function literalesDe(texto) {
    var frases = [], i = 0;
    while (i < texto.length) {
        if (texto.charAt(i) !== "'") { i++; continue; }

        /* Un grupo: literales pegados con + */
        var junto = '', sigue = true;
        while (sigue && i < texto.length && texto.charAt(i) === "'") {
            i++;
            while (i < texto.length && texto.charAt(i) !== "'") {
                if (texto.charAt(i) === '\\') { junto += texto.charAt(i) + texto.charAt(i + 1); i += 2; continue; }
                junto += texto.charAt(i);
                i++;
            }
            i++;                                        /* la comilla de cierre */
            var j = i;
            while (j < texto.length && /\s/.test(texto.charAt(j))) { j++; }
            if (texto.charAt(j) === '+') {
                j++;
                while (j < texto.length && /\s/.test(texto.charAt(j))) { j++; }
                if (texto.charAt(j) === "'") { i = j; continue; }
            }
            sigue = false;
        }
        junto = junto.replace(/\\'/g, "'").replace(/\\u00f1/g, 'ñ');
        if (junto.length > 1) { frases.push(junto); }
    }
    return frases;
}

function deCodigo() {
    var frases = {};
    ficherosDeInterfaz().forEach(function (p) {
        /* Fuera los comentarios: los ejemplos que hay dentro -idioma.js explica
           como se usa D.t- no son texto que salga en pantalla, y colarlos aqui
           obligaria a "traducir" una frase que no existe. */
        var s = fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        var desde = 0;
        while ((desde = s.indexOf('D.t(', desde)) >= 0) {
            var i = desde + 4, nivel = 0, comilla = null, fin = -1;
            while (i < s.length) {
                var c = s.charAt(i);
                if (comilla) {
                    if (c === '\\') { i += 2; continue; }
                    if (c === comilla) { comilla = null; }
                    i++;
                    continue;
                }
                if (c === "'" || c === '"') { comilla = c; i++; continue; }
                if (c === '(' || c === '{' || c === '[') { nivel++; i++; continue; }
                if (c === '}' || c === ']') { nivel--; i++; continue; }
                if (c === ')') { if (!nivel) { fin = i; break; } nivel--; i++; continue; }
                /* El segundo argumento son los datos que rellenan los huecos, no
                   texto: ahi dentro puede haber comillas -un join(', ')- que no
                   hay que traducir. */
                if (c === ',' && !nivel) { fin = i; break; }
                i++;
            }
            if (fin < 0) { break; }
            literalesDe(s.slice(desde + 4, fin)).forEach(function (f) { frases[f] = true; });
            desde = fin;
        }
    });
    return frases;
}

/* El texto de las etiquetas marcadas con data-t, y los atributos que se leen. */
function deMarcado() {
    var html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
    var titulo = /<title>([^<]+)<\/title>/.exec(html);
    var cuerpo = html.slice(html.indexOf('<body'))
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<script[\s\S]*?<\/script>/g, '');

    /* Las entidades se decodifican: en el navegador, el texto del nodo ya viene
       con la letra puesta, asi que la clave tiene que ser "anadir" con la ene
       de verdad y no "a&ntilde;adir". Son cuatro; no hace falta un
       decodificador entero. */
    function letras(t) {
        return t.replace(/&ntilde;/g, 'ñ').replace(/&oacute;/g, 'ó')
                .replace(/&mdash;/g, '—').replace(/&lt;/g, '<')
                .replace(/&amp;/g, '&');
    }

    var frases = {}, m, re;

    /* El titulo de la pestana: no lleva data-t -esta en la cabeza, no en el
       cuerpo- pero se lee igual que cualquier otra cosa. */
    if (titulo) { frases[titulo[1]] = true; }

    /* Una etiqueta marcada, ENTERA.

       No basta con el texto que va justo detras, porque un parrafo puede
       llevar una parte en negrita en medio:

           <p data-t>La contrasena cifra todo. <b data-t>Nadie puede
           recuperarla</b>. Si la pierdes, pierdes los mensajes.</p>

       Ahi hay TRES trozos de texto y no uno. El de despues de la negrita se
       quedaba fuera de la lista y por eso salia siempre en espanol, en medio
       de un parrafo por lo demas traducido. Se recorre hasta la etiqueta que
       cierra -contando las de dentro, que pueden ser del mismo nombre- y se
       recoge cada trozo por separado, que es exactamente lo que hace el
       navegador en idioma.js. */
    function apuntarTrozo(t) {
        var limpio = letras(t.replace(/\s+/g, ' ').trim());
        if (limpio.length > 1) { frases[limpio] = true; }
    }

    re = /<([a-zA-Z][a-zA-Z0-9]*)([^<>]*\bdata-t\b[^<>]*)>/g;
    while ((m = re.exec(cuerpo))) {
        var tag = m[1].toLowerCase();
        var i = m.index + m[0].length;
        var hondo = 0, trozo = '';
        while (i < cuerpo.length) {
            if (cuerpo.charAt(i) !== '<') { trozo += cuerpo.charAt(i); i++; continue; }

            apuntarTrozo(trozo);
            trozo = '';
            var cierra = cuerpo.substr(i, tag.length + 3).toLowerCase() === '</' + tag + '>';
            var abre = cuerpo.substr(i, tag.length + 1).toLowerCase() === '<' + tag;
            if (cierra) {
                if (!hondo) { break; }
                hondo--;
            } else if (abre) { hondo++; }
            var fin = cuerpo.indexOf('>', i);
            if (fin < 0) { break; }
            i = fin + 1;
        }
        apuntarTrozo(trozo);
    }

    /* placeholder y title, cuando estan marcados */
    re = /<[a-zA-Z][^<>]*\bdata-t-ph\b[^<>]*>/g;
    while ((m = re.exec(cuerpo))) {
        var ph = /placeholder="([^"]+)"/.exec(m[0]);
        if (ph) { frases[letras(ph[1])] = true; }
    }
    re = /<[a-zA-Z][^<>]*\bdata-t-title\b[^<>]*>/g;
    while ((m = re.exec(cuerpo))) {
        var ti = /\btitle="([^"]+)"/.exec(m[0]);
        if (ti) { frases[letras(ti[1])] = true; }
    }
    return frases;
}

/* Textos que se pintan SIN pasar por D.t. El fallo que nadie ve. */
var PINTAN = [
    { nombre: 'D.toast', re: /D\.toast\(\s*'/g },
    { nombre: 'window.confirm', re: /window\.confirm\(\s*'/g },
    { nombre: 'createTextNode', re: /document\.createTextNode\(\s*'/g }
];

function sinMarcar() {
    var sueltas = [];
    ficherosDeInterfaz().forEach(function (p) {
        var s = fs.readFileSync(p, 'utf8');
        var corto = p.replace(/^.*src[\\\/]/, 'src/').replace(/\\/g, '/');
        PINTAN.forEach(function (c) {
            var re = new RegExp(c.re.source, 'g'), m;
            while ((m = re.exec(s))) {
                /* Lo que va justo detras del parentesis. Si esa cadena no
                   tiene letras -un espacio, un guion, un separador- no es una
                   frase y no hay nada que traducir. */
                var cola = s.slice(m.index, m.index + 200);
                var abre = cola.indexOf("'");
                var literal = '';
                for (var q = abre + 1; q < cola.length; q++) {
                    if (cola.charAt(q) === '\\') { q++; continue; }
                    if (cola.charAt(q) === "'") { break; }
                    literal += cola.charAt(q);
                }
                if (!/[a-zA-Z]{3}/.test(literal)) { continue; }
                var linea = s.slice(0, m.index).split('\n').length;
                sueltas.push(corto + ':' + linea + '  ' + cola.replace(/\s+/g, ' ').slice(0, 110));
            }
        });
    });
    return sueltas;
}

/* Todo junto, ordenado. */
function todas() {
    var frases = deCodigo();
    var marcado = deMarcado();
    for (var k in marcado) {
        if (Object.prototype.hasOwnProperty.call(marcado, k)) { frases[k] = true; }
    }
    return Object.keys(frases).sort();
}

module.exports = { todas: todas, deCodigo: deCodigo, deMarcado: deMarcado, sinMarcar: sinMarcar };

/* Ejecutado a mano, escupe la lista: util para ponerse a traducir. */
if (require.main === module) {
    var lista = todas();
    console.log('frases marcadas: ' + lista.length);
    var sueltas = sinMarcar();
    console.log('textos que se pintan sin traducir: ' + sueltas.length);
    sueltas.forEach(function (s) { console.log('  ' + s); });
    lista.forEach(function (f) { console.log('  ' + f); });
}
