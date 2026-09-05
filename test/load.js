/* Monta la aplicacion en Node para poder probarla sin navegador.

   El orden de carga NO se decide aqui: se lee de src/index.html, que es donde
   vive desde que los ficheros dejaron de llamarse 00-, 10-, 20-. Un solo sitio
   dice en que orden va el codigo, y lo dice la propia pagina.

   Cuanto cargar se pide por capa, con el nombre de la carpeta:

     cargar('nucleo')        cifrado, boveda, contactos, malla, conversaciones.
                             Nada de esto toca el DOM ni la red.
     cargar('sin-interfaz')  lo anterior mas los transportes y el controlador.
                             Es lo que necesita cualquier prueba que monte dos
                             aparatos y los haga hablar.

   La interfaz no se carga nunca aqui: pide un DOM, y para eso esta el
   navegador.

   El segundo argumento mete globales que en Node no existen (localStorage y
   compania). Lo pide test/borrado.test.js: la boveda elige donde guardar
   mirando si hay localStorage, y para comprobar que el borrado lo deja limpio
   hace falta que lo haya.                                                   */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var SRC = path.join(__dirname, '..', 'src');

/* Las capas, en el orden en que se cargan. Cada nombre es una carpeta de
   src/js/, y lo que hay dentro de cada una lo dice index.html. */
var CAPAS = {
    'nucleo': ['nucleo'],
    'sin-interfaz': ['nucleo', 'transportes', 'app']
};

/* Las rutas que lista la pagina, en orden. Misma lectura que tools/build.js:
   si las dos leyeran sitios distintos, tarde o temprano dirian cosas
   distintas. */
function rutasDeLaPagina() {
    var html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
    var abre = '<!-- BUILD:JS -->';
    var cierra = '<!-- /BUILD:JS -->';
    var desde = html.indexOf(abre);
    var hasta = html.indexOf(cierra);
    if (desde < 0 || hasta < desde) {
        throw new Error('src/index.html no tiene el bloque BUILD:JS');
    }
    var dentro = html.slice(desde + abre.length, hasta);

    var rutas = [], m;
    var re = /src="(js\/[^"]+)"/g;
    while ((m = re.exec(dentro))) { rutas.push(m[1]); }
    if (!rutas.length) { throw new Error('el bloque BUILD:JS esta vacio'); }
    return rutas;
}

module.exports = function (capa, globales) {
    var quiero = CAPAS[capa || 'sin-interfaz'];
    if (!quiero) {
        throw new Error('capa desconocida: ' + capa + '. Vale ' + Object.keys(CAPAS).join(' o '));
    }

    var sandbox = {
        console: console,
        crypto: require('crypto').webcrypto,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        Date: Date,
        Math: Math
    };
    if (globales) {
        for (var k in globales) {
            if (Object.prototype.hasOwnProperty.call(globales, k)) { sandbox[k] = globales[k]; }
        }
    }
    vm.createContext(sandbox);

    rutasDeLaPagina().forEach(function (ruta) {
        var carpeta = ruta.split('/')[1];          /* js/<carpeta>/fichero.js */
        if (quiero.indexOf(carpeta) < 0) { return; }
        var completa = path.join(SRC, ruta);
        try {
            vm.runInContext(fs.readFileSync(completa, 'utf8'), sandbox, { filename: ruta });
        } catch (e) {
            console.error('FALLO cargando ' + ruta + ': ' + e.message);
            throw e;
        }
    });

    return sandbox.BINTIO;
};
