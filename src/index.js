require('dotenv').config();
const express = require('express');
const cors = require('cors');

// 1. Importaciones de rutas 
const iaRoutes = require('./routes/ia.routes');
const lugaresRoutes = require('./routes/lugares.routes');
const authRoutes = require('./routes/auth.routes');
const rutasRoutes = require('./routes/rutas.routes');
const leadsRoutes = require('./routes/leads.routes');

const app = express();
const PORT = process.env.PORT || 4000;

// 2. Middlewares Globales 
app.use(cors());
app.use(express.json());

// 3. Registro de Rutas
app.get('/', (req, res) => {
  res.json({ mensaje: 'GeoKaia backend funcionando' });
});

app.use('/api/ia', iaRoutes);
app.use('/api/lugares', lugaresRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/rutas', rutasRoutes);
app.use('/api/leads', leadsRoutes);

// 4. Arranque del servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});