const { z } = require('zod');

// Política de contraseñas de GeoKaia para TODAS las cuentas (administradores y propietarios de negocios; el público
// general no tiene cuenta). Se aplica al registro, al cambio y al restablecimiento. El frontend muestra los mismos
// requisitos mientras se escribe, pero el que decide es este archivo: el servidor nunca confía en el navegador.
//
// Requisitos obligatorios:
//   - al menos 12 caracteres;
//   - al menos una letra mayúscula (A-Z, incluye acentuadas y ñ);
//   - al menos un número (0-9);
//   - al menos un carácter especial (! @ # $ % & * ? y cualquier otro que no sea letra, número ni espacio).
// Se permiten minúsculas, espacios y cualquier otro carácter (frases largas incluidas). El máximo es 128 caracteres,
// solo para acotar el costo de procesar la contraseña: bastante más de lo que alguien escribe.
const MINIMO = 12;
const MAXIMO = 128;

const REQUISITOS = [
  { id: 'longitud', mensaje: `La contraseña debe tener al menos ${MINIMO} caracteres`, cumple: (p) => [...p].length >= MINIMO },
  { id: 'mayuscula', mensaje: 'La contraseña debe incluir al menos una letra mayúscula (A-Z)', cumple: (p) => /\p{Lu}/u.test(p) },
  { id: 'numero', mensaje: 'La contraseña debe incluir al menos un número (0-9)', cumple: (p) => /[0-9]/.test(p) },
  { id: 'especial', mensaje: 'La contraseña debe incluir al menos un carácter especial (por ejemplo ! @ # $ % & * ?)', cumple: (p) => /[^\p{L}\p{N}\s]/u.test(p) },
  { id: 'maximo', mensaje: `La contraseña no puede pasar de ${MAXIMO} caracteres`, cumple: (p) => [...p].length <= MAXIMO },
];

// Contraseñas que, aunque cumplan las reglas de forma, están en cualquier lista de claves comunes. Se compara solo la
// parte de letras, para atrapar "Password123!" sin rechazar una frase larga que contenga esas palabras.
const BASES_COMUNES = new Set(['password', 'contrasena', 'contrasenia', 'qwertyuiop', 'administrador', 'abcdefghijkl', 'geokaia', 'nicaragua']);

function contieneCorreo(password, email) {
  const local = String(email || '').split('@')[0].toLowerCase();
  return local.length >= 4 && password.toLowerCase().includes(local);
}

const soloLetras = (p) => p.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');

// Devuelve TODOS los requisitos que no cumple (lista vacía = válida). Los mensajes nunca incluyen la contraseña.
function validarPassword(password, email) {
  if (typeof password !== 'string' || password.length === 0) return ['La contraseña es obligatoria'];
  const errores = REQUISITOS.filter((r) => !r.cumple(password)).map((r) => r.mensaje);
  if (BASES_COMUNES.has(soloLetras(password))) errores.push('La contraseña es demasiado común: elegí una que no sea una clave conocida');
  if (contieneCorreo(password, email)) errores.push('La contraseña no puede contener tu correo');
  return errores;
}

// Esquema de zod: cada requisito incumplido es un error aparte (así el cliente puede marcar cuáles faltan).
const passwordSchema = z.string({ error: 'La contraseña es obligatoria' }).superRefine((password, ctx) => {
  for (const mensaje of validarPassword(password)) ctx.addIssue({ code: 'custom', message: mensaje });
});

module.exports = { passwordSchema, validarPassword, contieneCorreo, REQUISITOS, MINIMO, MAXIMO };
