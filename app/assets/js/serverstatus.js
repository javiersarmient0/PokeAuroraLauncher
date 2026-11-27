const net = require('net')

/**
 * Retrieves the status of a minecraft server.
 * 
 * @param {string} address The server address.
 * @param {number} port Optional. The port of the server. Defaults to 25565.
 * @returns {Promise.<Object>} A promise which resolves to an object containing
 * status information.
 */
exports.getStatus = function(address, port = 25565){

    if(port == null || port == ''){
        port = 25565
    }
    if(typeof port === 'string'){
        port = parseInt(port)
    }

    return new Promise((resolve, reject) => {
        const socket = net.connect(port, address, () => {
            let buff = Buffer.from([0xFE, 0x01])
            socket.write(buff)
        })

        socket.setTimeout(2500, () => {
            socket.end()
            reject({
                code: 'ETIMEDOUT',
                errno: 'ETIMEDOUT',
                address,
                port
            })
        })

        socket.on('data', (data) => {
            if(data != null && data != ''){
                let server_info = data.toString().split('\x00\x00\x00')
                const NUM_FIELDS = 6
                if(server_info != null && server_info.length >= NUM_FIELDS){
                    resolve({
                        online: true,
                        version: server_info[2].replace(/\u0000/g, ''),
                        motd: server_info[3].replace(/\u0000/g, ''),
                        onlinePlayers: server_info[4].replace(/\u0000/g, ''),
                        maxPlayers: server_info[5].replace(/\u0000/g,'')
                    })
                } else {
                    resolve({
                        online: false
                    })
                }
            }
            socket.end()
        })

        socket.on('error', (err) => {
            socket.destroy()
            reject(err)
            // ENOTFOUND = Unable to resolve.
            // ECONNREFUSED = Unable to connect to port.
        })
    })

}
function normalizeHost(host){
    return String(host || '').toLowerCase().replace(/\.$/, '')
}

/**
 * Direcciones a probar para el estado del servidor: primero la de la distribución y después
 * cada registro SRV, sin repetir.
 *
 * @param {string} hostname
 * @param {number} port
 * @param {{name: string, port: number}[]} [srv]
 * @returns {{host: string, port: number}[]}
 */
exports.statusTargets = function(hostname, port, srv){
    const targets = [{ host: hostname, port }]
    const seen = new Set([`${normalizeHost(hostname)}:${port}`])
    for(const record of srv || []){
        const host = normalizeHost(record.name)
        const key = `${host}:${record.port}`
        if(host && !seen.has(key)){
            seen.add(key)
            targets.push({ host, port: record.port })
        }
    }
    return targets
}

/**
 * Registros SRV de Minecraft de un dominio; lista vacía si no hay o falla el DNS.
 *
 * @param {string} domain
 * @returns {Promise<{name: string, port: number}[]>}
 */
exports.resolveSrvSafe = async function(domain){
    try {
        const records = await require('dns').promises.resolveSrv(`_minecraft._tcp.${domain}`)
        return records.map(record => ({ name: record.name, port: record.port }))
    } catch {
        return []
    }
}
