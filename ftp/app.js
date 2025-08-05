function $(id) {
    return document.getElementById(id)
}

const CHUNK_SIZE = 2 ** 15

const roomName = $("room")
const connectButton = $("connectToRoom")
const connectionStatus = $("connectionState")

/** @type {HTMLInputElement} */
const txFile = $("sendFile")
const txButton = $("sendFileButton")

const rxList = $("fileList")

let fileChunks = []
let totalFileChunks = 0
let fileName = ""

/** @type {Connection} */
let connection = null;
connectButton.onclick = async function() {
    if (!roomName.value) {
        alert("No room name specified")
        return
    }
    try {
        connection = new Connection(roomName.value)
        roomName.disabled = true

        connection.on("error", (e) => {
            console.error(e)
        })

        connection.on("data", async function(message) {
            const reader = new BufferReader(message.data)

            const type = reader.u8()

            if (type == 0) { // Broadcast File Begin
                const name = new TextDecoder().decode(
                    reader.bytes(reader.u8())
                )
                fileName = name
                totalFileChunks = reader.u32()
                connectionStatus.innerText = "Recieving " + fileName
            } else if (type == 1) { // Broadcast File Chunk
                fileChunks.push(reader.rest())
                connectionStatus.innerText = "Recieving " + fileName + ", Chunk " + fileChunks.length + "/" + totalFileChunks
            } else if (type == 2) { // Broadcast File End
                // Recompose the file using Blob
                // Create a URL for the blob
                // Add the link to the rxList

                connectionStatus.innerText = "Decompressing " + fileName

                const zlibbedU8 = new Uint8Array(await (new Blob(fileChunks)).arrayBuffer());

                const file = new Blob([ fflate.unzlibSync(zlibbedU8) ]);

                const url = URL.createObjectURL(file);

                const a = document.createElement("a");
                a.href = url;
                a.download = fileName;
                a.innerText = fileName;
                rxList.appendChild(a);

                rxList.appendChild(document.createElement("br"));

                connectionStatus.innerText = "Ready";

                fileChunks = []
            }
        })
        connectButton.disabled = true;
        
        connectionStatus.innerText = "Connecting"
        await connection.connect()
        connectionStatus.innerText = "Ready"

        txButton.disabled = false
    } catch (err) {
        alert(err.title + ", " + err.message)
        connectButton.disabled = false;
    }
}

txButton.onclick = async function() {
    if (!(txFile.files && txFile.files[0])) {
        alert("No file inputted")
        return
    }
    if (!connection) {
        alert("Not connected to room")
        return
    }

    const fileName = txFile.files[0].name

    connectionStatus.innerText = "Compressing " + fileName

    const compressedU8 = new Uint8Array(await txFile.files[0].arrayBuffer())

    const arrayBuffer = fflate.zlibSync(compressedU8, { level: 9 }).buffer

    const chunks = []
    for (let i = 0; i < arrayBuffer.byteLength; i += CHUNK_SIZE) {
        chunks.push(arrayBuffer.slice(i, i + CHUNK_SIZE))
    }

    const startWriter = new BufferWriter(2 + fileName.length + 4)
    startWriter.u8(0)
    startWriter.u8(fileName.length)
    startWriter.bytes(new TextEncoder().encode(fileName))
    startWriter.u32(chunks.length)
    connection.send(startWriter.getBuffer())

    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        const writer = new BufferWriter(CHUNK_SIZE + 1)
        writer.u8(1)
        writer.bytes(chunk)
        connection.send(writer.getBuffer())

        if (i % 16 == 0) {
            await new Promise((res) => setTimeout(res))
            connectionStatus.innerText = "Sending " + fileName + " Chunk " + ( i + 1 ) + "/" + chunks.length;
        }

    }

    const endWriter = new BufferWriter()
    endWriter.u8(2)
    connection.send(endWriter.getBuffer())


    connectionStatus.innerText = "Ready"
}