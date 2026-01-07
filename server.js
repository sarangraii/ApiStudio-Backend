// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/MERNPROJECTCLONE', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Request History Schema
const requestHistorySchema = new mongoose.Schema({
  method: { type: String, required: true },
  url: { type: String, required: true },
  headers: { type: Object, default: {} },
  body: { type: String, default: '' },
  bodyType: { type: String, default: 'raw' },
  response: {
    status: Number,
    statusText: String,
    headers: Object,
    data: String,
    time: Number
  },
  createdAt: { type: Date, default: Date.now }
});

const RequestHistory = mongoose.model('RequestHistory', requestHistorySchema);

app.get('/',(req,res)=>{
  res.send({
    activeStatus:true,
    error:false,
  })
})

// Send HTTP Request
app.post('/api/request', async (req, res) => {
  try {
    const { method, url, headers, body, bodyType } = req.body;
    
    const startTime = Date.now();
    
    // Prepare axios config
    const config = {
      method: method.toLowerCase(),
      url: url,
      headers: headers || {},
      timeout: 30000,
      validateStatus: () => true // Accept all status codes
    };

    // Add body based on type
    if (['post', 'put', 'patch'].includes(method.toLowerCase()) && body) {
      if (bodyType === 'raw') {
        try {
          config.data = JSON.parse(body);
          config.headers['Content-Type'] = config.headers['Content-Type'] || 'application/json';
        } catch (e) {
          config.data = body;
        }
      } else if (bodyType === 'form-data') {
        // For form-data, body should be an object
        config.data = body;
        config.headers['Content-Type'] = 'multipart/form-data';
      } else if (bodyType === 'urlencoded') {
        config.data = body;
        config.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }

    // Make the request
    const response = await axios(config);
    const endTime = Date.now();
    const timeTaken = endTime - startTime;

    const responseData = {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: typeof response.data === 'object' ? JSON.stringify(response.data, null, 2) : response.data,
      time: timeTaken
    };

    // Save to history
    const historyRecord = new RequestHistory({
      method,
      url,
      headers,
      body,
      bodyType,
      response: responseData
    });
    
    await historyRecord.save();

    res.json({
      success: true,
      response: responseData,
      historyId: historyRecord._id
    });

  } catch (error) {
    const timeTaken = Date.now() - (req.startTime || Date.now());
    
    const errorResponse = {
      status: error.response?.status || 0,
      statusText: error.response?.statusText || error.message,
      headers: error.response?.headers || {},
      data: error.response?.data ? 
        (typeof error.response.data === 'object' ? 
          JSON.stringify(error.response.data, null, 2) : 
          error.response.data) : 
        error.message,
      time: timeTaken
    };

    res.json({
      success: false,
      response: errorResponse,
      error: error.message
    });
  }
});

// Get Request History
app.get('/api/history', async (req, res) => {
  try {
    const history = await RequestHistory.find()
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json({
      success: true,
      history
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get Single Request from History
app.get('/api/history/:id', async (req, res) => {
  try {
    const request = await RequestHistory.findById(req.params.id);
    
    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Request not found'
      });
    }

    res.json({
      success: true,
      request
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete Request from History
app.delete('/api/history/:id', async (req, res) => {
  try {
    await RequestHistory.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Request deleted from history'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Clear All History
app.delete('/api/history', async (req, res) => {
  try {
    await RequestHistory.deleteMany({});
    
    res.json({
      success: true,
      message: 'All history cleared'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`MongoDB connection: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
});

// Handle MongoDB connection events
mongoose.connection.on('connected', () => {
  console.log('MongoDB connected successfully');
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});