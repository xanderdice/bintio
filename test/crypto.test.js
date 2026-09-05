/* Vectores oficiales. Si algo aqui falla, no se publica nada.
   Ejecutar con:  npm test                                                   */
var ayuda = require('./ayuda');
var eq = ayuda.eq;
var V = ayuda.cargar('nucleo');
var U = V.util, C = V.crypto;

console.log('SHA-256 (FIPS 180-4)');
eq('cadena vacia', U.toHex(C.sha256(U.fromString(''))),
   'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
eq('abc', U.toHex(C.sha256(U.fromString('abc'))),
   'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
eq('448 bits', U.toHex(C.sha256(U.fromString('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))),
   '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
eq('un millon de letras a', U.toHex(C.sha256(U.fromString(new Array(1000001).join('a')))),
   'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');

console.log('HMAC-SHA256 (RFC 4231)');
eq('caso 1', U.toHex(C.hmac(U.fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'), U.fromString('Hi There'))),
   'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
eq('caso 2', U.toHex(C.hmac(U.fromString('Jefe'), U.fromString('what do ya want for nothing?'))),
   '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
eq('clave mas larga que el bloque', U.toHex(C.hmac(U.fromHex(new Array(132).join('aa')),
     U.fromString('Test Using Larger Than Block-Size Key - Hash Key First'))),
   '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54');

console.log('HKDF (RFC 5869, caso 1)');
eq('42 bytes de salida', U.toHex(C.hkdf(U.fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'),
     U.fromHex('000102030405060708090a0b0c'), U.fromHex('f0f1f2f3f4f5f6f7f8f9'), 42)),
   '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865');

console.log('PBKDF2-HMAC-SHA256');
eq('1 iteracion', U.toHex(C.pbkdf2('password', U.fromString('salt'), 1, 32)),
   '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
eq('4096 iteraciones', U.toHex(C.pbkdf2('password', U.fromString('salt'), 4096, 32)),
   'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a');

console.log('ChaCha20 (RFC 8439)');
var key = U.fromHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
var pt = U.fromString('Ladies and Gentlemen of the class of 99: If I could offer you only one tip for the future, sunscreen would be it.');
eq('bloque 2.3.2', U.toHex(C.chachaBlock(key, U.fromHex('000000090000004a00000000'), 1)).slice(0, 64),
   '10f1e7e4d13b5915500fdd1fa32071c4c7d1f4c733c068030422aa9ac3d46c4e');
var nonce = U.fromHex('000000000000004a00000000');
eq('ida y vuelta', U.toString(C.chacha20(key, nonce, C.chacha20(key, nonce, pt, 1), 1)), U.toString(pt));

console.log('X25519 (RFC 7748, secciones 5.2 y 6.1)');
var aliceSk = U.fromHex('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a');
var alicePk = U.fromHex('8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a');
var bobSk = U.fromHex('5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb');
var bobPk = U.fromHex('de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f');
eq('clave publica de alice', U.toHex(C.x25519base(aliceSk)), U.toHex(alicePk));
eq('clave publica de bob', U.toHex(C.x25519base(bobSk)), U.toHex(bobPk));
eq('secreto compartido', U.toHex(C.x25519(aliceSk, bobPk)),
   '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742');
eq('el mismo secreto al reves', U.toHex(C.x25519(bobSk, alicePk)),
   '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742');

console.log('Caja autenticada');
var k = C.random(32), n = C.random(12), aad = U.fromString('cabecera');
var sealed = C.seal(k, n, aad, U.fromString('hola mundo'));
eq('abre lo que cerro', U.toString(C.open(k, n, aad, sealed)), 'hola mundo');
sealed[3] ^= 1;
eq('rechaza texto alterado', C.open(k, n, aad, sealed), null);
sealed[3] ^= 1;
eq('rechaza cabecera alterada', C.open(k, n, U.fromString('otra'), sealed), null);
eq('rechaza clave falsa', C.open(C.random(32), n, aad, sealed), null);

console.log('Codificaciones');
var r = C.random(37);
eq('base32 ida y vuelta', U.toHex(U.fromB32(U.toB32(r))).slice(0, r.length * 2), U.toHex(r));
eq('base64url ida y vuelta', U.toHex(U.fromB64(U.toB64(r))), U.toHex(r));
eq('utf8 con acentos y emoji', U.toString(U.fromString('anos, nandu, japones, saludo')), 'anos, nandu, japones, saludo');
eq('utf8 multibyte', U.toString(U.fromString('ñ 日本語 👋')), 'ñ 日本語 👋');

/* La derivacion rapida (WebCrypto) y la lenta (JavaScript propio) tienen que
   dar exactamente la misma clave: si divergieran, una boveda creada en un
   navegador no se abriria en otro. */
console.log('Los dos caminos de PBKDF2 dan la misma clave');
var salt = U.fromString('sal de prueba');
C.pbkdf2Async('frase larga de prueba', salt, 12000, 32, null, function (rapida) {
    C.pbkdf2Slow('frase larga de prueba', salt, 12000, 32, null, function (lenta) {
        eq('rapida == lenta', U.toHex(rapida), U.toHex(lenta));
        ayuda.resumen();
    });
});
