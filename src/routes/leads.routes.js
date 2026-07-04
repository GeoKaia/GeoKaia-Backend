const express = require('express');
const router = express.Router();
const leadsController = require('../controllers/leads.controller');

router.post('/', leadsController.crearLead);

module.exports = router;