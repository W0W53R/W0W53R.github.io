// data.js
class BufferReader {
    constructor(arrayBuffer, littleEndian = true) {
        this.view = new DataView(arrayBuffer)
        this.offset = 0
        this.littleEndian = littleEndian
    }

    u8() {
        return this.view.getUint8(this.offset++)
    }

    i8() {
        return this.view.getInt8(this.offset++)
    }

    u16() {
        const val = this.view.getUint16(this.offset, this.littleEndian)
        this.offset += 2
        return val
    }

    i16() {
        const val = this.view.getInt16(this.offset, this.littleEndian)
        this.offset += 2
        return val
    }

    u32() {
        const val = this.view.getUint32(this.offset, this.littleEndian)
        this.offset += 4
        return val
    }

    i32() {
        const val = this.view.getInt32(this.offset, this.littleEndian)
        this.offset += 4
        return val
    }

    f32() {
        const val = this.view.getFloat32(this.offset, this.littleEndian)
        this.offset += 4
        return val
    }

    f16() {
        const val = this.view.getFloat16(this.offset, this.littleEndian)
        this.offset += 2
        return val
    }

    bytes(n) {
        const result = this.view.buffer.slice(this.offset, this.offset + n)
        this.offset += n
        return result
    }

    address() {
        return new NetworkAddress(
            this.u32(),
            [...new Uint8Array(this.bytes(6))].map(e => e.toString(16)).join(":"),
            this.u16()
        )
    }

    rest() {
        return new Uint8Array(this.view.buffer, this.offset, this.view.buffer.byteLength - this.offset)
    }
}

class BufferWriter {
    constructor(size=25565, littleEndian = true) {
        this.buffer = new ArrayBuffer(size)
        this.view = new DataView(this.buffer)
        this.offset = 0
        this.littleEndian = littleEndian
    }

    u8(value) {
        this.view.setUint8(this.offset++, value)
    }

    i8(value) {
        this.view.setInt8(this.offset++, value)
    }

    u16(value) {
        this.view.setUint16(this.offset, value, this.littleEndian)
        this.offset += 2
    }

    i16(value) {
        this.view.setInt16(this.offset, value, this.littleEndian)
        this.offset += 2
    }

    u32(value) {
        this.view.setUint32(this.offset, value, this.littleEndian)
        this.offset += 4
    }

    i32(value) {
        this.view.setInt32(this.offset, value, this.littleEndian)
        this.offset += 4
    }

    f32(value) {
        this.view.setFloat32(this.offset, value, this.littleEndian)
        this.offset += 4
    }

    f16(value) {
        if (typeof this.view.setFloat16 === "function") {
            this.view.setFloat16(this.offset, value, this.littleEndian)
        } else {
            // Manual conversion fallback (optional)
            throw new Error("setFloat16 is not supported in this environment")
        }
        this.offset += 2
    }

    bytes(byteArray) {
        if (!(byteArray instanceof Uint8Array)) {
            byteArray = new Uint8Array(byteArray)
        }
        new Uint8Array(this.buffer, this.offset, byteArray.length).set(byteArray)
        this.offset += byteArray.length
    }

    address(network, node, socket) {
        this.u32(network);
        if (typeof node === "string") {
            const parts = node.split(":");
            if (parts.length !== 6) {
                throw new Error("Invalid node address format");
            }
            const nodeBytes = parts.map(part => parseInt(part, 16));
            if (nodeBytes.some(isNaN)) {
                throw new Error("Invalid node address format");
            }
            this.bytes(new Uint8Array(nodeBytes));
        } else if (node instanceof Uint8Array && node.length === 6) {
            this.bytes(node);
        }
        this.u16(socket);
    }

    getBuffer() {
        return this.buffer.slice(0, this.offset)
    }
}

// network.js
class NetworkAddress {
    /** @type {number} */
    network;
    /** @type {string | Uint8Array} */
    node;
    /** @type {number} */
    socket;
    /**
     * 
     * @param {number} network - The network
     * @param {string | Uint8Array} node - The address
     * @param {number} socket - The socket ID
     */
    constructor(network, node, socket) {
        this.network = network;
        this.node = node;
        this.socket = socket;
    }

