// Verificaciones de "¿este link es realmente lo que dice ser?" para los campos de
// contenido de un Lugar. Sin esto, un negocio del plan GRATIS puede pegar cualquier
// URL en un campo compartido con PREMIUM (por ejemplo un link de YouTube en "foto
// principal", o cualquier página en "Google Maps") y de hecho estar metiendo contenido
// que se supone que se paga aparte — no tiene sentido vender Premium si el plan
// Gratuito ya deja poner lo que sea en esos espacios.

const EXTENSIONES_IMAGEN = /\.(jpe?g|png|webp|gif|avif|bmp|svg)(\?.*)?$/i;

// Hosts que sirven imágenes sin extensión en la URL (redirects de Drive/Dropbox ya
// normalizados por normalizarUrlImagen en el frontend, CDNs de fotos, etc.) — se
// aceptan por dominio en vez de por extensión.
const HOSTS_DE_IMAGEN_SIN_EXTENSION = [
  'drive.google.com',
  'dropboxusercontent.com',
  'dl.dropboxusercontent.com',
  'googleusercontent.com',
  'imgur.com',
  'i.imgur.com',
  'cloudinary.com',
  'res.cloudinary.com',
  'unsplash.com',
  'images.unsplash.com',
  'wikimedia.org',
  'upload.wikimedia.org',
];

// Dominios que casi con certeza NO son una foto (para dar un mensaje de error más
// claro que "no es una imagen" cuando alguien pega, por ejemplo, un link de YouTube).
const HOSTS_PROHIBIDOS_EN_FOTO = [
  'youtube.com', 'youtu.be', 'tiktok.com', 'vimeo.com', 'facebook.com', 'instagram.com',
];

function obtenerHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

// La "foto principal" (fotoUrl) es un campo compartido por ambos tiers: tiene que ser
// una imagen de verdad, no video/red social/PDF disfrazado de foto.
function esUrlDeFotoValida(url) {
  const host = obtenerHost(url);
  if (!host) return false;
  if (HOSTS_PROHIBIDOS_EN_FOTO.some((h) => host === h || host.endsWith('.' + h))) return false;
  if (HOSTS_DE_IMAGEN_SIN_EXTENSION.some((h) => host === h || host.endsWith('.' + h))) return true;
  return EXTENSIONES_IMAGEN.test(url);
}

// mapsUrl solo tiene sentido si de verdad manda a Google Maps (o a uno de sus
// acortadores oficiales) — si no, el botón "Google Maps" de la tarjeta lleva a
// cualquier otro lado.
function esUrlDeGoogleMaps(url) {
  const host = obtenerHost(url);
  if (!host) return false;
  return (
    host === 'google.com' ||
    host.endsWith('.google.com') ||
    host === 'maps.app.goo.gl' ||
    host === 'goo.gl'
  );
}

// Mismo criterio para Waze.
function esUrlDeWaze(url) {
  const host = obtenerHost(url);
  if (!host) return false;
  return host === 'waze.com' || host.endsWith('.waze.com');
}

module.exports = { esUrlDeFotoValida, esUrlDeGoogleMaps, esUrlDeWaze };
