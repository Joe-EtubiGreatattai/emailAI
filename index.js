require('dotenv').config();
const express = require('express');
const emailController = require('./controllers/emailController');
const emailRoutes = require('./routes/emailRoutes');
const app = express();

console.log('🚀 Starting Smart Email Auto-Responder...');
console.log('📧 Email User:', process.env.EMAIL_USER);

// Initialize email controller
emailController.initialize();

// Middleware
app.use(express.json());

// Routes
app.use('/api/email', emailRoutes);
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  emailController.shutdown();
  process.exit(0);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});