    static Broadcast = new NetworkAddress(0, "ff:ff:ff:ff:ff:ff", 0)
}

class NetworkMessage {
    /** @type {number} */
    type;
    /** @type {NetworkAddress} */
    to;
    /** @type {NetworkAddress} */
    from;
    /** @type {ArrayBuffer} */
    data;
    /**
     * 
     * @param {number} type - The type of message
     * @param {NetworkAddress} to 
     * @param {NetworkAddress} from 
     * @param {ArrayBuffer} data 
     */
    constructor(type, to, from, data) {
        this.type = type;
        this.to = to;
        this.from = from;
        this.data = data;
    }
}

class Connection {
    static STATES = {
        DISCONNECTED: "disconnected",
        CONNECTING: "connecting",
        CONNECTED: "connected",
        ERROR: "error"
    }
    constructor(connect_code) {
        this.url = "wss://netherlands.dos.zone:1900/ipx/" + connect_code.replace("@", "_");
        this.state = Connection.STATES.DISCONNECTED;
        this.id = undefined;

        this.handlers = {
            "data": [],
            "close": [],
            "error": []
        }
    }
    async connect() {
        this.state = Connection.STATES.CONNECTING;
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.url);
            this.ws.binaryType = "arraybuffer";
            this.ws.onopen = () => {
                this.ws.send(new Uint8Array([
                    0xff, 0xff, // Header
                    0x00, 0x1e, // Length
                    0x00, // Hop count
                    0x00, // Type (0 for data)
                    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, // Destination address (network:node:socket) socket=2 for discovery
                    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02 // Source address (network:node:socket)
                ])); // Initial handshake
            };
            this.ws.onerror = (err) => {
                reject(err);
            };
            this.ws.onmessage = (event) => {
                if (event.data instanceof ArrayBuffer) {
                    try {
                        const r = new BufferReader(event.data, false);
                        if (r.u16() != 0xffff) { // CHeck header
                            throw new Error("Invalid packet header");
                        }
                        const length = r.u16();
                        const hop_count = r.u8();
                        const type = r.u8();
                        const destination = r.address();
                        const source = r.address();
                        const data = r.bytes(length - 12 - 12 - 2 - 2 - 1 - 1); // Subtract header size
                        if (this.state == Connection.STATES.CONNECTED) {
                            this.handlers["data"].forEach(handle => {
                                handle(new NetworkMessage(
                                    type,
                                    destination.node,
                                    source.node,
                                    data
                                ))
                            });
                        } else {
                            // Get this connection id
                            this.id = destination;
                            this.state = Connection.STATES.CONNECTED;
                            resolve();
                        }
                    } catch (error) {
                        this.handlers["error"].forEach(handler => handler(error));
                    }
                }
            };
            this.ws.onclose = () => {
                this.handlers["close"].forEach(handler => handler());
            };
        });
    }
    /**
     * 
     * @param {"data"|"close"|"error"} event 
     * @param {Function} handler 
     */
    on(event, handler) {
        if (this.handlers[event]) {
            this.handlers[event].push(handler);
        } else {
            throw new Error(`Unknown event: ${event}`);
        }
    }
    send(data, target = "ff:ff:ff:ff:ff:ff") {
        if (typeof data === "string") {
            data = new TextEncoder().encode(data);
        }
        if (!(data instanceof Uint8Array)) {
            data = new Uint8Array(data)
        }

        if (this.state != Connection.STATES.CONNECTED) {
            throw new Error("Connection is not established");
        }
        const writer = new BufferWriter(data.length + 12 + 12 + 2 + 2 + 1 + 1, false);
        writer.u16(0xffff); // Header
        writer.u16(data.length + 12 + 12 + 2 + 2 + 1 + 1); // Length
        writer.u8(0); // Hop count
        writer.u8(0); // Type (0 for data)  
        writer.address(0, target, 0); // Destination
        writer.address(this.id.network, this.id.node, 0); // Source
        writer.bytes(data);
        this.ws.send(writer.getBuffer());
    }
}