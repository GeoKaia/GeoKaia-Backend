require('dotenv').config();
const express = require('express');
const cors = require('cors');
const lugaresRoutes = require('./routes/lugares.routes');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ mensaje: 'GeoKaia backend funcionando ' });
});

app.use('/api/lugares', lugaresRoutes);
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});