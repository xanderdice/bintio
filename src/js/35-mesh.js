/* ==========================================================================
   La MALLA.

   Esta es la pieza que casi ningun mensajero de navegador tiene: los nodos
   se llevan sobres ajenos en el bolsillo y los sueltan cuando se cruzan con
   alguien nuevo. Si Ana no esta conectada, su mensaje no se pierde: viaja
   en aparatos de terceros que no pueden leerlo, hasta que llega.

   Reglas, todas conservadoras a proposito:
     - Un sobre se reenvia como mucho MAX_TTL saltos.
     - Cada sobre se procesa una sola vez (memoria de identificadores).
     - Un sobre caducado se tira, siempre.
     - La bolsa tiene tope de piezas y de bytes; cuando se llena se sacrifica
       primero lo que antes caduca. Las presentaciones tienen cupo aparte y se
       sacrifican al azar, pero antes lo ajeno que lo propio (podaPresentaciones).
     - Nada de lo que hay en la bolsa se puede leer en este aparato.

   Aqui dentro se llama "bolsa" (y en el codigo, bag/carrier). En la pantalla
   se llama MOCHILA, que es lo que la gente entiende a la primera: lo que tu
   aparato lleva encima para otros. Es la misma cosa.

   Formatos en el cable:
     'B','X',...   -> un sobre (ver 32-envelope.js)
     'B','P',...   -> una presentacion (ver 37-presenta.js)
     'B','C',tipo  -> control de la malla
                      1 inventario: lista de identificadores que tengo
                      2 peticion:   dame estos identificadores
                      3 saludo:     version y capacidades

   La presentacion se transporta, se reenvia, caduca y entra en la bolsa
   EXACTAMENTE igual que un sobre: la regla de esta casa es que la malla
   transporta cualquier marco de familia 'B' cuya clase conozca, y las clases
   futuras entran por el mismo camino. Lo unico distinto es quien intenta
   abrirla (V.presenta en vez de V.session) y que tiene cupo propio en la
   bolsa, para que una inundacion de presentaciones no desaloje ni un sobre.
   ========================================================================== */
