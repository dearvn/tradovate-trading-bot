const path = require('path');
const fs = require('fs');

const PUBLIC_DIR = path.resolve(__dirname, '/../../../../public');

const handle404 = async (_logger, app) => {
  // For SPA routes (non-API GET requests) serve the React index.html so that
  // client-side routing (wouter) handles the path.  API routes and other
  // methods that reach this point still get a JSON 404.
  app.use((req, res) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      const htmlPath = path.join(PUBLIC_DIR, 'index.html');
      if (fs.existsSync(htmlPath)) {
        return res.sendFile(htmlPath);
      }
    }

    res.status(404).json({
      success: false,
      status: 404,
      message: 'Route not found.',
      data: {}
    });
  });
};

module.exports = { handle404 };
