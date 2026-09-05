/* ==========================================================================
   Version de escritorio, para los siete sistemas de golpe.

   Esto lo llama el propio "npm run build" (y por tanto "npm start"), asi que
   compilar la aplicacion deja tambien los ejecutables hechos. Se puede llamar
   suelto con "npm run desktop:build".

   Por que existe este fichero y no un "neu build" a pelo en package.json:

     1. Neutralino no trae los binarios en el paquete de npm. Hay que pedirlos
        una vez con "neu update", y hasta que no estan, "neu build" falla con
        un ENOENT que no explica nada. Aqui se comprueba antes y se bajan
        solos la primera vez.
     2. La aplicacion que se empaqueta es la de dist/, asi que hay que
        compilar la web ANTES. Si no, se empaqueta lo de la vez anterior.
     3. Cuando esto va enganchado al build, un fallo suyo NO puede tumbar la
        compilacion de la web: quien esta sin conexion tiene que poder seguir
        trabajando en la aplicacion. Para eso esta --soft.
     4. Y porque el CLI hay que sacarlo del proyecto. Ver "el banco".

   Opciones:

     --only-package   no recompila la web (ya la ha compilado quien llama)
     --soft           avisa y sale bien si el empaquetado no se puede hacer
     --run            abre la ventana de escritorio en vez de empaquetar
     --setup          solo baja los binarios base y sale

   Salida, toda dentro de dist/ y al lado de la web:

     dist/index.html              la aplicacion entera, en un fichero
     dist/sw.js                   lo unico que no se puede incrustar
     dist/bintio-win_x64.exe      Windows
     dist/bintio-linux_x64        Linux de escritorio
     dist/bintio-linux_arm64      Linux ARM de 64 (Raspberry, etc)
     dist/bintio-linux_armhf      Linux ARM de 32
     dist/bintio-mac_x64          macOS Intel
     dist/bintio-mac_arm64        macOS Apple Silicon
     dist/bintio-mac_universal    macOS, los dos en un binario
     dist/resources.neu           la aplicacion empaquetada, que es lo que
                                  abre cualquiera de los ejecutables
     dist/bintio-release.zip      todo lo anterior, para publicar

   Cada ejecutable necesita el resources.neu de al lado, y esta al lado: por eso
   se reparte la carpeta entera o el zip, nunca el ejecutable suelto.

   --------------------------------------------------------------------------
   EL BANCO DE TRABAJO

   El CLI de Neutralino lleva la carpeta bin/ escrita a fuego en su codigo: la
   crea en downloader.js, lee de ella en bundler.js y ejecuta desde ella en
   runner.js. No hay ninguna opcion de configuracion para moverla. Ahi bajan
   los 30 MB de binarios base de los siete sistemas.

   Y la salida tampoco puede caer dentro de dist/ sin mas, porque dist/ es
   justo la carpeta que se empaqueta: cada compilacion se meteria dentro la
   anterior, y el instalador de 400 KB acabaria pesando 15 MB.

   Solucion: el CLI no se ejecuta en el proyecto. Se ejecuta en un directorio
   suyo, fuera, con una copia de la configuracion y una copia de la web. Alli
   tiene su bin/ y su salida/, y de alli se traen los ejecutables a dist/.

   Sale ganando todo el mundo: el proyecto se queda con src/, test/, tools/ y
   dist/, sin una carpeta de 30 MB que no es suya; los binarios base se bajan
   una vez por usuario en vez de una vez por copia del proyecto; y borrar el
   proyecto entero no obliga a volver a bajarlos.

   Ojo al leer neutralino.config.json: sus rutas ("/dist/", "/salida/",
   "/bin/neutralino.js") son relativas al BANCO, no al proyecto, porque el
   fichero se copia alli tal cual y es alli donde lo lee el CLI.
   ========================================================================== */
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var DIST = path.join(ROOT, 'dist');
var CFG = JSON.parse(fs.readFileSync(path.join(ROOT, 'neutralino.config.json'), 'utf8'));
var NEU = path.join(ROOT, 'node_modules', '@neutralinojs', 'neu', 'bin', 'neu.js');

var SALIDA = require('./salida');
var NOMBRE = SALIDA.nombre;                    /* bintio */
var ZIP = SALIDA.zip;

