/* ==========================================================================
   Transporte BLUETOOTH (Web Bluetooth, papel de central).

   LO QUE HACE: se conecta a cualquier nodo BINTIO que anuncie el servicio de
   abajo, y a partir de ahi mueve sobres igual que cualquier otro transporte.
   Un movil puede asi apoyarse en un portatil, en un nodo fijo o en cualquier
   cacharro que implemente este perfil para alcanzar a alguien que no ve.

   LO QUE NO PUEDE HACER, Y HAY QUE DECIRLO: un navegador NO puede anunciarse
   como periferico. Esa capacidad no existe en la plataforma web, en ninguno.
   Por eso dos pestanas de navegador nunca se veran por Bluetooth entre si;
   hace falta que uno de los dos extremos sea un periferico de verdad: la
   version de escritorio con el puente nativo, un movil con la app nativa o
   un cacharro tipo ESP32 con este mismo perfil.

   PERFIL GATT DE BINTIO (implementalo y tu cacharro es parte de la malla):
     Servicio   d1e4a2c0-7b31-4f6e-9a55-1c0de1a70001
       RX       d1e4a2c0-7b31-4f6e-9a55-1c0de1a70002  escritura  central -> nodo
       TX       d1e4a2c0-7b31-4f6e-9a55-1c0de1a70003  notificar  nodo -> central

   Trozos, porque un paquete BLE es diminuto:
     byte 0-1  identificador de mensaje (16 bits)
     byte 2-3  numero de trozo; el bit alto marca "ultimo"
     byte 4..  datos
   ========================================================================== */
