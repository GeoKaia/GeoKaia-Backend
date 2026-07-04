const validate = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body); // Compara el body con tus reglas
    next(); // Si todo está bien, pasa al siguiente paso
  } catch (err) {
    // Si hay error, envía un mensaje claro con los campos que fallaron
    return res.status(400).json({
      error: 'Error de validación',
      detalles: err.errors.map(e => ({ campo: e.path[0], mensaje: e.message }))
    });
  }
};

module.exports = validate;