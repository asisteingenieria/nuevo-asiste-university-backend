const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = createServer(app);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased limit for development
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Asiste University API',
      version: '1.0.0',
      description: 'API for call center induction system'
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 3001}`,
        description: 'Development server'
      }
    ]
  },
  apis: ['./routes/*.js']
};

const specs = swaggerJsdoc(swaggerOptions);

app.use('/uploads', express.static('uploads'));
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
};

// Configure Socket.IO
const io = new Server(server, {
  cors: corsOptions
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join user to their personal room for notifications
  socket.on('join-user-room', (userId) => {
    socket.join(`user-${userId}`);
    console.log(`User ${userId} joined their notification room`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Make io available globally for other modules
global.io = io;

app.use(cors(corsOptions));
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));
app.use(limiter);
app.use(express.json({ limit: '1gb' }));
app.use(express.urlencoded({ extended: true, limit: '1gb' }));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

app.get('/', (req, res) => {
  res.json({ 
    message: 'Asiste University API is running!',
    documentation: '/api-docs'
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/activities', require('./routes/activities'));
app.use('/api/workshops', require('./routes/workshops'));
app.use('/api/quizzes', require('./routes/quizzes'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/grades', require('./routes/grades'));
app.use('/api/satisfaction', require('./routes/satisfaction'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/content-blocks', require('./routes/content-blocks'));
app.use('/api/workshop-questions', require('./routes/workshop-questions'));
app.use('/api/forum', require('./routes/forum'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/quiz-retake-grants', require('./routes/quiz-retake-grants'));
app.use('/api/workshop-retake-grants', require('./routes/workshop-retake-grants'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API Documentation available at http://localhost:${PORT}/api-docs`);
  console.log(`Socket.IO server running on port ${PORT}`);
});