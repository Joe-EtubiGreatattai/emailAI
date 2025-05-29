const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');

// Route to manually trigger email check
router.get('/check-now', (req, res) => {
  try {
    emailController.checkUnseenEmails();
    res.json({ message: 'Email check triggered successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to trigger email check' });
  }
});

module.exports = router;