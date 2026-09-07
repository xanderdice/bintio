# BINTIO

**Ni un servidor en medio.**

Sin cuenta. Sin telefono. Sin correo. Sin nube. Sin rastreadores. Sin anuncios.
Sin una sola peticion a internet que no hayas pedido tu.

BINTIO es un mensajero cifrado de punta a punta que funciona en cualquier
navegador, en el movil, en el escritorio y hasta desde un fichero suelto en un
USB. Los mensajes viajan directos entre aparatos, y cuando no hay camino
directo, viajan **dentro de aparatos de terceros que no pueden leerlos** hasta
que llegan. Eso ultimo es lo que casi nadie ha hecho todavia en un navegador.

---

## Arrancar

```bash
npm install
npm start
```

Y ya esta: **http://localhost:8787**.

Por http, sin certificado y sin avisos rojos del navegador. No es una version
recortada: `http://localhost` es un **contexto seguro** para todos los
navegadores, exactamente igual que `https://`. La camara para leer QR, WebRTC,
Web Bluetooth, `crypto.subtle` y el modo sin conexion funcionan igual. Un
certificado de mentira en local solo anade el aviso y no aporta nada.

https hace falta en dos sitios, y solo en dos:

| Cuando | Comando |
|---|---|
| Abrirlo **desde el movil** por la IP de tu red (ahi ya no es localhost, y sin https el navegador apaga camara, bluetooth y modo sin conexion) | `npm run start:lan` |
| **Puntuar las cabeceras** (HSTS y la redireccion solo existen sobre TLS) | `npm run audit` |

### Como probarlo, segun donde

BINTIO tiene que funcionar en todas partes, y cada sitio se prueba distinto:

| Donde | Como | Que hay que ver |
|---|---|---|
| **En tu maquina** | `npm start` y abre `http://localhost:8787` | todo |
| **Con doble clic, sin servidor** | abre `dist/bintio.html` desde el explorador de ficheros | todo menos instalar como app y modo sin conexion |
| **Desde el movil, en tu wifi** | `npm run start:lan` y abre la direccion `https://192.168.x.x:8787` que imprime (acepta el aviso del certificado) | todo, incluida la camara |
| **Como app instalada** | abrelo en `http://localhost:8787` y pulsa "Instalar" en el navegador | todo, y arranca sin conexion |
| **Como programa de escritorio** | `npm run desktop` (o `npm run desktop:build` para los siete sistemas) | todo |
| **En un servidor de verdad** | sube `dist/` entero, incluidos `_headers` / `.htaccess` / `nginx.conf` | todo |

Para ver la malla sin tener dos aparatos, abre **dos pestanas** en
`http://localhost:8787`: se encuentran solas por el transporte local y se
pasan mensajes entre ellas.

### Lo que sale de dist/

| Fichero | Que es |
|---|---|
| `dist/index.html` | **la aplicacion entera**: estilos, codigo, logos y manifiesto dentro del propio documento. No pide un solo fichero a nadie. Vale servida, vale instalada, vale de escritorio y vale con doble clic. |
| `dist/bintio.html` | el mismo fichero byte a byte, con el nombre de siempre para quien lo busque asi. |
| `dist/sw.js` | tres kilobytes. Lo unico que **no se puede** meter dentro (ver abajo), y solo hace falta si se publica en un servidor: es lo que da el modo sin conexion y la instalacion. |
| `dist/bintio-win_x64.exe` y los otros seis | la aplicacion de escritorio para los siete sistemas, al lado de la web. Cada uno abre el `resources.neu` que tiene al lado. |
| `dist/resources.neu` | la web empaquetada, que es lo que abren los ejecutables. Dentro va el `index.html` de arriba, no los ejecutables: la aplicacion no se lleva una copia de si misma. |
| `dist/bintio-release.zip` | los siete ejecutables y el paquete, listos para publicar. |
| `social.png`, `robots.txt`, `_headers`, `.htaccess`, `nginx.conf`, iconos | para los rastreadores, los buscadores, el servidor y el empaquetador de escritorio. La aplicacion no los necesita para funcionar. |

#### Por que sw.js no va dentro

Porque no se puede, y no es una opinion: el codigo de un trabajador de
servicio **tiene que venir de una direccion http o https**. Intentar
registrarlo desde `blob:` o desde `data:` lo rechaza cualquier navegador con
un error explicito:

```
TypeError: Failed to register a ServiceWorker:
The URL protocol of the script (blob:...) is not supported.
```

El manifiesto si va dentro, en el propio enlace, con sus iconos
incrustados. Como una direccion `data:` no tiene origen y para instalar hace
falta que lo tenga, al arrancar se rehace como `blob:` con `start_url`,
`scope` e `id` absolutos, que es lo que no se puede saber al compilar.

Otros comandos:

```bash
npm run build       # compila la web Y los ejecutables, todo en dist/
npm run build:web   # solo la web, sin tocar el escritorio
npm test            # vectores, protocolo, malla, QR, auditoria del build y cabeceras
npm run verify      # compila y audita solo lo compilado
npm run audit       # levanta el servidor por https y puntua sus cabeceras
npm run cert        # certificado local, solo para https en desarrollo
npm run start:https # servir por https en localhost (rara vez hace falta)
npm run start:lan   # https y ademas escuchando en toda la red local
npm run desktop     # abre la ventana de escritorio (Neutralino)
npm run desktop:build # solo los ejecutables, sin arrancar nada
```

Y si quieres otro puerto: `node tools/serve.js --port 9000`.

---

## Que hace distinto

Estas fueron las quejas que mas se repiten sobre los mensajeros que ya
existen. BINTIO esta construido alrededor de ellas.

| La queja de siempre | Que hace BINTIO |
|---|---|
| "Necesita mi numero de telefono" | Tu identidad son 32 bytes generados en tu aparato. |
| "Si pierdo el movil, pierdo todo" | Llave de Recuperacion de 56 caracteres + copia cifrada que puedes guardar donde quieras. |
| "Necesita un servidor, aunque digan que no" | Ni siquiera para presentaros: os pasais un codigo de texto por donde os de la gana. |
| "Sin cobertura no sirve" | Malla con guardar-y-reenviar: otros aparatos llevan tu sobre encima hasta que llega. |
| "El que lo reenvia sabe quien habla con quien" | El sobre no dice remitente ni destinatario. Solo el destinatario lo reconoce. |
| "Anuncios y suscripcion" | No hay nada que cobrar: no hay servicio detras. |
| "Solo funciona en un sistema" | Cualquier navegador de los ultimos diez anos, y de ahi para arriba. |
| "No me fio del codigo que me sirven" | La pagina fija el hash exacto de su propio codigo; si alguien lo cambia, no se ejecuta. |

---

## Como llega un mensaje

```
   Ana                    cualquiera                     Beto
    |                          |                           |
    |  sobre sellado           |                           |
    |------------------------->|  lo guarda en la mochila  |
    |                          |  (no puede abrirlo)       |
    |                          |                           |
    |                          |   Beto aparece dias        |
    |                          |   despues, a lo mejor      |
    |                          |   por Bluetooth            |
    |                          |-------------------------->|
    |                          |                           | lo abre
    |<---------------------------------------- acuse ------|
```

Tres formas de mover bytes, y a la malla le da igual cual sea:

1. **Enlace directo (WebRTC).** Es lo que hay detras del codigo de
   **Conectar**: tu codigo YA es una invitacion. El otro lo lee (QR o texto),
   le sale una respuesta, se la ensenas de vuelta y el canal queda abierto por
   los dos lados. Sin servidor de senalizacion: el "servidor" sois vosotros
   dos pasandoos dos codigos.

   Son dos pasos y no uno porque no pueden ser uno: WebRTC necesita oferta
   **y** respuesta, y sin nadie en medio que lleve la respuesta de vuelta, esa
   vuelta la teneis que dar vosotros. Anadir un contacto no es conectarlo.
2. **Bluetooth.** El navegador se engancha a nodos que anuncian el perfil GATT
   de BINTIO (ver abajo) y usa la malla sin internet ninguno.
3. **Local.** Otras pestanas o ventanas del mismo navegador, para que una
   pestana de fondo pueda seguir repartiendo.

---

## Escribiendo, entregado y leido

Tres avisos, y los tres son opcionales porque los tres dicen algo de ti.

| | Que dice | Vida del sobre | Se guarda? |
|---|---|---|---|
| **Escribiendo** | estas tecleando ahora mismo | 15 s, y **cero saltos** | no, en ninguna parte |
| **Entregado** | el sobre ha llegado a su aparato | la normal | si, con el mensaje |
| **Leido** | ha abierto la conversacion | la normal | si, con el mensaje |

El **escribiendo** sale como mucho una vez cada cuatro segundos aunque teclees
sin parar, no se reenvia por la malla (`ttl 0`: solo por los cables que haya
abiertos en ese instante) y **no entra en ninguna mochila**, ni en la de quien
lo manda ni en la de quien lo recibe. Esto ultimo no es un caso especial suyo:
la mochila no guarda nada que caduque en menos de un minuto, porque no le da
tiempo a llegar a ninguna parte y a cambio escribiria la boveda en disco cada
cuatro segundos. La regla vale para todos por igual -destinatario, reenviador o
vecino de paso- y por eso no delata a nadie.

