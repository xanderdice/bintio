/* ==========================================================================
   Las traducciones al ingles.

   Solo hay una tabla, y no dos: la clave ES el texto en espanol, tal y como
   esta escrito en el marcado y en el codigo (ver idioma.js). Asi que aqui no
   hay identificadores que descifrar; cada linea dice lo que sale en pantalla
   en un idioma y en el otro.

   COMO ANADIR O CORREGIR UNA

   La clave tiene que coincidir EXACTAMENTE con el espanol: mismos espacios,
   misma puntuacion. Si no coincide, no se encuentra y sale el espanol. Para no
   tener que adivinarlo:

       node test/frases.js        saca la lista de todo lo que hay que traducir
       node test/idioma.test.js   falla y dice que frase falta

   Lo que va entre llaves -{quien}, {n}- es un hueco que rellena el codigo. Se
   pueden mover de sitio: en ingles la frase puede tener otro orden y por eso
   son huecos con nombre y no trozos pegados.

   COMO ANADIR UN IDIOMA

   Otra clave al lado de "en" con la misma lista, y una linea mas en D.IDIOMAS
   (idioma.js). Nada mas: no hay nada mas que tocar.

   Fuera de ASCII no hay nada: las enes y los guiones largos van escapados para
   que el fichero no dependa de con que codificacion se guarde.
   ========================================================================== */

