/* ==========================================================================
   Solicitudes: quien te escribe sin que lo tengas dado de alta.

   Un sobre de presentacion se cifra con una clave que sale de la efimera de
   quien escribe y de la publica de quien recibe, asi que se abre sin tener a
   nadie dado de alta. Por eso NO anade contacto: deja aqui un nombre, una
   huella y una frase, y decide el usuario.

   Este fichero es el UNICO dueno de los ids requests-*: los pinta y les pone
   el manejador. El manejador se pone una sola vez, en D.initRequests, porque
   refreshRoster se ejecuta muchas veces y D.on solo sabe anadir.
   ========================================================================== */
(function (V) {
    'use strict';
    var D = V.ui, U = V.util;

    /* Sin presenta.js no hay modelo. Se degrada en silencio en vez de
       llevarse por delante la lista de conversaciones, que es la pantalla
       que de verdad hace falta. */
    function cuantas() { return V.requests ? V.requests.count() : 0; }

    /* ---------------------------------------------------- toque doble */

    /* Las tarjetas son altas y todas iguales, asi que el boton "Aceptar" de la
       siguiente cae practicamente en el mismo pixel que el de la que acaba de
       irse: medido en un movil de 360 px, la tarjeta ocupa 499 px y el paso
       entre botones es de 496. Trece pixeles. Un toque que rebota -o el
       "click fantasma" que el navegador manda despues de un toque, o un doble
       click de raton- acepta a un desconocido DISTINTO que el usuario no ha
       leido, y aceptar no se deshace solo: hay que ir a la ficha y borrar el
       contacto.

       De todas las soluciones posibles esta es la unica que no depende de
       donde caiga el segundo toque: se ignora cualquier decision que llegue
       antes de MARGEN desde la anterior, venga del boton que venga y este
       donde este. Mover las tarjetas, cambiar sus alturas o deshabilitar un
       boton concreto solo desplaza el problema al siguiente diseno; una
       ventana de tiempo lo cierra entero y no hay ningun elemento al que
       agarrarse, que es bueno porque la lista se repinta entera en cada
       decision.

       Medio segundo largo: el toque fantasma llega a los ~300 ms y un doble
       toque se cuenta hasta los ~500. Decidir sobre otro desconocido exige
       leer un nombre y veinte caracteres de huella, que no se hace en menos
       de un segundo, asi que esto no le quita ni un toque a nadie que sepa
       lo que esta haciendo. */
    var MARGEN = 600;
    var ultimaDecision = 0;

    function encadenado() {
        var t = U.now();
        if (t - ultimaDecision < MARGEN) { return true; }
        ultimaDecision = t;
        return false;
    }

    /* ------------------------------------------------------- decisiones */

    /* Aceptar: el modelo crea el contacto, mete el primer mensaje en su
       conversacion con el identificador que traia la presentacion -para que
       una copia repetida por la malla no lo duplique- y quita la solicitud.
       Aqui solo se repinta y se decide a donde va el usuario.

       No se manda NADA al otro lado. Un acuse automatico diria el momento
       exacto en que aceptaste sin que hayas escrito una palabra: quien
       contesta eres tu.

       Y por eso aceptar NO abre la conversacion, aunque fuera la ultima y no
       quede nada mas que decidir. Abrir una conversacion es leerla: D.openChat
       llama a V.chat.markRead, markRead ve el mensaje que la solicitud acaba
       de meter sin leer y manda un T_RECEIPT con {"m":<su mensaje>,"s":"r"}.
       Descifrado al otro lado eso dice "he abierto y aceptado tu presentacion,
       a esta hora exacta", con los acuses en su valor de serie y sin que el
       usuario haya escrito una palabra. Justo lo que este fichero promete no
       hacer.

       De las tres formas de taparlo -no abrir, abrir sin marcar leido, o
       marcar leido sin acusar- se elige NO ABRIR, y no por ser la mas comoda:
         - Es la unica que no deja una promesa que mantener. Las otras dos son
           una bandera que cruza tres ficheros y que el proximo que toque
           openChat o markRead tiene que acordarse de respetar; aqui no hay
           nada que respetar porque no se llama.
         - No miente sobre el estado. Marcar leido sin acusar deja al otro
           esperando un acuse que ya no va a llegar nunca aunque de verdad lo
           leas; abrir sin marcar leido deja la conversacion abierta con su
           insignia de "sin leer" encima. Sin abrir, todo cuadra: el mensaje
           esta sin leer porque esta sin leer.
         - Aceptar y leer son dos decisiones distintas del usuario. Aceptar
           dice "puedes escribirme"; leer dice "te he leido". La aplicacion no
           puede tomar la segunda por su cuenta. Cuando el usuario entre en la
           conversacion, el acuse saldra y sera verdad.
         - Y de paso no cambia la vista debajo del dedo, que es exactamente lo
           que descartar lleva evitando desde el primer dia. Las dos decisiones
           se comportan igual: se resuelve la tarjeta y el usuario sigue donde
           estaba.
       El mensaje no se pierde: queda en su conversacion con su insignia, y la
       lista esta a un toque del boton Volver. */
    function aceptar(pkHex) {
        var c = V.requests.accept(pkHex);
        if (!c) {
            /* Pudo caducar con el reloj del minuto mientras estaba en
               pantalla, o resolverse desde otra pestana con la misma boveda. */
            D.toast(D.t('Esa solicitud ya no esta'), 'bad');
            D.refreshRoster();
            return;
        }
        /* La huella queda SIN comprobar a proposito: el sello demuestra que
           quien escribe tiene esa clave privada, no de quien es la clave.
           Se dice tambien donde ha quedado la conversacion, porque ya no se
           llega sola a ella. */
        D.toast(D.t('A\u00f1adido a tus conversaciones. Su huella sigue sin comparar: hazlo en Ficha antes de fiarte.'), 'ok');
        D.refreshStatus();

        /* Se repinta esta misma vista con una tarjeta menos, queden mas o no
           quede ninguna: no se echa al usuario de una pantalla que todavia
           esta usando. refreshRoster acaba llamando a refreshRequests, que es
           quien repinta las tarjetas si seguimos aqui; al quedarse a cero sale
           #requests-empty con el boton de volver, igual que al descartar la
           ultima. */
        D.refreshRoster();
    }

    /* Descartar: no queda nada suyo en la boveda -ni nombre, ni texto, ni
       huella- y NO se avisa al otro lado: un "te he rechazado" confirmaria
       que esa clave esta viva y que hay alguien leyendo. Tampoco se guarda
       lista negra; mientras la boveda siga abierta esa clave no vuelve a
       asomar, y al cerrarla esa memoria se va con la sesion.

       Sin window.confirm: eso se usa para lo irreversible, y esto no lo es
       -pueden volver a escribir-. Limpiar diez solicitudes basura con diez
       dialogos no lo hace nadie. */
    function descartar(pkHex) {
        V.requests.discard(pkHex);
        D.toast(D.t('Descartada. No se guarda nada suyo. Si vuelve a escribir, saldra otra vez.'));
        /* Se queda donde esta aunque fuera la ultima: nada de cambiar de
           vista debajo del dedo. Al quedarse a cero sale #requests-empty. */
        D.refreshRoster();
    }

    /* ---------------------------------------------------------- tarjeta */

    function marco(bloque) {
        var lados = ['bracket--tl', 'bracket--tr', 'bracket--bl', 'bracket--br'];
        for (var i = 0; i < lados.length; i++) {
            bloque.appendChild(D.make('span', 'bracket ' + lados[i]));
        }
    }

    /* La ventana se mira AQUI y no dentro de aceptar y descartar: es el toque
       lo que hay que filtrar, no la decision. Asi los dos botones comparten
       una sola ventana -aceptar y descartar seguidos tambien es una cadena- y
       cualquier boton que se anada a la tarjeta manana la hereda sin que nadie
       se acuerde de ella. */
    function boton(texto, cls, fn) {
        var b = D.make('button', cls, texto);
        b.type = 'button';      /* un <button> nace de tipo submit si no se dice */
        D.on(b, 'click', function () {
            if (encadenado()) { return; }
            fn();
        });
        return b;
    }

    function tarjeta(r) {
        var b = D.make('div', 'block');
        marco(b);

        /* El titulo dice "Solicitud", no el nombre. Lo primero de la tarjeta
           tiene que ser la palabra de la aplicacion, no la de quien escribe:
           un h2 es la voz de la casa -en el acabado terminal lleva ademas el
           galon de color y va en versalitas- y meter ahi texto ajeno deja que
           alguien se llame "Contacto verificado por BINTIO" y lo lea con la
           tipografia de los titulos. */
        b.appendChild(D.make('h2', null, D.t('Solicitud')));

        b.appendChild(D.make('p', 'dim',
            D.t('Se presenta con este nombre. Lo escribe quien manda y no lo comprueba nadie.')));
        /* Monoespaciada, que en este proyecto es la fuente de lo que llega de
           fuera y se compara, y nunca el acento encendido: ese es de la
           aplicacion, y prestarselo a un desconocido es media suplantacion
           hecha. El recorte a 40 caracteres ya lo hizo el modelo al anotarla. */
        b.appendChild(D.make('div', 'mono-break', r.name));

        b.appendChild(D.make('p', 'dim mt-l',
            D.t('Su huella. Esto si esta comprobado: quien ha mandado la solicitud tiene la clave privada de esta huella, asi que nadie puede presentarse con la huella de otro. Lo que la huella no dice es de quien es: para eso tienes que compararla con la persona, por telefono o en persona.')));
        /* Sin la etiqueta verde que lleva la lista de conversaciones: alli
           significa "la comparaste tu por otra via", que es exactamente lo
           que aqui todavia NO ha pasado. */
        b.appendChild(D.make('div', 'key-grid', V.id.fingerprint(U.fromHex(r.pk))));

        b.appendChild(D.make('p', 'dim mt-l', D.t('Lo que te escribe:')));
        if (r.text) {
            /* Con la ficha de un mensaje recibido a proposito: es texto de un
               desconocido y no puede parecerse a lo que dice la aplicacion.
               La ficha con su marco y su fondo es la senal que el usuario ya
               sabe leer como "esto lo ha escrito otro". */
            b.appendChild(D.make('div', 'msg msg--in msg--req', r.text));
        } else {
            /* Un primer mensaje que no cabe en la presentacion viaja vacio, no
               cortado: el texto entero va en un sobre normal que esta en la
               mochila sin poder abrirse, y aceptar lo abre. Decirlo es mejor
               que ensenar una ficha vacia que parece un fallo. */
            b.appendChild(D.make('p', 'dim',
                D.t('Aqui no viene texto: lo que escribio no cabia en una presentacion. Su mensaje viaja aparte y aparece entero en la conversacion al aceptarla.')));
        }

        /* La hora va DEBAJO de la ficha y fuera de ella: es un dato nuestro
           -cuando llego a este aparato- y no puede ir dentro de la caja del
           texto ajeno. La marca de tiempo que viaja dentro del sobre la
           escribe el mismo que escribe el nombre. */
        b.appendChild(D.make('p', 'dim mt-s',
            D.t('Recibido en este aparato: {cuando}',
                { cuando: D.day(r.at) + ' ' + D.time(r.at) })));

        /* Los dos botones al mismo peso. Ni btn--primary, que es la unica cosa
           solida de cada pantalla y significa "esto es lo que hay que hacer":
           la aplicacion no tiene opinion sobre un desconocido. Ni btn--danger,
           que esta reservado a lo que rompe algo: descartar es la opcion
           prudente, no la peligrosa, y pintarla de rojo empuja a aceptar. */
        var fila = D.make('div', 'btn-row mt-l');
        fila.appendChild(boton('Aceptar', 'btn', function () { aceptar(r.pk); }));
        fila.appendChild(boton('Descartar', 'btn btn--ghost', function () { descartar(r.pk); }));
        b.appendChild(fila);

        return b;
    }

    /* Las tarjetas no llevan id: son una lista de longitud variable, igual
       que las filas de #roster-list, y cada boton sabe de quien es por la
       clausura que lo creo. */
    function pintar() {
        var box = D.$('requests-list');
        if (!box) { return; }
        D.clear(box);

        /* El modelo ya las devuelve ordenadas por hora de llegada, la mas
           reciente arriba, igual que V.chat.list() ordena por actividad. */
        var rows = V.requests ? V.requests.all() : [];
        for (var i = 0; i < rows.length; i++) { box.appendChild(tarjeta(rows[i])); }

        /* Sin ninguna, el hueco se esconde: si no, deja un escalon de aire
           muerto entre el bloque de arriba y el boton de volver. */
        D.show(box, rows.length > 0);
        D.show(D.$('requests-empty'), rows.length === 0);
    }

    /* ------------------------------------------------------------- fuera */

    D.refreshRequests = function () {
        var row = D.$('requests-row');
        if (!row) { return; }

        var n = cuantas();
        D.show(row, n > 0);
        if (n) {
            D.text(D.$('requests-row-note'), D.t(n === 1
                ? '1 persona sin a\u00f1adir. Pulsa para verla.'
                : '{n} personas sin a\u00f1adir. Pulsa para verlas.', { n: n }));
            D.text(D.$('requests-row-count'), String(n));
        }

        /* Y si el usuario esta mirando las solicitudes cuando llega otra, se
           repinta debajo. Solo entonces: fabricar tarjetas para una vista
           apagada es trabajo tirado, y esto se llama en cada refreshRoster. */
        if (D.current === 'view-requests') { pintar(); }
    };

    D.openRequests = function () {
        pintar();
        D.view('view-requests');
    };

    D.initRequests = function () {
        D.on(D.$('requests-row'), 'click', function () { D.openRequests(); });
        /* Volver a la lista, no a la conversacion: se ha llegado aqui desde
           la lista y en movil D.view deja el panel de conversaciones a la
           vista, que es de donde salio el usuario. */
        D.on(D.$('btn-requests-back'), 'click', function () { D.view('view-main'); });
        D.refreshRequests();
    };
})(BINTIO);