El **acuse de lectura** solo se manda del ultimo mensaje de cada persona, no de
todos: leer el ultimo implica los de antes, y asi la lectura no se convierte en
un chorro de metadatos. Los dos interruptores estan en Ajustes y se pueden
apagar por separado.

---

## Grupos

Sin servidores no hay "sala": un grupo es una **lista** que guarda tu aparato, y
mandar al grupo es sellar un sobre para cada miembro. Con cinco personas salen
cuatro sobres, cada uno cifrado punta a punta con su destinatario.

Cuesta ancho de banda. A cambio no hay **ni un solo secreto compartido**: no hay
clave de grupo que robar, quien se sale no puede seguir leyendo, y ningun
servidor sabe que ese grupo existe ni quien esta dentro.

**La ficha viaja con cada mensaje.** El cuerpo de un mensaje de grupo lleva el
nombre y la lista entera. Podria mandarse una vez, pero entonces quien se
perdiera esa unica copia se quedaria con mensajes de un grupo que no sabe ni
como se llama, y sin servidor no hay a quien preguntarle. Repitiendola, el grupo
se arregla solo con el siguiente mensaje que llegue. Son unos 80 bytes por
miembro; con el cupo de 32, 2,5 KB sobre una mochila de 900 KB.

**No manda nadie.** No hay administrador. Cada ficha lleva un numero de
revision y la mas nueva pisa a la que hay, asi que un cambio se propaga con el
trafico normal.

**No se anade a nadie solo.** La ficha trae claves publicas de gente que quiza
no tienes dada de alta, y no se dan de alta solas: eso es una decision tuya y
este proyecto entero se sostiene sobre eso. A quien no tengas no le puedes
escribir, la conversacion lo dice con su nombre, y sus acuses no te llegaran
nunca.

### "Leido" quiere decir leido por todos

Un mensaje de grupo pone **leido** cuando lo ha abierto el ultimo, no el
primero. Mientras tanto ensena la cuenta:

```
Quedamos a las nueve?          12:11  enviado
Sin problema, os espero.       12:16  leido 2 de 3
Reservo mesa para cuatro.      12:20  entregado 3 de 3
```

"Leido" a secas cuando lo ha visto uno de cuatro es una mentira comoda para
quien escribe y una trampa para los otros tres. Y si la cuenta se queda parada
en "2 de 3" para siempre, la conversacion dice por que: falta alguien a quien no
tienes anadido.

---

## La auditoria de seguridad

El codigo se reviso entero buscando fallos y ataques: ocho auditores en
paralelo por angulos distintos (las primitivas y su uso, el parseo de lo que
llega de la red, la malla y el agotamiento de recursos, los transportes y el
primer contacto, la boveda, la interfaz, el build y la logica de estados), y
cada hallazgo grave lo intentaron tumbar despues dos refutadores independientes,
uno reproduciendolo y otro buscando la defensa que ya existiera. Sobrevivieron
**dieciocho**, casi todos con una prueba que los demostraba.

Estan **todos arreglados menos uno** -la clave de trinquete en claro, explicada
en "Como esta cifrado", que es un cambio del formato del cable- y cada arreglo
tiene su comprobacion en `test/seguridad.test.js`, escrita de forma que **falla
si alguien deshace el arreglo**. Comprobado: con la poda vieja, la prueba de la
mochila deja 0 de 20 sobres honrados.

Lo que se cerro, en una linea cada uno:

| | Que se podia hacer |
|---|---|
| Prototipo | una ficha de grupo con `__proto__` de id escribia en `Object.prototype` |
| Marcos gigantes | cuatro marcos de 200 KB inutilizaban la mochila 96 horas |
| Inundacion | 300 marcos con la caducidad al maximo echaban todo lo honrado |
| Clave de encuentro | un codigo SIN cifrar se aceptaba aunque hubieras escrito la clave: suplantacion en el primer contacto |
| Secretos en el DOM | la contrasena y la Llave de Recuperacion se quedaban en los campos despues de cerrar |
| Borrado de panico | otra pestana volvia a escribir la boveda al minuto siguiente |
| Vueltas de PBKDF2 | una copia con otro numero de vueltas se volvia inabrible al primer guardado |
| Nombres | un nombre de 255 bytes con saltos de linea pintaba un falso aviso del sistema |
| Grupos | guardar la ficha echaba a los miembros que no tenias anadidos, y se lo contaba a todos |
| Trinquete | quien te quitaba dejaba tus mensajes siguientes ilegibles para siempre |
| Repeticion | un aviso viejo de "te he quitado" volvia a valer tras desbordar la memoria de vistos |
| Cuota llena | todo lo nuevo dejaba de guardarse sin un solo aviso |
| nginx | los tres ficheros que importan salian sin CSP, sin HSTS y sin nada |

Quedan fuera veinticuatro observaciones de gravedad baja (endurecimiento) que no
se han tocado, y las dos limitaciones que dice "Lo que NO puede hacer".

---

## Videollamadas

Entre dos personas, de aparato a aparato, sin que el video pase por ningun
sitio. El boton **Llamar** sale en la cabecera de la conversacion cuando hay
vinculo con esa persona; con un grupo no sale, porque una llamada de punta a
punta tiene dos puntas.

### Por que es de punta a punta, y de quien depende

El video de WebRTC va cifrado siempre (DTLS-SRTP), pero eso por si solo no
vale: quien controle el intercambio de descripciones (SDP) puede ponerse en
medio y cifrar dos tramos en vez de uno. Todas las aplicaciones de
videollamada tienen ese punto debil en su **servidor de senalizacion**.

Aqui no hay servidor de senalizacion. Las descripciones viajan **dentro de
sobres normales de BINTIO**, sellados por `session.js`: solo esa persona
puede abrirlos y solo esa persona puede haberlos sellado (`ss2` exige su clave
estatica). La huella DTLS que va en el SDP queda asi autenticada por la misma
criptografia que autentica un mensaje, y un intermediario no puede cambiarla
sin romper el sobre. **La seguridad de la llamada es exactamente la de la
identidad del contacto**: si comprobaste su huella en persona, la llamada es
con esa persona. La pantalla de la llamada la ensena por eso.

### Lo que viaja, y cuando

| | Que dice | Lleva SDP? |
|---|---|---|
| `ring` | te llamo | **no** |
| `ok` | acepto | no |
| `offer` | mi descripcion, con mi huella DTLS | si |
| `answer` | la mia | si |
| `bye` | cuelgo, o no puedo, o no quiero, con el motivo | no |

El timbre va **sin descripcion a proposito**. Reunir candidatos de red para el
SDP revela las direcciones IP del aparato, y eso no se hace hasta que el otro
ha dicho que si: quien recibe una llamada y la rechaza no ha soltado nada, y
quien llama tampoco hasta que le contestan. Por lo mismo, la camara de quien
recibe no se enciende hasta que pulsa **Aceptar**; la de quien llama, al
pulsar **Llamar**, que es su decision.

Los sobres de llamada viven **40 segundos y no dan saltos** (`ttl 0`): igual
que el "escribiendo", no entran en ninguna mochila y solo salen por los cables
abiertos en ese instante. Una llamada solo tiene sentido con camino vivo, y un
timbre guardado que suena tres horas despues seria un fallo, no una funcion.
Tampoco se guarda nada en la boveda: no hay registro de llamadas.

### Lo que hace cuando las cosas se tuercen

- **Ocupado**: si te llaman mientras estas en otra, al que llama le llega
  `ocupado` y tu llamada no se entera de nada.
- **Los dos a la vez**: si os llamais en el mismo instante, sigue llamando el
  de la clave mas baja y el otro coge ese timbre. Es una regla que los dos
  aplican sin hablar, y por eso sale una llamada y no cero ni dos.
- **Nadie contesta**: un timbre se apaga solo a los 45 s; aceptada pero sin
  conectar el video, a los 30 s. Un solo temporizador, y solo mientras hay
  llamada: en reposo no hay ninguno.
- **Cerrar la boveda cuelga**, con los cables todavia abiertos, para que al
  otro le llegue el `bye` en vez de una pantalla congelada. Y apaga la camara
  de verdad, no solo la esconde.
- **Una descripcion que no es SDP** -texto ajeno que no empieza por `v=0`, o
  de mas de 32 KB- no llega al navegador. `setRemoteDescription` es codigo del
  navegador leyendo texto de otra persona, y esa es la puerta.

Todo esto esta probado sin camara ni navegador en `test/llamada.test.js`: la
maquina de estados (`nucleo/llamada.js`) no sabe que existe WebRTC. El video
lo pone `transportes/videollamada.js` en una conexion **aparte** de la del
canal de datos -para poder colgar sin tirar los mensajes, y porque las dos
personas pueden estar unidas por bluetooth o por la malla- y la pantalla,
`interfaz/videollamada.js`.

### Lo que NO hace

- Sin STUN, solo en la misma red: lo mismo que el enlace directo de mensajes,
  y por la misma decision. Con un STUN en Ajustes, tambien a traves de
  internet.
