const settings = require("./local.settings.json");
const deluge = require('deluge')(settings.deluge.url, settings.deluge.password);

async function addMagnet(magnet) {
  return new Promise((resolve, reject) => {
    deluge.add(magnet, settings.deluge.dlPath, function (error, result) {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

module.exports = {
  addMagnet,
};