(function (V) {
    'use strict';
    var U = V.util, T = V.transport;
    var B = V.transport.ble = {};

    B.SERVICE = 'd1e4a2c0-7b31-4f6e-9a55-1c0de1a70001';
    B.RX = 'd1e4a2c0-7b31-4f6e-9a55-1c0de1a70002';
    B.TX = 'd1e4a2c0-7b31-4f6e-9a55-1c0de1a70003';

    var CHUNK = 116;            /* datos por trozo; cabe en un MTU normal */
    var REASSEMBLY_MS = 20000;  /* un mensaje a medias se tira pasado esto */

    var links = {};             /* id -> {device, rx, tx, inbox} */

    B.available = function () {
        return typeof navigator !== 'undefined' && !!navigator.bluetooth;
    };

    /* Muchos navegadores exigen que la peticion salga de un clic del usuario.
       Por eso esto se llama desde un boton y no automaticamente. */
    B.connect = function (cb) {
        if (!B.available()) { cb(new Error('Este navegador no tiene Web Bluetooth')); return; }
        var device = null, server = null, link = null;

        navigator.bluetooth.requestDevice({
            filters: [{ services: [B.SERVICE] }],
            optionalServices: [B.SERVICE]
        }).then(function (d) {
            device = d;
            device.addEventListener('gattserverdisconnected', function () { drop(device.id); });
            return device.gatt.connect();
        }).then(function (s) {
            server = s;
            return server.getPrimaryService(B.SERVICE);
        }).then(function (service) {
            return Promise.all([service.getCharacteristic(B.RX), service.getCharacteristic(B.TX)]);
        }).then(function (chars) {
            link = { device: device, id: device.id, rx: chars[0], tx: chars[1],
                     inbox: {}, nextId: 1, cola: [], escribiendo: false };
            links[device.id] = link;
            return chars[1].startNotifications();
        }).then(function () {
            link.tx.addEventListener('characteristicvaluechanged', function (ev) {
                onChunk(link, new Uint8Array(ev.target.value.buffer || ev.target.value));
            });
            var peer = {
                id: 'ble:' + device.id,
                kind: 'ble',
                label: device.name || 'Nodo Bluetooth',
                send: function (bytes) { sendChunks(link, bytes); },
                close: function () { try { device.gatt.disconnect(); } catch (e) {} drop(device.id); }
            };
            T.addPeer(peer);
            cb(null, peer);
        })['catch'](function (err) { cb(err); });
    };

    function drop(deviceId) {
        delete links[deviceId];
        T.removePeer('ble:' + deviceId);
    }

    /* ---------------------------------------------------------------------
       Envio troceado. Las escrituras van en cadena: BLE no admite dos a la vez
       sobre la misma caracteristica.

       Esa frase estaba aqui desde el principio y el codigo solo la cumplia a
       medias: encadenaba los trozos DE UN MENSAJE, pero quien llama manda
       mensajes enteros en bucle. M.flushTo (mesh.js) suelta hasta 40 sobres
       seguidos en el mismo tick, y el inventario hasta 120. Eran cuarenta
       cadenas independientes sobre la misma caracteristica: el GATT rechaza
       todas menos la primera, el rechazo se tragaba un catch vacio, y la malla
       contaba cuarenta enviados. Medido con un GATT de mentira que aplica la
       regla de verdad: llegaba 1 sobre de 40, y la aplicacion marcaba los 40
       como enviados.

       Ahora hay UNA cola por enlace. Se escribe de una en una, en orden, y si
       una escritura falla se para la cola y se avisa: mas vale saber que el
       enlace no traga que creer que salio.
       --------------------------------------------------------------------- */
    function drenar(link) {
        if (link.escribiendo || !link.cola.length) { return; }
        link.escribiendo = true;
        var frame = link.cola.shift();
        var write = link.rx.writeValueWithoutResponse
            ? link.rx.writeValueWithoutResponse(frame)
            : link.rx.writeValue(frame);
        write.then(function () {
            link.escribiendo = false;
            drenar(link);
        })['catch'](function () {
            /* El enlace no traga. Se tira lo que quedaba en vez de seguir
               empujando: los trozos sueltos solo dejarian medio sobre en el
               otro lado, que caduca solo a los REASSEMBLY_MS. */
            link.escribiendo = false;
            link.cola.length = 0;
            try { link.device.gatt.disconnect(); } catch (e) {}
            drop(link.id);
        });
    }

    function sendChunks(link, bytes) {
        var id = link.nextId = (link.nextId + 1) & 0xffff;
        var total = Math.ceil(bytes.length / CHUNK) || 1;
        if (!link.cola) { link.cola = []; }

        for (var i = 0; i < total; i++) {
            var start = i * CHUNK;
            var part = bytes.subarray(start, Math.min(bytes.length, start + CHUNK));
            var seq = i | (i === total - 1 ? 0x8000 : 0);
            var frame = new Uint8Array(4 + part.length);
            frame[0] = (id >> 8) & 255; frame[1] = id & 255;
            frame[2] = (seq >> 8) & 255; frame[3] = seq & 255;
            frame.set(part, 4);
            link.cola.push(frame);
        }
        drenar(link);
    }

    /* ---------------------------------------------------------------------
       Recepcion y recomposicion.
       --------------------------------------------------------------------- */
    function onChunk(link, frame) {
        if (frame.length < 4) { return; }
        var id = (frame[0] << 8) | frame[1];
        var raw = (frame[2] << 8) | frame[3];
        var last = !!(raw & 0x8000);
        var seq = raw & 0x7fff;
        var slot = link.inbox[id];
        if (!slot) {
            slot = link.inbox[id] = { parts: [], count: 0, at: U.now(), total: -1 };
        }
        if (!slot.parts[seq]) { slot.count++; }
        slot.parts[seq] = frame.subarray(4);
        if (last) { slot.total = seq + 1; }

        if (slot.total > 0 && slot.count >= slot.total) {
            var joined = U.concat(slot.parts.slice(0, slot.total));
            delete link.inbox[id];
            var peer = null, list = T.peers();
            for (var i = 0; i < list.length; i++) {
                if (list[i].id === 'ble:' + link.device.id) { peer = list[i]; }
            }
            T.receive(joined, peer || { id: 'ble:' + link.device.id, send: function () {} });
        }
        cleanup(link);
    }

    function cleanup(link) {
        var now = U.now();
        for (var k in link.inbox) {
            if (Object.prototype.hasOwnProperty.call(link.inbox, k) && now - link.inbox[k].at > REASSEMBLY_MS) {
                delete link.inbox[k];
            }
        }
    }

    B.closeAll = function () {
        for (var k in links) {
            if (Object.prototype.hasOwnProperty.call(links, k)) {
                try { links[k].device.gatt.disconnect(); } catch (e) {}
            }
        }
        links = {};
    };
})(BINTIO);