- No hay TURN y no lo habra: un TURN es un servidor por el que pasa el video.
  Si vuestras dos redes no se alcanzan, la llamada no sale, y lo dice.
- Grupos, no. Compartir pantalla, no.
- La **pantalla protegida** tapa tambien la llamada cuando la ventana deja de
  estar delante. Es la misma promesa de siempre; si molesta, se apaga en
  Ajustes.

---

## Espanol e ingles

El idioma se elige en **Ajustes > Aspecto** y cambia al momento, sin recargar y
sin cerrar la boveda. De serie sale el del navegador; si no es ninguno de los
dos, el espanol.

Se guarda **fuera de la boveda**, en `bintio.lang`. Dentro no serviria: la
pantalla donde se escribe la contrasena sale ANTES de que haya boveda que
abrir, y ahi tambien hay que leer. Tampoco es un dato privado -el idioma que
prefieres es justo lo que tu navegador ya le cuenta a cualquier pagina- y el
borrado se lo lleva igual, porque empieza por `bintio.`.

### La clave es el texto en espanol

Lo normal en estas cosas es inventarse identificadores y tener dos tablas. Aqui
la clave **es la frase en espanol**, asi que el codigo sigue diciendo lo que va
a salir en pantalla:

```js
D.toast(D.t('Guardado'));            // y no D.t('ajustes.guardado')
```

En el marcado basta un atributo, sin clave dentro. Se traduce cada trozo de
texto por separado, asi que un parrafo con una parte en negrita sigue teniendo
su negrita en su sitio:

```html
<p data-t>La contrasena cifra todo. <b data-t>Nadie puede recuperarla</b>.</p>
```

Y solo hay **una** tabla, la de ingles (`interfaz/textos.js`), porque el
espanol ya esta escrito donde se usa.

El precio es que si alguien cambia una coma en una frase espanola, su
traduccion deja de encontrarse y esa linea vuelve al espanol. Por eso existe
`test/idioma.test.js`, que no deja pasar eso:

- que **no falte** ni una frase de las marcadas,
- que **no sobre** ninguna traduccion cuya frase ya no existe,
- que los huecos (`{quien}`, `{n}`) esten en los dos idiomas, porque perder uno
  hace desaparecer el nombre de una persona de la frase,
- y que no haya textos que se pinten **sin pasar por** `D.t`, que es el fallo
  que nadie ve: saldrian siempre en espanol y no fallaria nada.

```bash
node test/frases.js        # la lista de todo lo que hay que traducir
node test/idioma.test.js   # falla y dice que frase falta
```

### Anadir un idioma

Una clave mas al lado de `en` en `textos.js` con la misma lista, y una linea en
`D.IDIOMAS` (`interfaz/idioma.js`). Nada mas: el selector de Ajustes se rellena
solo con lo que haya en esa lista.

---

## El vinculo: quien te tiene y quien no

Anadir a alguien va en **una sola direccion**, asi que "lo tengo en mi lista" y
"le puedo escribir" no son lo mismo. Al lado de cada nombre hay dos anillos que
lo dicen: si se tocan hay cadena, si estan separados no la hay.

| Icono | Estado | Que significa |
|---|---|---|
| anillos verdes **unidos** | vinculado | ha llegado algo suyo y se ha podido abrir, o sea que esa persona te tiene anadido. Es lo unico que demuestra que lo que escribas le va a llegar |
| anillos grises **de puntos** | a medias | todavia no ha llegado nada suyo. Puede que no te haya anadido, o que aun no os hayais cruzado |
| anillos ambar **separados** | te ha quitado | te lo ha dicho el. No hay nada que esperar |

Lo que cambia de verdad es la **forma** -pegados o separados-, no el color: quien
no distingue el verde del ambar tiene que poder leerlo igual. El color solo lo
subraya, y pasando el raton lo dice con palabras.

Las dos primeras se parecen en la pantalla y no se parecen en nada: en una cabe
esperar y en la otra no. Confundirlas es lo que hace creer que la aplicacion
falla.

### Quitar a alguien se le dice

Al eliminar un contacto sale un sobre `T_UNLINK` para esa persona antes de
borrarla, que es cuando todavia se tiene su clave para sellarselo. Si no hay
camino, el aviso espera en la mochila y le llega cuando os crucais.

Se manda **siempre, sin interruptor**, y no es un descuido. Los acuses son
opcionales porque dicen algo de ti -a que hora abriste la aplicacion-; esto no
dice nada de ti, dice algo de **el**: que lo que escriba a partir de ahora ya no
se va a poder abrir. Callarselo lo deja escribiendo a una pared sin saberlo. El
dialogo de eliminar lo avisa antes de pulsar, para que tampoco sea una sorpresa
para quien lo hace.

Quitar a alguien no le borra a el de tu lista si es el quien te quita a ti: eso
lo decides tu. Lo que ya os disteis sigue donde estaba.

Un detalle del que depende todo: el sobre que dice "te he quitado" **demuestra,
por el mero hecho de abrirse**, que quien lo mando te tenia dado de alta. Asi
que al abrirlo el vinculo se marca como bueno y una linea despues se marca como
roto. Si ese orden se invierte, el aviso se anula a si mismo. Hay prueba:
`test/vinculo.test.js`.

---

## Que te escriban sin tenerlos anadidos (el buzon)

Anadir a alguien va en **una sola direccion**. Un sobre solo se puede abrir si
quien lo recibe tiene dado de alta a quien lo manda, asi que si te anaden y te
escriben sin que tu hagas lo mismo, el mensaje llega a tu aparato y no se puede
abrir. Es una consecuencia de como se cifra, no un fallo: el secreto que
autentica al remitente necesita su clave publica.

Para eso existe la **presentacion**: un sobre cifrado solo con el secreto que tu
puedes calcular sin saber quien te escribe, que lleva dentro su clave, su nombre
y su primer mensaje. Te llega como **solicitud**, con la huella a la vista, y tu
aceptas o descartas.

**Viene apagado.** En Ajustes, *"Dejar que te escriban sin tenerlos anadidos"*.
Apagado -que es como sale de fabrica, y como se lee una boveda que ya existia-
para escribirte hay que estar en tu lista, igual que siempre. Encendido,
cualquiera con tu codigo puede llamar a tu puerta.

| | apagado (de serie) | encendido |
|---|---|---|
| quien puede escribirte | solo quien tu hayas anadido | cualquiera con tu codigo |
| que cuesta una presentacion que llega | nada: se trata como un sobre ajeno y se sigue transportando | una operacion de curva, con cupo por minuto y por enlace |
| spam | imposible | posible, y por eso llega como solicitud y no como conversacion |

Dos cosas que conviene saber antes de encenderlo. **Ese primer mensaje no va
autenticado**: el nombre lo pone quien escribe, y hasta que no compruebes la
huella no sabes quien es -por eso la solicitud la ensena siempre-. Y **aceptar no
manda nada**: ni acuse, ni aviso, ni nada. Sale si aceptas y no sale si
descartas seria decirle a un desconocido el segundo exacto de tu decision.

---

## Empezar de cero (perdiste la contrasena)

Si pierdes la contrasena y no tienes Llave de Recuperacion ni copia, **no hay
nada que hacer**: aqui no existe ningun servidor que restablezca nada, y esa es
justo la propiedad por la que existe el proyecto. Pero el aparato no tiene por
que quedarse inservible.

En la pantalla de acceso, al lado de **Abrir**, hay **Empezar de cero**. Pregunta
antes -si o no, en la propia pantalla y no con el cuadro del navegador, que se
acepta sin leer- y dice entero lo que desaparece: la identidad y la clave, todas
las conversaciones, los contactos, los grupos, los sobres de otros que llevabas
en la mochila y los ajustes. Despues arranca en la pantalla de crear identidad,
en limpio.

No se borra solo la boveda: se barre **toda clave que empiece por `bintio.`**.
Antes quedaba atras `bintio.bus.v1`, el buzon con el que hablan las pestanas del
mismo navegador; dentro no hay nada legible, pero la clave en si dice que aqui
se uso BINTIO, y esta funcion promete lo contrario. Lo que no es nuestro no se
toca. Hay prueba: `test/borrado.test.js`.

**No pide la contrasena, y tiene un precio.** Cualquiera que coja el aparato
puede borrarlo. No puede *leer* nada -eso sigue protegido por la contrasena, que
es lo que esta aplicacion defiende-, pero si puede destruirlo. Se acepta a
proposito: pedir la contrasena para la salida que existe justo porque la has
perdido no seria una medida de seguridad, seria un candado sin puerta.

Con la boveda ya abierta hay otro camino equivalente en **Ajustes > Este
aparato > Borrar todo**.

---

## Como esta cifrado

Todo con primitivas implementadas aqui dentro y **comprobadas contra los
vectores oficiales** (`npm test`): SHA-256 (FIPS 180-4), HMAC (RFC 4231),
HKDF (RFC 5869), PBKDF2 (RFC 8018), ChaCha20 (RFC 8439) y X25519 (RFC 7748).

Cada mensaje se cierra con tres secretos a la vez:

```
ss1 = X25519(efimera del remitente, estatica del destinatario)   frescura
ss2 = X25519(estatica del remitente, estatica del destinatario)  autenticidad
ss3 = X25519(trinquete propio, trinquete del otro)               secreto futuro

clave = HKDF(ss1 || ss2 || ss3, sal = clave efimera, "bintio/env/v1")
```

