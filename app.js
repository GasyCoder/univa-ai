// Startup file for hosts that run a Node.js file instead of `next start`
// (cPanel "Setup Node.js App" / Passenger). Build first with `npm run build`.
const { createServer } = require('node:http');
const next = require('next');

const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port);
});
