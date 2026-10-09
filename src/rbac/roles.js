// Rol de una cuenta, calculado SIEMPRE a partir de lo que está en la base de datos (esAdmin y esResponsable), nunca de lo
// que mande el navegador. Ninguno de los dos campos se puede cambiar desde la API: se asignan a mano en la base.
function rolDe(negocio) {
  if (!negocio) return null;
  if (negocio.esAdmin) return negocio.esResponsable ? 'RESPONSABLE' : 'ADMIN';
  return 'PROPIETARIO';
}

module.exports = { rolDe };
