/* ==========================================================================
   Que ficheros de dist/ son del escritorio y cuales son la web.

   Existe por un fallo concreto, y de los caros: la regla estaba escrita dos
   veces, una en build.js y otra en desktop.js, y cuando la salida del
   empaquetador paso de la carpeta dist/bintio/ a ficheros planos en dist/, solo
   se actualizo una. build.js barria dist/ dejando "todo lo que no sea del
   escritorio", y como su copia de la regla solo reconocia el zip, cada
   compilacion de la web se llevaba por delante los siete ejecutables y el
   resources.neu que acababa de dejar el empaquetador. En silencio, ademas: el
   unico superviviente era un zip de la compilacion anterior.

   Lo peor no fue el borrado, fue que el comentario que lo justificaba seguia
   ahi, diciendo que no podia pasar. Por eso la regla vive ahora en un solo
   fichero: no se puede desincronizar lo que no esta duplicado.

   La regla, en dos pasos:

     1. Lo que compila la web NUNCA es del escritorio. Se mira primero porque es
        la parte que no se puede equivocar: si algun dia hay un icono que se
        llame bintio-algo.png, es de la web, y ni se salva del barrido ni se
        queda fuera del paquete.
     2. De lo que queda, es del escritorio el paquete (resources.neu), el zip de
        publicacion y los ejecutables, que el CLI de Neutralino nombra siempre
        <binaryName>-<sistema>.

   Ojo con el guion: bintio.html empieza igual que bintio-win_x64.exe y ESA es
   la web. Por eso el patron lleva el guion y no vale un indexOf del nombre.
   ========================================================================== */
var fs = require('fs');
var path = require('path');

var CFG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'neutralino.config.json'), 'utf8'));
var NOMBRE = CFG.cli.binaryName;

/* Todo lo que sale de tools/build.js acaba en una de estas. Los que no llevan
   extension (_headers, .htaccess) tampoco empiezan por el prefijo, asi que
   caen del lado correcto solos. */
var DE_LA_WEB = /\.(?:html|css|js|png|svg|webp|ico|webmanifest|txt|xml|json|conf|map)$/;

var PREFIJO = new RegExp('^' + NOMBRE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-');

function esDelEscritorio(nombre) {
    if (DE_LA_WEB.test(nombre)) { return false; }
    return nombre === 'resources.neu' || PREFIJO.test(nombre);
}

module.exports = {
    nombre: NOMBRE,
    zip: NOMBRE + '-release.zip',
    esDelEscritorio: esDelEscritorio
};