- **ss1** es distinto en cada mensaje, aunque escribas mil seguidos.
- **ss2** solo lo pueden calcular esas dos personas: eso autentica al
  remitente sin firmar nada, asi que ademas nadie puede demostrarle a un
  tercero que tu escribiste eso.
- **ss3** es el trinquete: las claves rotan solas y las viejas se borran.
  Cuando desaparecen, esos mensajes ya no se pueden descifrar **ni robando la
  clave estatica del aparato**.

El sobre que viaja por la malla **no lleva ni remitente ni destinatario**. Solo
una etiqueta de 8 bytes que unicamente el destinatario sabe recalcular: cambia
en cada mensaje, porque se calcula sobre la clave efimera, asi que por ella no
se pueden agrupar dos sobres.

**Pero si lleva una cosa que si los agrupa, y hay que decirlo**: la clave de
trinquete del remitente viaja en la cabecera, en claro (32 bytes), porque el
que recibe la necesita para calcular `ss3` antes de poder descifrar nada. Esa
clave solo cambia cuando el OTRO publica una nueva, asi que veinte mensajes
seguidos de la misma persona llevan la misma. Quien solo transporta no puede
leer nada, pero **si puede agrupar los sobres de una misma conversacion y
enlazar la ida con la vuelta**, y con eso reconstruir el grafo de quien habla
con quien y a que horas. Lo encontro la auditoria de seguridad de este
proyecto, con una prueba que lo demuestra mirando solo los bytes del cable.

Arreglarlo es mover esa clave DENTRO del texto cifrado y usar para `ss3` la
clave que se aprendio del mensaje anterior. Es un cambio del formato del cable
y del momento en que gira el trinquete, asi que va aparte y todavia **no esta
hecho**. Mientras tanto la promesa correcta es esta: quien transporta no lee
nada y no sabe quien eres, pero puede contar cuantos sobres se cruzan dos
desconocidos suyos.

En disco, todo (identidad, contactos, mensajes y sobres ajenos) vive dentro de
un unico bloque cifrado con una clave derivada de tu contrase&ntilde;a con
150.000 vueltas de PBKDF2.

**No hay puerta trasera y no puede haberla.** El desarrollador no tiene
servidor, no tiene tus claves y no tiene forma de pedirtelas. Si pierdes la
contrase&ntilde;a y la Llave de Recuperacion, tus datos son ruido. Eso es el producto.

---

## Lo que NO puede hacer (dicho claro)

- **Dos navegadores no se ven entre si por Bluetooth.** Ningun navegador puede
  anunciarse como periferico BLE; eso no existe en la plataforma web. El
  transporte Bluetooth de BINTIO funciona contra un nodo que si pueda serlo:
  la version de escritorio con puente nativo, una app nativa o un cacharro
  tipo ESP32 que implemente el perfil de abajo. El perfil esta documentado
  justo para eso.
- **Sin servidor STUN solo hay enlace directo en tu red.** Red local, cable,
  o compartir datos desde el movil. Puedes poner tu propio STUN en Ajustes si
  quieres atravesar internet; por defecto no hay ninguno porque un STUN ve que
  dos direcciones IP se estan buscando.
- **El primer intercambio de codigo es el momento delicado.** Quien
  intercepte ese texto puede colarse en medio. Por eso existen la *clave de
  encuentro* (cifra el codigo con algo que solo sabeis los dos) y la *huella*
  (comparadla en persona o por telefono y marcadla como comprobada).
- **El navegador puede borrar el almacenamiento.** Descarga la copia cifrada.
- **iPhone no tiene Web Bluetooth.** Todo lo demas si.
- **Una captura de pantalla no se puede impedir desde una pagina web.** Ni
  desde aqui ni desde ninguna: la pantalla es del sistema operativo. En el
  navegador solo cabe estorbarla, y eso es lo que se hace. En Windows si hay
  salida de verdad, y tiene su propio ejecutable: ver la seccion siguiente.
- **Quien transporta puede agrupar los sobres de una conversacion.** No leerlos:
  agruparlos. La clave de trinquete va en claro en la cabecera y aguanta varios
  mensajes. Esta explicado arriba, en "Como esta cifrado", con el arreglo
  pendiente.
- **Dos pestanas a la vez editando la misma boveda pueden pisarse.** La
  escritura de mantenimiento cede ante la pestana que se esta usando, y el
  borrado ya no se resucita nunca, pero si las dos se usan a la vez lo ultimo
  que se guarde es lo que queda. Lo correcto seria un cerrojo de escritura de
  verdad.

---

## Pantalla protegida

Encendida de serie, en Ajustes. Hace tres cosas, y ninguna de ellas es
"bloquear capturas", porque eso desde una pagina no existe.

**1. Tapa en cuanto la ventana deja de estar delante.** No es cosmetico. En
Windows, `Win + Mayus + S` abre el recorte y **se lleva el foco antes de
capturar**: lo que acaba en la imagen es la cortina. Lo mismo con casi todo lo
que obliga a salir de la ventana, y con el descuido mas comun de todos —
compartir pantalla en una reunion y cambiar de aplicacion con la conversacion
detras.

**2. `Impr Pant` si llega a la pagina.** La captura ya esta hecha cuando nos
enteramos y no se puede cancelar, pero va al **portapapeles**, y el
portapapeles si se puede pisar. Se pisa, se tapa la pantalla y se avisa con
todas las letras de que la captura no se ha impedido.

**3. Fuera el menu del boton derecho**, que era ademas la via comoda para
"Inspeccionar" por encima del hombro de alguien. Con una excepcion a proposito:
**dentro de un campo de texto si sale**, porque ese menu es como se pega, y en
el movil la pulsacion larga es la unica forma de pegar el codigo de una
invitacion. Un menu de pegar sobre un campo vacio no ensena nada de nadie.

### Lo que NO hace

- Un grabador que **no roba el foco** (OBS, una videollamada ya en marcha) graba
  la conversacion entera. No hay nada que hacer desde una pagina.
- Una **camara apuntando a la pantalla** se lo lleva todo, siempre. Contra eso
  no hay software.
- `Impr Pant` a secas ya ha hecho la foto: solo se puede estropear la copia del
  portapapeles.

### En Windows si se impide: bintio-win_x64-protegido.exe

En Windows existe la solucion buena: `SetWindowDisplayAffinity` con
`WDA_EXCLUDEFROMCAPTURE`. Marca la ventana como no capturable **en el sistema
operativo**, y entonces cualquier grabador -OBS incluido- solo ve negro. Es lo
que usan la banca y las plataformas de video, y es lo que hay detras de
`setContentProtection` en Electron o `set_content_protected` en Tauri.

La primera idea es lanzarla desde fuera: un `.cmd` al lado del ejecutable que
busque la ventana de BINTIO y le aplique la afinidad. **No funciona**, y no es
una cuestion de permisos de administrador. Medido en esta misma maquina:

| Llamada | Resultado |
|---|---|
| sobre una ventana **del propio proceso** | `True`, afinidad queda en `0x11` |
| sobre la ventana de **otro proceso** | `False`, error 5 (acceso denegado) |

Esa API solo la puede llamar el proceso dueno de la ventana. Asi que tampoco
sirve una extension de Neutralino: las extensiones son procesos aparte y se
comen el mismo error 5. Tiene que salir de **dentro** del propio ejecutable.

Asi que hay un anfitrion propio, y es lo minimo que puede ser: una ventana, el
WebView2 que Windows ya trae dentro, y esa llamada. Carga el MISMO
`dist/bintio.html` que todo el mundo; no hay ni una linea de logica de BINTIO
en el (`tools/protegido/`, unas 180 lineas de C#, y `bintio-win_x64-protegido.exe`
ocupa 22 KB).

```bash
npm run protegido      # deja el ejecutable y sus dll en dist/
```

Va **suelto y no dentro de `npm run build`** porque pide el SDK de .NET, y la
promesa de este proyecto es que con Node y nada mas se compila todo. Quien no
lo tenga sigue teniendo los siete ejecutables normales y la web.

| | Neutralino | Protegido |
|---|---|---|
| Sistemas | los siete | solo Windows |
| Tamano | 2,6 MB | 22 KB + 790 KB de dll |
| Sale en capturas y grabaciones | si | **no** |
| Necesita | nada | Windows 10 2004+, WebView2, .NET Framework 4.8 |

Las tres cosas que necesita vienen puestas en Windows 11 y en cualquier
Windows 10 al dia.

**Dos avisos que importan:**

- **Las bovedas NO son la misma.** El protegido carga la pagina desde `file://`
  y el de Neutralino desde un http local con su propio puerto; para el navegador
  son dos origenes, y cada origen tiene su almacen. Cambiar de un ejecutable al
  otro es empezar de cero salvo que te lleves la identidad con la Llave de
  Recuperacion o con una copia completa.
- **Una camara apuntando a la pantalla se lo sigue llevando todo.** Eso no lo
  arregla ningun software, y conviene repetirlo cada vez que se habla de esto.

