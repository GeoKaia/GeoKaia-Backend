
require('dotenv').config();
const express = require('express');
const cors = require('cors');
// arriba con los otros require
const iaRoutes = require('./routes/ia.routes');

const lugaresRoutes = require('./routes/lugares.routes');
const authRoutes = require('./routes/auth.routes');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use('/api/ia', iaRoutes);

app.get('/', (req, res) => {
  res.json({ mensaje: 'GeoKaia backend funcionando' });
});

app.use('/api/lugares', lugaresRoutes);
app.use('/api/auth', authRoutes);

app.use('/api/leads', require('./routes/leads.routes'));


app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});