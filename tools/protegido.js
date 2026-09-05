/* ==========================================================================
   Compila la version de Windows con la ventana fuera de las capturas.

     npm run protegido

   Deja en dist/ un ejecutable mas, al lado de los siete de Neutralino:

     dist/bintio-win_x64-protegido.exe   la aplicacion en una ventana que
                                         NO sale en ninguna captura ni
                                         grabacion de pantalla
     dist/*.dll                          el enganche con el WebView2 que ya
                                         trae Windows (unos 850 KB)

   POR QUE VA SUELTO Y NO DENTRO DE "npm run build"

   Porque pide el SDK de .NET, y la promesa de este proyecto es que con Node y
   nada mas se compila todo. Quien no tenga dotnet sigue teniendo los siete
   ejecutables normales y la web; quien lo tenga, ejecuta esto y ademas se
   lleva el protegido. Un paso opcional no puede volverse obligatorio por la
   puerta de atras.

   Y por que no se sustituye al de Neutralino: el protegido es solo Windows.
   Los otros seis sistemas siguen saliendo de Neutralino, que ademas pesa la
   mitad y no necesita WebView2.

   LO QUE HAY QUE SABER

   La boveda del protegido y la del de Neutralino son DISTINTAS. Uno carga la
   pagina desde file:// y el otro desde un http local con su propio puerto;
   para el navegador son dos origenes, y cada origen tiene su almacen. Cambiar
   de un ejecutable al otro es empezar de cero, salvo que te lleves la
   identidad con la Llave de Recuperacion o con una copia completa.
   ========================================================================== */
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..');
var DIST = path.join(ROOT, 'dist');
var PROY = path.join(__dirname, 'protegido');
var SALIDA = path.join(PROY, 'bin', 'Release', 'net48');

var ARGS = process.argv.slice(2);
var BLANDO = ARGS.indexOf('--soft') >= 0;

function log(m) { process.stdout.write(m + '\n'); }
function kb(n) { return n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }

function fallar(msg) {
    if (BLANDO) {
        log('');
        log('  Sin la version protegida: ' + msg);
        log('  Los siete ejecutables normales y la web estan hechos igual.');
        log('');
        process.exit(0);
    }
    log('');
    log('ERROR: ' + msg);
    log('');
    process.exit(1);
}

/* El icono. WinForms lo quiere en .ico, y un .ico moderno puede llevar un PNG
   dentro tal cual: seis bytes de cabecera, dieciseis por entrada y el PNG
   entero detras. Asi no hace falta un conversor ni una imagen mas en el
   repositorio, y el icono sale del mismo logo que todo lo demas. */
function escribirIcono(destino) {
    var png = path.join(DIST, 'icon-192.png');
    if (!fs.existsSync(png)) { return false; }
    var datos = fs.readFileSync(png);
    var lado = datos.readUInt32BE(16);            /* ancho, de la cabecera IHDR */
    var cab = Buffer.alloc(22);
    cab.writeUInt16LE(0, 0);                      /* reservado */
    cab.writeUInt16LE(1, 2);                      /* 1 = icono */
    cab.writeUInt16LE(1, 4);                      /* una sola imagen */
    cab.writeUInt8(lado >= 256 ? 0 : lado, 6);    /* 0 quiere decir 256 */
    cab.writeUInt8(lado >= 256 ? 0 : lado, 7);
    cab.writeUInt8(0, 8);                         /* colores de paleta: ninguno */
    cab.writeUInt8(0, 9);                         /* reservado */
    cab.writeUInt16LE(1, 10);                     /* planos */
    cab.writeUInt16LE(32, 12);                    /* bits por pixel */
    cab.writeUInt32LE(datos.length, 14);
    cab.writeUInt32LE(22, 18);                    /* donde empieza el PNG */
    fs.writeFileSync(destino, Buffer.concat([cab, datos]));
    return true;
}

function main() {
    if (process.platform !== 'win32') {
        fallar('esto solo se puede compilar en Windows: la proteccion es una llamada de Windows.');
    }
    if (!fs.existsSync(path.join(DIST, 'bintio.html'))) {
        fallar('falta dist/bintio.html. Compila antes la web:  npm run build:web');
    }

    /* Sin shell: con shell los argumentos se concatenan sin escapar, y ademas
       en Windows "dotnet" es un .exe que se resuelve por el PATH sin ayuda. */
    var dotnet = cp.spawnSync('dotnet', ['--version'], { encoding: 'utf8' });
    if (dotnet.error || dotnet.status !== 0) {
        fallar('no hay "dotnet" en el PATH. Se instala desde https://dotnet.microsoft.com/download');
    }
    log('  dotnet ' + String(dotnet.stdout || '').replace(/\s+$/, ''));

    if (!escribirIcono(path.join(PROY, 'bintio.ico'))) {
        fallar('falta dist/icon-192.png; el icono sale de ahi. Compila antes la web.');
    }

    log('  compilando el anfitrion protegido...');
    var r = cp.spawnSync('dotnet',
        ['build', '-c', 'Release', '--nologo', '-v', 'quiet'],
        { cwd: PROY, stdio: 'inherit' });
    if (r.error || r.status !== 0) {
        fallar('la compilacion de dotnet ha fallado (mira el error de arriba).');
    }

    /* Lo que hace falta al lado del ejecutable, y solo eso. El WebView2 de x86
       que mete el paquete no se copia -aqui todo es de 64 bits- y el enganche
       de WPF tampoco, porque la ventana es de WinForms: son 81 KB que nadie
       va a cargar nunca. */
    var SOBRA = /(\.Wpf\.dll)$/i;
    var piezas = fs.readdirSync(SALIDA).filter(function (f) {
        return /\.(exe|dll|config)$/.test(f) && !SOBRA.test(f);
    });
    var total = 0, puestas = [];
    for (var i = 0; i < piezas.length; i++) {
        var origen = path.join(SALIDA, piezas[i]);
        var destino = path.join(DIST, piezas[i]);
        fs.copyFileSync(origen, destino);
        var n = fs.statSync(destino).size;
        total += n;
        puestas.push([piezas[i], n]);
    }

    puestas.sort(function (a, b) { return b[1] - a[1]; });
    log('');
    log('Windows con la pantalla protegida, en dist/:');
    for (var j = 0; j < puestas.length; j++) {
        log('  ' + puestas[j][0] + new Array(Math.max(2, 34 - puestas[j][0].length)).join(' ') + kb(puestas[j][1]));
    }
    log('');
    log('  Total ' + kb(total) + ', y necesita bintio.html al lado (ya esta en dist/).');
    log('');
    log('  La ventana de este ejecutable NO sale en capturas ni grabaciones:');
    log('  ni Impr Pant, ni la Herramienta de Recortes, ni OBS, ni compartir');
    log('  pantalla en una reunion. Lo aplica Windows, no la pagina.');
    log('');
    log('  Pide Windows 10 version 2004 o posterior y el runtime de WebView2,');
    log('  que Windows 11 ya trae. Una camara apuntando a la pantalla se lo');
    log('  lleva todo igual: contra eso no hay software.');
    log('');
    log('  OJO: su boveda NO es la misma que la de bintio-win_x64.exe (origen');
    log('  distinto, almacen distinto). Para pasar de uno a otro, llevate la');
    log('  identidad con la Llave de Recuperacion o con una copia completa.');
    log('');
}

main();