(function (V) {
    'use strict';
    var C = V.crypto, U = V.util, E = V.envelope, M = V.mesh;

    /* La clase de marco de control. El byte 0 lo pone la familia (E.MAGIC0),
       asi que aqui solo se decide el byte 1, y se decide UNA vez: tenerlo dos
       veces (una al comparar y otra al construir) es exactamente la forma en
       que el nombre viejo se quedo colado en el cable. */
    var CTRL1 = 0x43; /* C */

    var MAX_BAG = 300;              /* piezas, solo sobres */
    var MAX_BAG_BYTES = 900 * 1024; /* aprox 900 KB, solo sobres */
    var MAX_SEEN = 800;

    /* Cupo propio de las presentaciones. Vive aqui y no en 37-presenta.js
       porque quien lo aplica es la bolsa; si falta el fichero, 40 sigue
       siendo el numero. 40 x 708 bytes son 28 KB: el 3% del presupuesto. */
    function presMax() {
        return (V.presenta && V.presenta.BAG_MAX) || 40;
    }

    var seen = {};        /* id -> segundos en que se vio */
    var seenOrder = [];
    var onDeliver = null; /* callback: (envelopeParsed) cuando es para nosotros */

    M.stats = { received: 0, relayed: 0, delivered: 0, dropped: 0, carried: 0, presented: 0 };

    /* La unica linea del fichero que sabe de clases de marco, y se usa en los
       CUATRO sitios que parsean: si alguno se queda con E.parse, una
       presentacion se convierte en null justo ahi y se pierde en silencio. */
    function parse(b) {
        if (b && b[1] === E.MAGIC_PRES) {
            return (V.presenta && V.presenta.parse) ? V.presenta.parse(b) : null;
        }
        return E.parse(b);
    }

    /* El identificador de un marco, sea sobre o presentacion. Mismo reparto
       que parse(), y por lo mismo. */
    function idDe(b) {
        if (b && b[1] === E.MAGIC_PRES) {
            return (V.presenta && V.presenta.idOf) ? V.presenta.idOf(b) : null;
        }
        return E.idOf(b);
    }

    /* Bovedas viejas: el identificador se calculaba sobre menos bytes, asi que
       una mochila guardada con la version anterior trae identificadores que hoy
       no salen de sus propios datos. Eso no rompe nada por dentro -la mochila
       se busca a si misma por el campo guardado- pero el mismo sobre, al volver
       a llegar por otro vecino, no se reconoce como repetido y se guarda dos
       veces. Se recalculan una vez al arrancar, que son trescientos hashes de
       un kilobyte, y el problema no vuelve a existir. */
    function migrarIds(lista) {
        var cambiados = 0, i, bytes, nuevo;
        for (i = lista.length - 1; i >= 0; i--) {
            try { bytes = U.fromB64(lista[i].d); } catch (e) { bytes = null; }
            nuevo = bytes ? idDe(bytes) : null;
            if (!nuevo) { lista.splice(i, 1); cambiados++; continue; }
            if (nuevo !== lista[i].i) { lista[i].i = nuevo; cambiados++; }
        }
        return cambiados;
    }

    M.init = function (deliverFn) {
        onDeliver = deliverFn;
        var st = V.vault.state;
        if (!st.carrier) { st.carrier = []; }
        if (migrarIds(st.carrier)) { V.vault.save(); }
        if (st.seen) {
            for (var i = 0; i < st.seen.length; i++) { markSeen(st.seen[i]); }
        }
        M.prune();
    };

    function markSeen(id) {
        if (seen[id]) { return false; }
        seen[id] = Math.floor(U.now() / 1000);
        seenOrder.push(id);
        while (seenOrder.length > MAX_SEEN) { delete seen[seenOrder.shift()]; }
        return true;
    }

    /* Deshacer el "visto".

       La memoria de identificadores existe para no procesar dos veces lo mismo,
       y eso presupone que la primera vez se proceso. Cuando una presentacion se
       queda SIN PROCESAR por falta de cupo de curvas, marcarla como vista la
       condena: si ademas se cae de la mochila, no vuelve a entrar nunca aunque
       el vecino la siga ofreciendo. Un atacante que agote el cupo del minuto
       borraba asi todas las presentaciones legitimas posteriores.

       Regla, que es la que faltaba: solo se da por visto lo que se ha terminado
       de atender. Lo que se aparca para luego, se olvida. */
    function unmarkSeen(id) {
        if (!seen[id]) { return; }
        delete seen[id];
        for (var i = seenOrder.length - 1; i >= 0; i--) {
            if (seenOrder[i] === id) { seenOrder.splice(i, 1); break; }
        }
    }

    M.persistSeen = function () {
        if (V.vault.state) { V.vault.state.seen = seenOrder.slice(-MAX_SEEN); }
    };

    /* ---------------------------------------------------------------------
       La bolsa: sobres ajenos que llevamos encima.
       --------------------------------------------------------------------- */
    function bag() { return (V.vault.state && V.vault.state.carrier) || []; }

    M.bagSize = function () {
        var b = bag(), n = 0;
        for (var i = 0; i < b.length; i++) { n += b[i].d.length; }
        return { count: b.length, bytes: Math.floor(n * 3 / 4) };
    };

    /* Las presentaciones tienen cupo propio, y dentro de ese cupo se echa AL
       AZAR, pero por ORDEN DE DUENO.

       Al azar y no por caducidad, que es lo que hace el bloque de abajo: ahi el
       que inunda elige su caducidad dentro de la ventana que se acepta, pone la
       mayor y sobrevive siempre. Tampoco por antiguedad de llegada, que
       convierte la bolsa en "gana el ultimo" o en "gana el primero" segun el
       signo. Al azar, nadie puede dirigir a quien se echa.

       Lo que faltaba era el ORDEN. Al azar a secas entraba tambien la
       presentacion que acabas de sellar tu: trescientos marcos ajenos la
       echaban de tu propia mochila, y como no habia salido del aparato, no la
       tenia nadie mas. Con los sobres 'X' eso no pasa nunca, porque ahi se
       ordena por caducidad y lo recien sellado es lo ultimo en morir; aqui hacia
       falta decirlo.

       Las listas se recalculan tras cada baja en vez de arrastrar indices: son
       cuarenta piezas y una resta mal hecha aqui se lleva el marco equivocado. */
    /* El orden en que se sacrifica, de lo que menos duele a lo que mas:

         1. ajenas    ya se abrieron y no eran para nosotros. Las llevamos por
                      hacer de cartero; si se pierden, otro las lleva.
         2. sin ver   no se han podido abrir por falta de cupo. PODRIAN ser
                      nuestras, asi que valen mas que las ajenas, pero menos
                      que las que ya sabemos que lo son.
         3. propias   las sellamos aqui. Duele, pero se pueden volver a sellar:
                      36-chat.js las reintenta.
         4. espera    abiertas, para nosotros, esperando sitio en la lista. Son
                      las UNICAS que no se pueden recuperar de ninguna forma si
                      se van: quien las mando no reintenta. Se sacrifican las
                      ultimas, y por eso estaban mal antes de las propias.

       Dentro de cada grupo se elige al azar, que es lo unico que impide que
       quien inunda decida a quien echa. */
    function podaPresentaciones(b) {
        var tope = presMax(), ajenas, sinVer, espera, propias, cola, i, j, r;
        for (;;) {
            ajenas = []; sinVer = []; espera = []; propias = [];
            for (i = 0; i < b.length; i++) {
                if (b[i].k !== 'p') { continue; }
                if (b[i].m) { propias.push(i); }
                else if (b[i].w) { espera.push(i); }
                else if (b[i].z) { sinVer.push(i); }
                else { ajenas.push(i); }
            }
            if (ajenas.length + sinVer.length + espera.length + propias.length <= tope) { return; }
            /* Antes del orden de valor, un suelo por clase.

               Sin esto, una clase se come la mochila entera y mata de hambre a
               las demas: cuarenta presentaciones propias pendientes -escribir a
               cuarenta personas nuevas sin cobertura, sin que nadie ataque
               nada- hacian que toda presentacion que llegara despues muriera en
               la misma llamada que la metia. Lo propio no puede quedarse con
               mas de su parte, y lo que llega tiene que tener siempre donde
               caer. */
            /* El suelo vale para las DOS clases que pueden acaparar. Estaba
               solo en las propias, y con la mochila llena de las que esperan
               sitio, la presentacion que acababas de sellar moria en el mismo
               M.send que la metia... y como 36-chat.js reintenta lo que no esta
               en la mochila, se quedaba minando cada minuto para siempre. */
            cola = espera.length > Math.floor(tope / 2) ? espera
                 : (propias.length > Math.floor(tope / 4) ? propias
                 : (ajenas.length ? ajenas
                 : (sinVer.length ? sinVer
                 : (propias.length ? propias : espera))));
            /* Dos bytes, no uno: con uno solo, una bolsa de mas de 256
               presentaciones nunca podria echar a las de mas atras. */
            r = C.random(2);
            j = (((r[0] << 8) | r[1]) >>> 0) % cola.length;
            b.splice(cola[j], 1);
            M.stats.dropped++;
        }
    }

    M.prune = function () {
        var b = bag(), now = Math.floor(U.now() / 1000), i, sobres = [], bytes = 0, fuera;
        for (i = b.length - 1; i >= 0; i--) {
            if (b[i].e < now) { b.splice(i, 1); M.stats.dropped++; }
        }

        podaPresentaciones(b);

        /* El cupo general cuenta SOLO sobres. Es lo que hace que el cupo de
           arriba sea de verdad aparte: una inundacion de presentaciones no
           puede desalojar ni un sobre, que es lo que esta aplicacion existe
           para llevar.

           Y dentro de los sobres, lo que antes caduca se va primero: ese sobre
           tiene menos vida util que uno recien creado y por tanto menos
           posibilidades de llegar. */
        for (i = 0; i < b.length; i++) {
            if (b[i].k !== 'p') { sobres.push(b[i]); bytes += b[i].d.length; }
        }
        bytes = Math.floor(bytes * 3 / 4);
        if (sobres.length > MAX_BAG || bytes > MAX_BAG_BYTES) {
            sobres.sort(function (x, y) { return y.e - x.e; });
            while (sobres.length && (sobres.length > MAX_BAG || bytes > MAX_BAG_BYTES)) {
                fuera = sobres.pop();
                bytes -= Math.floor(fuera.d.length * 3 / 4);
                i = b.indexOf(fuera);
                if (i >= 0) { b.splice(i, 1); }
                M.stats.dropped++;
            }
        }
    };

    function bagHas(id) {
        var b = bag();
        for (var i = 0; i < b.length; i++) { if (b[i].i === id) { return true; } }
        return false;
    }

    /* clase: 'p' si es una presentacion, nada si es un sobre.

       estado, solo para las presentaciones, y cada valor pone una marca que
       decide dos cosas: si hay que volver a intentar abrirla y quien la puede
       desalojar de la mochila.
         'mia'       la sellamos aqui: no se abre nunca (seria abrir lo que
                     acabamos de escribir) y la poda la protege.
         'probada'   ya se intento abrir y no era para nosotros, o si lo era y
                     quedo atendida. No se vuelve a tocar.
         'diferida'  no se pudo ni intentar por el cupo de curvas. Entra SIN
                     marca de probada y la reintenta V.presenta.retry; sin eso,
                     cada vuelta del reloj pagaria la curva de todas.
         'llena'     se abrio y es una solicitud nueva, pero la lista esta llena.
                     Se queda esperando sitio (marca w) en vez de darse por
                     atendida, que es como se perdian para siempre. */
    function bagAdd(id, bytes, expires, clase, estado) {
        if (bagHas(id)) { return; }
        var reg = { i: id, d: U.toB64(bytes), e: expires, t: Math.floor(U.now() / 1000) };
        if (clase === 'p') {
            reg.k = 'p';
            if (estado === 'mia') { reg.m = 1; reg.p = 1; }
            else if (estado === 'probada') { reg.p = 1; }
            else if (estado === 'llena') { reg.w = 1; }
            /* Sin abrir todavia. No lleva la marca de probada, asi que
               V.presenta.retry vuelve a por ella, y lleva la suya propia para
               que la poda no la confunda con lo que solo transportamos: podria
               ser nuestra y aun no lo sabemos. */
            /* Sin abrir: o porque no habia cupo de curva, o porque el buzon
               esta cerrado. En los dos casos podria ser nuestra y no lo sabemos,
               asi que ni se da por atendida ni se confunde con lo que solo
               transportamos. */
            else if (estado === 'diferida' || estado === 'cerrada') { reg.z = 1; }
        } else if (estado === 'senuelo') {
            /* Un sobre nuestro ya leido, guardado para que la lista no delate
               nada. La marca es de puertas adentro -no sale en el inventario ni
               en el cable- y solo sirve para que M.rescanBag no lo vuelva a
               abrir en cada alta de contacto. */
            reg.v = 1;
        }
        bag().push(reg);
        M.stats.carried++;
        M.prune();
        V.vault.save();
    }

    /* Sacar una pieza de la bolsa. Lo usa 36-chat.js al reintentar: un
       mensaje que no ha salido se vuelve a sellar, y el sobre nuevo tiene otro
       identificador, asi que sin esto la copia anterior se quedaria dentro
       para siempre. */
    function bagDrop(id) {
        var b = bag();
        for (var i = 0; i < b.length; i++) {
            if (b[i].i === id) { b.splice(i, 1); return true; }
        }
        return false;
    }
    M.bagDrop = bagDrop;

    /* Lo mismo que M.bagGet pero para dar a un tercero: por aqui no sale lo
       que sePublica no ensena. M.bagGet se queda como esta porque lo usa
       36-chat.js para mirar su propia mochila, y ahi no hay nadie a quien
       ocultarle nada. */
    function bagServe(id) {
        var b = bag();
        for (var i = 0; i < b.length; i++) {
            if (b[i].i === id) { return sePublica(b[i]) ? U.fromB64(b[i].d) : null; }
        }
        return null;
    }

    M.bagGet = function (id) {
        var b = bag();
        for (var i = 0; i < b.length; i++) {
            if (b[i].i === id) { return U.fromB64(b[i].d); }
        }
        return null;
    };

    /* Que piezas se le ensenan a un vecino.

       Con el reenvio ENCENDIDO, todas: es lo que hace que lo nuestro y lo ajeno
       no se distingan, que es justo lo que se busca.

       Apagado es al reves. Apagado no se lleva nada de nadie, asi que en la
       mochila solo queda lo propio, y entonces ensenarla delata: un vecino te
       ofrece una presentacion, te pide la lista, y si aparece es que era para
       ti. Apagado se ensena solo lo que uno mismo ha sellado, que ya sale por
       el cable de todas formas y no dice nada que no se sepa. Lo que esta
       aparcado esperando -una presentacion sin cupo, o con el buzon cerrado-
       se queda en casa. */
    function sePublica(reg) {
        if (V.vault.state && V.vault.state.settings && V.vault.state.settings.relay) { return true; }
        return !!reg.m;
    }

    M.bagIds = function () {
        var b = bag(), out = [];
        for (var i = 0; i < b.length; i++) {
            if (sePublica(b[i])) { out.push(b[i].i); }
        }
        return out;
    };

    M.bagClear = function () {
        if (V.vault.state) { V.vault.state.carrier = []; V.vault.save(); }
    };

    /* ---------------------------------------------------------------------
       Entrada: un marco cualquiera desde un transporte.
       --------------------------------------------------------------------- */
    M.handleFrame = function (bytes, peer) {
        if (!bytes || bytes.length < 3) { return; }
        if (bytes[0] !== E.MAGIC0) { return; }
        if (bytes[1] === E.MAGIC1) { M.handleEnvelope(bytes, peer); return; }
        /* La presentacion entra por la MISMA puerta que el sobre: solo cambia
           quien intenta abrirla. Si se le diera un camino propio, acabaria con
           su propia memoria de repetidos, su propio reenvio y su propia
           caducidad, o sea con tres sitios donde equivocarse. */
        if (bytes[1] === E.MAGIC_PRES) { M.handleEnvelope(bytes, peer); return; }
        if (bytes[1] === CTRL1) { handleControl(bytes, peer); return; }
    };

    M.handleEnvelope = function (bytes, peer) {
        var env = parse(bytes);
        if (!env) { return; }
        M.stats.received++;

        var now = Math.floor(U.now() / 1000);
        if (E.isExpired(env, now)) { M.stats.dropped++; return; }
        if (!markSeen(env.id)) { return; }   /* ya paso por aqui */

        var esPres = env.clase === 'p';
        var opened = null, suerte = null;

        /* Primero: es para nosotros? */
        if (esPres) {
            M.stats.presented++;
            /* onDeliver no vale aqui: ese callback esta tipado como "un sobre
               abierto para una conversacion", y una presentacion puede acabar
               en una solicitud, que no es una conversacion todavia. */
            try { suerte = V.presenta.receive(env, peer); } catch (e) { suerte = 'ajena'; }
            if (suerte === 'mia') {
                M.stats.delivered++;
                /* Y se guarda igual que si fuera de otro: ver mas abajo. */
                if (V.vault.state.settings.relay) {
                    bagAdd(env.id, bytes, env.expires, 'p', 'probada');
                }
            }
            else if (suerte === 'diferida' || suerte === 'llena' || suerte === 'cerrada') {
                /* Estas dos son NUESTRAS aunque todavia no se hayan podido
                   atender, asi que entran en la mochila aunque el usuario haya
                   apagado el reenvio: apagarlo dice "no llevo cosas de otros",
                   no "tira lo que va dirigido a mi". Si no entraran aqui, el
                   marco se habria consumido sin dejar rastro y el emisor no
                   reintenta nunca. */
                bagAdd(env.id, bytes, env.expires, 'p', suerte);
                /* Y si al final NO cupo en la mochila, se olvida que se vio:
                   es la unica forma de que el vecino nos la pueda volver a
                   ofrecer. Aparcar algo y ademas darlo por atendido es como se
                   perdian para siempre. */
                /* Si al final NO cupo, se olvida que se vio: es la unica forma
                   de que el vecino nos la pueda volver a ofrecer. Vale para las
                   TRES: aparcar algo y ademas darlo por atendido es como se
                   perdian para siempre. */
                if (!bagHas(env.id)) { unmarkSeen(env.id); }
            } else if (V.vault.state.settings.relay) {
                bagAdd(env.id, bytes, env.expires, 'p', 'probada');
            }
        } else {
            try { opened = V.session.open(env); } catch (e) { opened = null; }
            if (opened) {
                M.stats.delivered++;
                if (onDeliver) { onDeliver(opened, env); }
                /* Se sigue reenviando aunque sea nuestro: si el trafico se parara
                   justo en el destino, mirar donde se detiene un sobre revelaria
                   a quien iba dirigido. Con una presentacion vale doble: donde se
                   parase diria a quien se acaba de presentar alguien.

                   Y por lo mismo se GUARDA aunque ya se haya leido. Reenviar y no
                   guardar tapaba media huella y dejaba la otra a la vista: basta
                   con pedirle el inventario al vecino de al lado. Todo el que
                   lleva cosas de otros apunta el sobre; el destinatario era el
                   unico que no, asi que el hueco en su lista lo senalaba. Se
                   captura un sobre cualquiera de la malla, se le ofrece a cada
                   vecino, se le pide la lista, y el que no lo tenga es para quien
                   iba. Con esto la lista de uno y la de otro son iguales.

                   No cuesta nada de mas: es exactamente lo que ese sobre habria
                   ocupado en cualquier otro aparato, caduca a la vez y se poda
                   igual. Solo se hace con el reenvio encendido: apagado, nadie
                   guarda nada de nadie, y una mochila con solo lo tuyo dentro
                   seria la senal mas clara de todas. */
                if (V.vault.state.settings.relay) {
                    bagAdd(env.id, bytes, env.expires, null, 'senuelo');
                }
            } else if (V.vault.state.settings.relay) {
                bagAdd(env.id, bytes, env.expires, null, null);
            }
        }

        /* Segundo: pasarlo a los demas, con un salto menos. */
        var copy = new Uint8Array(bytes);
        if (E.hop(copy) && V.vault.state.settings.relay) {
            M.broadcast(copy, peer);
            M.stats.relayed++;
        }
        M.persistSeen();
        V.vault.save();
    };

    /* ---------------------------------------------------------------------
       Control: inventario y peticiones. Asi dos nodos que se acaban de
       conocer se ponen al dia sin mandarse la bolsa entera.
       --------------------------------------------------------------------- */
    function controlFrame(type, payload) {
        return U.concat([new Uint8Array([E.MAGIC0, CTRL1, type]), payload || new Uint8Array(0)]);
    }

    function idsToBytes(ids) {
        var out = new Uint8Array(ids.length * 12);
        for (var i = 0; i < ids.length; i++) { out.set(U.fromHex(ids[i]), i * 12); }
        return out;
    }
    function bytesToIds(b) {
        var out = [];
        for (var i = 0; i + 12 <= b.length; i += 12) { out.push(U.toHex(b.subarray(i, i + 12))); }
        return out;
    }

    function handleControl(bytes, peer) {
        var type = bytes[2], payload = bytes.subarray(3), i;
        if (type === 1) {                       /* inventario recibido */
            var want = [];
            var ids = bytesToIds(payload);
            for (i = 0; i < ids.length; i++) {
                if (!seen[ids[i]] && !bagHas(ids[i])) { want.push(ids[i]); }
            }
            if (want.length) { peer.send(controlFrame(2, idsToBytes(want.slice(0, 120)))); }
        } else if (type === 2) {                /* nos piden sobres */
            /* El mismo tope que el inventario, y por la misma razon. Sin el, un
               vecino pedia cincuenta mil veces el mismo identificador y se le
               contestaba con treinta megas: no roba nada, pero le gasta a un
               movil la radio y la bateria por Bluetooth con una peticion suya de
               medio mega. Se responde a lo que quepa en una tanda y que vuelva a
               pedir si le falta algo. */
            var req = bytesToIds(payload).slice(0, 120);
            for (i = 0; i < req.length; i++) {
                var data = bagServe(req[i]);
                if (data) { peer.send(data); }
            }
        }
    }

    /* Al conocer a alguien: ofrecerle lo que llevamos encima. */
    M.greet = function (peer) {
        var ids = M.bagIds();
        if (ids.length) { peer.send(controlFrame(1, idsToBytes(ids.slice(0, 200)))); }
    };

    /* ---------------------------------------------------------------------
       Salida
       --------------------------------------------------------------------- */
    M.broadcast = function (bytes, exceptPeer) {
        var peers = V.transport.peers(), n = 0;
        for (var i = 0; i < peers.length; i++) {
            if (exceptPeer && peers[i].id === exceptPeer.id) { continue; }
            try { peers[i].send(bytes); n++; } catch (e) {}
        }
        return n;
    };

    /* Enviar algo propio. Si no hay nadie conectado, se guarda en la bolsa
       para soltarlo en cuanto aparezca alguien: el mensaje sale del aparato
       en cuanto haya por donde.

       El segundo argumento es el identificador del sobre que ESTE sustituye, y
       existe por un fallo que costo la bolsa entera. Un mensaje que no ha
       salido se reintenta cada minuto (50-app.js), y cada reintento lo vuelve
       a SELLAR: efimera nueva, nonce nuevo, identificador nuevo. bagAdd no lo
       reconocia como repetido y metia una copia mas. Once copias del mismo
       mensaje en diez minutos; en cinco horas, las trescientas de MAX_BAG.

       Y lo que se tiraba no eran las copias: M.prune saca primero lo que antes
       caduca, y cada copia nueva nace con 72 horas por delante mientras que un
       sobre ajeno ya lleva camino recorrido. Es decir: un solo mensaje tuyo
       atascado vaciaba la bolsa de sobres de otros, que es exactamente lo que
       esta aplicacion existe para llevar.

       Quien reintenta dice cual era su copia anterior y aqui se quita antes de
       poner la nueva: una por mensaje, no una por minuto. */
    M.lastId = null;

    M.send = function (bytes, reemplaza) {
        /* Con E.parse aqui, una presentacion propia salia por los cables que
           hubiera abiertos en ese instante y NO se guardaba: sin nadie cerca
           -que es el caso normal cuando te presentas- se perdia entera. */
        var env = parse(bytes);
        M.lastId = env ? env.id : null;
        if (env) { markSeen(env.id); }
        var n = M.broadcast(bytes, null);
        if (env) {
            if (reemplaza && reemplaza !== env.id) { bagDrop(reemplaza); }
            /* Lo nuestro entra ya probado -abrirlo seria abrir lo que acabamos
               de escribir- y marcado como propio, que es lo que impide que una
               inundacion ajena se lo lleve por delante antes de que salga. */
            bagAdd(env.id, bytes, env.expires, env.clase, 'mia');
        }
        return n;
    };

    /* Volver a intentar abrir lo que ya llevamos encima.

       Un sobre solo se puede abrir si quien lo manda esta en nuestra lista de
       contactos: S.open recorre los contactos y prueba la etiqueta con cada
       uno (34-session.js). Si alguien nos anade y nos escribe ANTES de que
       nosotros le anadamos a el, su mensaje llega al aparato, no se reconoce
       como propio y se queda en la bolsa igual que el de un desconocido.

       Hasta ahora se quedaba ahi para siempre: al dar de alta a esa persona
       nadie volvia a mirar la bolsa, y ese mensaje se perdia aunque estuviera
       en el disco. Esto lo llama contacts.add, asi que en cuanto le anades
       aparecen los mensajes que ya te habia mandado.

       No se saca nada de la bolsa: seguimos reenviandolo como cualquier otro,
       que es lo que hace que la malla funcione. */
    M.rescanBag = function () {
        if (!V.vault.state) { return 0; }
        var b = bag(), abiertos = 0, i, env, opened;
        for (i = 0; i < b.length; i++) {
            /* Las presentaciones no se miran aqui: no dependen de tener a
               nadie dado de alta, asi que dar de alta a alguien no cambia
               nada para ellas. Las que se quedaron sin cupo de curva las
               reintenta V.presenta.retry, y volver a probarlas en cada alta
               seria pagar curvas para nada. */
            if (b[i].k === 'p' || b[i].v) { continue; }
            env = parse(U.fromB64(b[i].d));
            if (!env) { continue; }
            opened = null;
            try { opened = V.session.open(env); } catch (e) { opened = null; }
            if (opened) {
                abiertos++;
                M.stats.delivered++;
                /* El tercer argumento dice "esto no acaba de llegar: estaba
                   guardado y lo hemos podido abrir AHORA". Importa porque un
                   acuse de entrega aqui no contaria cuando llego el mensaje,
                   sino el segundo exacto en que diste de alta a esa persona
                   -o aceptaste su solicitud-, que es justo lo que nadie tiene
                   por que saber. */
                opened.recuperado = true;
                if (onDeliver) { onDeliver(opened, env); }
            }
        }
        return abiertos;
    };

    /* Cuando aparece un transporte nuevo, vaciar lo pendiente hacia el. */
    M.flushTo = function (peer) {
        var b = bag(), sent = 0;
        for (var i = 0; i < b.length && sent < 40; i++) {
            if (!sePublica(b[i])) { continue; }
            try { peer.send(U.fromB64(b[i].d)); sent++; } catch (e) { break; }
        }
        return sent;
    };
})(BINTIO);
