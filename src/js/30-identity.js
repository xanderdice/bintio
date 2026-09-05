/* ==========================================================================
   Identidad.

   Una identidad BINTIO es UNA semilla de 32 bytes. De ella sale todo lo
   demas de forma determinista, asi que el usuario solo necesita guardar
   la Llave de Recuperacion (esa misma semilla en base32) para volver a
   ser el mismo en otro dispositivo.

   No hay servidor de registro, no hay nombre de usuario reservado, no hay
   telefono ni correo. Tu identidad es una clave publica y nada mas.
   ========================================================================== */
(function (V) {
    'use strict';
    var C = V.crypto, U = V.util, ID = V.id;

    /* Semilla -> par de claves estatico X25519.
       Se pasa por HKDF para que la semilla escrita en papel y la clave
       privada real no sean el mismo numero. */
    ID.fromSeed = function (seed) {
        var material = C.hkdf(seed, U.fromString('bintio/identity/v1'), 'x25519-static', 32);
        var kp = C.keypairFromSeed(material);
        U.wipe(material);
        return {
            seed: seed,
            sk: kp.sk,
            pk: kp.pk,
            fingerprint: ID.fingerprint(kp.pk),
            address: ID.address(kp.pk)
        };
    };

    ID.create = function () { return ID.fromSeed(C.random(32)); };

    /* Huella para comparar en persona o por telefono. 20 caracteres base32
       en cinco grupos: suficiente para descartar suplantacion y corto para
       leerlo en voz alta. */
    ID.fingerprint = function (pk) {
        var h = C.sha256(U.fromString('bintio/fingerprint/v1'), pk);
        return U.group(U.toB32(h.subarray(0, 13)).substr(0, 20), 4, ' ');
    };

    /* Direccion corta: lo que se ve en la lista de contactos. */
    ID.address = function (pk) {
        var h = C.sha256(U.fromString('bintio/address/v1'), pk);
        return U.toB32(h.subarray(0, 5)).substr(0, 8);
    };

    /* ---------------------------------------------------------------------
       Llave de Recuperacion: semilla + 2 bytes de comprobacion, en base32
       Crockford, agrupada de cuatro en cuatro. 56 caracteres.
       Sirve para dos cosas: mover la identidad a otro aparato y recuperar
       una copia de seguridad. Quien la tenga, ES tu. Nadie mas la conoce:
       no sale nunca del dispositivo salvo que el usuario la copie.
       --------------------------------------------------------------------- */
    ID.toRecoveryKey = function (seed) {
        var check = C.sha256(U.fromString('bintio/recovery/v1'), seed).subarray(0, 2);
        return U.group(U.toB32(U.concat([seed, check])), 4, '-');
    };

    ID.fromRecoveryKey = function (text) {
        var raw = U.fromB32(text);
        if (raw.length < 34) { return null; }
        var seed = raw.subarray(0, 32);
        var check = C.sha256(U.fromString('bintio/recovery/v1'), seed).subarray(0, 2);
        if (!U.equal(check, raw.subarray(32, 34))) { return null; }
        return ID.fromSeed(new Uint8Array(seed));
    };

    /* Nombre visible por defecto, para no obligar a inventarse uno.
       Deliberadamente impersonal: no filtra nada del usuario. */
    var ADJ = ['Azul', 'Lento', 'Claro', 'Hondo', 'Seco', 'Vivo', 'Frio', 'Tenue', 'Nuevo', 'Alto',
               'Puro', 'Libre', 'Firme', 'Suave', 'Raro', 'Sabio'];
    var NOU = ['Cuervo', 'Faro', 'Nodo', 'Pulso', 'Eco', 'Rastro', 'Cauce', 'Vuelo', 'Puerto', 'Duna',
               'Cima', 'Vado', 'Nube', 'Roble', 'Cardo', 'Lince'];
    ID.suggestName = function (pk) {
        var h = C.sha256(U.fromString('bintio/name/v1'), pk);
        return ADJ[h[0] % ADJ.length] + ' ' + NOU[h[1] % NOU.length];
    };
})(BINTIO);