En los otros seis sistemas sigue valiendo lo de arriba, ni mas ni menos: macOS
y Linux tienen equivalentes, pero Neutralino tampoco los expone.

---

## Perfil GATT: haz tu propio nodo

Cualquier cacharro que implemente esto es parte de la malla:

```
Servicio  d1e4a2c0-7b31-4f6e-9a55-1c0de1a70001
  RX      d1e4a2c0-7b31-4f6e-9a55-1c0de1a70002   escritura   central -> nodo
  TX      d1e4a2c0-7b31-4f6e-9a55-1c0de1a70003   notificar   nodo -> central

Trozos:  byte 0-1  identificador de mensaje
         byte 2-3  numero de trozo (bit alto = ultimo)
         byte 4..  datos

Marcos:  'B','X',...    un sobre
         'B','C',tipo   control: 1 inventario, 2 peticion
```

Un nodo no necesita claves, ni identidad, ni entender nada: recibe sobres,
los guarda mientras no caduquen y los suelta cuando alguien nuevo aparece.

---

## Estructura del codigo

La regla es una y no se rompe: **cada fichero sabe una cosa**.

```
src/js/
  nucleo/       ns, compat, util, sha256, kdf, chacha, x25519, box,
                identity, vault, envelope, contacts, session, mesh,
                chat, presenta, groups
  transportes/  transport, local, rtc, ble, invite, qr
  app/          app
  interfaz/     dom, theme, qr, lock, roster, chat, connect,
                settings, requests, privacidad, boot
```

- El **nucleo** no toca el DOM y no sabe que existe una pantalla. Por eso se
  puede probar entero en Node (`test/protocol.test.js` levanta cinco nodos y
  los hace hablar entre si).
- Los **transportes** hablan con la red y tampoco tocan el DOM.
- La **interfaz** no hace criptografia. Le pide las cosas a `app.js`.
- Si un fichero rompe su regla, esta en la carpeta equivocada. Y se nota, que
  es justo la gracia de que la carpeta lo diga.

### El orden de carga

Los ficheros se llamaban `00-ns.js`, `10-util.js`, `20-sha256.js`... porque el
build los concatenaba por orden de nombre: el orden iba escondido en el nombre.
Funcionaba, pero meter un fichero entre dos obligaba a renumerar, y `20` no le
decia a nadie que ahi dentro habia un SHA-256.

Ahora ese orden vive donde ya estaba a la vista: en las etiquetas `<script>` de
**`src/index.html`**, agrupadas por capa. Un solo sitio, y ademas el evidente.
Lo leen `tools/build.js` para concatenar y `test/load.js` para montar la
aplicacion en Node; si un fichero existe y nadie lo lista, la compilacion se
para y lo dice, en vez de dejarlo fuera en silencio.

Nada de frameworks, nada de dependencias en el resultado, nada de modulos ES:
se concatena y ya esta. Se puede leer de arriba abajo sin herramientas.

Anadir un transporte nuevo es escribir un fichero en `transportes/`, listarlo
en `index.html` y llamar a `transport.addPeer()` cuando consigas un enlace.
Nada mas.

Los estilos siguen la misma idea:

```
src/css/          (el orden de la cascada tambien lo dice index.html)
  tokens      color, tipografia y medidas de los dos acabados, en variables
  base        reposicion, tipografia, capas de acumulacion de luz
  layout      barra superior, escenario, paneles, portada, barra de estado
  components  botones, campos, etiquetas, avisos
  chat        la conversacion
  flourish    el acabado: sombras del de casa y cromado CRT del terminal
  themes      los otros siete temas, ocho lineas cada uno
```

### Aspecto

El tema de casa se llama **BINTIO** y es de escaparate: tinta casi negra, neon
de **cian** para lo que se pulsa y de **magenta** para lo que reclama, esquinas
suaves, sombras negras y un solo boton solido por pantalla. La tipografia del sistema para lo que se lee, y la monoespaciada
**solo** para lo que se copia, se dicta o se compara —claves, huellas y
codigos—, que es donde confundir un caracter cuesta caro. Nada se mueve salvo
dos puntos que respiran.

Ademas del tema hay un **acabado**, que es el juego de tipografia, medidas y
cromado que comparte una familia de temas. Solo hay dos y se ponen con
`data-skin` en `<html>`:

| acabado | quien lo lleva | como se ve |
| --- | --- | --- |
| `studio` | BINTIO, el de casa | plano, limpio, comercial |
| `terminal` | los otros siete | monoespaciada, versalitas, fosforo y corchetes |

Quien decide cual lleva cada tema es una lista de una linea en
`theme.js`, no la hoja de estilos. Si el atributo no esta, sale el de
casa: el acabado comercial es el suelo, no una opcion.

Todo el color de la interfaz sale de cuatro variables (`--ice`, `--ice-hot`,
`--ember`, `--deep`), asi que **un tema nuevo son ocho lineas** al final de
`themes.css`: los trazos, las luces, los degradados y el cromado se recolorean
solos. Vienen siete mas de serie: **Neon** (el rojo escarlata con todo el
cromado encendido, que era el de casa hasta esta version), **Hielo** (el azul
clinico original), Matrix, Brasa, Violeta, **Carbon** (sin efectos, para
pantallas malas y baterias justas) y **Papel** (claro y de mucho contraste).

Y tres niveles de efectos en Ajustes: completos, suaves y apagados. Nada se
apaga a mano regla por regla: los brillos van multiplicados por `--bloom`, los
barridos por `--sheen`, la neblina por `--haze`, las lineas de barrido por
`--scan` y el parpadeo es el nombre de animacion que hay en `--flicker`, asi
que "efectos apagados", los temas planos y `prefers-reduced-motion` los apagan
solos. La aplicacion sigue siendo exactamente la misma sin una sola de esas
luces.

#### El fondo de un `<select>` tiene que ser opaco

Es la unica regla de esta hoja que no se puede deducir mirandola, asi que va
escrita: **`select.input` lleva un `background-color` opaco a proposito** y el
tinte translucido de los demas campos se pinta encima como una capa mas de
`background-image`.

El motivo es que la lista ABIERTA de un desplegable no la pinta la hoja de
estilos: la pinta el navegador en una ventana aparte, fuera de la pagina, y de
la hoja solo se lleva una cosa, el `background-color` del `<select>`. El tinte
de los campos —`--field-bg`— esta pensado para dejar ver el panel oscuro de
detras. En esa ventana no hay panel detras, asi que se compone sobre SU fondo,
que es blanco, y la lista salia blanca con la letra clara dentro. Medido en el
tema de casa: `rgba(120,190,240,.05)` sobre blanco da `rgb(248,252,254)` contra
un texto `#f4faff`, o sea **1.02:1**. Ilegible. Pasaba en los siete temas
oscuros (1.02 a 1.14); con el fondo opaco quedan entre 15.6 y 18.3.

La regla de `select.input option` no bastaba: pinta las **filas**, no la
superficie de la ventana, y donde no hay ni una fila —el desplegable de idioma
estuvo vacio— la lista entera era esa superficie translucida. `color-scheme:
dark` tampoco basta: fija el fondo por defecto de esa ventana, pero el
`background-color` del `<select>` se pinta encima igual.

Cerrado no se nota: las capas de `background-image` **no** viajan a la ventana
emergente, y el color de fondo si.

---

## Que hace el build

`npm run build`:

1. Junta los 33 ficheros de JavaScript en uno y los minifica **renombrando
   funciones y variables** (terser, `mangle.toplevel`), con nombres **distintos
   en cada compilacion** (ver mas abajo). 315 KB -> 95 KB.
2. Junta los 7 de CSS en uno y los minifica.
3. Lo mete **todo dentro de un solo `index.html`**: los estilos, el codigo, el
   logo en PNG, el icono de iOS y el manifiesto con los suyos, todos como
   `data:`. El documento no pide un solo fichero a nadie, asi que
   la CSP se cierra al **hash sha256 de su propio codigo y de sus propios
   estilos**: nada mas puede ejecutarse ahi dentro.
4. **Minifica tambien el HTML**: fuera comentarios, fuera saltos de linea y
   fuera sangrado, con el CSS de dentro apretado igual que el de fuera. Lo
   unico que no toca es el interior de `<script>`, `<textarea>` y `<pre>`, y un
   espacio suelto entre dos etiquetas, que ese separa palabras. El documento
   publicado sale en **una sola linea y sin un solo comentario**.
5. Saca del logo **todos** los tamanos que hacen falta -la pestana, la
   instalacion, iOS, la interfaz y la tarjeta social- leyendo y escribiendo
   PNG a mano con el zlib que Node ya trae, sin una sola dependencia de
   dibujo. Y deja el trabajador de servicio con su lista y su version.
6. Escribe las cabeceras de seguridad como configuracion lista para publicar:
   `dist/_headers` (Netlify, Cloudflare Pages), `dist/.htaccess` (Apache) y
   `dist/nginx.conf`, mas `robots.txt`.

Los hashes de la CSP se calculan **sobre el documento ya minificado**, no sobre
el fuente: lo que tiene que cuadrar es lo que se publica. Si el minificador
tocara un byte de mas dentro de un `<style>` o un `<script>`, la politica lo
reflejaria en vez de romper la pagina en silencio.

