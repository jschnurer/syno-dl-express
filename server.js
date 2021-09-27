const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const downloader = require("./downloader.js");
const settings = require("./local.settings.json");
const cors = require('cors')

app.use(cors());
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

http.listen(settings.port, function () {
  console.log(`listening on *:${settings.port}`);
});