var ARGS = process.argv.slice(2);
var SOLO_EMPAQUETAR = ARGS.indexOf('--only-package') >= 0;
var BLANDO = ARGS.indexOf('--soft') >= 0;
var CORRER = ARGS.indexOf('--run') >= 0;
var SOLO_BAJAR = ARGS.indexOf('--setup') >= 0;

function log(msg) { process.stdout.write(msg + '\n'); }

/* Las rutas del fichero de configuracion empiezan por barra y son relativas a
   la raiz de quien lo lee, que es el banco. */
function sinBarra(p) { return String(p || '').replace(/^[/\\]+/, ''); }

/* Donde vive el banco: la carpeta de cache del usuario, la que cada sistema
   tiene para esto. Si no hay ninguna, el temporal; se volveria a bajar de vez
   en cuando, pero funciona. */
function bancoDe() {
    var base;
    if (process.platform === 'win32') { base = process.env.LOCALAPPDATA || process.env.APPDATA; }
    else if (process.platform === 'darwin') { base = path.join(os.homedir(), 'Library', 'Caches'); }
    else { base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'); }
    return path.join(base || os.tmpdir(), NOMBRE, 'neutralino');
}
var BANCO = bancoDe();

/* Se llama al CLI por su fichero .js con el mismo node que corre esto: asi no
   depende de npx, ni del PATH, ni de que Windows resuelva un .cmd. Y siempre
   desde el banco, nunca desde el proyecto. */
function neu(args) {
    var r = cp.spawnSync(process.execPath, [NEU].concat(args), { cwd: BANCO, stdio: 'inherit' });
    if (r.error) { throw r.error; }
    if (r.status !== 0) { throw new Error('neu ' + args.join(' ') + ' termino con codigo ' + r.status); }
}

function kb(n) { return n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }

/* Lo que hay en dist/ que NO es la web: los ejecutables y el paquete que dejo
   aqui la vez anterior. Se quedan en dist/ para quien los reparte, pero no
   entran en la copia que se empaqueta: la aplicacion no se lleva dentro una
   copia de si misma, que serian quince megas.

   La regla es la de tools/salida.js, la misma que usa el barrido de build.js.
   Antes se preguntaba al banco que ficheros habia dejado el CLI la vez anterior,
   y eso tenia un agujero de los que no se ven venir: en una maquina con dist/
   traido de otro sitio y el banco todavia vacio, la lista salia corta y los
   quince megas de ejecutables se metian DENTRO del paquete. La regla no puede
   depender de una cache que puede no estar. */
function esSalida(p) {
    var rel = path.relative(DIST, p);
    if (rel.indexOf(path.sep) >= 0) { return false; }   /* solo la primera capa */
    return SALIDA.esDelEscritorio(rel);
}

/* Una carpeta bin/ de un proyecto de antes: los binarios base valen igual, asi
   que se mudan al banco en vez de volver a bajar 30 MB. */
function mudarBinariosViejos() {
    var viejo = path.join(ROOT, 'bin');
    if (!fs.existsSync(viejo)) { return; }
    var destino = path.join(BANCO, 'bin');
    fs.mkdirSync(destino, { recursive: true });
    var mudados = 0;
    fs.readdirSync(viejo).forEach(function (f) {
        if (!/^neutralino/.test(f)) { return; }
        var origen = path.join(viejo, f), fin = path.join(destino, f);
        if (!fs.statSync(origen).isFile() || fs.existsSync(fin)) { return; }
        fs.copyFileSync(origen, fin);
        mudados++;
    });
    fs.rmSync(viejo, { recursive: true, force: true });
    log('');
    log('  La carpeta bin/ ya no existe: ' + (mudados ? 'sus ' + mudados + ' binarios base estan' : 'ahora todo esta') +
        ' en ' + BANCO);
}

/* El banco, listo para que el CLI trabaje: su configuracion y la web recien
   compilada. La copia se rehace entera en cada pasada, que son 400 KB, para
   que no quede nada de la vez anterior dentro del paquete. */
function prepararBanco() {
    fs.mkdirSync(BANCO, { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'neutralino.config.json'), path.join(BANCO, 'neutralino.config.json'));

    var recursos = path.join(BANCO, sinBarra(CFG.cli.resourcesPath));
    fs.rmSync(recursos, { recursive: true, force: true });
    fs.cpSync(DIST, recursos, { recursive: true, filter: function (o) { return !esSalida(o); } });
}

function asegurarBinarios() {
    var cliente = path.join(BANCO, sinBarra(CFG.cli.clientLibrary));
    if (fs.existsSync(path.join(BANCO, 'bin')) && fs.existsSync(cliente)) { return; }
    log('');
    log('Faltan los binarios de Neutralino ' + CFG.cli.binaryVersion + ' (unos 30 MB). Bajandolos...');
    log('Se quedan en ' + BANCO + ' y no se vuelven a bajar.');
    neu(['update']);
}

function compilarWeb() {
    log('');
    log('Compilando la aplicacion...');
    var r = cp.spawnSync(process.execPath, [path.join(__dirname, 'build.js')], { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) { process.exit(r.status || 1); }
}

function main() {
    if (!fs.existsSync(NEU)) {
        throw new Error('falta el CLI de Neutralino; ejecuta antes "npm install"');
    }
    mudarBinariosViejos();

    if (SOLO_BAJAR) {
        fs.mkdirSync(BANCO, { recursive: true });
        fs.copyFileSync(path.join(ROOT, 'neutralino.config.json'), path.join(BANCO, 'neutralino.config.json'));
        neu(['update']);
        log('');
        log('Binarios base listos en ' + BANCO);
        log('');
        return;
    }

    /* 1. La web primero: es lo que se empaqueta. */
    if (!SOLO_EMPAQUETAR) { compilarWeb(); }
    if (!fs.existsSync(path.join(DIST, 'index.html'))) {
        throw new Error('no hay nada compilado en dist/');
    }

    /* 2. El banco: configuracion, web y binarios base. */
    prepararBanco();
    asegurarBinarios();

    /* 3. O se abre la ventana, o se empaqueta para los siete sistemas. */
    if (CORRER) { neu(['run']); return; }
    neu(['build', '--release']);

    /* 4. Los ejecutables se traen a dist/, al lado del index.html y del sw.js:
          la carpeta que se publica es la misma que se reparte. Se borra antes
          lo de la vez anterior, porque si una version deja de generar un
          binario no puede quedarse el viejo suelto ahi dentro. */
    var salida = path.join(BANCO, sinBarra(CFG.cli.distributionPath));
    var hechos = path.join(salida, NOMBRE);
    if (!fs.existsSync(hechos)) { throw new Error('el CLI no ha dejado nada en ' + hechos); }
    fs.readdirSync(DIST).filter(SALIDA.esDelEscritorio).forEach(function (f) {
        fs.rmSync(path.join(DIST, f), { recursive: true, force: true });
    });
    var traidos = [];
    fs.readdirSync(hechos).forEach(function (f) {
        /* .tmp es el rastro que deja la propia aplicacion al ejecutarla desde
           ahi (la posicion de la ventana); no viaja con ella. */
        if (f === '.tmp' || f === '.storage') { return; }
        var origen = path.join(hechos, f);
        if (!fs.statSync(origen).isFile()) { return; }
        fs.copyFileSync(origen, path.join(DIST, f));
        traidos.push(f);
    });
    var zipHecho = path.join(salida, ZIP);
    if (fs.existsSync(zipHecho)) { fs.copyFileSync(zipHecho, path.join(DIST, ZIP)); }

    /* 5. Informe. */
    log('');
    log('Escritorio listo en dist/, al lado de la web:');
    traidos.sort().forEach(function (f) {
        log('  ' + f + new Array(Math.max(2, 30 - f.length)).join(' ') + kb(fs.statSync(path.join(DIST, f)).size));
    });
    if (fs.existsSync(path.join(DIST, ZIP))) {
        log('');
        log('  Para publicar: dist/' + ZIP + '  (' + kb(fs.statSync(path.join(DIST, ZIP)).size) + ')');
    }
    log('');
    log('  Cada ejecutable necesita el resources.neu de al lado.');
    log('');
}

try { main(); }
catch (e) {
    var msg = e && e.message ? e.message : e;
    if (BLANDO) {
        /* Enganchado al build: se avisa fuerte y se sigue. La aplicacion web
           ya esta compilada y no tiene la culpa de que falte la red. */
        log('');
        log('  AVISO: no se han podido generar los ejecutables de escritorio.');
        log('  ' + msg);
        log('  La aplicacion web de dist/ esta compilada y funciona igual.');
        log('  Cuando vuelva la red:  npm run desktop:build');
        log('');
        process.exit(0);
    }
    log('');
    log('ERROR empaquetando el escritorio: ' + msg);
    process.exit(1);
}