BINTIO.textos = {
    en: {
        '+ Contacto':
            '+ Contact',
        '+ Grupo':
            '+ Group',
        ', ni el desarrollador. Si tienes una Llave de Recuperacion o una copia de seguridad, vuelve atras y usa':
            ', not even the developer. If you have a Recovery Key or a backup, go back and use',
        ', y despues podras crear una identidad nueva desde el principio.':
            ', and afterwards you will be able to create a new identity from scratch.',
        '. Si la pierdes, pierdes los mensajes.':
            '. If you lose it, you lose the messages.',
        '0 KB':
            '0 KB',
        '1 persona sin a\u00f1adir. Pulsa para verla.':
            '1 person not added. Tap to see them.',
        ': desde una pagina web eso no se puede, y una camara apuntando a la pantalla se lo lleva todo igual.':
            ': a web page cannot do that, and a camera pointed at the screen gets everything anyway.',
        '; eso si recupera tu identidad.':
            '; that does bring your identity back.',
        'Abierto como fichero local: funciona, pero sin instalacion ni modo sin conexion.':
            'Opened as a local file: it works, but with no install and no offline mode.',
        'Abre tu identidad y entra en Conectar: el codigo te espera ahi.':
            'Open your identity and go to Connect: the code is waiting there.',
        'Abrir':
            'Open',
        'Ahora mismo llevas {n} sobres ajenos ({tam}) que no puedes leer.':
            'You are currently carrying {n} envelopes for other people ({tam}) that you cannot read.',
        'Ajustes':
            'Settings',
        'Ajustes guardados':
            'Settings saved',
        'Ajustes guardados. Habia {n} solicitud esperando':
            'Settings saved. There was {n} request waiting',
        'Ajustes guardados. Habia {n} solicitudes esperando':
            'Settings saved. There were {n} requests waiting',
        'Alguien te ha escrito sin que lo tuvieras a\u00f1adido. Su mensaje venia cifrado para tu clave y solo este aparato ha podido abrirlo. No entra en tus conversaciones hasta que tu lo aceptes.':
            'Someone wrote to you without being in your list. Their message was encrypted for your key and only this device could open it. It does not join your conversations until you accept.',
        'Apagados (mas bateria)':
            'Off (more battery)',
        'Aqui no hay sala ni servidor: un grupo es una lista que guarda tu aparato. Cada mensaje sale cifrado por separado para cada persona, asi que nadie de fuera sabe siquiera que este grupo existe.':
            'There is no room and no server here: a group is a list your device keeps. Every message goes out encrypted separately for each person, so nobody outside even knows this group exists.',
        'Aqui no hay servidor ni copia en la nube:':
            'There is no server and no copy in the cloud:',
        'Aqui no viene texto: lo que escribio no cabia en una presentacion. Su mensaje viaja aparte y aparece entero en la conversacion al aceptarla.':
            'No text here: what they wrote did not fit in an introduction. Their message travels separately and appears in full in the conversation once you accept.',
        'Aspecto':
            'Appearance',
        'Avisar de que estas escribiendo':
            'Show when you are typing',
        'Avisar de que has recibido y leido. Quitalo si prefieres no decir cuando estas.':
            'Tell people when you have received and read. Turn it off if you would rather not say when you are around.',
        'Ayer':
            'Yesterday',
        'A\u00f1adido a tus conversaciones. Su huella sigue sin comparar: hazlo en Ficha antes de fiarte.':
            'Added to your conversations. Their fingerprint is still unchecked: do it under Details before you trust it.',
        'BINTIO':
            'BINTIO',
        'BINTIO - mensajes cifrados que no pasan por ningun servidor':
            'BINTIO - encrypted messages that pass through no server',
        'BINTIO no pide telefono, ni correo, ni nombre real. Tu identidad es una clave que se genera aqui dentro y no sale nunca de este aparato.':
            'BINTIO asks for no phone number, no email, no real name. Your identity is a key generated in here that never leaves this device.',
        'BINTIO no puede funcionar aqui, y prefiere decirtelo a fingir:':
            'BINTIO cannot work here, and would rather tell you than pretend:',
        'Bintio (por defecto)':
            'Bintio (default)',
        'Bluetooth: {motivo}':
            'Bluetooth: {motivo}',
        'Borrado. Este aparato ya no sabe nada de ti.':
            'Erased. This device no longer knows anything about you.',
        'Borrar conversacion':
            'Delete conversation',
        'Borrar toda la conversacion de este aparato? No se puede deshacer.':
            'Delete this whole conversation from this device? This cannot be undone.',
        'Borrar todo de este aparato':
            'Erase everything from this device',
        'Brasa':
            'Ember',
        'Buscar por Bluetooth':
            'Search over Bluetooth',
        'Cada mensaje sale cifrado por separado para cada persona. Un mensaje pone "leido" solo cuando lo han leido todos.':
            'Every message goes out encrypted separately for each person. A message says "read" only when everyone has read it.',
        'Camino abierto. Lo que tuvieras sin salir sale ahora.':
            'Path open. Anything waiting to go out is going now.',
        'Carbon (sin efectos)':
            'Carbon (no effects)',
        'Cerrado. Hace falta la contrase\u00f1a para volver a entrar.':
            'Locked. The password is needed to get back in.',
        'Cerrar':
            'Lock',
        'Clave de encuentro (opcional)':
            'Meeting key (optional)',
        'Clave de encuentro (solo si os la habeis puesto)':
            'Meeting key (only if you agreed on one)',
        'Codigo QR con tu invitacion':
            'QR code with your invitation',
        'Codigo QR con tu respuesta':
            'QR code with your answer',
        'Codigo QR con tu tarjeta de contacto':
            'QR code with your contact card',
        'Como lo llamas tu':
            'What you call them',
        'Como quieres que te vean':
            'How you want to be seen',
        'Comparad esta huella en persona o por telefono. Si coincide, nadie se ha colado en medio. Es la unica comprobacion que de verdad importa.':
            'Compare this fingerprint in person or over the phone. If it matches, nobody has slipped in between. It is the only check that really matters.',
        'Compartir':
            'Share',
        'Completos':
            'Full',
        'Comprobando el aparato':
            'Checking the device',
        'Con clave, el codigo va cifrado: si viaja por un chat y alguien lo intercepta, no le sirve de nada. Dile la clave por otra via, no en el mismo mensaje. Ense\u00f1ando el QR en persona no hace falta.':
            'With a key, the code travels encrypted: if it goes through a chat and someone intercepts it, it is useless to them. Tell them the key by another route, not in the same message. Showing the QR in person makes it unnecessary.',
        'Con esto puesto, cualquiera que tenga tu codigo puede mandarte un primer mensaje y te llega como solicitud, con su nombre y su huella, para que aceptes o descartes. Sin esto -que es como viene- para escribirte hay que estar en tu lista: tienes que a\u00f1adirlo tu antes. Ojo: ese primer mensaje no va autenticado, asi que el nombre lo pone quien escribe hasta que compruebes la huella.':
            'With this on, anyone holding your code can send you a first message and it arrives as a request, with their name and fingerprint, for you to accept or discard. Without it -which is how it ships- writing to you requires being in your list: you have to add them first. Careful: that first message is not authenticated, so the name is whatever the sender types until you check the fingerprint.',
        'Con la Llave de Recuperacion vuelves a ser la misma persona en otro aparato, aunque el anterior este en el fondo del mar. Con una copia de seguridad completa recuperas ademas las conversaciones.':
            'With the Recovery Key you become the same person again on another device, even if the old one is at the bottom of the sea. With a full backup you also get the conversations back.',
        'Conectado por Bluetooth a {quien}':
            'Connected over Bluetooth to {quien}',
        'Conectar':
            'Connect',
        'Contacto':
            'Contact',
        'Contacto eliminado':
            'Contact removed',
        'Contactos':
            'Contacts',
        'Contactos ':
            'Contacts ',
        'Contrase\u00f1a':
            'Password',
        'Contrase\u00f1a (la nueva, o la de la copia)':
            'Password (the new one, or the backup\'s)',
        'Conversacion borrada':
            'Conversation deleted',
        'Conversaciones':
            'Conversations',
        'Copia descargada':
            'Backup downloaded',
        'Copia restaurada':
            'Backup restored',
        'Copiado':
            'Copied',
        'Copialo a mano desde el recuadro':
            'Copy it by hand from the box',
        'Copiar':
            'Copy',
        'Copias y recuperacion':
            'Backups and recovery',
        'Crear grupo':
            'Create group',
        'Crear identidad':
            'Create identity',
        'Crear tu identidad':
            'Create your identity',
        'Dejar que te escriban sin tenerlos a\u00f1adidos':
            'Let people write to you without adding them first',
        'Desaparecen para siempre:':
            'Gone for good:',
        'Descargar copia cifrada':
            'Download encrypted backup',
        'Descartada. No se guarda nada suyo. Si vuelve a escribir, saldra otra vez.':
            'Discarded. Nothing of theirs is kept. If they write again, it will show up again.',
        'Disco':
            'Disk',
        'Disco ':
            'Disk ',
        'El grupo necesita un nombre':
            'The group needs a name',
        'El nombre se lo pone quien escribe: puede poner el que quiera y no se comprueba. La huella si se comprueba, y es lo unico que se comprueba. Las horas son las de llegada a este aparato, no las que venian escritas dentro del sobre.':
            'The name is whatever the sender types: they can put anything and it is not checked. The fingerprint is checked, and it is the only thing that is. Times are when it arrived on this device, not what was written inside the envelope.',
        'Elige a quien quieras. Todos veran el nombre del grupo y quien esta dentro.':
            'Pick whoever you like. Everyone will see the group name and who is in it.',
        'Elige un nodo de la lista del navegador...':
            'Pick a node from the browser\'s list...',
        'Eliminar contacto':
            'Remove contact',
        'Eliminar el contacto y su conversacion? Se le avisara de que ya no hay vinculo, para que no siga escribiendote sin saberlo.':
            'Remove the contact and their conversation? They will be told the link is gone, so they do not keep writing to you without knowing.',
        'Empezar de cero':
            'Start from scratch',
        'Empezar de cero?':
            'Start from scratch?',
        'En este grupo esta {quien}, pero no lo tienes anadido: lo que escribas aqui no le llegara, y sus acuses no te llegaran a ti. Anadelo desde + Contacto y el grupo se completa solo.':
            '{quien} is in this group, but you have not added them: what you write here will not reach them, and their receipts will not reach you. Add them from + Contact and the group completes itself.',
        'Enlace abierto con {quien}. Lo que tuvieras sin salir sale ahora.':
            'Link open with {quien}. Anything waiting to go out is going now.',
        'Enlaces':
            'Links',
        'Enlaces ':
            'Links ',
        'Ense\u00f1ale esto ahora a {quien}':
            'Show this to {quien} now',
        'Ense\u00f1aselo a la otra persona, o pasaselo por donde quieras. Al leerlo te a\u00f1ade y le sale una respuesta: escanea esa respuesta aqui abajo y el camino queda abierto. Son dos pasos porque no hay ningun servidor que lleve el segundo por vosotros.':
            'Show it to the other person, or send it however you like. Reading it adds you and gives them an answer: scan that answer below and the path is open. It is two steps because there is no server to carry the second one for you.',
        'Enviar':
            'Send',
        'Enviar acuses de recibo':
            'Send read receipts',
        'Esa llave no es valida (mira si falta algun caracter)':
            'That key is not valid (check whether a character is missing)',
        'Esa solicitud ya no esta':
            'That request is gone',
        'Escanea el QR que te ense\u00f1en, o pega el codigo que te pasen. Vale cualquiera de los tres (invitacion, respuesta o tarjeta): BINTIO sabe cual es y hace lo que toca.':
            'Scan the QR they show you, or paste the code they send. Any of the three works (invitation, answer or card): BINTIO knows which it is and does the right thing.',
        'Escanear su QR':
            'Scan their QR',
        'Escribe. Nadie mas lo vera.':
            'Write. Nobody else will see it.',
        'Escribela en papel. No le hagas una foto.':
            'Write it down on paper. Do not photograph it.',
        'Ese codigo lleva clave de encuentro: escribela abajo y vuelve a darle':
            'That code carries a meeting key: type it below and try again',
        'Esta ventana no sale en ninguna captura ni grabacion de pantalla: lo impide Windows, no la pagina. Ademas tapa la conversacion cuando la ventana deja de estar delante y quita el menu del boton derecho. Una camara apuntando a la pantalla se lo lleva todo igual.':
            'This window does not appear in any screenshot or screen recording: Windows blocks it, not the page. It also covers the conversation when the window stops being in front, and removes the right-click menu. A camera pointed at the screen still gets everything.',
        'Este aparato':
            'This device',
        'Este navegador no tiene Web Bluetooth. En Android usa Chrome; en iPhone todavia no existe.':
            'This browser has no Web Bluetooth. On Android use Chrome; on iPhone it does not exist yet.',
        'Este navegador no tiene WebRTC, asi que no puede abrir un enlace directo.':
            'This browser has no WebRTC, so it cannot open a direct link.',
        'Esto borra la identidad, los contactos y todos los mensajes de este aparato. Sin la Llave de Recuperacion no hay vuelta atras. Seguro?':
            'This erases the identity, the contacts and every message on this device. Without the Recovery Key there is no way back. Sure?',
        'Ficha':
            'Details',
        'Grupo':
            'Group',
        'Grupo creado. Lo sabran cuando escribas el primer mensaje.':
            'Group created. They will find out when you write the first message.',
        'Grupo vacio. Lo que escribas sale cifrado por separado para cada persona.':
            'Empty group. What you write goes out encrypted separately for each person.',
        'Guardado':
            'Saved',
        'Guardado, pero no hay ningun enlace: saldra solo en cuanto conectes con alguien. Pulsa Conectar.':
            'Saved, but there is no link: it will go out on its own as soon as you connect with someone. Press Connect.',
        'Guardado. El cambio les llega con el siguiente mensaje.':
            'Saved. The change reaches them with the next message.',
        'Guardar':
            'Save',
        'Guardar nombre':
            'Save name',
        'Han compartido un codigo contigo: revisalo y pulsa Usar codigo':
            'Someone shared a code with you: check it and press Use code',
        'Has salido del grupo':
            'You left the group',
        'He comparado la huella y coincide':
            'I compared the fingerprint and it matches',
        'Hielo':
            'Ice',
        'Hoy':
            'Today',
        'Identidad creada. Guarda tu Llave de Recuperacion desde Ajustes.':
            'Identity created. Save your Recovery Key from Settings.',
        'Identidad recuperada. Los contactos hay que volver a a\u00f1adirlos.':
            'Identity recovered. Contacts have to be added again.',
        'Idioma':
            'Language',
        'La Llave de Recuperacion es tu identidad en 56 caracteres. Escribela en papel y guardala lejos del aparato. Quien la tenga puede hacerse pasar por ti.':
            'The Recovery Key is your identity in 56 characters. Write it on paper and keep it away from the device. Whoever holds it can impersonate you.',
        'La contrase\u00f1a cifra todo lo que se guarda.':
            'The password encrypts everything that is stored.',
        'La contrase\u00f1a necesita ocho caracteres':
            'The password needs eight characters',
        'La contrase\u00f1a necesita ocho caracteres como minimo':
            'The password needs at least eight characters',
        'La malla':
            'The mesh',
        'Las dos contrase\u00f1as no coinciden':
            'The two passwords do not match',
        'Llave de Recuperacion, o copia de seguridad completa':
            'Recovery Key, or full backup',
        'Llevar mensajes de otros':
            'Carry other people\'s messages',
        'Lo que aceptes aparece en tus conversaciones.':
            'Whatever you accept shows up in your conversations.',
        'Lo que te escribe:':
            'What they wrote:',
        'Luz y efectos':
            'Light and effects',
        'Marca esto solo si lo has comprobado por un canal distinto a este.':
            'Tick this only if you checked it through a channel other than this one.',
        'Matrix':
            'Matrix',
        'Mensaje de {quien}':
            'Message from {quien}',
        'Mensajes cifrados de punta a punta que no pasan por ningun servidor. Solo tu aparato y el de la otra persona.':
            'End-to-end encrypted messages that pass through no server. Just your device and the other person\'s.',
        'Mientras tecleas, la otra persona lo ve. No se guarda en ninguna parte y caduca en segundos, pero es un aviso cada cuatro mientras escribes; en un grupo, uno por miembro.':
            'While you type, the other person sees it. It is stored nowhere and expires in seconds, but it is one notice every four seconds while you write; in a group, one per member.',
        'Mirando por donde puede salir este aparato. Un segundo.':
            'Looking for a way out of this device. One moment.',
        'Mochila':
            'Backpack',
        'Mochila ':
            'Backpack ',
        'Mochila vaciada':
            'Backpack emptied',
        'Nadie puede recuperarla':
            'Nobody can recover it',
        'Neon (rojo)':
            'Neon (red)',
        'No hay nada que copiar todavia':
            'There is nothing to copy yet',
        'No impide una captura':
            'It does not prevent a screenshot',
        'No queda ninguna solicitud.':
            'No requests left.',
        'No se ha abierto el enlace con {quien}. Esa respuesta puede ser de una sesion anterior: pidele que te ense\u00f1e su codigo otra vez.':
            'The link with {quien} did not open. That answer may be from an earlier session: ask them to show you their code again.',
        'No, volver':
            'No, go back',
        'Nombre del grupo':
            'Group name',
        'Nombre guardado':
            'Name saved',
        'Nombre visible':
            'Visible name',
        'Nuevo grupo':
            'New group',
        'O pega aqui su codigo':
            'Or paste their code here',
        'Pantalla protegida':
            'Protected screen',
        'Papel (claro)':
            'Paper (light)',
        'Parar':
            'Stop',
        'Pega la llave o la copia':
            'Paste the key or the backup',
        'Pega primero un codigo, o escanea su QR':
            'Paste a code first, or scan their QR',
        'Ponte algun nombre':
            'Give yourself a name',
        'Preparando el codigo...':
            'Preparing the code...',
        'Preparando tu codigo':
            'Preparing your code',
        'Prueba con Firefox, Chrome, Edge o Safari en una version de los ultimos diez anos.':
            'Try Firefox, Chrome, Edge or Safari in a version from the last ten years.',
        'Pulsa':
            'Press',
        'Quien esta dentro':
            'Who is in',
        'Quieren escribirte':
            'Someone wants to write to you',
        'Quieren escribirte. Lo tienes arriba, en Conversaciones.':
            'Someone wants to write to you. It is at the top, under Conversations.',
        'Recibido en este aparato: {cuando}':
            'Received on this device: {cuando}',
        'Recuperar':
            'Recover',
        'Rehacer con esta clave':
            'Redo with this key',
        'Rehaciendo tu codigo con clave. Dile la clave por otra via, no en el mismo mensaje.':
            'Redoing your code with a key. Tell them the key by another route, not in the same message.',
        'Rehaciendo tu codigo sin clave.':
            'Redoing your code without a key.',
        'Repitela':
            'Repeat it',
        'Respuesta aceptada. Comprobando el enlace con {quien}...':
            'Answer accepted. Checking the link with {quien}...',
        'Restaurar copia':
            'Restore backup',
        'Salir del grupo':
            'Leave group',
        'Salir del grupo? Se borra de este aparato con su conversacion. Los demas no reciben ningun aviso.':
            'Leave the group? It is deleted from this device along with its conversation. The others get no notice.',
        'Se presenta con este nombre. Lo escribe quien manda y no lo comprueba nadie.':
            'They introduce themselves with this name. The sender types it and nobody checks it.',
        'Segundo y ultimo paso. En cuanto lea esta respuesta, el camino queda abierto por los dos lados y no hace falta ningun codigo mas. Si no puede escanear, copiala y pasasela.':
            'Second and last step. As soon as they read this answer, the path is open both ways and no further code is needed. If they cannot scan, copy it and send it to them.',
        'Servidor STUN (opcional, vacio = ninguno)':
            'STUN server (optional, empty = none)',
        'Si cerca hay un nodo BINTIO de verdad (la version de escritorio, un movil con la aplicacion nativa o un cacharro con el perfil), engancharse a el abre camino sin pasarse nada. Dos pesta\u00f1as de navegador no se ven asi: ningun navegador puede anunciarse por Bluetooth.':
            'If there is a real BINTIO node nearby (the desktop version, a phone with the native app or a gadget with the profile), hooking onto it opens a path without exchanging anything. Two browser tabs cannot see each other this way: no browser can advertise itself over Bluetooth.',
        'Si, borrar todo y empezar de cero':
            'Yes, erase everything and start from scratch',
        'Sin STUN funcionan la red local, el cable y compartir datos desde el movil. Con uno, tambien enlaces a traves de internet, a cambio de que ese servidor vea que dos direcciones IP se buscan. Tu decides; por defecto no hay ninguno.':
            'Without STUN, the local network, a cable and phone tethering all work. With one, links across the internet work too, at the cost of that server seeing that two IP addresses are looking for each other. Your call; by default there is none.',
        'Sin Web Bluetooth: no podras engancharte a nodos por Bluetooth desde este navegador.':
            'No Web Bluetooth: you will not be able to hook onto nodes over Bluetooth from this browser.',
        'Sin WebRTC: no habra enlace directo, pero si malla y tarjetas.':
            'No WebRTC: there will be no direct link, but the mesh and cards still work.',
        'Sin almacenamiento: lo que hagas se perdera al cerrar la pestana.':
            'No storage: whatever you do will be lost when you close the tab.',
        'Sin codigos: Bluetooth':
            'No codes: Bluetooth',
        'Sin vinculo todavia: no ha llegado nada suyo. Hasta que te anada, no puede abrir lo que le escribas.':
            'No link yet: nothing of theirs has arrived. Until they add you, they cannot open what you write.',
        'Solicitud':
            'Request',
        'Soltar todos los sobres ajenos que llevas? Algunos mensajes de otras personas podrian no llegar.':
            'Drop every envelope you are carrying for others? Some people\'s messages might not arrive.',
        'Su codigo':
            'Their code',
        'Su huella. Esto si esta comprobado: quien ha mandado la solicitud tiene la clave privada de esta huella, asi que nadie puede presentarse con la huella de otro. Lo que la huella no dice es de quien es: para eso tienes que compararla con la persona, por telefono o en persona.':
            'Their fingerprint. This part is verified: whoever sent the request holds the private key for this fingerprint, so nobody can introduce themselves with someone else\'s. What the fingerprint does not say is whose it is: for that you have to compare it with the person, by phone or face to face.',
        'Suaves':
            'Soft',
        'Tapa la conversacion en cuanto la ventana deja de estar delante, quita el menu del boton derecho y, si pulsas Impr Pant, borra lo que quede en el portapapeles.':
            'Covers the conversation as soon as the window stops being in front, removes the right-click menu and, if you press Print Screen, wipes whatever is left on the clipboard.',
        'Te ha quitado de sus contactos. Lo que le escribas ya no lo puede abrir.':
            'They removed you from their contacts. They can no longer open what you write.',
        'Te lo a\u00f1ade como contacto, pero no conecta: falta un codigo de los de arriba':
            'It adds them as a contact, but does not connect: one of the codes above is still missing',
        'Tema':
            'Theme',
        'Todavia no conoces a nadie.':
            'You do not know anyone yet.',
        'Todavia no ha llegado nada de {quien}. Anadir a alguien va en una sola direccion: hasta que {quien} te tenga a ti, no puede abrir lo que le escribas. Si le pasaste tu codigo, tiene que devolverte su respuesta; si le anadiste tu con su codigo, pasale el tuyo.':
            'Nothing from {quien} has arrived yet. Adding someone goes one way only: until {quien} has you, they cannot open what you write. If you gave them your code, they have to send you their answer back; if you added them with their code, give them yours.',
        'Todavia no hay nada. Lo que escribas aqui solo lo puede leer esta persona.':
            'Nothing here yet. What you write can only be read by this person.',
        'Todavia no tienes a nadie. Un grupo se hace con gente que ya has anadido.':
            'You have nobody yet. A group is made of people you have already added.',
        'Todavia se esta preparando':
            'Still getting ready',
        'Todo listo.':
            'All set.',
        'Tu aparato guarda y reparte sobres ajenos que no puede leer. Es lo que hace que un mensaje llegue a alguien que estaba apagado. Si lo quitas, tu si usaras la malla pero no la sostendras.':
            'Your device stores and passes on other people\'s envelopes, which it cannot read. That is what gets a message to someone whose device was off. If you turn it off, you will use the mesh but not hold it up.',
        'Tu codigo para conectar':
            'Your code to connect',
        'Tu codigo ya lleva esa clave':
            'Your code already carries that key',
        'Tu codigo ya va sin clave':
            'Your code already goes without a key',
        'Tu huella. Quien te la lea puede comprobar que habla contigo y no con un impostor.':
            'Your fingerprint. Whoever reads it can check they are talking to you and not to an impostor.',
        'Tu identidad':
            'Your identity',
        'Tu navegador no deja descargar. Copia el texto a mano.':
            'Your browser does not allow downloads. Copy the text by hand.',
        'Tu navegador no puede generar numeros aleatorios seguros.':
            'Your browser cannot generate secure random numbers.',
        'Tu navegador no tiene Uint8Array (es de antes de 2011).':
            'Your browser has no Uint8Array (it is from before 2011).',
        'Tu tarjeta de contacto':
            'Your contact card',
        'Tu: ':
            'You: ',
        'Ultima oportunidad. Borrar de verdad?':
            'Last chance. Really erase?',
        'Un grupo necesita al menos a una persona mas':
            'A group needs at least one more person',
        'Usar el codigo pegado':
            'Use the pasted code',
        'Vaciar la mochila':
            'Empty the backpack',
        'Vas a borrar de este aparato':
            'You are about to erase from this device',
        'Ver la conversacion':
            'View the conversation',
        'Ver la llave':
            'Show the key',
        'Vinculado: te tiene anadido, asi que lo que le escribas lo puede abrir.':
            'Linked: they have you added, so they can open what you write.',
        'Violeta':
            'Violet',
        'Volver':
            'Back',
        'Volver a mi codigo':
            'Back to my code',
        'Ya tengo una':
            'I already have one',
        'Ya tienes a {quien}. Falta un paso: ense\u00f1ale la respuesta de arriba.':
            'You already have {quien}. One step left: show them the answer above.',
        'ahora':
            'now',
        'algo que solo sepais los dos':
            'something only the two of you know',
        'alguien':
            'someone',
        'entregado':
            'delivered',
        'entregado {d} de {n}':
            'delivered to {d} of {n}',
        'enviado':
            'sent',
        'error':
            'error',
        'escribiendo...':
            'typing...',
        'huella comprobada':
            'fingerprint checked',
        'leido':
            'read',
        'leido {r} de {n}':
            'read by {r} of {n}',
        'nadie puede devolvertelo':
            'nobody can give it back to you',
        'no':
            'no',
        'no lo tienes anadido: sigue en el grupo, pero no puedes escribirle':
            'you have not added them: still in the group, but you cannot write to them',
        'ok':
            'ok',
        'si':
            'yes',
        'sin enlaces':
            'no links',
        'sin guardar en disco':
            'not saved to disk',
        'sin salir':
            'not sent',
        'stun:ejemplo.org:3478':
            'stun:example.org:3478',
        'todo lo que BINTIO guarda':
            'everything BINTIO stores',
        'un grupo':
            'a group',
        'y pasale tu codigo a alguien.':
            'and give your code to someone.',
        '{motivo} Con esta tarjeta pueden a\u00f1adirte y comprobar tu huella, pero NO abre camino de red: lo que os escribais se quedara guardado y sin salir hasta que aparezca un enlace por Bluetooth, por la malla o desde otro aparato.':
            '{motivo} With this card they can add you and check your fingerprint, but it opens NO network path: whatever you write each other stays stored and unsent until a link appears over Bluetooth, through the mesh or from another device.',
        '{n} bluetooth':
            '{n} bluetooth',
        '{n} d':
            '{n} d',
        '{n} directo':
            '{n} direct',
        '{n} h':
            '{n} h',
        '{n} local':
            '{n} local',
        '{n} min':
            '{n} min',
        '{n} personas':
            '{n} people',
        '{n} personas sin a\u00f1adir. Pulsa para verlas.':
            '{n} people not added. Tap to see them.',
        '{n} personas, sin nada escrito todavia':
            '{n} people, nothing written yet',
        '{quien} en {grupo}':
            '{quien} in {grupo}',
        '{quien} esta escribiendo...':
            '{quien} is typing...',
        '{quien} te ha quitado de sus contactos. Lo que escribas aqui saldra del aparato, pero {quien} ya no lo puede abrir: para eso tendria que volver a anadirte. Lo que ya os disteis sigue aqui; si no lo quieres, borra la conversacion desde Ficha.':
            '{quien} removed you from their contacts. What you write here will leave the device, but {quien} can no longer open it: for that they would have to add you again. What you already exchanged is still here; if you do not want it, delete the conversation from Details.',
        '\u2014 Los sobres de otros que llevabas en la mochila y tus ajustes.':
            '\u2014 The envelopes for other people in your backpack, and your settings.',
        '\u2014 Todas las conversaciones y todos los mensajes, tuyos y de los demas.':
            '\u2014 Every conversation and every message, yours and everyone else\'s.',
        '\u2014 Tu identidad y tu clave. La persona que eras en BINTIO deja de existir: quien te tuviera anadido ya no podra escribirte.':
            '\u2014 Your identity and your key. The person you were on BINTIO stops existing: anyone who had you added will no longer be able to write to you.',
        '\u2014 Tus contactos y tus grupos.':
            '\u2014 Your contacts and your groups.'
    }
};
