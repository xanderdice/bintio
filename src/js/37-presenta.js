/* ==========================================================================
   La PRESENTACION: el unico marco que puede abrir alguien que no te conoce.

   Un sobre normal (32-envelope.js) mezcla tres secretos, y uno de ellos,
   ss2 = X25519(estatica del remitente, estatica del destinatario), exige que
   el destinatario TE TENGA DADO DE ALTA para poder recalcularlo. Eso autentica
   al remitente sin firmar nada, pero obliga a un paso de vuelta que la gente
   no da: sus mensajes acaban en la mochila del otro sin poderse abrir jamas.

   La presentacion rompe ese circulo con una sola idea: se cifra con una clave
   derivada SOLO de ss1 = X25519(efimera, estatica del destinatario). El
   destinatario la calcula con su propia privada y la efimera que viaja en la
   cabecera, sin saber quien escribe. Dentro del texto cifrado van la clave
   publica estatica del remitente, su nombre, un primer mensaje y un SELLO
   hecho con ss2. Al abrirlo, el destinatario lee la clave que se declara,
   calcula ss2 por su lado y comprueba el sello: si cuadra, quien lo mando
   tiene de verdad la privada de esa identidad. NADIE PUEDE SUPLANTAR A NADIE.

   Lo unico que queda abierto -y es deliberado- es que un desconocido te
   escriba con SU identidad real. Para eso no se anade el contacto solo: llega
   como SOLICITUD y decide el usuario.

   Disposicion binaria: 708 bytes EXACTOS, siempre.

     cabecera (64, la misma del sobre)
       0      'B'   familia
       1      'P'   clase: presentacion
       2      version del protocolo
       3      banderas: SIEMPRE 0, y se rechaza si no lo es
       4      saltos restantes   <- MUTABLE en transito
       5      saltos dados       <- MUTABLE, arranca en 1 (ver abajo)
       6-11   caducidad, segundos unix (48 bits)
       12-43  clave efimera del remitente (32)
       44-51  prueba de coste (8)   <- NO entra en el AAD
       52-63  nonce (12)
     texto cifrado (628 + 16 de autenticador)
       0      version del contenido
       1-32   clave publica estatica DECLARADA del remitente
       33     longitud del nombre, 1..64
       34-97  nombre UTF-8, relleno a cero
       98-99  longitud del mensaje, 0..512
       100-611 mensaje UTF-8, relleno a cero
       612-627 sello de ss2 sobre los bytes 0..611

   Por que ranuras fijas y relleno: con campos de longitud variable, el tamano
   del marco delata el del mensaje a todos los relevos. Relleno hasta un tamano
   fijo eso desaparece, y una vez que se rellena, poner cada campo en un sitio
   constante sale gratis: el primer filtro del receptor es una igualdad de
   enteros, antes de tocar nada.

   Por que los saltos arrancan en 1 y no en 0: en un sobre normal, el primer
   vecino que ve hops === 0 sabe con certeza que quien se lo pasa es el autor.
   Para una presentacion esa fuga es peor, porque el marco significa "esta
   persona se acaba de presentar a alguien". Arrancando en 1, el vecino no
   puede distinguir al autor del primer relevo. Nadie consume hops, asi que el
   cambio es gratis.

   Por que la posicion 44 no puede llevar la etiqueta del sobre: la etiqueta
   solo es un filtro barato si el RECEPTOR la recalcula sin criptografia cara,
   y para eso hace falta un secreto compartido... que es justo lo que aqui no
   se tiene todavia. Una etiqueta sobre ss1 no ahorra nada (comprobarla cuesta
   la misma curva que intentar abrir) y una etiqueta publica sobre la clave del
   destinatario convertiria el marco en un sobre con destinatario legible: como
   la clave publica se reparte en un QR, cualquiera podria contar quien te
   escribe. Es una dicotomia, no un termino medio.

   Lo que se pone en su lugar: una PRUEBA DE COSTE que protege el mismo recurso
   (la CPU del que recibe) por el unico camino que queda, hacer caro FABRICAR
   el marco en vez de barato descartarlo. Comprobarla es un sha256; producirla,
   65.536 de media. Dos bytes a cero es el unico valor entre "gratis" y
   "inutilizable" con el sha256 de este proyecto.

   Claves, todas por HKDF y ningun secreto crudo:
     clave del sobre = HKDF(ss1, sal = efimera, "bintio/pres/v1")
     clave del sello = HKDF(ss2, sal = efimera, "bintio/pres-auth/v1")

   El sello es un MAC y no una firma a proposito: una firma es transferible y
   probaria ante terceros que Ana contacto contigo. El sello sobre ss2 solo lo
   puede comprobar el destinatario, que ademas podria haberlo fabricado el
   mismo. Es la misma propiedad que ya tiene el sobre normal, y la presentacion
   no puede ser el unico marco del protocolo que produzca prueba no repudiable
   de quien habla con quien.
   ========================================================================== */