Ya no hay integridad de subrecursos (SRI) porque **ya no hay subrecursos**: el
auditor de cabeceras lo dice tal cual y baja la nota de 125 a 120, que sigue
siendo A+. Es un cambio a mejor: SRI protege lo que llega de fuera, y aqui no
llega nada de fuera.

### Nada se llama igual dos veces

Cada compilacion cambia **los nombres de todo lo que se puede nombrar desde
fuera**: los `id` de las etiquetas del documento y los nombres de las variables
y funciones del JavaScript minificado.

```
build 1:   id="xw4ccsj"   id="n6gq1vj"   id="gs9rc54"
build 2:   id="s4kjn0u"   id="ynt70nz"   id="abdd6eg"
```

Esto no hace nada mas seguro por dentro, y conviene decirlo claro: no es una
defensa, es un peaje. Quien escriba una extension, un script o un bot que se
agarre a `#chat-lista` o a que la variable mas usada se llama `a`, se lo
encuentra roto en la version siguiente y tiene que rehacer el trabajo entero,
no retocarlo.

Lo de los ids ya se hacia. Lo de las variables no, y era el agujero: un
minificador reparte los nombres cortos **siempre igual** -a la variable mas
usada le toca `a`, a la siguiente `b`-, asi que es una funcion del codigo y dos
compilaciones del mismo codigo dan el mismo fichero. Ahora el abecedario con el
que se reparten esos nombres se **baraja con la semilla de la compilacion**, y
con el cambia el fichero entero.

Medido: no cuesta ni un byte en crudo -los nombres miden lo mismo, solo cambian
las letras- y 452 bytes comprimido, un 1,3%, que es lo que se pierde al no
poder ordenar las letras por frecuencia.

Las dos cosas salen de **una sola semilla**, y por eso la compilacion se puede
repetir byte a byte cuando hace falta:

```bash
BINTIO_IDSEED=ed8ca5358450e484f46e019ab5aec0e6 npm run build
```

Sin ella, la semilla es al azar y el build la escribe en pantalla para que se
pueda apuntar. Los hashes `sha256` de la CSP se recalculan solos, porque salen
del documento ya renombrado.

### Ficha, PWA y redes sociales

La pagina se presenta sola donde la peguen:

- **Buscadores**: titulo con la promesa, descripcion, autor, palabras clave,
  `robots` que deja indexar y pide vista previa grande, enlace canonico y
  `robots.txt`.
- **Redes sociales**: Open Graph y tarjeta grande de Twitter apuntando a
  `dist/social.png`, 1200x630 con el logo sobre el fondo de la aplicacion.
  Ninguna red ensena un SVG en una vista previa y muchas no entienden WebP:
  por eso todo sale en PNG. El nombre no se dibuja en la imagen, lo pone
  `og:title`, y ahi es texto de verdad.
- **Quien firma**: `xander.dice`, dicho de las tres formas que hacen falta
  porque cada maquina lee una distinta y ninguna lee las otras dos:
  `<link rel="me">` a Instagram, YouTube y Facebook (Mastodon y las
  herramientas de identidad), `article:publisher` (el rastreador de Meta) y un
  bloque `application/ld+json` con `sameAs` (Google y Bing). El bloque de datos
  lleva `type` a proposito: los hashes de la CSP se sacan buscando la etiqueta
  `<script>` pelada, asi que con atributo no entra en la firma del codigo y no
  necesita hash. Va en una sola linea porque el minificador no toca el cuerpo
  de un `<script>` y el documento entero tiene que caber en una.
  No hay `twitter:creator`: pide un nombre de usuario con arroba de X, no una
  direccion, y no existe ninguno. Inventarlo seria atribuir la pagina a otro.
- **Instalable (PWA)**: el manifiesto viaja **dentro del documento**, con sus
  iconos incrustados (192, y uno de 512 que hace ademas de recortable para
  Android), y al arrancar se rehace como `blob:` con `start_url`, `scope` e
  `id` absolutos.
  El trabajador de servicio guarda el documento entero: con el servidor
  apagado, la aplicacion sigue abriendo. Comprobado apagandolo.

#### Para que la vista previa salga, hay que decir el dominio

Esto no es un detalle: es el unico dato que le falta al proyecto para embeberse
bien, y sin el la mitad de las redes no ensenan imagen.

Las direcciones de las vistas previas salen relativas, que es lo correcto en
localhost, en el fichero suelto y en el escritorio. Pero **ninguna red resuelve
una direccion relativa**: la descartan sin avisar y sin error. Medido, red por
red: X, LinkedIn, Telegram y WhatsApp se quedan **sin imagen**; Facebook a veces
la resuelve y a veces no; solo Slack y Discord la resuelven siempre. Y como
Slack y Discord son las dos primeras donde uno prueba, el fallo pasa
desapercibido justo al comprobarlo.

Se arregla con un dato, y arregla las cuatro etiquetas de golpe (`og:url`,
`og:image`, `twitter:image` y el canonico) y ademas saca `sitemap.xml`:

```bash
BINTIO_URL=https://tu.dominio npm run build
```

Para no depender de que alguien se acuerde de la variable, lo estable es poner
el dominio una vez en `package.json`, que es el segundo sitio donde el build lo
busca, y entonces cualquier `npm run build` sale ya correcto:

```json
"homepage": "https://tu.dominio"
```

Mientras no haya dominio, el build hace dos cosas para no publicar mentiras:
quita `og:url` y el canonico en vez de dejarlos valiendo `"."` -son los dos que
nombran a la pagina, y un punto no nombra nada; sin ellos cada red usa la
direccion por la que llego, que es la buena- y deja `og:image` relativa, porque
relativa la entienden unos pocos y borrada no la entiende ninguno. Y
`npm run verify` lo avisa por escrito en vez de dar el visto bueno callando.

### Que audita npm run verify

66 comprobaciones sobre lo compilado, no sobre las intenciones: hashes que
cuadran, cero peticiones externas, cero rastreadores, sin `eval`, sin
manejadores ni estilos en linea, sin una sola via para convertir texto en HTML
(`innerHTML` y compania estan prohibidos y se comprueba), que el renombrado se
hizo de verdad, que el HTML sale en una linea y sin un solo comentario, y que
la ficha, el manifiesto, los iconos y la tarjeta social de 1200x630 estan donde
tienen que estar.

De la ficha social no comprueba solo que las etiquetas **existan**, que era el
agujero por donde se colaba el fallo de arriba: una compilacion con
`og:image="social.png"` y `og:url="."` pasaba la auditoria entera sin una
queja, y no se veia en ninguna red. Ahora mira que las direcciones esten
**enteras**: `og:url` y el canonico, o absolutos o ausentes; las dos imagenes
sociales diciendo lo mismo; y el bloque para buscadores leido de verdad con
`JSON.parse`, exigiendo que diga quien firma y que enlace los tres perfiles.
Si la imagen va relativa no falla -compilar sin dominio es legitimo- pero lo
dice con un `aviso`, que no cuenta como comprobacion pero se lee.

---

## Probarlo con 500 contactos

Una aplicacion de mensajeria con tres contactos no dice nada. Lo que se rompe
se rompe con quinientos, y hay dos herramientas para llegar ahi sin esperar a
tener quinientos amigos.

```bash
npm run seed     # fabrica 500 contactos y 8.000 mensajes: bintio-semilla.txt
npm run bench    # mide el nucleo sin navegador y dice donde duele
```

### El sembrador

`npm run seed` no mete una puerta trasera en la aplicacion. Fabrica una boveda
de verdad en Node —con claves X25519 reales, no bytes al azar— y la escribe en
el **mismo formato de copia de seguridad** que exporta la aplicacion, asi que
entra por la puerta de siempre: Ajustes no, sino la pantalla de acceso ->
**Restaurar copia**. El codigo que se ejecuta al importarla es el mismo que
usaria una copia tuya de verdad.

```bash
npm run seed -- --contactos 500 --mensajes 40 --pass carga1234
```

Luego, en la aplicacion: **Ya tengo una** -> **Restaurar copia**, se pega el
contenido de `bintio-semilla.txt` en el recuadro, la contrasena (`carga1234`
si no se cambio) y **Recuperar**.

> Cuidado: restaurar **sobreescribe** la boveda de ese navegador sin
> preguntar. Hazlo en un perfil o un navegador de pruebas, no donde tengas
> conversaciones de verdad.

Lo que el sembrador **no** finge, y esta dicho tambien en su cabecera y en su
salida: los mensajes no han viajado por la malla (se escriben directos, sin
sobres ni acuses reales), el trinquete tiene pares reales pero nadie ha
cifrado con ellos, y la bolsa de reenvio se deja vacia a proposito porque
sobres falsos ahi si se soltarian en la malla de verdad.

### Lo que se mide sin navegador

`npm run bench` cronometra las siete operaciones que el usuario sufre, en el
orden en que las sufre: PBKDF2 al abrir, alta de contactos, derivacion de
secretos con cache fria y caliente, sellar y abrir un sobre, **la curva del
emparejado con 10, 50, 100, 250 y 500 contactos**, el guardado completo de la
boveda con su tamano contra la cuota, y la reapertura.

