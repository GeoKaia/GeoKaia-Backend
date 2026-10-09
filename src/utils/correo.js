const fs = require('fs');

// Envío de correos transaccionales (restablecer contraseña, aviso de cambio de contraseña).
//  - Producción: define SMTP_URL (por ejemplo smtps://usuario:clave@smtp.proveedor.com:465) y MAIL_FROM.
//  - Sin SMTP_URL: no se envía nada y se avisa en el log; las funciones que dependen del correo quedan inactivas
//    (la cuenta se recupera por soporte). NUNCA se imprime en el log el contenido de un correo (llevaría el enlace
//    secreto de restablecimiento).
//  - Pruebas automáticas (CORREO_PRUEBAS=true y CORREO_PRUEBAS_ARCHIVO): el mensaje se anexa como una línea JSON al
//    archivo indicado para que la prueba lo lea. No existe ninguna ruta HTTP que exponga correos.
let transporte;
function obtenerTransporte() {
  if (transporte !== undefined) return transporte;
  if (!process.env.SMTP_URL) {
    transporte = null;
  } else {
    transporte = require('nodemailer').createTransport(process.env.SMTP_URL);
  }
  return transporte;
}

const correoConfigurado = () => process.env.CORREO_PRUEBAS === 'true' || !!process.env.SMTP_URL;

async function enviar({ para, asunto, texto }) {
  if (process.env.CORREO_PRUEBAS === 'true') {
    if (process.env.CORREO_PRUEBAS_ARCHIVO) fs.appendFileSync(process.env.CORREO_PRUEBAS_ARCHIVO, JSON.stringify({ para, asunto, texto }) + '\n');
    return true;
  }
  const t = obtenerTransporte();
  if (!t) {
    console.warn('[correo] SMTP_URL no está configurado: no se envió un correo a', para);
    return false;
  }
  await t.sendMail({ from: process.env.MAIL_FROM || 'GeoKaia <no-responder@geokaia.example>', to: para, subject: asunto, text: texto });
  return true;
}

module.exports = { enviar, correoConfigurado };