(function (V) {
    'use strict';
    var C = V.crypto, U = V.util, E = V.envelope, K = V.contacts;

    /* Dos espacios de nombres, una sola implementacion:
         V.presenta  el cable (sellar, abrir, minar, recibir)
         V.requests  el modelo de solicitudes que usa la interfaz
       Se crean aqui con "|| {}" para que este fichero funcione tanto si
       00-ns.js los declara como si no: es el unico sitio que los escribe. */
    var P = V.presenta = V.presenta || {};
    var R = V.requests = V.requests || {};

    P.VER = 1;                     /* version del contenido cifrado */
    P.HEAD = E.HEAD;               /* 64: la cabecera es la misma del sobre */
    P.PLAIN = 628;                 /* texto en claro, SIEMPRE exactamente esto */
    P.FRAME = 708;                 /* 64 + 628 + 16, siempre */
    P.NOMBRE_MAX = 64;             /* bytes UTF-8 */
    P.MENSAJE_MAX = 512;           /* bytes UTF-8 */
    P.LIFE = E.DEFAULT_LIFE;       /* 72 h, la misma vida que un sobre */
    P.MAX_LIFE = 96 * 3600;        /* 72 h + 24 h de holgura de reloj */
    P.CEROS = 2;                   /* bytes a cero en la prueba de coste */
    P.SLICE = 512;                 /* intentos de minado por tanda */
    P.BAG_MAX = 40;                /* presentaciones en la bolsa, cupo aparte */
    P.TRY_MIN = 60;                /* aperturas por minuto en todo el nodo */
    P.TRY_PEER = 10;               /* ... y por enlace */
    P.SOL_MAX = 20;                /* solicitudes pendientes guardadas */
    P.SOL_LIFE = 30 * 24 * 3600 * 1000;

    /* Posiciones dentro del texto en claro. La clave declarada va la primera
       porque es lo primero que el receptor necesita para calcular ss2. */
    var O_VER = 0, O_PK = 1, O_NLEN = 33, O_NOMBRE = 34,
        O_MLEN = 98, O_MENSAJE = 100, O_SELLO = 612;

    /* ---------------------------------------------------------------------
       Prueba de coste
       --------------------------------------------------------------------- */

    /* Lo que se autentica: la cabecera con los saltos Y los 8 bytes de coste a
       cero. Los saltos porque cambian por el camino; el coste porque cada
       intento de minado cambia esos 8 bytes y, si entraran, habria que volver a
       cifrar 644 bytes por intento. Que queden fuera del AEAD es inofensivo:
       se autentican solos, porque el hash del coste cubre el texto cifrado. */
    P.aadOf = function (head) {
        var a = new Uint8Array(P.HEAD), i;
        a.set(head.subarray(0, P.HEAD));
        a[4] = 0; a[5] = 0;
        for (i = 44; i < 52; i++) { a[i] = 0; }
        return a;
    };

    var POW = null;
    function powDom() {
        if (!POW) { POW = U.fromString('bintio/pow/v1'); }
        return POW;
    }

    /* El hash cubre el CUERPO CIFRADO ademas de la cabecera. Si solo cubriera
       la cabecera, se minaria una vez y se le colgarian diez mil cuerpos
       distintos: minar una vez, inundar siempre. */
    P.workHash = function (head, body) {
        var h0 = new Uint8Array(P.HEAD);
        h0.set(head.subarray(0, P.HEAD));
        h0[4] = 0; h0[5] = 0;
        return C.sha256(powDom(), h0, body);
    };

    P.workOk = function (head, body) {
        var h = P.workHash(head, body);
        for (var i = 0; i < P.CEROS; i++) { if (h[i] !== 0) { return false; } }
        return true;
    };

    /* Minar es hashear el mismo bufer una y otra vez cambiando 8 bytes. Se
       arma UNA vez y se toca solo el contador: reconstruirlo por intento
       costaria mas que el propio hash. */
    function banco(head, body) {
        var pre = powDom();
        var b = new Uint8Array(pre.length + P.HEAD + body.length);
        b.set(pre, 0);
        b.set(head.subarray(0, P.HEAD), pre.length);
        b.set(body, pre.length + P.HEAD);
        b[pre.length + 4] = 0; b[pre.length + 5] = 0;
        return { buf: b, off: pre.length + 44 };
    }

    /* Contador opaco de 8 bytes, con acarreo del 51 hacia el 44. No se
       interpreta como numero porque en ES5 no hay enteros de 64 bits, y
       tampoco hace falta: solo tiene que recorrer valores distintos. */
    function siguiente(b, off) {
        for (var i = off + 7; i >= off; i--) {
            b[i] = (b[i] + 1) & 255;
            if (b[i] !== 0) { return; }
        }
    }

    function valeYa(h) {
        for (var i = 0; i < P.CEROS; i++) { if (h[i] !== 0) { return false; } }
        return true;
    }

    /* Se arranca en un valor aleatorio, no en cero: si no, el campo seria casi
       siempre un numero pequeno y eso es un patron reconocible en la cabecera. */
    function arranque(head, b) {
        head.set(C.random(8), 44);
        b.buf.set(head.subarray(44, 52), b.off);
    }

    P.mineSync = function (head, body) {
        var b = banco(head, body), n = 0;
        arranque(head, b);
        for (;;) {
            n++;
            if (valeYa(C.sha256(b.buf))) {
                head.set(b.buf.subarray(b.off, b.off + 8), 44);
                return n;
            }
            siguiente(b.buf, b.off);
        }
    };

    /* La misma cuenta, troceada, con la forma de C.pbkdf2Slow y por el mismo
       motivo: 512 intentos son unos 5 ms en un escritorio y unos 40 ms en un
       movil ocho veces mas lento, que es el objetivo de tanda de todo el
       proyecto. Son ~128 tandas de media, con barra. La pestana esta delante
       (el usuario acaba de pulsar), asi que el estrangulamiento de setTimeout
       en segundo plano no aplica. */
    P.mine = function (head, body, onProgress, cb) {
        var b = banco(head, body), n = 0;
        var esperados = Math.pow(256, P.CEROS);
        arranque(head, b);

        function tanda() {
            for (var k = 0; k < P.SLICE; k++) {
                n++;
                if (valeYa(C.sha256(b.buf))) {
                    head.set(b.buf.subarray(b.off, b.off + 8), 44);
                    if (onProgress) { try { onProgress(1); } catch (e) {} }
                    cb(null, n);
                    return;
                }
                siguiente(b.buf, b.off);
            }
            if (onProgress) {
                try { onProgress(Math.min(0.99, n / esperados)); } catch (e) {}
            }
            setTimeout(tanda, 0);
        }
        setTimeout(tanda, 0);
    };

    /* ---------------------------------------------------------------------
       Identificadores
       --------------------------------------------------------------------- */

    /* Doce bytes en hexadecimal, igual que E.idOf, para que el inventario de
       la malla siga funcionando sin tocar una linea. Entra TODO el marco menos
       dos cosas: los saltos (4 y 5), que cambian por el camino, y los 8 bytes
       del coste (44-51), para que volver a minar el mismo contenido no produzca
       un marco nuevo. El dominio distinto separa los dos espacios de
       identificadores por construccion.

       La caducidad (6-11) tiene que entrar, y antes no entraba. No es un campo
       mutable -solo lo son los saltos- y SI entra en el AEAD, asi que un relevo
       la cambiaba, volvia a minar (un sha256 por intento, 121 ms medidos) y
       obtenia un marco con el MISMO identificador que ya no abre. Cada nodo por
       el que pasaba lo daba por visto y tiraba el bueno cuando llegaba detras:
       la solicitud desaparecia sin que nadie pudiera notarlo. El coste sigue
       fuera porque volver a minar NO cambia el contenido; la caducidad si. */
    P.idOf = function (b) {
        var h = C.sha256(U.fromString('bintio/pres-id/v1'),
                         b.subarray(0, 4), b.subarray(6, 44),
                         b.subarray(52, 64), b.subarray(64));
        return U.toHex(h.subarray(0, 12));
    };

    /* Identificador del mensaje que viaja dentro. Es determinista sobre la
       efimera y lo calculan los dos lados, y eso resuelve dos cosas de golpe:
       dos copias de la misma presentacion no duplican el mensaje, y el sobre
       normal que sale con ESTE mismo identificador (36-chat.js) tampoco lo
       duplica cuando el otro nos da de alta y la malla se lo entrega. */
    P.midOf = function (ephPk) {
        return U.toHex(C.sha256(U.fromString('bintio/pres-mid/v1'), ephPk).subarray(0, 8));
    };

    /* ---------------------------------------------------------------------
       Claves y sello
       --------------------------------------------------------------------- */
    P.boxKey = function (ss1, ephPk) {
        return C.hkdf(ss1, ephPk, 'bintio/pres/v1', 32);
    };
    P.authKey = function (ss2, ephPk) {
        return C.hkdf(ss2, ephPk, 'bintio/pres-auth/v1', 32);
    };

    /* El sello cubre el MISMO array que se le pasa al AEAD como AAD (una
       funcion, un significado) y los 612 primeros bytes del claro, o sea todo
       menos el propio sello. Sin prefijos de longitud, y se puede: los dos
       trozos miden siempre 64 y 612, no hay frontera ambigua posible. */
    P.authFor = function (authKey, head, plain) {
        return C.hmac(authKey, U.concat([P.aadOf(head), plain.subarray(0, O_SELLO)])).subarray(0, 16);
    };

    /* ---------------------------------------------------------------------
       Empaquetado
       --------------------------------------------------------------------- */
    P.pack = function (pkDeclarada, nombreBytes, msgBytes) {
        var p = new Uint8Array(P.PLAIN);
        p[O_VER] = P.VER;
        p.set(pkDeclarada, O_PK);
        p[O_NLEN] = nombreBytes.length;
        p.set(nombreBytes, O_NOMBRE);
        p[O_MLEN] = (msgBytes.length >> 8) & 255;
        p[O_MLEN + 1] = msgBytes.length & 255;
        p.set(msgBytes, O_MENSAJE);
        return p;
    };

    /* El resto del proyecto corta los nombres a 40 CARACTERES; el cable mide
       BYTES. Se corta primero a 40 y luego se van quitando caracteres enteros
       mientras pase de 64 bytes: asi no hay que razonar sobre fronteras de
       UTF-8 en ningun sitio. Un medio par suplente al final tambien se cae,
       que si no quedaria un caracter roto en la pantalla del otro. */
    P.nombreBytes = function (name) {
        var s = String(name === undefined || name === null ? '' : name).substr(0, 40);
        var c;
        for (;;) {
            if (s.length) {
                c = s.charCodeAt(s.length - 1);
                if (c >= 0xd800 && c < 0xdc00) { s = s.substr(0, s.length - 1); continue; }
            }
            if (U.fromString(s).length <= P.NOMBRE_MAX || !s.length) { break; }
            s = s.substr(0, s.length - 1);
        }
        return U.fromString(s);
    };

    /* ---------------------------------------------------------------------
       Sellar
       --------------------------------------------------------------------- */

    /* Un par efimero por adelantado. 36-chat.js lo pide antes de sellar nada
       para poder usar P.midOf como identificador del mensaje tambien en el
       sobre normal que sale a la vez. */
    P.prepare = function () {
        var kp = C.keypair();
        return { sk: kp.sk, pk: kp.pk, mid: P.midOf(kp.pk) };
    };

    /* Efimeras que ya han sellado algo. Una efimera es de UN SOLO uso y esto
       lo hace cumplir: sellar dos veces con la misma no produce un marco malo,
       no produce ninguno.

       Por que importa tanto: de la efimera sale ss1, y ss1 es TODA la clave del
       sobre. Dos presentaciones con la misma efimera se cifran con la misma
       clave, y ademas comparten el identificador de mensaje (P.midOf), asi que
       la segunda se descartaria como copia de la primera. El caso agudo lo
       encontro una auditoria: si quien llama vuelve a sellar con un par cuya
       privada ya se borro (32 ceros), el clamping deja un escalar CONSTANTE que
       cualquiera puede aplicar a la clave publica del destinatario -que es
       publica-, y un tercero descifra el nombre, el texto y la clave declarada.

       El anillo es corto a proposito: entre P.prepare y el sellado pasan
       milisegundos, asi que 64 sobran para cualquier rafaga. Y no es la unica
       defensa: la comprobacion de que la publica cuadra con la privada de abajo
       hace imposible el caso de la privada borrada aunque el anillo hubiera
       dado la vuelta. */
    var gastadas = {}, gastadasOrden = [];
    function gastar(pkHex) {
        gastadas[pkHex] = 1;
        gastadasOrden.push(pkHex);
        while (gastadasOrden.length > 64) { delete gastadas[gastadasOrden.shift()]; }
    }

    /* Todo menos minar. opts:
         mySk, myPk   identidad propia (myPk es lo que se DECLARA dentro)
         recipPk      clave publica estatica del destinatario
         name, text   nombre y primer mensaje
         eph          par efimero ya creado (opcional, ver P.prepare)
         ttl, lifeSeconds

       Lanza si la efimera no sirve. Antes esta funcion hacia U.wipe(eph.sk)
       sobre el objeto de quien llama: borraba memoria ajena, y el siguiente
       sellado con ese mismo objeto producia el marco descifrable por cualquiera
       que se describe arriba. Aqui no se toca ni un byte de lo que llega: se
       trabaja sobre una copia y se borra la copia. */
    function armar(opts) {
        /* Lo que el destinatario va a rechazar, se rechaza AQUI, antes de minar.

           Sin esto, el emisor gastaba sesenta y cinco mil sha256 en fabricar un
           marco que el otro lado tiraba por un caracter, y nadie se enteraba:
           el que escribia veia "enviado", el que recibia no veia nada, y la
           marca de "ya me presente" bloqueaba el reintento veinticuatro horas.
           Fallar aqui cuesta dos comparaciones y se ve.

           opts.sinFiltrar salta este control y solo lo usan las pruebas, para
           fabricar lo que fabricaria un cliente modificado. Que exista no debilita
           nada: el filtro que protege es el de quien RECIBE, en P.open, y ese no
           se puede saltar desde el otro lado del cable. */
        var nombreP = String(opts.name || '');
        var textoP = String(opts.text || '');
        if (!opts.sinFiltrar) {
            if (MALOS_NOMBRE.test(nombreP) || SUELTO.test(nombreP)) {
                throw new Error('el nombre lleva caracteres que el otro lado no acepta');
            }
            if (MALOS_TEXTO.test(textoP) || SUELTO.test(textoP)) {
                throw new Error('el mensaje lleva caracteres que el otro lado no acepta');
            }
        }

        var eph = opts.eph || C.keypair();
        var ephHex = U.toHex(eph.pk);
        if (gastadas[ephHex]) { throw new Error('esa efimera ya sello una presentacion'); }
        /* La copia es el unico sitio donde esta privada vive dentro de esta
           funcion, y se borra abajo pase lo que pase. */
        var sk = new Uint8Array(eph.sk);
        try {
            /* Y tiene que ser la privada DE ESA publica: si no cuadra (porque se
               borro, porque llegaron cruzadas o porque quien llama la fabrico mal),
               el marco resultante se cifraria con una clave que no es la que el
               destinatario va a calcular... o con una que puede calcular cualquiera.
               Una curva mas sobre las dos que ya cuesta sellar, y el minado que
               viene detras son mil veces eso. */
            if (!U.equal(C.x25519base(sk), eph.pk)) {
                throw new Error('esa efimera no es un par valido');
            }
            gastar(ephHex);
            var nonce = C.random(C.NONCE);
            var exp = Math.floor(U.now() / 1000) + (opts.lifeSeconds || P.LIFE);

            var head = new Uint8Array(P.HEAD);
            head[0] = E.MAGIC0; head[1] = E.MAGIC_PRES;
            head[2] = V.PROTO;
            head[3] = 0;
            head[4] = opts.ttl === undefined ? E.DEFAULT_TTL : opts.ttl;
            head[5] = 1;
            head.set(U.u48(exp), 6);
            head.set(eph.pk, 12);
            head.set(nonce, 52);

            var nombre = P.nombreBytes(opts.name || V.id.suggestName(opts.myPk));
            if (!nombre.length) { nombre = P.nombreBytes(V.id.suggestName(opts.myPk)); }

            /* Un mensaje que no cabe NO se recorta: se manda la presentacion sin
               mensaje. Recortarlo dejaria al otro con media frase para siempre,
               porque el sobre normal que lleva el texto entero viaja con el mismo
               identificador y se descartaria como copia. Sin mensaje, la solicitud
               se acepta y el texto completo aparece al abrirse el sobre. */
            var texto = U.fromString(String(opts.text === undefined || opts.text === null ? '' : opts.text));
            if (texto.length > P.MENSAJE_MAX) { texto = new Uint8Array(0); }

            var plain = P.pack(opts.myPk, nombre, texto);

            var ss2 = C.x25519(opts.mySk, opts.recipPk);
            var ak = P.authKey(ss2, eph.pk);
            U.wipe(ss2);
            plain.set(P.authFor(ak, head, plain), O_SELLO);
            U.wipe(ak);

            var ss1 = C.x25519(sk, opts.recipPk);
            var k = P.boxKey(ss1, eph.pk);
            U.wipe(ss1);
            var body = C.seal(k, nonce, P.aadOf(head), plain);
            U.wipe(k);
            U.wipe(plain);

            return { head: head, body: body, mid: P.midOf(eph.pk) };
        } finally {
            /* Pase lo que pase, incluso si algo lanza a mitad, la copia de la
               privada no se queda en memoria. Es la unica de esta funcion, asi
               que aqui se acaba: la de quien llama nunca se ha tocado. */
            U.wipe(sk);
        }
    }

    /* Sellar de verdad: asincrona porque MINA, y minar son segundos. */
    P.seal = function (opts, onProgress, cb) {
        var a;
        try { a = armar(opts); }
        catch (e) { cb(e); return; }
        P.mine(a.head, a.body, onProgress, function (err, intentos) {
            if (err) { cb(err); return; }
            cb(null, U.concat([a.head, a.body]), { mid: a.mid, intentos: intentos });
        });
    };

    /* La misma, de una tacada. Bloquea el hilo cerca de un segundo, asi que no
       la llama la interfaz: existe para las pruebas y para tools/bench.js. */
    P.sealSync = function (opts) {
        var a = armar(opts);
        P.mineSync(a.head, a.body);
        return U.concat([a.head, a.body]);
    };

    /* ---------------------------------------------------------------------
       Leer la cabecera. Devuelve null si no es una presentacion utilizable, y
       eso significa ademas que NO se reenvia ni se guarda: los pasos que hay
       aqui son los que se pueden comprobar sin gastar una sola curva.
       --------------------------------------------------------------------- */
    P.parse = function (b) {
        if (!b || b.length !== P.FRAME) { return null; }
        if (b[0] !== E.MAGIC0 || b[1] !== E.MAGIC_PRES) { return null; }
        if (b[2] !== V.PROTO) { return null; }
        if (b[3] !== 0) { return null; }
        if (b[4] > E.MAX_TTL) { return null; }
        /* Sin tope de caducidad, un marco con expires enorme es inmortal en
           todas las bolsas de la malla: M.prune sacrifica primero lo que antes
           caduca, asi que lo que caduca mas tarde es lo ultimo en morir. */
        var exp = U.readU48(b, 6);
        if (exp > Math.floor(U.now() / 1000) + P.MAX_LIFE) { return null; }
        var head = b.subarray(0, P.HEAD), body = b.subarray(P.HEAD);
        if (!P.workOk(head, body)) { return null; }
        return {
            clase: 'p',
            raw: b,
            version: b[2],
            flags: 0,
            ttl: b[4],
            hops: b[5],
            expires: exp,
            eph: b.subarray(12, 44),
            work: b.subarray(44, 52),
            nonce: b.subarray(52, 64),
            headerEnd: P.HEAD,
            body: body,
            id: P.idOf(b)
        };
    };

    /* ---------------------------------------------------------------------
       Abrir
       --------------------------------------------------------------------- */

    /* Caracteres que no se dejan pasar. Tres familias, y todas por lo mismo:
       lo que se pinta tiene que ser lo que esta escrito.

         - Los que PARTEN una linea, porque componen una fila falsa en la lista
           de solicitudes (el "Ana, salto, salto, VERIFICADA" de siempre): los
           de control 00-1f, el DEL y los C1 (7f-9f, ahi vive U+0085 NEL), y los
           separadores tipograficos U+2028 y U+2029, que son saltos de linea de
           pleno derecho aunque no lo parezcan.
         - Los que dan la vuelta al texto o lo reordenan: U+202A-U+202E,
           U+2066-U+2069, U+200E, U+200F y U+061C, la marca arabe que se colaba
           por no estar en el rango de las otras.
         - Los que NO SE VEN, y por tanto dejan escribir dos nombres distintos
           que se pintan igual, o uno que parece otro con algo pegado detras:
           U+00AD, U+034F, los de ancho cero U+200B-U+200D, U+2060-U+2064 (el
           juntapalabras y los operadores invisibles), U+180B-U+180E,
           U+17B4-U+17B5, los rellenos hangul U+115F, U+1160 y U+3164, los
           selectores de variacion U+FE00-U+FE0F, U+FEFF, las anclas de
           anotacion U+FFF9-U+FFFB y los no-caracteres U+FFFE y U+FFFF.

       La lista anterior se quedaba en la primera familia y media: pasaban
       U+2028, U+2029, U+0085, U+061C, U+2060, U+180E, U+3164, U+115F y U+FFF9,
       o sea que la fila falsa que este comentario decia impedir se escribia
       igual, solo que con otro salto de linea.

       En el mensaje se permiten el salto de linea y el tabulador, que es lo que
       una persona escribe de verdad; todo lo demas es la misma lista, escrita
       UNA vez para que las dos no puedan separarse. */
    var INVISIBLES = '\\u007f-\\u009f\\u00ad\\u034f\\u061c\\u115f\\u1160' +
        '\\u17b4\\u17b5\\u180b-\\u180e\\u200b-\\u200f\\u2028-\\u202e' +
        '\\u2060-\\u2064\\u2066-\\u206f\\u3164\\ufe00-\\ufe0f\\ufeff' +
        '\\ufff9-\\ufffb\\ufffe\\uffff';
    /* El NOMBRE lleva la lista entera: es lo que se lee para decidir quien es
       alguien, y ahi un caracter invisible es una herramienta de engano.

       El MENSAJE no puede llevarla igual, y esto costo un fallo de los buenos:
       con la lista completa, escribir "te quiero" con un corazon detras
       tiraba la presentacion ENTERA en silencio. Un emoji con color es U+2764 mas el selector de
       variacion U+FE0F; una familia es varios munecos unidos por U+200D. El que
       escribia veia "enviado" y al otro no le llegaba nada, y encima no se
       volvia a presentar en 24 horas. Lo mismo con el texto pegado desde
       Windows, que trae \\r.

       Asi que en el mensaje se dejan pasar: los que componen emoji (los
       selectores de variacion y el juntador U+200D), el tabulador, el salto de
       linea y el retorno de carro. Lo que sigue fuera es lo que rompe una linea
       o cambia el sentido de la lectura: U+2028, U+2029, U+0085 y la familia
       bidi, que es lo que permitiria disfrazar el mensaje de otra cosa. */
    var INVISIBLES_TEXTO = '\\u007f-\\u009f\\u00ad\\u034f\\u061c\\u115f\\u1160' +
        '\\u17b4\\u17b5\\u180b-\\u180e\\u200b\\u200c\\u200e\\u200f\\u2028-\\u202e' +
        '\\u2060-\\u2064\\u2066-\\u206f\\u3164\\ufeff' +
        '\\ufff9-\\ufffb\\ufffe\\uffff';

    var MALOS_NOMBRE = new RegExp('[\\u0000-\\u001f' + INVISIBLES + ']');
    var MALOS_TEXTO  = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f' +
                                  INVISIBLES_TEXTO + ']');

    /* Un sustituto suelto: la mitad de un par que no tiene la otra mitad. No
       hay UTF-8 valido que lo represente -los sustitutos solo existen dentro de
       UTF-16- asi que echarlo es parte de exigir UTF-8 canonico. No se puede
       hacer con una lista de caracteres sin llevarse por delante los emojis y
       todo lo que vive fuera del plano basico, que son pares legitimos. ES5 no
       tiene mirada atras, asi que el caso del sustituto bajo se resuelve
       mirando lo que lleva DELANTE dentro del propio patron. */
    var SUELTO = new RegExp('[\\ud800-\\udbff](?![\\udc00-\\udfff])' +
                            '|(?:^|[^\\ud800-\\udbff])[\\udc00-\\udfff]');

    /* Se vuelve a codificar y se exige el mismo byte a byte. Lo que eso
       garantiza es que el UTF-8 que viaja es CANONICO: no hay formas largas
       (C0 80 en vez de 00), ni secuencias truncadas, ni sustitutos codificados
       a la CESU-8, ni nada que U.toString remiende en silencio. Para cada
       nombre hay exactamente una cadena de bytes posible, y quien mira los
       bytes ve lo mismo que quien mira la pantalla.

       Lo que NO garantiza, y el comentario anterior lo afirmaba, es que dos
       cadenas distintas no se puedan pintar igual: eso son los homoglifos y no
       hay filtro que los quite, porque una A cirilica es una letra legitima en
       ruso. Contra eso esta la huella, que es lo unico que identifica de verdad
       y por eso la solicitud la pinta al lado del nombre. */
    function leerTexto(bytes, malos) {
        var s = U.toString(bytes);
        if (!U.equal(U.fromString(s), bytes)) { return null; }
        if (SUELTO.test(s)) { return null; }
        if (malos.test(s)) { return null; }
        return s;
    }

    /* Devuelve {pk, name, text, mid} o null. Un null no distingue "no es para
       mi" de "esta corrompida", y esta bien que no lo distinga.

       Los pasos de aqui abajo son caros (dos curvas) y por eso van despues de
       todo lo barato. Quien llega hasta el sello ya cifro correctamente hacia
       nosotros; si el sello falla, algo va mal y el usuario no tiene nada que
       decidir: se tira en silencio y no se pinta nada. */
    P.open = function (env, mySk, myPk) {
        var ss1, ss2, plain, i;

        try { ss1 = C.x25519(mySk, env.eph); } catch (e) { return null; }
        var k = P.boxKey(ss1, env.eph);
        U.wipe(ss1);
        var head = env.raw.subarray(0, P.HEAD);
        plain = C.open(k, env.nonce, P.aadOf(head), env.body);
        U.wipe(k);
        if (!plain || plain.length !== P.PLAIN) { return null; }
        if (plain[O_VER] !== P.VER) { return null; }

        var nLen = plain[O_NLEN];
        var mLen = (plain[O_MLEN] << 8) | plain[O_MLEN + 1];
        if (nLen < 1 || nLen > P.NOMBRE_MAX) { return null; }
        if (mLen > P.MENSAJE_MAX) { return null; }
        /* El relleno tiene que ser todo ceros: si no, seria un canal encubierto
           que la interfaz no pinta y nadie mira. */
        for (i = O_NOMBRE + nLen; i < O_NOMBRE + P.NOMBRE_MAX; i++) {
            if (plain[i] !== 0) { return null; }
        }
        for (i = O_MENSAJE + mLen; i < O_MENSAJE + P.MENSAJE_MAX; i++) {
            if (plain[i] !== 0) { return null; }
        }

        var nombre = leerTexto(plain.subarray(O_NOMBRE, O_NOMBRE + nLen), MALOS_NOMBRE);
        if (nombre === null || !nombre.replace(/^\s+|\s+$/g, '').length) { return null; }
        var texto = leerTexto(plain.subarray(O_MENSAJE, O_MENSAJE + mLen), MALOS_TEXTO);
        if (texto === null) { return null; }

        /* Una presentacion que declara TU propia clave no es una suplantacion
           (para fabricarla haria falta tu privada), pero seria una solicitud
           imposible de aceptar -K.add rechaza la clave propia- y obliga a
           razonar sobre reflexion en todas partes. Cuesta una comparacion. */
        var pk = plain.subarray(O_PK, O_PK + 32);
        if (U.equal(pk, myPk)) { return null; }

        try { ss2 = C.x25519(mySk, pk); } catch (e) { return null; }
        var ak = P.authKey(ss2, env.eph);
        U.wipe(ss2);
        var sello = P.authFor(ak, head, plain);
        U.wipe(ak);
        if (!U.equal(sello, plain.subarray(O_SELLO, O_SELLO + 16))) { return null; }

        return { pk: U.toHex(pk), name: nombre, text: texto, mid: P.midOf(env.eph) };
    };

    /* ---------------------------------------------------------------------
       Cupo de curvas.

       La prueba de coste hace caro fabricar un marco, pero no gana un duelo de
       CPU contra alguien con sha256 nativo. Ese duelo lo gana esto: pase lo que
       pase, abrir presentaciones no puede costarle a este aparato mas de 60
       curvas por minuto (unos 376 ms, el 0,6% de un nucleo). El sub-cupo por
       enlace impide ademas que un solo cable hostil se lleve el presupuesto
       entero. Lo que se queda sin cupo no se pierde: se guarda en la bolsa sin
       probar y lo reintenta P.retry.
       --------------------------------------------------------------------- */
    var ventana = -1, gastoTotal = 0, gastoPeer = {};

    function cupo(peer) {
        var w = Math.floor(U.now() / 60000);
        if (w !== ventana) { ventana = w; gastoTotal = 0; gastoPeer = {}; }
        if (gastoTotal >= P.TRY_MIN) { return false; }
        var id = (peer && peer.id) ? peer.id : '.';
        var n = gastoPeer[id] || 0;
        if (peer && n >= P.TRY_PEER) { return false; }
        gastoTotal++;
        gastoPeer[id] = n + 1;
        return true;
    }

    /* ---------------------------------------------------------------------
       Solicitudes: el modelo que usa la interfaz.
       --------------------------------------------------------------------- */

    /* Descartadas en esta sesion. SOLO en memoria y a proposito: una lista de
       a quien has rechazado, guardada en el aparato, dice mas de ti que muchos
       mensajes, y no compra nada porque quien insiste se fabrica una identidad
       nueva en un segundo. Esto no es una lista negra: es no repintar lo que el
       usuario acaba de quitar de la pantalla, que hace falta de todos modos
       porque la malla repite el mismo marco muchas veces. */
    var descartadas = {}, bovedaVista = null;

    /* ... y se va con la sesion, de verdad: al cerrar la boveda, V.vault.state
       pasa a null y al abrirla es otro objeto. Comprobarlo aqui evita que esta
       memoria sobreviva a un cierre, y evita tambien que dos bovedas distintas
       abiertas en la misma pestana compartan lo que la otra descarto. */
    function sesion() {
        if (V.vault.state !== bovedaVista) {
            bovedaVista = V.vault.state;
            descartadas = {};
        }
    }

    /* Una boveda creada antes de que esto existiera no tiene el campo. Se crea
       al vuelo, igual que hace M.init con st.carrier. */
    function lista() {
        var st = V.vault.state;
        sesion();
        if (!st) { return []; }
        if (!st.requests) { st.requests = []; }
        return st.requests;
    }

    function aviso(pkHex, que) {
        /* Por el mismo camino que los mensajes: 50-app.js reemite lo que sale
           de V.chat y la interfaz ya escucha ahi. Un segundo canal seria un
           segundo sitio que enganchar, y engancharlo dos veces es un fallo que
           este proyecto ya ha pagado una vez. */
        try { V.chat.emit('request', { pk: pkHex, what: que }); } catch (e) {}
    }

    R.ignoradas = 0;    /* veces que una presentacion no cupo, en esta sesion */

    R.all = function () {
        var l = lista().slice(0);
        l.sort(function (a, b) { return b.at - a.at; });
        return l;
    };
    R.count = function () { return lista().length; };

    /* Hay sitio para una solicitud MAS. Lo miran la entrega y el reintento, y
       tambien la interfaz, que con esto puede decir "la lista esta llena" en vez
       de dejar al usuario preguntandose por que no llega nada. */
    R.hueco = function () { return lista().length < P.SOL_MAX; };

    /* Presentaciones que se abrieron, no cupieron y siguen en la MOCHILA
       esperando sitio. Se cuentan sobre la mochila y no con un contador aparte:
       un contador se desincroniza en cuanto una caduca y la poda se la lleva, y
       entonces la pantalla diria que hay algo esperando que ya no existe. */
    R.esperando = function () {
        var b = (V.vault.state && V.vault.state.carrier) || [], n = 0, i;
        for (i = 0; i < b.length; i++) {
            if (b[i].k === 'p' && b[i].w && !b[i].p) { n++; }
        }
        return n;
    };
    R.get = function (pkHex) {
        var l = lista();
        for (var i = 0; i < l.length; i++) { if (l[i].pk === pkHex) { return l[i]; } }
        return null;
    };

    R.prune = function () {
        var l = lista(), corte = U.now() - P.SOL_LIFE, n = 0;
        for (var i = l.length - 1; i >= 0; i--) {
            if (l[i].at < corte) { l.splice(i, 1); n++; }
        }
        if (n) { V.vault.save(); aviso(null, 'prune'); }
        return n;
    };

    /* Devuelve true si la solicitud queda anotada (o actualizada), y false si
       no cabe. Ese false es lo que impide que se de por consumida: quien llama
       la deja en la mochila para volver a intentarlo. */
    function anotar(a) {
        var l = lista(), i;
        R.prune();
        /* Una segunda presentacion del mismo emisor actualiza la fila que hay:
           nadie puede llenar la pantalla repitiendose. Esto es tambien lo que
           hace que el tope se mida por CLAVE DISTINTA y no por marco recibido,
           que es la decision correcta y conviene dejarla escrita: contar marcos
           dejaria que una sola identidad, repitiendose, agotara el cupo de toda
           la lista; contando claves, llenar la lista cuesta veinte identidades
           con su prueba de coste cada una, y ademas es lo unico que se
           corresponde con lo que el usuario ve, que son personas, no marcos. */
        for (i = 0; i < l.length; i++) {
            if (l[i].pk === a.pk) {
                l[i].name = a.name.substr(0, 40);
                /* Una presentacion SIN texto no borra el que ya habia: puede ser
                   el reintento que manda 36-chat.js cuando la suya se perdio
                   antes de salir, y ese va vacio porque el texto viaja aparte.
                   Sin esta condicion, un reintento dejaria la solicitud muda y
                   el usuario tendria que decidir sin haber leido nada. */
                /* El texto y su identificador son PAREJA: guardar uno sin el
                   otro duplicaba el mensaje al aceptar, porque el identificador
                   guardado ya no era el del texto guardado y la copia que venia
                   por el sobre normal no se reconocia como repetida. */
                if (a.text.length || !l[i].text) {
                    l[i].text = a.text.substr(0, 1000);
                    l[i].mid = a.mid;
                }
                l[i].at = U.now();
                V.vault.save();
                aviso(a.pk, 'update');
                return true;
            }
        }
        /* Lleno: NO entra la nueva, pero tampoco se tira. Echar a las viejas
           seria peor -veinte presentaciones minadas desalojarian justo la
           solicitud que si estabas esperando- y darla por atendida era peor
           todavia: como la malla la marcaba nuestra, no entraba en la mochila y
           el emisor no reintenta nunca, asi que la solicitud legitima se perdia
           para siempre y con la lista llena de basura no podia entrar ninguna
           hasta que el usuario las descartara a mano. Devolver false la deja
           viajando en la mochila, transportable y reprocesable, y R.esperando
           permite decir en pantalla que hay alguien esperando sitio. */
        if (l.length >= P.SOL_MAX) {
            R.ignoradas++;
            aviso(a.pk, 'full');
            return false;
        }
        l.push({
            pk: a.pk,
            name: a.name.substr(0, 40),
            text: a.text.substr(0, 1000),
            at: U.now(),
            mid: a.mid
        });
        V.vault.save();
        aviso(a.pk, 'new');
        return true;
    }

    /* Aceptar: se crea el contacto, entra el primer mensaje en su conversacion
       y desaparece la solicitud.

       No se manda NADA de vuelta. Un acuse automatico diria el momento exacto
       en que aceptaste sin que hayas escrito una palabra; la primera respuesta
       la escribe el usuario, y el otro lado puede abrirla porque para poder
       presentarse ya tenia nuestra clave publica. */
    R.accept = function (pkHex) {
        var l = lista(), i, s = null;
        for (i = 0; i < l.length; i++) { if (l[i].pk === pkHex) { s = l[i]; break; } }
        if (!s) { return null; }

        var res = K.add(s.pk, s.name);
        if (res.error) { return null; }
        var c = res.contact;
        /* Quien manda una presentacion tiene por fuerza nuestra clave publica:
           sin ella no habria podido calcular ss1. Eso ES reciprocidad, y sin
           esta linea la conversacion avisaria de que el otro no puede leernos,
           que aqui es falso. La huella sigue SIN comprobar: el sello dice que
           quien escribe tiene esa privada, no de quien es la clave. */
        c.mutuo = true;
        c.lastSeen = U.now();

        /* K.add ya ha llamado a M.rescanBag, asi que un sobre suyo que
           estuviera en la bolsa puede haber entrado ya con este mismo
           identificador: addIncoming no lo duplica. */
        if (s.text && s.text.length) { V.chat.addIncoming(c.pk, s.mid, s.text, s.at); }

        l.splice(i, 1);
        V.vault.save();
        aviso(pkHex, 'accept');
        return c;
    };

    /* Descartar: no queda nada suyo en la boveda, no se anade contacto y NO se
       avisa al otro lado. Un "te he rechazado" confirmaria que esa clave esta
       viva y que hay alguien leyendo. */
    R.discard = function (pkHex) {
        var l = lista(), i;
        for (i = 0; i < l.length; i++) {
            if (l[i].pk === pkHex) {
                l.splice(i, 1);
                descartadas[pkHex] = 1;
                V.vault.save();
                aviso(pkHex, 'discard');
                return true;
            }
        }
        return false;
    };

    /* Los dos disenos que hay sobre la mesa llamaron distinto a lo mismo. Una
       sola implementacion, y estos tres nombres para que ni la interfaz ni las
       herramientas dependan de cual de los dos leyeron. */
    P.list = R.all;
    P.get = R.get;
    P.accept = R.accept;
    P.dismiss = R.discard;
    P.prune = R.prune;

    /* ---------------------------------------------------------------------
       Entrega
       --------------------------------------------------------------------- */
    /* true si la presentacion queda ATENDIDA (mensaje entregado, solicitud
       anotada o descartada de antes) y false si no cabe y hay que dejarla
       esperando en la mochila. */
    function entregar(a) {
        /* El contacto se mira ANTES que la lista de descartados: si a quien
           descartaste lo anades luego por un codigo, lo que llegue es un
           mensaje suyo y perderlo seria perder un mensaje de verdad. */
        var contacto = K.get(a.pk);
        if (contacto) {
            /* De alguien que YA es contacto no se hace una solicitud: se
               entrega el mensaje. Es literalmente lo que ha pasado -esa persona
               demostro tener la privada y nos escribio- y tirarlo perderia un
               mensaje de verdad. No se toca su nombre (el usuario pudo
               renombrarlo) ni su verificacion. */
            contacto.mutuo = true;
            contacto.lastSeen = U.now();
            if (a.text.length) {
                V.chat.onIncoming({
                    contact: contacto,
                    type: V.session.T_TEXT,
                    ts: U.now(),
                    mid: a.mid,
                    body: U.fromString(a.text)
                });
            } else {
                V.vault.save();
            }
            return true;
        }
        sesion();
        if (descartadas[a.pk]) { return true; }
        return anotar(a);
    }

    /* Lo que la malla necesita saber:
         'mia'       se abrio y quedo atendida. No se guarda, si se reenvia
         'ajena'     no abre: se guarda y se reenvia, como cualquier sobre ajeno
         'diferida'  sin cupo de curva: se guarda SIN probar, y se reenvia
         'llena'     se abrio, pero la lista de solicitudes esta llena: se
                     guarda MARCADA como esperando sitio, y se reenvia */
    /* El buzon: si esta cerrado, para escribirte hay que estar en tu lista.

       Va CERRADO de serie (31-vault.js). Cerrado, una presentacion es para
       nosotros exactamente lo mismo que un sobre de un desconocido: se sigue
       transportando -para que le llegue a quien si lo quiera- pero no se abre,
       no se paga su curva y no gasta cupo. Por eso la comprobacion esta la
       PRIMERA de todas: con el buzon cerrado, una inundacion de presentaciones
       cuesta lo mismo que una inundacion de sobres, que es casi nada. */
    P.buzonAbierto = function () {
        var s = V.vault.state && V.vault.state.settings;
        return !!(s && s.openInbox === true);
    };

    P.receive = function (env, peer) {
        var me = K.me();
        if (!me || !V.vault.state) { return 'ajena'; }
        /* 'cerrada' y no 'ajena': son cosas distintas y confundirlas costaba
           el mensaje. 'ajena' significa que se intento abrir y no era para
           nosotros, asi que la malla la daba por atendida y no se volvia a
           mirar JAMAS. Pero con el buzon cerrado no se ha intentado nada: ese
           marco puede ser perfectamente nuestro, esta entero en nuestra propia
           mochila, y el dia que el usuario abra el buzon tiene que abrirse. */
        if (!P.buzonAbierto()) { return 'cerrada'; }
        if (!cupo(peer)) { return 'diferida'; }
        var abierta = P.open(env, me.sk, me.pk);
        if (!abierta) { return 'ajena'; }
        return entregar(abierta) ? 'mia' : 'llena';
    };

    /* Las que se quedaron sin cupo esperan en la mochila con la marca p sin
       poner. Esto las reintenta, y lo llama el reloj de un minuto de
       50-app.js. En regimen normal no hay ninguna y no cuesta nada.

       Las que se quedaron sin SITIO llevan ademas la marca w. Esas no se vuelven
       a abrir mientras la lista siga llena: ya sabemos lo que son -una solicitud
       nueva- y pagar su curva cada minuto para volver a no poder anotarla seria
       regalar el cupo entero a quien haya llenado la lista. En cuanto el usuario
       acepta o descarta una, la vuelta siguiente del reloj las recupera. */
    P.retry = function () {
        /* Con el buzon cerrado no se paga ni una curva: las que haya guardadas se
           quedan esperando a que se abra. Sin esto, el reloj de un minuto las
           reintentaba igual. */
        if (!P.buzonAbierto()) { return 0; }
        var b = (V.vault.state && V.vault.state.carrier) || [], i, reg, env, res, n = 0;
        var hueco = R.hueco(), toco = false;
        for (i = 0; i < b.length; i++) {
            /* Se guarda la FICHA, no el indice.

               Abrir una presentacion acaba llamando a M.send (el acuse del
               sobre que venia con ella), y M.send poda la mochila: un splice
               dentro de este bucle corre todo lo que hay detras. Marcando por
               indice se marcaba la ficha SIGUIENTE -que no se habia abierto- y
               el i++ se la saltaba: ese mensaje no llegaba nunca, y el que si
               se abrio se quedaba sin marca y volvia a pagar su curva cada
               minuto para siempre. Basta con una pieza caducada por delante. */
            reg = b[i];
            if (reg.k !== 'p' || reg.p) { continue; }
            if (reg.w && !hueco) { continue; }
            env = P.parse(U.fromB64(reg.d));
            if (!env) { reg.p = 1; toco = true; continue; }
            res = P.receive(env, null);
            if (res === 'diferida') { break; }   /* se acabo el minuto */
            if (res === 'llena') {
                /* Sigue en la mochila y sin dar por atendida: no se pierde. La
                   marca se guarda aunque no se haya atendido ninguna, que si no
                   una recarga volveria a pagar su curva para nada. */
                if (!reg.w) { reg.w = 1; toco = true; }
                hueco = false;
                continue;
            }
            if (reg.w) { delete reg.w; }
            reg.p = 1;
            toco = true;
            n++;
        }
        if (toco) { V.vault.save(); }
        return n;
    };
})(BINTIO);
