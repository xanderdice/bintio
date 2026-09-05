/* ==========================================================================
   Relevo de "yaeti", el ultimo paquete que quedaba dando aviso al instalar.

   La cadena era esta:

     @neutralinojs/neu  ->  websocket  ->  yaeti

   "neu run" abre la ventana de escritorio y habla con ella por un socket web;
   para eso websocket usa W3CWebSocket, y W3CWebSocket hereda de yaeti para
   tener addEventListener/dispatchEvent. yaeti se escribio en 2015, cuando Node
   no traia EventTarget, y su autor lo dio por muerto: npm lo anuncia en cada
   "npm install" con un aviso que no se puede quitar desde fuera.

   Node ya trae EventTarget, pero no sirve aqui: websocket lo usa como mezcla
   -"yaeti.EventTarget.call(this)" sobre un objeto que ya existe- y el nativo es
   una clase, que llamada asi revienta. De modo que el relevo tiene que ser el
   de siempre; son cien lineas sin una sola dependencia.

   Esto entra en su sitio por "overrides" en package.json, y solo se usa al
   compilar: no toca ni un byte de lo que se publica en dist/.

   Se comporta como el original (MIT, Inaki Baz Castillo) hasta en los detalles
   que parecen accidentes y no lo son:

     - El constructor no hace nada si el objeto YA sabe escuchar eventos.
     - dispatchEvent llama primero a on<tipo> y despues a los apuntados.
     - Los eventos propios llevan la marca _yaeti; a esos, y solo a esos, se
       les pone target y cancelable.
     - Devuelve false si alguien ha llamado a preventDefault.
   ========================================================================== */

function Event(type) {
    this.type = type;
    this.isTrusted = false;
    this._yaeti = true;
}

function EventTarget() {
    /* Un EventTarget de verdad -el del navegador, el de Node- ya trae esto
       puesto. Pisarlo seria peor que no hacer nada. */
    if (typeof this.addEventListener === 'function') { return; }

    this._listeners = {};
    this.addEventListener = anadir;
    this.removeEventListener = quitar;
    this.dispatchEvent = repartir;
}

Object.defineProperties(EventTarget.prototype, {
    listeners: { get: function () { return this._listeners; } }
});

function anadir(tipo, oyente) {
    if (!tipo || !oyente) { return; }

    var lista = this._listeners[tipo];
    if (lista === undefined) { this._listeners[tipo] = lista = []; }

    for (var i = 0; i < lista.length; i++) {
        if (lista[i] === oyente) { return; }        /* ya estaba */
    }
    lista.push(oyente);
}

function quitar(tipo, oyente) {
    if (!tipo || !oyente) { return; }

    var lista = this._listeners[tipo];
    if (lista === undefined) { return; }

    for (var i = 0; i < lista.length; i++) {
        if (lista[i] === oyente) { lista.splice(i, 1); break; }
    }
    if (lista.length === 0) { delete this._listeners[tipo]; }
}

function repartir(evento) {
    if (!evento || typeof evento.type !== 'string') {
        throw new Error('`event` must have a valid `type` property');
    }

    /* A los eventos de esta casa se les completa lo que el navegador daria
       hecho. A los de verdad no se les toca. */
    if (evento._yaeti) {
        evento.target = this;
        evento.cancelable = true;
    }

    var corta = false;
    try {
        evento.stopImmediatePropagation = function () { corta = true; };
    } catch (e) {}                                  /* evento ajeno y sellado */

    var lista = this._listeners[evento.type] || [];

    /* Primero el manejador suelto (onopen, onmessage, onclose, onerror), que
       es como lo hace el navegador y de lo que depende quien nos llama. */
    var suelto = this['on' + evento.type];
    if (typeof suelto === 'function') { suelto.call(this, evento); }

    /* La copia importa: un oyente puede quitar a otro mientras repartimos. */
    lista = lista.slice();
    for (var i = 0; i < lista.length; i++) {
        if (corta) { break; }
        lista[i].call(this, evento);
    }

    return !evento.defaultPrevented;
}

module.exports = { EventTarget: EventTarget, Event: Event };
