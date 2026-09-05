/* Que no quede ni una frase sin traducir.

   El esquema de traduccion de este proyecto usa el texto en espanol como
   clave (ver interfaz/idioma.js). Eso hace el codigo legible -se lee lo que
   va a salir en pantalla- y tiene un precio: si alguien cambia una coma en una
   frase espanola, su traduccion deja de encontrarse y esa linea vuelve al
   espanol sin que nadie se entere.

   Esta prueba es lo que convierte ese precio en un error de compilacion. Busca
   TODAS las frases marcadas -las del marcado con data-t y las que pasan por
   D.t()- y comprueba que cada una esta en la tabla. Si falta alguna, la dice.

   Y busca una segunda cosa: textos que se pintan sin pasar por D.t. Esos no
   fallarian nunca, saldrian siempre en espanol y nadie lo notaria hasta que
   alguien abriera la aplicacion en ingles y viera media pantalla en el otro
   idioma. Es el fallo silencioso que este fichero existe para cazar.        */
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ayuda = require('./ayuda');
var frases = require('./frases');

var ok = ayuda.ok;

console.log('Idioma');

/* La tabla, leida como la lee el navegador. */
var caja = { BINTIO: {} };
vm.createContext(caja);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'interfaz', 'textos.js'), 'utf8'),
    caja, { filename: 'textos.js' });
var TABLA = caja.BINTIO.textos;

ok('la tabla existe', !!TABLA && !!TABLA.en);

var idiomas = Object.keys(TABLA);
ok('hay al menos un idioma ademas del espanol', idiomas.length >= 1, idiomas.join(', '));

/* ---------------------------------------------------------------- completa */
var todas = frases.todas();
ok('hay frases marcadas', todas.length > 50, String(todas.length));

idiomas.forEach(function (cod) {
    var faltan = todas.filter(function (f) { return TABLA[cod][f] === undefined; });
    ok('no falta ni una frase en "' + cod + '"', faltan.length === 0,
       faltan.length + ' sin traducir, la primera: ' + (faltan[0] || '').slice(0, 70));

    /* Y al reves: una traduccion cuya clave ya no existe es una frase que
       alguien cambio y una traduccion que no se usa. No es grave, pero se
       acumula y confunde. */
    var sobran = Object.keys(TABLA[cod]).filter(function (k) { return todas.indexOf(k) < 0; });
    ok('no sobra ninguna traduccion en "' + cod + '"', sobran.length === 0,
       sobran.length + ' de mas, la primera: ' + (sobran[0] || '').slice(0, 70));
});

/* ------------------------------------------------------------- sin traducir */
var sueltas = frases.sinMarcar();
ok('no hay textos que se pinten sin pasar por D.t', sueltas.length === 0,
   sueltas.slice(0, 3).join(' | '));

/* --------------------------------------------------------------- los huecos */
/* Un hueco {quien} que este en el espanol tiene que estar tambien en el
   ingles: si se pierde, el nombre de la persona desaparece de la frase. */
function huecos(s) {
    var m = s.match(/\{[a-z]+\}/g) || [];
    return m.sort().join(',');
}
idiomas.forEach(function (cod) {
    var rotas = [];
    todas.forEach(function (f) {
        var t = TABLA[cod][f];
        if (t === undefined) { return; }
        if (huecos(f) !== huecos(t)) { rotas.push(f.slice(0, 60)); }
    });
    ok('los huecos cuadran en "' + cod + '"', rotas.length === 0, rotas.join(' | '));
});

/* -------------------------------------------------------- nada de etiquetas */
/* Una traduccion se mete en el DOM como texto, nunca como marcado. Aun asi, si
   alguna trajera una etiqueta seria senal de que alguien esta intentando
   maquetar desde aqui, y eso no se hace. */
var conEtiquetas = [];
idiomas.forEach(function (cod) {
    Object.keys(TABLA[cod]).forEach(function (k) {
        if (/<[a-zA-Z\/]/.test(TABLA[cod][k])) { conEtiquetas.push(k.slice(0, 50)); }
    });
});
ok('ninguna traduccion lleva etiquetas dentro', conEtiquetas.length === 0, conEtiquetas.join(' | '));

/* ------------------------------------------------------- se puede elegir */
/* Que la tabla este completa no sirve de nada si no hay forma de cambiar de
   idioma, y eso es exactamente lo que paso: el <select id="set-lang"> se
   publico VACIO -sin una sola opcion y sin nadie que se las pusiera- y ninguna
   de las 443 comprobaciones lo vio. Todas miraban la tabla de textos o lo ya
   compilado; ninguna miraba si se podia usar. La etiqueta de al lado,
   "Idioma", si estaba traducida, asi que la prueba salia verde senalando justo
   al sitio del fallo.

   Hacen falta las DOS de aqui abajo, porque el fallo se cuela por cualquiera de
   los dos huecos: que la funcion que llena el desplegable no funcione, o que
   funcione y no la llame nadie. Lo segundo era el caso. */

/* 1. La funcion llena de verdad. Se ejecuta idioma.js con lo justo de DOM que
      necesita -crear una etiqueta y colgarla- y se le pide que llene un
      desplegable de mentira. */
var falsoDoc = {
    createElement: function () { return { value: '', textContent: '' }; },
    documentElement: { setAttribute: function () {} },
    querySelectorAll: function () { return []; },
    title: ''
};
var cajaUi = {
    BINTIO: { ui: { clear: function (el) { el.opciones = []; } } },
    document: falsoDoc,
    localStorage: { getItem: function () { return null; }, setItem: function () {} },
    navigator: { language: 'es' }
};
vm.createContext(cajaUi);
vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'interfaz', 'idioma.js'), 'utf8'),
    cajaUi, { filename: 'idioma.js' });
var UI = cajaUi.BINTIO.ui;

var desplegable = { opciones: [], value: '', appendChild: function (o) { this.opciones.push(o); } };
UI.montarIdiomas(desplegable);

ok('el desplegable de idioma se llena con todos los idiomas',
   desplegable.opciones.length === UI.IDIOMAS.length,
   desplegable.opciones.length + ' opciones para ' + UI.IDIOMAS.length + ' idiomas');
ok('y cada opcion lleva su codigo y su nombre',
   desplegable.opciones.every(function (o, i) {
       return o.value === UI.IDIOMAS[i].codigo && o.textContent === UI.IDIOMAS[i].nombre;
   }),
   desplegable.opciones.map(function (o) { return o.value + '=' + o.textContent; }).join(' '));

/* 2. Y alguien la llama con el desplegable de verdad. Sin esta linea, la de
      arriba pasaria en verde sobre una pantalla en la que no hay nada que
      elegir, que es justo lo que se publico. */
var ajustes = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'js', 'interfaz', 'settings.js'), 'utf8');
ok('y Ajustes lo llena al arrancar',
   ajustes.indexOf("D.montarIdiomas(D.$('set-lang'))") >= 0,
   'nadie llama a D.montarIdiomas con set-lang');

ayuda.resumen();
