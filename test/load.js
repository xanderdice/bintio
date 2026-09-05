/* Carga los modulos del nucleo en Node para poder probarlos sin navegador.
   Solo carga hasta el prefijo indicado: los ficheros 4x en adelante hablan
   con el navegador y no tienen sentido aqui. */
var fs = require('fs'), path = require('path'), vm = require('vm');
var dir = path.join(__dirname, '..', 'src', 'js');

module.exports = function (upto) {
    var files = fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).sort();
    var sandbox = {
        console: console,
        crypto: require('crypto').webcrypto,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        Date: Date,
        Math: Math
    };
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
