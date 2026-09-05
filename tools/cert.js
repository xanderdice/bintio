/* ==========================================================================
   Certificado local firmado por si mismo, para poder servir por https en
   desarrollo.

   Hace falta para dos cosas: probar la aplicacion instalada como PWA en
   condiciones parecidas a las reales, y poder comprobar de verdad las
   cabeceras que solo tienen sentido sobre TLS (HSTS y la redireccion).

   Usa openssl, que viene con git en Windows y de serie en Linux y macOS.
   El certificado NO vale para publicar nada: es de mentira y el navegador
   avisara. Va en certs/, que esta en .gitignore.
   ========================================================================== */
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var DIR = path.join(__dirname, '..', 'certs');
var KEY = path.join(DIR, 'key.pem');
var CERT = path.join(DIR, 'cert.pem');
var CONF = path.join(DIR, 'openssl.cnf');

function log(m) { process.stdout.write(m + '\n'); }

if (fs.existsSync(KEY) && fs.existsSync(CERT) && process.argv.indexOf('--force') < 0) {
    log('Ya hay certificado en certs/. Usa "node tools/cert.js --force" para rehacerlo.');
    process.exit(0);
}

try {
    cp.execSync('openssl version', { stdio: 'ignore' });
} catch (e) {
    log('No encuentro openssl.');
    log('En Windows viene con Git; en Linux y macOS suele estar instalado.');
    log('Sin el, BINTIO sigue sirviendose por http: solo pierdes https en local.');
    process.exit(0);
}

if (!fs.existsSync(DIR)) { fs.mkdirSync(DIR, { recursive: true }); }

/* subjectAltName es obligatorio: sin el, los navegadores modernos rechazan el
   certificado aunque el nombre comun coincida. */
fs.writeFileSync(CONF, [
    '[req]',
    'distinguished_name = dn',
    'x509_extensions = ext',
    'prompt = no',
    '',
    '[dn]',
    'CN = localhost',
    'O = BINTIO desarrollo',
    '',
    '[ext]',
    'subjectAltName = DNS:localhost, IP:127.0.0.1, IP:::1',
    'basicConstraints = critical, CA:FALSE',
    'keyUsage = critical, digitalSignature, keyEncipherment',
    'extendedKeyUsage = serverAuth',
    ''
].join('\n'));

try {
    cp.execSync('openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes' +
        ' -keyout "' + KEY + '" -out "' + CERT + '" -config "' + CONF + '"',
        { stdio: 'ignore' });
} catch (e) {
    log('openssl fallo al generar el certificado: ' + e.message);
    process.exit(1);
}

fs.unlinkSync(CONF);
log('Certificado local creado en certs/. "npm start" ya servira por https.');
