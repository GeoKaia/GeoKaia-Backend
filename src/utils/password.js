const { z } = require('zod');

// Política de contraseñas para cuentas nuevas (registro y script de admin). El login NO la aplica:
// las cuentas anteriores a esta regla tienen que poder seguir entrando y cambiar su clave.
// El máximo de 72 es el límite real de bcrypt: más allá de eso ignora los caracteres sobrantes.
const MINIMO = 12;
const MAXIMO = 72;

const PROHIBIDAS = ['password', 'contrasena', 'contraseña', '123456', 'qwerty', 'abcdef', 'geokaia', 'nicaragua'];

const passwordSchema = z
  .string({ error: 'La contraseña es obligatoria' })
  .min(MINIMO, `La contraseña debe tener al menos ${MINIMO} caracteres`)
  .max(MAXIMO, `La contraseña no puede pasar de ${MAXIMO} caracteres`)
  .regex(/[a-z]/, 'La contraseña debe incluir al menos una minúscula')
  .regex(/[A-Z]/, 'La contraseña debe incluir al menos una mayúscula')
  .regex(/\d/, 'La contraseña debe incluir al menos un número')
  .regex(/[^A-Za-z0-9\s]/, 'La contraseña debe incluir al menos un símbolo (por ejemplo ! ? # $ %)')
  .refine((p) => !/\s/.test(p), 'La contraseña no puede tener espacios')
  .refine((p) => !PROHIBIDAS.some((w) => p.toLowerCase().includes(w)), 'La contraseña es demasiado común o contiene el nombre de la plataforma');

// La parte local del correo (lo de antes de la @) no puede ir dentro de la contraseña.
function contieneCorreo(password, email) {
  const local = String(email || '').split('@')[0].toLowerCase();
  return local.length >= 4 && password.toLowerCase().includes(local);
}

// Devuelve la lista de problemas (vacía si la contraseña es válida). Lo usa el script de admin.
function validarPassword(password, email) {
  const r = passwordSchema.safeParse(password);
  const errores = r.success ? [] : r.error.issues.map((i) => i.message);
  if (r.success && contieneCorreo(password, email)) errores.push('La contraseña no puede contener tu correo');
  return errores;
}

module.exports = { passwordSchema, contieneCorreo, validarPassword, MINIMO, MAXIMO };