De cada medida da minimo, mediana y numero de repeticiones. El minimo esta ahi
por una razon: en una maquina cargada la mediana se contamina, y el banco
avisa cuando sus propios numeros dejan de cuadrar entre si (sellar un sobre
tiene que costar lo que un par de claves mas un x25519; si no lo hace, la
maquina estaba ocupada y el numero de fiar es el minimo).

### Lo que hay que medir en el navegador

El nucleo es solo la mitad. Esto se pega en la consola (F12) con la boveda
sembrada ya abierta:

```js
function mide(nombre, veces, fn) {
    fn(0); var v = [];
    for (var i = 0; i < veces; i++) { var t = performance.now(); fn(i); v.push(performance.now() - t); }
    v.sort(function (a, b) { return a - b; });
    return { operacion: nombre, min: +v[0].toFixed(2),
             mediana: +v[Math.floor(v.length / 2)].toFixed(2), max: +v[v.length - 1].toFixed(2) };
}
var lista = BINTIO.chat.list();
console.table([
    mide('refreshRoster', 10, function () { BINTIO.ui.refreshRoster(); }),
    mide('chat.list (ordenar 500)', 20, function () { BINTIO.chat.list(); }),
    mide('abrir conversacion', 10, function () { BINTIO.ui.openChat(lista[0].contact.pk); }),
    mide('cambiar de conversacion', 20, function (i) { BINTIO.ui.openChat(lista[(i || 0) % 20].contact.pk); })
]);
console.log('boveda en disco:', (BINTIO.vault.sizeBytes() / 1048576).toFixed(2), 'MiB');
```

Y la medida que solo aparece con muchos contactos, la que hay que hacer
**antes de tocar nada mas** porque solo se paga una vez por sesion:

```js
var todos = BINTIO.contacts.all(), t = performance.now();
for (var i = 0; i < todos.length; i++) { BINTIO.contacts.secrets(todos[i]); }
console.log('derivar los ' + todos.length + ' secretos:', Math.round(performance.now() - t), 'ms');
```

### Lo que sale, y donde esta el techo de verdad

Medido en la aplicacion real (Chrome, escritorio) con 500 contactos, 500
conversaciones y 8.793 mensajes, boveda de 1,94 MiB:

| Operacion | Tiempo |
|---|---|
| Restaurar la copia entera (PBKDF2 + descifrar + parsear + pintar) | 278 ms |
| Repintar las 500 filas de la lista | 2,7 ms |
| Ordenar las 500 conversaciones | 0,1 ms |
| Abrir una conversacion de 40 mensajes | 5,0 ms |
| Cambiar de conversacion | 4,3 ms |
| **Derivar los 500 secretos (cache fria)** | **1.862 ms** |
| La misma pasada con la cache caliente | 0,12 ms |
| **Guardar la boveda entera** | **219 ms** |

La interfaz aguanta 500 contactos sin despeinarse: todo lo que se pinta esta
por debajo de los 16 ms que dan 60 imagenes por segundo. Los dos numeros
gordos no estan en el dibujo, estan debajo:

1. **El primer sobre ajeno tras desbloquear cuesta ~1,9 segundos.**
   `session.open` recorre todos los contactos y deriva el secreto de cada uno
   la primera vez (session.js:116 y contacts.js:34). Son 500 acuerdos
   X25519 en JavaScript puro, a 3,7 ms cada uno. Despues quedan cacheados y el
   mismo sobre cuesta 2,7 ms.
2. **Cada guardado reescribe la boveda entera.** Con 1,94 MiB son 219 ms, y
   `mesh.handleEnvelope` pide un guardado por **cada** sobre que pasa
   (mesh.js:162), agrupados en uno cada 400 ms. Con trafico de malla
   sostenido eso es medio segundo de cada segundo con el hilo bloqueado.

El banco lo dice sin rodeos: con 40 mensajes en **todas** las 500
conversaciones (20.000 en total) la boveda pide 8,96 MiB y **no cabe**. La
siembra por defecto se queda en 8.800 porque `--mensajes` es un tope y no una
media, y esa si cabe: 1,94 MiB.

El techo de almacenamiento son los 5 MiB tipicos de `localStorage`: con 500
contactos, la lista y sus trinquetes ya ocupan 1 MiB antes del primer mensaje,
y cada mensaje cuesta unos 341 bytes de cuota. Eso deja sitio para unos 12.000
mensajes. El sembrador lo calcula y avisa si la tirada pedida se pasa del 80%.

### Dejarlo limpio

Ajustes -> **Borrar todo de este aparato**. Borra la identidad, los contactos y
los mensajes de ese navegador y deja el aparato como si BINTIO no hubiera
estado nunca.

---

## Seguridad de lo que se sirve

`npm run audit` levanta el servidor, le pide la pagina y **puntua la respuesta
real** con las reglas publicadas del Observatorio de Mozilla. Ahora mismo:

```
 ok Content-Security-Policy      +10   estricta, con default-src 'none' y sin unsafe-*
 ok Proteccion contra marcos       0   protegido con frame-ancestors y X-Frame-Options
 ok X-Content-Type-Options         0   nosniff
 ok Referrer-Policy               +5   no-referrer
 ok HSTS                          +5   max-age 63072000, con subdominios
 ok Redireccion a https            0   http 301 -> https
 ok Integridad de subrecursos     +5   el unico script lleva integrity
 ok Cookies                        0   no pone ni una cookie
 ok Comparticion entre origenes    0   no comparte con nadie

  PUNTUACION 120   NOTA A+
  Cabeceras delatoras: ninguna
```

125 es el techo de esa escala, y los cinco que faltan son los de integridad de
subrecursos: no se pueden ganar sin subrecursos, y aqui no hay ninguno. Ademas van `Cross-Origin-Opener-Policy`,
`Cross-Origin-Resource-Policy`, `Cross-Origin-Embedder-Policy` y una
`Permissions-Policy` que solo nombra funciones reconocidas (una inventada haria
que el navegador se queje en la consola, que es justo la clase de cabecera rara
que no queremos). No se manda `Server`, ni `X-Powered-By`, ni el difunto
`X-XSS-Protection`.

Contra la inyeccion de codigo hay tres capas y no una:

1. **La CSP**: `default-src 'none'`, sin `unsafe-inline` ni `unsafe-eval`, y
   fijada al hash sha256 de su propio codigo y de sus propios estilos. No
   existe ningun otro script que el navegador vaya a ejecutar en esa pagina.
2. **El codigo**: la interfaz construye todo con `createElement` y
   `textContent`. No hay `innerHTML`, ni `document.write`, ni
   `insertAdjacentHTML`, ni `eval`. Un nombre de contacto o un mensaje recibido
   no pueden convertirse en etiquetas ni aunque la CSP no existiera.
3. **El hash**: si alguien cambia un byte del codigo por el camino, deja de
   cuadrar con el hash que declara la propia pagina y el navegador se niega a
   ejecutarlo. Esto no es teoria: paso durante el desarrollo y la aplicacion se
   quedo en blanco, que es exactamente lo que tiene que hacer.

> **Si sirves la pagina desde un servidor propio**, ese servidor no debe
> mandar su propia cabecera CSP: el navegador aplica todas las politicas a la
> vez y se queda con la interseccion, asi que un `script-src 'self'` de la
> cabecera anularia el permiso por hash del documento y la pagina se quedaria
> en blanco. `tools/serve.js` ya lo resuelve leyendo la politica del propio
> documento y mandando esa.

---

## El logo

Toda la imagen de la aplicacion sale de **un solo fichero**: `src/logo.webp`.
De ahi salen la pestana, el icono de instalacion, el de iOS, el de la ventana
de escritorio, el logo de la cabecera, el de la portada y la tarjeta que
ensenan las redes sociales. No hay ninguna otra imagen en el proyecto.

Con un paso en medio, y por una razon concreta: ese WebP es **con perdida**
(VP8 con el canal alfa aparte), y decodificar eso a mano son mil quinientas
lineas de bitstream. Un PNG, en cambio, se lee con el `zlib` que Node ya trae,
en sesenta lineas. Asi que el maestro que lee la compilacion es `src/logo.png`,
y de convertirlo se encarga el decodificador de WebP mejor probado que hay en
cualquier maquina: el navegador.

```bash
npm run logo        # y abre la direccion que te dice
```

Levanta una pagina en local que carga el WebP, lo pinta en un lienzo y devuelve
los pixeles. Se cierra sola. Solo hace falta cuando cambia el logo, y si te
olvidas, la compilacion se para: si `src/logo.webp` es mas nuevo que
`src/logo.png`, avisa en vez de publicar la aplicacion entera con el logo de
antes.

Los tamanos se sacan promediando **toda** el area de origen que cae en cada
pixel nuevo, no cogiendo el del medio: de 1254 a 32 hay un factor de cuarenta,
y muestrear a saltos se come los trazos finos. El color se promedia
multiplicado por su opacidad, que es lo que evita la orla oscura alrededor de
un logo con transparencia.

Y como cada icono viaja en base64 dentro de la pagina, el que escribe los PNG
elige el filtro que mejor le va a cada linea y tira el canal alfa cuando no hay
un solo pixel translucido. Son ciento cinco kilobytes menos en cada visita.

