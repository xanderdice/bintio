/* ==========================================================================
   Grupos.

   Sin servidores no hay "sala": un grupo es una LISTA que cada aparato guarda
   en su boveda, y mandar al grupo es sellar un sobre para cada miembro. No hay
   clave de grupo ni nadie que reparta: si hay cinco miembros salen cuatro
   sobres, cada uno cifrado punta a punta con su destinatario. Cuesta ancho de
   banda y a cambio no hay ni un solo secreto compartido que romper, ni un
   miembro que al salirse siga pudiendo leer, ni un servidor que sepa quien
   habla con quien.

   LA FICHA VIAJA CON CADA MENSAJE

   El cuerpo de un mensaje de grupo lleva la lista entera de miembros. Podria
   mandarse una vez y no repetirla, pero entonces quien se perdiera esa unica
   copia -la mochila la echo, caduco, estaba sin conexion- se quedaria con
   mensajes de un grupo que no sabe ni como se llama, y sin servidor no hay a
   quien preguntarle. Repitiendola, el grupo se arregla solo con el siguiente
   mensaje que llegue. Son unos 80 bytes por miembro; con el cupo de 32 son 2,5
   KB en el peor caso, sobre una mochila de 900 KB.

   QUIEN MANDA

   Nadie. No hay administrador. Cada uno guarda su lista y la ficha que llega
   con un numero de revision mas alto pisa a la que hay: quien cambia el grupo
   sube el numero, y el cambio se propaga con el trafico normal. Dos cambios a
   la vez pueden pelearse; para lo que es esto -un grupo de gente que se
   conoce- es el precio justo por no tener un servidor que arbitre.

   NO SE ANADE A NADIE SOLO

   La ficha trae claves publicas de gente que a lo mejor no tienes dada de
   alta. NO se dan de alta solas: dar de alta a alguien es una decision, y este
   proyecto entero se sostiene sobre que esa decision es tuya. A quien no
   tengas no le puedes escribir, la conversacion lo dice con todas las letras,
   y sus acuses no llegaran nunca; por eso un mensaje de grupo solo se pone
   "leido" cuando lo han leido TODOS, y mientras tanto ensena por cuantos va.
   ========================================================================== */
