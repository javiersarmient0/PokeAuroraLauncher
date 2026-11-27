// Genera el valor de ADMIN_PASSWORD_HASH a partir de la clave maestra.
// Uso: node scripts/hash-clave.mjs [--out archivo]   (pide la clave sin mostrarla)
// Imprime el hash (o lo guarda en UTF-8 con --out); la clave no se guarda en ningún lado.
import { writeFileSync } from 'node:fs'
import { hashPassword } from '../src/logic.mjs'

function readHidden(prompt){
    return new Promise((resolve, reject) => {
        const stdin = process.stdin
        process.stderr.write(prompt)
        if(!stdin.isTTY){
            let data = ''
            stdin.setEncoding('utf8')
            stdin.on('data', chunk => { data += chunk })
            stdin.on('end', () => resolve(data.replace(/\r?\n$/, '')))
            stdin.on('error', reject)
            return
        }
        let value = ''
        stdin.setRawMode(true)
        stdin.resume()
        stdin.setEncoding('utf8')
        // Un evento puede traer varias teclas juntas (al pegar): se procesa carácter por carácter.
        const onData = chunk => {
            for(const char of chunk){
                if(char === '\r' || char === '\n'){
                    stdin.setRawMode(false)
                    stdin.pause()
                    stdin.off('data', onData)
                    process.stderr.write('\n')
                    resolve(value)
                    return
                } else if(char === '\u0003'){
                    process.exit(130)
                } else if(char === '\u007f' || char === '\b'){
                    value = value.slice(0, -1)
                } else if(char >= ' '){
                    value += char
                }
            }
        }
        stdin.on('data', onData)
    })
}

const password = await readHidden('Clave maestra (mínimo 12 caracteres): ')
if(password.length < 12){
    process.stderr.write('La clave tiene que tener al menos 12 caracteres.\n')
    process.exit(1)
}
const salt = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64')
const hash = await hashPassword(password, salt)
const outIndex = process.argv.indexOf('--out')
if(outIndex !== -1 && process.argv[outIndex + 1]){
    writeFileSync(process.argv[outIndex + 1], hash, 'utf8')
    process.stderr.write('Hash guardado. Ya puedes cerrar esta pestaña.\n')
} else {
    process.stdout.write(`${hash}\n`)
}
