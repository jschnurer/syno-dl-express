const express = require('express');
const app = express();
const https = require("https");
const http = require('http');
const io = require('socket.io')(http);
const downloader = require("./downloader.js");
const settings = require("./local.settings.json");
const cors = require('cors');
const fs = require("fs");

const path = `/etc/letsencrypt/live/${settings.serverName}`;
const privateKey = fs.readFileSync(`${path}/privkey.pem`, 'utf8');
const certificate = fs.readFileSync(`${path}/cert.pem`, 'utf8');
const ca = fs.readFileSync(`${path}/chain.pem`, 'utf8');
const credentials = {
  key: privateKey,
  cert: certificate,
  ca: ca
};
const httpsServer = https.createServer(credentials, app);
const httpServer = http.createServer(app);

app.use('*', cors());
app.options("*", cors());
app.use(express.json());

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

app.post('/submitUrls', async function (req, res) {
  try {
    if (!req.body.urls) {
      throw new Error("no urls prop specified in request body.");
    }

    await downloader.handleUrlsAsync(req.body.urls, settings.synoSettings);

    res.sendStatus(200);
  } catch (err) {
    res.status(500).send(err.toString());
  }
});

io.on('connection', async function (socket) {
  console.log('A user connected');

  // Handler for submitting urls.
  socket.on('submitUrls', async function (urls) {
    console.log(`Received urls:\n${JSON.stringify(urls, null, 2)}`);

    io.emit("started");

    try {
      await downloader.handleUrlsAsync(urls,
        settings.synoSettings,
        (progressMessage) => {
          io.emit('progress', progressMessage);
        });

      console.log("Done.");
      io.emit("done");
    } catch (err) {
      console.log(err);
      io.emit('error', err.toString());
    }
  });

  socket.on('disconnect', function () {
    console.log('A user disconnected');
  });
});

httpServer.listen(settings.httpPort, function () {
  console.log(`listening on *:${settings.httpPort}`);
});
httpsServer.listen(settings.httpsPort, function () {
  console.log(`listening (ssl) on *:${settings.httpsPort}`);
});