(function (V) {
    'use strict';
    var C = V.crypto, U = V.util, K = V.contacts, G = V.groups;

    /* Cada miembro de mas es un sobre de mas por mensaje. Treinta y dos es
       mucho mas de lo que cabe en una conversacion que se pueda seguir, y deja
       la ficha en 2,5 KB, que es el 0,3% de la mochila. */
    G.MAX = 32;

    function todos() {
        if (!V.vault.state.groups) { V.vault.state.groups = {}; }
        return V.vault.state.groups;
    }

    /* La conversacion de un grupo vive en el MISMO sitio que las demas, con la
       clave prefijada. Asi la lista, los no leidos, el borrado y el limite de
       mensajes por conversacion son exactamente el mismo codigo. */
    G.key = function (id) { return 'g:' + id; };
    G.isKey = function (k) { return String(k).substr(0, 2) === 'g:'; };
    G.idOf = function (k) { return String(k).substr(2); };

    G.get = function (id) { return todos()[id] || null; };

    G.all = function () {
        var m = todos(), out = [], id;
        for (id in m) {
            if (Object.prototype.hasOwnProperty.call(m, id)) { out.push(m[id]); }
        }
        return out;
    };

    G.mePk = function () {
        var me = K.me();
        return me ? U.toHex(me.pk) : null;
    };

    /* Los demas: la lista menos yo. Es a quien hay que mandarle cada cosa y
       sobre quien se cuentan los acuses. */
    G.others = function (group) {
        var yo = G.mePk(), out = [], i;
        for (i = 0; i < group.members.length; i++) {
            if (group.members[i].pk !== yo) { out.push(group.members[i]); }
        }
        return out;
    };

    /* De los otros, a cuales podemos escribirles de verdad. Tener a alguien en
       la lista del grupo no es tenerlo dado de alta. */
    G.reachable = function (group) {
        var otros = G.others(group), out = [], i, c;
        for (i = 0; i < otros.length; i++) {
            c = K.get(otros[i].pk);
            if (c) { out.push(c); }
        }
        return out;
    };

    /* Los que estan en la lista y NO tenemos: lo que la conversacion tiene que
       decir en voz alta en vez de tragarselo. */
    G.missing = function (group) {
        var otros = G.others(group), out = [], i;
        for (i = 0; i < otros.length; i++) {
            if (!K.get(otros[i].pk)) { out.push(otros[i]); }
        }
        return out;
    };

    function nombreDe(pkHex) {
        var yo = G.mePk();
        if (pkHex === yo) {
            var mio = V.vault.state && V.vault.state.identity;
            return (mio && mio.name) || 'Yo';
        }
        var c = K.get(pkHex);
        return c ? c.name : V.id.suggestName(U.fromHex(pkHex));
    }

    /* ---------------------------------------------------------------------
       Alta
       --------------------------------------------------------------------- */

    /* El identificador sale de ocho bytes al azar y no del nombre ni de los
       miembros: dos grupos con la misma gente son dos grupos, y cambiar el
       nombre no puede partir la conversacion en dos. */
    G.create = function (name, pks) {
        var yo = G.mePk();
        if (!yo) { return { error: 'No hay identidad abierta' }; }
        name = String(name || '').replace(/^\s+|\s+$/g, '');
        if (!name) { return { error: 'El grupo necesita un nombre' }; }

        var vistos = {}, members = [{ pk: yo, name: nombreDe(yo) }], i, pk;
        vistos[yo] = 1;
        for (i = 0; i < pks.length; i++) {
            pk = pks[i];
            if (vistos[pk]) { continue; }
            if (!K.get(pk)) { continue; }        /* solo gente que tenemos */
            vistos[pk] = 1;
            members.push({ pk: pk, name: nombreDe(pk) });
        }
        if (members.length < 2) { return { error: 'Elige al menos a una persona' }; }
        if (members.length > G.MAX) { return { error: 'Un grupo admite ' + G.MAX + ' personas como mucho' }; }

        var group = {
            id: U.toHex(C.random(8)),
            name: name.substr(0, 40),
            members: members,
            rev: 1,
            created: U.now()
        };
        todos()[group.id] = group;
        V.vault.save();
        return { group: group };
    };

    /* ---------------------------------------------------------------------
       La ficha que viaja en cada mensaje
       --------------------------------------------------------------------- */
    G.card = function (group) {
        var m = [], i;
        for (i = 0; i < group.members.length; i++) {
            m.push([group.members[i].pk, group.members[i].name]);
        }
        return { g: group.id, n: group.name, r: group.rev || 1, m: m };
    };

    /* Una ficha que llega de fuera. Devuelve el grupo, nuevo o actualizado, o
       null si la ficha no vale.

       Se exige que el que la manda y nosotros estemos DENTRO: sin lo primero
       cualquiera podria colarnos un grupo inventado a nombre de otro, y sin lo
       segundo nos meterian en conversaciones ajenas. Con las dos, lo peor que
       puede hacer alguien que ya tienes dado de alta es abrirte un grupo con
       gente que conoce, que es exactamente lo que un grupo es. */
    G.fromCard = function (card, fromPkHex) {
        if (!card || !card.g || !card.m || !card.m.length) { return null; }
        var yo = G.mePk();
        if (!yo) { return null; }

        var members = [], vistos = {}, i, fila, pk, dentroYo = false, dentroEl = false;
        for (i = 0; i < card.m.length && members.length <= G.MAX; i++) {
            fila = card.m[i];
            pk = fila && fila[0];
            if (typeof pk !== 'string' || !/^[0-9a-f]{64}$/.test(pk) || vistos[pk]) { continue; }
            vistos[pk] = 1;
            if (pk === yo) { dentroYo = true; }
            if (pk === fromPkHex) { dentroEl = true; }
            members.push({ pk: pk, name: String(fila[1] || '').substr(0, 40) || nombreDe(pk) });
        }
        if (!dentroYo || !dentroEl || members.length < 2) { return null; }

        var rev = card.r > 0 ? card.r : 1;
        var group = G.get(card.g);
        if (group) {
            /* Una ficha vieja no pisa a una nueva: si no, el ultimo mensaje que
               llegara -que puede ser de hace dos dias, la malla no ordena-
               resucitaria a quien acaba de salirse del grupo. */
            if (rev < (group.rev || 1)) { return group; }
            group.name = String(card.n || group.name).substr(0, 40);
            group.members = members;
            group.rev = rev;
        } else {
            group = {
                id: card.g,
                name: String(card.n || 'Grupo').substr(0, 40),
                members: members,
                rev: rev,
                created: U.now()
            };
            todos()[group.id] = group;
        }
        V.vault.save();
        return group;
    };

    /* ---------------------------------------------------------------------
       Cambios
       --------------------------------------------------------------------- */
    G.rename = function (id, name) {
        var g = G.get(id);
        name = String(name || '').replace(/^\s+|\s+$/g, '');
        if (!g || !name) { return false; }
        g.name = name.substr(0, 40);
        g.rev = (g.rev || 1) + 1;
        V.vault.save();
        return true;
    };

    G.setMembers = function (id, pks) {
        var g = G.get(id), yo = G.mePk();
        if (!g) { return false; }
        var vistos = {}, members = [{ pk: yo, name: nombreDe(yo) }], i;
        vistos[yo] = 1;
        for (i = 0; i < pks.length; i++) {
            if (vistos[pks[i]] || !K.get(pks[i])) { continue; }
            vistos[pks[i]] = 1;
            members.push({ pk: pks[i], name: nombreDe(pks[i]) });
        }
        if (members.length < 2 || members.length > G.MAX) { return false; }
        g.members = members;
        g.rev = (g.rev || 1) + 1;
        V.vault.save();
        return true;
    };

    /* Salirse es un acto local: se borra de aqui y ya esta. Los demas seguiran
       mandandote sobres que no vas a abrir hasta que alguno rehaga la lista.
       Avisar de la salida es cosa de quien se va, con un mensaje; inventarse
       un "fulano se ha ido" que nadie puede comprobar seria peor. */
    G.remove = function (id) {
        delete todos()[id];
        if (V.vault.state.chats[G.key(id)]) { delete V.vault.state.chats[G.key(id)]; }
        V.vault.save();
    };
})(BINTIO);
