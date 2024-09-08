const compress = require('compression');
const cors = require('cors');
const express = require('express');
const http = require('http');
const pug = require('pug');
const path = require('path');

const config = require('../config');

// Create an Express application
const app = express();

// Create an HTTP server
const server = http.createServer(app);

// Set the port from environment variable or default to 5001
const PORT = process.env.PORT || 5001;

// Trust "X-Forwarded-For" and "X-Forwarded-Proto" headers
app.enable('trust proxy');

// Disable "powered by express" header
app.set('x-powered-by', false);

// Use pug for templates
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.engine('pug', pug.renderFile);

// Pretty print JSON
app.set('json spaces', 2);

// Use GZIP
app.use(compress());

// CORS whitelist
const CORS_WHITELIST = [
  'http://rollcall.audio',
  'https://rollcall.audio'
];

// Load secret configuration
let secret;
try {
  secret = require('../secret');
} catch (err) {
  // Handle error if secret configuration is missing
}

// Security and performance middleware
app.use((req, res, next) => {
  if (config.isProd) {
    // Redirect HTTP to HTTPS
    if (req.protocol !== 'https') {
      return res.redirect('https://' + req.hostname + req.url);
    }

    // Redirect 'www.' subdomain to non-'www.' domain
    if (req.hostname.startsWith('www.')) {
      const nonWwwHost = req.hostname.substring(4); // Remove 'www.' prefix
      return res.redirect('https://' + nonWwwHost + req.url);
    }

    // Set security headers
    res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Add CORS headers for specific font file types
  const extname = path.extname(req.url);
  if (['.eot', '.ttf', '.otf', '.woff', '.woff2'].includes(extname)) {
    res.header('Access-Control-Allow-Origin', '*');
  }

  // Set additional security headers
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  res.header('X-UA-Compatible', 'IE=Edge,chrome=1');

  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, '../static')));

// Define a route for /torrent
app.get('/torrent', (req, res) => {
  res.send('Torrent page content goes here'); // You can render a template or serve a file instead
});

// Routes
app.get('/', (req, res) => {
  res.render('index', {
    title: 'Fastshare - Streaming file transfer over WebTorrent'
  });
});

app.get('/__rtcConfig__', cors({
  origin: (origin, cb) => {
    const allowed = CORS_WHITELIST.indexOf(origin) >= 0 ||
      /https?:\/\/localhost(:|$)/.test(origin) ||
      /https?:\/\/airtap\.local(:|$)/.test(origin);
    cb(null, allowed);
  }
}), (req, res) => {
  // Hardcoded WebRTC configuration
  const rtcConfig = {
    iceServers: [
      {
        urls: [
          'stun:stun.l.google.com:19302', // Public Google STUN server
        ]
      }
    ],
    sdpSemantics: 'unified-plan',
    bundlePolicy: 'max-bundle',
    iceCandidatePoolsize: 1
  };
  res.send({
    comment: 'WARNING: This is *NOT* a public endpoint. Do not depend on it in your app',
    rtcConfig: rtcConfig
  });
});

app.get('*', (req, res) => {
  res.status(404).render('error', {
    title: '404 Page Not Found',
    message: '404 Not Found'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  const code = typeof err.code === 'number' ? err.code : 500;
  res.status(code).render('error', {
    title: '500 Internal Server Error',
    message: err.message || err
  });
});

// Start the server
server.listen(PORT, () => {
  console.log('Server is listening on port %s', PORT);
});
