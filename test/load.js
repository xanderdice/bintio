/* Carga los modulos del nucleo en Node para poder probarlos sin navegador.
   Solo carga hasta el prefijo indicado: los ficheros 4x en adelante hablan
   con el navegador y no tienen sentido aqui. */
var fs = require('fs'), path = require('path'), vm = require('vm');
var dir = path.join(__dirname, '..', 'src', 'js');

/* "extra" mete globales de navegador que en Node no existen. Lo pide
   test/borrado.test.js: la boveda elige donde guardar mirando si hay
   localStorage, y para comprobar que el borrado lo deja limpio hace falta que
   lo haya. Sin esto, esa prueba mediria el almacen de memoria, que es
   justamente el que NO se le promete a nadie. */
module.exports = function (upto, extra) {
    var files = fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).sort();
    var sandbox = {
        console: console,
        crypto: require('crypto').webcrypto,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        Date: Date,
        Math: Math
    };
    if (extra) {
        for (var k in extra) {
            if (Object.prototype.hasOwnProperty.call(extra, k)) { sandbox[k] = extra[k]; }
        }
    }
    vm.createContext(sandbox);
    files.forEach(function (f) {
        if (upto && f.slice(0, upto.length) > upto) { return; }
        try {
            vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), sandbox, { filename: f });
        } catch (e) {
            console.error('FALLO cargando ' + f + ': ' + e.message);
            throw e;
        }
    });
    return sandbox.BINTIO;
};
