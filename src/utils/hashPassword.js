const argon2 = require('argon2');
const bcrypt = require('bcrypt');

// Las contraseñas se guardan con Argon2id (ganador de la Password Hashing Competition y recomendación de OWASP), con
// sal aleatoria propia en cada hash (va dentro del texto resultante). Parámetros de OWASP: 19 MiB de memoria,
// 2 iteraciones, 1 hilo. Nunca se guarda la contraseña ni nada reversible.
//
// Compatibilidad: las cuentas creadas antes tienen hash bcrypt ($2b$...). Se siguen aceptando y, en cuanto la persona
// inicia sesión con éxito, su hash se reemplaza por uno Argon2id (ver necesitaRehash en el login).
const OPCIONES = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

const esBcrypt = (hash) => typeof hash === 'string' && /^\$2[aby]\$/.test(hash);

async function hashear(password) {
  return argon2.hash(password, OPCIONES);
}

async function verificar(password, hash) {
  try {
    if (esBcrypt(hash)) return await bcrypt.compare(password, hash);
    return await argon2.verify(hash, password);
  } catch {
    return false; // hash corrupto o con formato desconocido: no verifica
  }
}

function necesitaRehash(hash) {
  return esBcrypt(hash) || argon2.needsRehash(hash, OPCIONES);
}

// Hash de relleno para equiparar tiempos: si el correo no existe se hace igual una verificación completa, para que
// responder "no existe" no sea más rápido que "contraseña incorrecta" y no sirva para descubrir correos.
let relleno;
async function verificarContraRelleno(password) {
  relleno = relleno || hashear('relleno-que-no-es-la-contrasena-de-nadie');
  return verificar(password, await relleno);
}

module.exports = { hashear, verificar, necesitaRehash, verificarContraRelleno, esBcrypt };
