exports.obtenerTodos = async (req, res) => {
  res.json({ mensaje: 'Lista de lugares (todavía sin conectar a la BD)' });
};

exports.obtenerPorId = async (req, res) => {
  res.json({ mensaje: `Lugar con id ${req.params.id}` });
};

exports.crear = async (req, res) => {
  res.json({ mensaje: 'Lugar creado (placeholder)' });
};