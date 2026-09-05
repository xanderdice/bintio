/* Empezar de cero: que no quede NADA.

   vault.js promete que el borrado "deja el aparato como si BINTIO nunca
   hubiera estado". Es la clase de promesa que se rompe sin que nadie se entere,
   porque lo que queda atras no se ve por ninguna pantalla: hay que ir a mirar
   el almacen del navegador.

   Y ya se habia roto. El borrado quitaba la boveda y se dejaba "bintio.bus.v1",
   el buzon con el que hablan entre si las pestanas del mismo navegador. Dentro
   no hay nada legible -son sobres cifrados-, pero la clave en si delata que en
   este aparato se uso BINTIO, que es exactamente lo que la funcion dice que no
   va a pasar.

   Por eso esta prueba no comprueba "se ha borrado la boveda": comprueba que de
   TODO lo que empiece por bintio. no sobrevive ni una clave, y que lo que no es
   nuestro no se toca. Lo segundo importa igual: un borrado que se lleva por
   delante los datos de otra aplicacion del mismo dominio seria un fallo peor
   que el que viene a arreglar.                                              */
var ayuda = require('./ayuda');
var ok = ayuda.ok;

/* Un almacen como el del navegador: con length, key(i) y removeItem, que es de
   lo que se sirve el barrido. */
function almacen() {
    var datos = {};
    return {
        datos: datos,
        get length() { return Object.keys(datos).length; },
        key: function (i) { return Object.keys(datos)[i]; },
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(datos, k) ? datos[k] : null; },
        setItem: function (k, v) { datos[k] = String(v); },
        removeItem: function (k) { delete datos[k]; },
        claves: function () { return Object.keys(datos); }
    };
}

console.log('Empezar de cero');

var local = almacen(), sesion = almacen();
var V = ayuda.cargar('nucleo', { localStorage: local, sessionStorage: sesion });

ok('la boveda usa el almacen del navegador, no el de memoria',
   V.vault.isPersistent() === true);

/* Una boveda de verdad, con identidad, contactos, un grupo y mensajes. */
var hecho = false;
V.vault.create('una contrasena larga de prueba', function () {}, function (err) {
    if (err) { throw err; }
    var id = V.id.create();
    V.vault.state.identity = { seed: V.util.toHex(id.seed), name: 'Yo' };
    V.contacts.bind(id);
    var otro = V.id.create();
    var c = V.contacts.add(V.util.toHex(otro.pk), 'Alguien').contact;
    V.chat.sendText(c, 'algo que no puede sobrevivir al borrado');
    V.groups.create('Un grupo', [c.pk]);
    V.vault.saveNow();
    hecho = true;
});

/* pbkdf2Async va por trocitos con setTimeout, asi que hay que esperarlo. */
function cuandoEste(fn) {
    if (hecho) { fn(); return; }
    setTimeout(function () { cuandoEste(fn); }, 25);
}

cuandoEste(function () {
    /* Y los rastros que deja el resto de la aplicacion, mas uno ajeno. */
    local.setItem('bintio.bus.v1', '{"t":"hola"}|0.5');
    sesion.setItem('bintio.session.v1', 'clave de sesion');
    local.setItem('otra.app.datos', 'esto no es nuestro');

    ok('antes de borrar, hay boveda', V.vault.exists() === true);
    ok('y ocupa algo', V.vault.sizeBytes() > 0, String(V.vault.sizeBytes()));
    ok('con la conversacion dentro',
       V.chat.get(V.contacts.all()[0].pk).messages.length === 1);
    ok('y con el grupo', V.groups.all().length === 1);

    V.vault.destroy();

    var quedan = local.claves(), quedanSesion = sesion.claves();
    var nuestras = quedan.concat(quedanSesion).filter(function (k) {
        return k.substr(0, 7) === 'bintio.';
    });

    ok('no queda NI UNA clave de BINTIO', nuestras.length === 0, nuestras.join(', '));
    ok('en particular, tampoco el buzon entre pestanas',
       local.getItem('bintio.bus.v1') === null);
    ok('ni la clave de sesion', sesion.getItem('bintio.session.v1') === null);
    ok('lo que NO es nuestro se queda donde estaba',
       local.getItem('otra.app.datos') === 'esto no es nuestro',
       String(local.getItem('otra.app.datos')));

    ok('la boveda ya no existe', V.vault.exists() === false);
    ok('ni en memoria', V.vault.state === null);
    ok('y el tamano vuelve a cero', V.vault.sizeBytes() === 0, String(V.vault.sizeBytes()));

    /* Lo que de verdad se pidio: que despues se pueda empezar de cero. */
    var otraVez = false;
    V.vault.create('otra contrasena distinta', function () {}, function (err) {
        if (err) { throw err; }
        otraVez = true;

        ok('despues se puede crear una identidad nueva', V.vault.exists() === true);
        ok('y arranca vacia: sin contactos',
           (V.vault.state.contacts || []).length === 0);
        ok('sin conversaciones',
           Object.keys(V.vault.state.chats || {}).length === 0);
        ok('sin grupos', Object.keys(V.vault.state.groups || {}).length === 0);
        ok('y sin sobres en la mochila',
           (V.vault.state.carrier || []).length === 0);

        ayuda.resumen();
    });

    setTimeout(function () {
        if (!otraVez) {
            console.log('  FALLA no se pudo crear la identidad nueva tras el borrado');
            process.exit(1);
        }
    }, 20000);
});
