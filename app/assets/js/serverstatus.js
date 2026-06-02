const util = require('minecraft-server-util');

/**
 * Recupera el estado de un servidor de Minecraft moderno (1.7 a 1.21.1+).
 */
exports.getStatus = async function(address, port = 25565) {
    if (port == null || port == '') port = 25565;
    if (typeof port === 'string') port = parseInt(port);

    try {
        // Hacemos el ping moderno real
        const response = await util.status(address, port, {
            timeout: 3000,
            enableSRV: true
        });

        // Devolvemos los datos estructurados igual que Helios espera para la lógica
        return {
            online: true,
            onlinePlayers: response.players.online, // Helios espera esto
            maxPlayers: response.players.max      // Helios espera esto
        };
    } catch (err) {
        return { online: false };
    }
};