---

## Escritorio (Neutralino)

**No hace falta ejecutar nada aparte**: `npm run build` y `npm start` ya dejan
los ejecutables hechos en `dist/`. Los comandos sueltos existen para cuando solo
se quiere una de las dos cosas:

```bash
npm run desktop         # abre la ventana con lo que hay en dist/
npm run desktop:build   # solo empaqueta, sin arrancar nada
npm run build:web       # solo la web, sin tocar el escritorio
```

Compilar solo la web **no borra** los ejecutables, pero si los deja desfasados: el
`index.html` nuevo lleva otros ids y otros nombres de variables que el que va
dentro del `resources.neu` de al lado. La compilacion lo dice en voz alta y
recuerda el comando para rehacerlos. Esto costo un fallo de los buenos: la regla
de "que ficheros de dist/ son del escritorio" estaba escrita dos veces, y cuando
el empaquetador paso de `dist/bintio/` a dejar los ejecutables planos en `dist/`,
la copia que vivia en el compilador se quedo vieja y **cada compilacion de la web
se llevaba por delante los siete ejecutables y el paquete**. En silencio. Ahora la
regla vive en `tools/salida.js` y la leen los dos: no se puede desincronizar lo
que no esta duplicado.

El CLI de Neutralino es una dependencia del proyecto, asi que `npm install` ya
lo deja listo: no hay que instalar nada en global. Los binarios base de cada
sistema (unos 30 MB) se bajan solos la primera vez que hacen falta, y no se
vuelven a bajar. Si no hay red, el empaquetado avisa y **la compilacion de la
web sigue adelante igual**: nadie se queda sin poder trabajar porque falte una
descarga.

Ese CLI arrastra dos paquetes que npm da por muertos, y `npm install` lo
anunciaba a gritos cada vez. Los dos estan atados en `overrides`:

| Paquete | De donde venia | Que se hace |
|---|---|---|
| `glob@7` y su `inflight`, que pierde memoria | `@electron/asar@3` | subir `asar` a la 4, que ya no los usa (y de paso el `resources.neu` adelgaza 300 KB: la version nueva no guarda dos veces los ficheros identicos) |
| `yaeti`, sin mantener desde 2016 | `websocket`, para los eventos de `neu run` | relevarlo por `tools/parches/yaeti`, cien lineas sin dependencias que hacen lo mismo |

Ninguno de los dos toca lo que se publica: son del compilador, no de la
aplicacion. El dia que Neutralino actualice sus dependencias, se borran las dos
lineas de `overrides` y ya esta.

### La ventana no se recuerda a proposito

En `neutralino.config.json` la ventana lleva `"useSavedState": false`, y no es
una manía: con el valor de serie (`true`) Neutralino guarda la posicion y el
tamano al cerrar, en `.tmp/window_state.config.json` al lado del ejecutable, y
los vuelve a poner al abrir. El problema es **que hora los guarda**. Si se
cierra la aplicacion estando minimizada, lo que apunta es esto:

```json
{"width":237,"height":39,"x":-32000,"y":-32000, ...}
```

`-32000,-32000` es donde Windows aparca las ventanas minimizadas. A partir de
ahi, cada vez que se abre la aplicacion la ventana se coloca ahi: el proceso
arranca, la aplicacion funciona, y **no se ve nada**. Ni se puede arreglar
desde la propia aplicacion, porque no hay ventana que tocar, ni lo va a
encontrar nadie: el fichero esta en una carpeta oculta al lado del ejecutable.

Medido: cerrar sin tocar nada guarda `1120x760` y reabre bien; redimensionar y
cerrar guarda el tamano nuevo y reabre bien; **minimizar y cerrar deja la
ventana invisible para siempre**. Con `useSavedState` apagado, la ventana sale
donde dice esta configuracion -1120x760 y centrada- pase lo que pase, y un
fichero de estado ya envenenado se ignora sin mas.

Se pierde recordar el tamano entre sesiones. A cambio, la aplicacion siempre se
ve, que es bastante mas importante en un ejecutable suelto que se reparte por
ahi.

Todo queda dentro de `dist/`, al lado del `index.html` y del `sw.js`:

| Fichero | Sistema |
|---|---|
| `dist/bintio-win_x64.exe` | Windows |
| `dist/bintio-linux_x64` | Linux |
| `dist/bintio-linux_arm64`, `bintio-linux_armhf` | Linux ARM (Raspberry y compania) |
| `dist/bintio-mac_x64`, `bintio-mac_arm64`, `bintio-mac_universal` | macOS Intel, Apple Silicon y los dos en un binario |
| `dist/resources.neu` | la web empaquetada, que es lo que abren los ejecutables |
| `dist/bintio-release.zip` | todo lo anterior, listo para publicar |

Cada ejecutable necesita el `resources.neu` de al lado, y lo tiene al lado: se
reparte la carpeta entera o el zip, nunca el ejecutable suelto.

El paquete lleva dentro la web y **solo** la web: los ejecutables no se meten
dentro de si mismos aunque vivan en la misma carpeta. Y el trabajador de
servicio no guarda en el navegador nada que no sea la aplicacion, para que
publicar esa carpeta no le cuele dos megas y medio de `.exe` en la cache a quien
solo venia a leer.

La aplicacion de escritorio sirve `dist/` en un **puerto fijo, el 8788**, y eso
no es un detalle: la boveda vive en `localStorage`, que esta separado por
origen, y el origen incluye el puerto. Con el puerto aleatorio que trae
Neutralino de serie (`"port": 0`) la ventana de escritorio estrenaba almacen
vacio **en cada arranque** y perdia identidad, contactos y mensajes al cerrar.
Se vio en el disco: ocho origenes `http://localhost:5xxxx` distintos, uno por
cada vez que se abrio. Con el puerto fijo hay uno solo y los datos se quedan.

El precio: dos ventanas de escritorio a la vez ya no pueden servir las dos, y
la segunda carga lo que sirve la primera. Es lo normal en una aplicacion de
escritorio, y persistir los datos vale mucho mas que abrir dos ventanas.

El ejecutable de Windows sale con su ficha rellena (`applicationName`,
`description`, `author` y `copyright` del fichero de configuracion), asi que el
administrador de tareas lo llama **BINTIO** y no "A Neutralinojs application",
que es lo que pone Neutralino cuando esos campos estan vacios.

`neutralino.config.json` apunta a `dist/` con la API nativa desactivada: la
aplicacion es autosuficiente y no necesita permisos del sistema.

### El banco de trabajo

El CLI de Neutralino lleva la carpeta `bin/` escrita a fuego en su codigo: la
crea en `downloader.js`, lee de ella en `bundler.js` y ejecuta desde ella en
`runner.js`. No hay opcion de configuracion que la mueva. Ahi bajan los 30 MB
de binarios base de los siete sistemas, que no son de este proyecto y no
pintan nada dentro de el.

Y la salida tampoco puede caer dentro de `dist/` sin mas, porque `dist/` es
justo la carpeta que se empaqueta: cada compilacion se meteria dentro la
anterior, y un paquete de 400 KB acabaria pesando 15 MB.

Por eso el CLI **no se ejecuta en el proyecto**. `tools/desktop.js` le monta un
banco de trabajo en la carpeta de cache del usuario
(`%LOCALAPPDATA%intio
eutralino` en Windows, `~/.cache/bintio/neutralino` en
Linux, `~/Library/Caches/bintio/neutralino` en macOS) con una copia de la
configuracion y una copia de la web. Alli tiene su `bin/` y su `salida/`, y de
alli se traen los ejecutables a `dist/`.

Asi el proyecto se queda con `src/`, `test/`, `tools/` y `dist/`, los binarios
base se bajan una vez por usuario en vez de una por copia del proyecto, y
borrar el proyecto entero no obliga a volver a bajarlos.

Al leer `neutralino.config.json` hay que tener esto presente: sus rutas
(`/dist/`, `/salida/`, `/bin/neutralino.js`) son relativas **al banco**, no al
proyecto, porque el fichero se copia alli tal cual y es alli donde lo lee el
CLI.

Si publicas `dist/` en un servidor web, ten en cuenta que los ejecutables se
publican con ella. Puede ser justo lo que quieres -la pagina de descarga sirve
la aplicacion de escritorio desde la misma carpeta-; si no, borra los
`bintio-*`, el `resources.neu` y el zip antes de subir.

---

## Navegadores

| | Enlace directo | Bluetooth | Instalable | Lector QR |
|---|---|---|---|---|
| Chrome / Edge escritorio | si | si | si | si |
| Chrome Android | si | si | si | si |
| Firefox | si | no | si | pega el codigo |
| Safari / iOS | si | no | si | pega el codigo |
| Navegadores viejos | segun cual | no | no | pega el codigo |

Todo el codigo es ES5 (`var`, funciones normales, nada de flechas ni
plantillas). Donde falte algo, BINTIO lo dice en la primera pantalla en vez de
fallar a medias. Lo unico innegociable es un generador aleatorio seguro: sin
el, la aplicacion **no arranca**, porque cifrar con `Math.random()` seria
mentir.

---

## Licencia

MIT. Leelo, cambialo, monta tu propia red. Es tuyo.
