/* ==========================================================================
   Espanol e ingles.

   LA DECISION QUE LO EXPLICA TODO: la clave ES el texto en espanol.

   Lo normal en estas cosas es inventarse identificadores -acceso.crear.titulo,
   ajustes.malla.reenvio- y dos tablas, una por idioma. Aqui no, y por una razon
   que se ve al abrir cualquier fichero: el codigo sigue diciendo

       D.toast(D.t('Guardado'));

   y no D.toast(D.t('ajustes.guardado')). Se lee lo que va a salir en pantalla,
   sin ir a buscar a ninguna tabla que significa una clave. Y solo hay UNA
   tabla, la de ingles, porque el espanol ya esta escrito en su sitio.

   El precio: si alguien cambia una frase en espanol, su traduccion deja de
   encontrarse y sale el espanol. No es un fallo silencioso porque
   test/idioma.test.js recorre todo el proyecto y falla si aparece un texto sin
   traducir. La frase cambiada sale ahi, con su fichero y su linea.

   EN EL MARCADO

   Un atributo data-t basta, sin clave dentro: el texto que hay en la etiqueta
   es la clave. Se traduce cada trozo de texto por separado, asi que un parrafo
   con una parte en negrita se traduce en tres pedazos y la negrita sigue en su
   sitio.

     <p data-t>La contrasena cifra todo. <b data-t>Nadie puede recuperarla</b>.</p>

   Los atributos que se leen -placeholder, title- llevan el suyo: data-t-ph y
   data-t-title.

   NADA DE innerHTML

   Se cambia solo el texto de los nodos de texto. Ni una linea de este fichero
   convierte texto en marcado, que es lo que comprueba tools/verify.js y lo que
   impide que una traduccion pueda meter etiquetas.
   ========================================================================== */
