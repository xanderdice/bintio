/* ==========================================================================
   Contactos.

   La lista vive dentro de la boveda cifrada. Aqui solo hay lectura, alta,
   baja y una cache en memoria de los dos secretos que se usan en cada
   mensaje (el del par y el de la etiqueta), porque recalcularlos por sobre
   recibido seria absurdo.
   ========================================================================== */
(function (V) {
    'use strict';
    var C = V.crypto, U = V.util, K = V.contacts;

    var me = null;          /* identidad propia, la pone app.js al abrir */
    var cache = {};         /* pkHex -> {pair, tagKey} */

    K.bind = function (identity) {
        me = identity;
        cache = {};
    };

    K.all = function () {
        return (V.vault.state && V.vault.state.contacts) || [];
    };

    K.get = function (pkHex) {
        var list = K.all();
        for (var i = 0; i < list.length; i++) {
            if (list[i].pk === pkHex) { return list[i]; }
        }
        return null;
    };

    /* Secretos derivados, calculados una vez por contacto y sesion. */
    K.secrets = function (contact) {
        var c = cache[contact.pk];
        if (c) { return c; }
        var pair = C.x25519(me.sk, U.fromHex(contact.pk));
        c = { pair: pair, tagKey: V.envelope.tagKey(pair) };
        cache[contact.pk] = c;
        return c;
    };

    K.add = function (pkHex, name) {
        if (pkHex === U.toHex(me.pk)) { return { error: 'Esa es tu propia clave' }; }
        var existing = K.get(pkHex);
        if (existing) { return { contact: existing, existed: true }; }
        var pk = U.fromHex(pkHex);
        if (pk.length !== 32) { return { error: 'Clave publica invalida' }; }
        var contact = {
            pk: pkHex,
            name: name || V.id.suggestName(pk),
            address: V.id.address(pk),
            fingerprint: V.id.fingerprint(pk),
            verified: false,
            added: U.now(),
            lastSeen: 0,
            ratchet: { mine: [], theirs: null }
        };
        K.all().push(contact);
        V.vault.save();

        /* Puede que esta persona nos haya escrito ANTES de que la anadieramos:
           esos sobres estan en la bolsa sin poder abrirse, porque para abrir
           uno hay que tener a quien lo manda. Ahora que la tenemos, se miran
           otra vez y aparecen los mensajes que ya nos habia mandado. */
        try { if (V.mesh && V.mesh.rescanBag) { V.mesh.rescanBag(); } } catch (e) {}

        return { contact: contact, existed: false };
    };

    K.remove = function (pkHex) {
        var list = K.all();
        for (var i = 0; i < list.length; i++) {
            if (list[i].pk === pkHex) { list.splice(i, 1); break; }
        }
        delete cache[pkHex];
        if (V.vault.state.chats[pkHex]) { delete V.vault.state.chats[pkHex]; }
        V.vault.save();
    };

    K.rename = function (pkHex, name) {
        var c = K.get(pkHex);
        if (c) { c.name = name; V.vault.save(); }
    };

    K.setVerified = function (pkHex, yes) {
        var c = K.get(pkHex);
        if (c) { c.verified = !!yes; V.vault.save(); }
    };

    /* Hay vinculo: ha llegado algo suyo y se ha podido abrir. Eso demuestra
       que esta persona nos tiene dados de alta, porque si no no habria sabido
       a quien sellar.

       Vive aqui y no en las tres lineas que lo ponian por su cuenta -la
       sesion y las dos de la presentacion- porque desde que existe el aviso de
       desvinculacion hay algo mas que hacer: borrar la marca de "me quito".
       Con tres sitios poniendolo, el primero que se olvidara dejaria a alguien
       marcado como desvinculado para siempre aunque volviera a escribir. */
    K.enlazado = function (contact) {
        contact.mutuo = true;
        if (contact.unlinked) { delete contact.unlinked; }
    };

    /* Nos ha quitado. No se le borra a el -eso lo decide el usuario-, se
       apunta el hecho: la conversacion y la lista lo ensenan, y lo que se
       escriba a partir de ahora ya no se va a poder abrir al otro lado. */
    K.desenlazado = function (contact) {
        contact.mutuo = false;
        contact.unlinked = U.now();
    };

    K.touch = function (pkHex) {
        var c = K.get(pkHex);
        if (c) { c.lastSeen = U.now(); }
    };

    K.me = function () { return me; };
})(BINTIO);