(function (V) {
    'use strict';
    var D = V.ui;

    /* Los idiomas que hay. El primero es el de casa y el que se usa de clave.

       El nombre va escrito en SU propio idioma, con su ene y sus tildes: es lo
       que se lee en el desplegable de Ajustes, y quien lo busca es justo quien
       no entiende el idioma en el que esta la pantalla. */
    D.IDIOMAS = [
        { codigo: 'es', nombre: 'Espa\u00f1ol' },
        { codigo: 'en', nombre: 'English' }
    ];

    var actual = 'es';

    /* La tabla. Solo ingles: el espanol es la clave.
       Vive en su propio fichero para que se pueda leer, corregir y ampliar sin
       pasar por el codigo. */
    function tabla() { return (V.textos && V.textos.en) || {}; }

    /* Traducir. Si no hay traduccion, sale el espanol: nunca un hueco vacio ni
       un identificador crudo en pantalla.

       El segundo argumento rellena huecos con nombre:

           D.t('Mensaje de {quien}', { quien: 'Ana' })

       Con huecos y no pegando trozos ('Mensaje de ' + nombre) porque en ingles
       el orden de la frase no tiene por que ser el mismo, y una frase partida
       en tres no se puede traducir: hay que traducirla entera. */
    D.t = function (es, datos) {
        var s = es;
        if (actual !== 'es' && es) {
            var t = tabla()[es];
            if (t !== undefined) { s = t; }
        }
        if (datos) {
            for (var k in datos) {
                if (Object.prototype.hasOwnProperty.call(datos, k)) {
                    s = s.split('{' + k + '}').join(datos[k]);
                }
            }
        }
        return s;
    };

    D.idioma = function () { return actual; };

    /* El idioma de serie: lo que diga el navegador, si lo tenemos. A quien
       abre esto en Berlin no se le ensena espanol porque si. */
    D.idiomaDelNavegador = function () {
        var cod = '';
        try {
            cod = (navigator.language || navigator.userLanguage || '').toLowerCase();
        } catch (e) { cod = ''; }
        for (var i = 0; i < D.IDIOMAS.length; i++) {
            if (cod.indexOf(D.IDIOMAS[i].codigo) === 0) { return D.IDIOMAS[i].codigo; }
        }
        return 'es';
    };

    /* Donde se guarda la eleccion.

       Fuera de la boveda, y a proposito. Dentro no serviria: la pantalla de
       acceso -donde se escribe la contrasena- sale ANTES de que haya boveda que
       abrir, y ahi tambien hay que leer. Ademas no es un dato privado: el
       idioma que prefieres es justo lo que el navegador ya le cuenta a
       cualquier pagina que visitas.

       La clave empieza por "bintio." como todo lo demas, asi que el borrado de
       vault.js se la lleva igual que al resto. */
    var CLAVE = 'bintio.lang';

    D.idiomaGuardado = function () {
        try {
            var g = localStorage.getItem(CLAVE);
            if (g) { return g; }
        } catch (e) {}
        return D.idiomaDelNavegador();
    };

    D.guardarIdioma = function (codigo) {
        try { localStorage.setItem(CLAVE, codigo); } catch (e) {}
        D.aplicarIdioma(codigo);
    };

    /* El desplegable de Ajustes, llenado desde la lista de arriba.

       Las opciones se generan aqui y NO se escriben en index.html a proposito.
       Escritas a mano, anadir un idioma serian tres sitios -la tabla en
       textos.js, la linea en D.IDIOMAS y las opciones del marcado- y el tercero
       es justo el que se olvida, porque los otros dos fallan en las pruebas y
       este no. Generadas, anadir un idioma es lo que promete el README: una
       linea en D.IDIOMAS y su tabla.

       Los nombres NO llevan data-t, y esa es la parte que parece un descuido y
       no lo es. Cada idioma se ensena en su propio nombre: "English" no se
       convierte en "Ingles" por estar la pantalla en espanol, porque quien va a
       buscar este desplegable es precisamente quien no entiende lo que hay
       escrito alrededor. Ademas, marcarlos obligaria a "traducir" English a
       otra cosa para que test/idioma.test.js pasara. */
    D.montarIdiomas = function (sel) {
        if (!sel) { return; }
        D.clear(sel);
        for (var i = 0; i < D.IDIOMAS.length; i++) {
            var op = document.createElement('option');
            op.value = D.IDIOMAS[i].codigo;
            op.textContent = D.IDIOMAS[i].nombre;
            sel.appendChild(op);
        }
        sel.value = actual;
    };

    /* ---------------------------------------------------------------------
       Aplicarlo al marcado
       --------------------------------------------------------------------- */

    /* El espanol original de cada nodo de texto, apuntado la primera vez que se
       toca. Sin esto, volver del ingles al espanol seria imposible: la clave se
       habria perdido al escribir encima. */
    var original = [];      /* [ [nodo, textoEnEspanol], ... ] */
    var apuntado = false;
    var tituloOriginal = null;

    function apuntarNodos() {
        var marcados = document.querySelectorAll('[data-t]');
        for (var i = 0; i < marcados.length; i++) {
            var hijos = marcados[i].childNodes;
            for (var j = 0; j < hijos.length; j++) {
                /* 3 es un nodo de texto. Solo los hijos DIRECTOS: si dentro hay
                   otra etiqueta marcada, se la traduce a ella por su cuenta. */
                if (hijos[j].nodeType !== 3) { continue; }
                if (!/\S/.test(hijos[j].nodeValue)) { continue; }
                original.push([hijos[j], hijos[j].nodeValue]);
            }
        }
        apuntado = true;
    }

    /* Los atributos que se leen. Se apuntan igual y por lo mismo. */
    var ATRIBUTOS = [['data-t-ph', 'placeholder'], ['data-t-title', 'title']];
    var originalAttr = [];

    function apuntarAtributos() {
        for (var a = 0; a < ATRIBUTOS.length; a++) {
            var marcados = document.querySelectorAll('[' + ATRIBUTOS[a][0] + ']');
            for (var i = 0; i < marcados.length; i++) {
                originalAttr.push([marcados[i], ATRIBUTOS[a][1], marcados[i].getAttribute(ATRIBUTOS[a][1]) || '']);
            }
        }
    }

    /* Se respeta el espacio de alrededor: en "La contrasena cifra todo. " el
       espacio final separa de la negrita que viene detras, y perderlo pega las
       dos palabras. Se traduce lo de en medio y se devuelven los bordes.

       Y lo de en medio se aplana antes de buscarlo: en el fichero, un parrafo
       largo viene partido en varias lineas con su sangria, asi que el texto
       real lleva saltos y espacios que dependen de como este escrito el HTML.
       Buscar con eso dentro seria buscar una clave que cambia cada vez que
       alguien reformatea el marcado. El navegador aplana los espacios al
       pintar, asi que aplanarlos aqui no cambia nada de lo que se ve. */
    function traducirTrozo(texto) {
        var antes = texto.match(/^\s*/)[0];
        var despues = texto.match(/\s*$/)[0];
        var medio = texto.slice(antes.length, texto.length - despues.length).replace(/\s+/g, ' ');
        return antes + D.t(medio) + despues;
    }

    D.aplicarIdioma = function (codigo) {
        var vale = false;
        for (var i = 0; i < D.IDIOMAS.length; i++) {
            if (D.IDIOMAS[i].codigo === codigo) { vale = true; }
        }
        actual = vale ? codigo : 'es';

        if (!apuntado) { apuntarNodos(); apuntarAtributos(); }

        for (i = 0; i < original.length; i++) {
            original[i][0].nodeValue = traducirTrozo(original[i][1]);
        }
        for (i = 0; i < originalAttr.length; i++) {
            originalAttr[i][0].setAttribute(originalAttr[i][1], D.t(originalAttr[i][2]));
        }

        /* El titulo de la pestana tambien se lee, y es lo primero que se ve en
           una ventana con veinte pestanas abiertas. Se apunta el original la
           primera vez, por lo mismo que los nodos de texto. */
        try {
            if (tituloOriginal === null) { tituloOriginal = document.title; }
            document.title = D.t(tituloOriginal);
        } catch (e) {}

        /* Que el documento diga en que idioma esta: lo usan los lectores de
           pantalla, el corrector del teclado y los buscadores. */
        try { document.documentElement.setAttribute('lang', actual); } catch (e) {}

        /* Y lo que pinta la propia aplicacion, que no esta en el marcado. Solo
           si hay algo pintado: al arrancar esto se llama antes de abrir la
           boveda, y entonces no hay ni lista ni conversacion. */
        if (V.app && V.app.ready) {
            if (D.refreshRoster) { D.refreshRoster(); }
            /* La barra de abajo tambien lleva palabras -Enlaces, Mochila,
               Contactos, Disco- y no se repasa sola: solo se repinta cuando
               cambia algo de lo que cuenta, y cambiar de idioma no cambia
               ningun numero. */
            if (D.refreshStatus) { D.refreshStatus(); }
            if (D.activePk && D.renderMessages) { D.renderMessages(); }
            /* Y la pantalla de Ajustes, que es desde donde se cambia el idioma:
               si no se rehace, quien acaba de pulsar ve media pantalla en un
               idioma y media en el otro, que parece un fallo aunque no lo sea.
               Lo que pinta el codigo -el informe del aparato, lo que ocupa la
               mochila- no esta en el marcado y no se puede repasar solo. */
            if (D.current === 'view-settings' && D.openSettings) { D.openSettings(); }
        }
    };
})(BINTIO);
