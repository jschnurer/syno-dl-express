const Syno = require('syno');

/**
 * Handles an incoming array of urls and downloads them all.
 * If customFolderName is specified, it will download them into that folder.
 */
async function handleUrlsAsync(urls, makeFolders, settings, outputProgressMessage, customFolderName) {
  if (!urls.length) {
    throw new Error("No urls were provided!");
  }

  var syno = new Syno({
    protocol: settings.protocol,
    host: settings.host,
    port: settings.port,
    account: settings.account,
    passwd: settings.password,
    apiVersion: settings.apiVersion || '6.0.2',
  });

  if (makeFolders) {
    await createNestedFolders(urls, syno, settings, outputProgressMessage);
  }
  await createDownloadTasks(urls, makeFolders, syno, settings, outputProgressMessage, customFolderName);
}

async function createDownloadTasks(urls, makeFolders, syno, settings, outputProgressMessage, customFolderName) {
  for (let i = 0; i < urls.length; i++) {
    let destination = `${settings.baseDownloadDir}`

    if (makeFolders) {
      const folderPath = getFolderPath([urls[i]], settings)[0];

      if (folderPath) {
        destination += `/${folderPath}`;
      }
    } else if (customFolderName) {
      destination += `/${customFolderName}`;
    }
    
    if (destination.startsWith('/')) {
      destination = destination.slice(1);
    }

    let url = tryInjectCredentials(urls[i], settings);

    // Ensure the target folder exists before downloading.
    var folderPromise = new Promise((resolve, reject) => {
      syno.fs.createFolder({
        folder_path: settings.baseDownloadDir,
        name: customFolderName,
      }, (err) => {

        if (err) {
          reject(err);
        }

        resolve();
      });
    });

    await folderPromise;

    var promise = new Promise((resolve) => {
      syno.dl.createTask({
        uri: url,
        destination: destination,
      }, () => {
        resolve();
      });
    });

    await promise;

    const msg = `Downloading ${urls[i]} to ${destination}`;
    console.log(msg);

    if (outputProgressMessage) {
      outputProgressMessage(msg);
    }
  }
}

async function createNestedFolders(urls, syno, settings, outputProgressMessage) {
  const folderPaths = getFolderPath(urls, settings);

  for (let f = 0; f < folderPaths.length; f++) {
    const path = folderPaths[f];
    let folders = path.split('/')
      .filter(x => !!x);

    const folderName = folders.slice(-1);
    parentFolders = folders.length > 1
      ? folders.slice(0, folders.length)
      : [];

    if (parentFolders.length) {
      // Create the path of folders leading to the folder name.
      for (p = 0; p < parentFolders.length; p++) {
        const parentPath = p === 0
          ? settings.baseDownloadDir
          : [settings.baseDownloadDir, ...parentFolders.slice(0, p)].join('/');

        var promise = new Promise((resolve, reject) => {
          syno.fs.createFolder({
            folder_path: parentPath,
            name: parentFolders[p],
          }, (err) => {

            if (err) {
              reject(err);
            }

            resolve();
          });
        });

        await promise;

        const parentMessage = `Created ${[parentPath, parentFolders[p]].join('/')}`;
        console.log(parentMessage);
        if (outputProgressMessage) {
          outputProgressMessage(parentMessage);
        }
      }

    } else {
      // Now create the folder itself.
      let folder_path = parentFolders.length === 0
        ? settings.baseDownloadDir
        : [settings.baseDownloadDir, ...parentFolders].join('/');

      var promise = new Promise((resolve, reject) => {
        syno.fs.createFolder({
          folder_path: folder_path,
          name: folderName,
        }, (err) => {

          if (err) {
            reject(err);
          }

          resolve();
        });
      });

      await promise;

      const createdMessage = `Created ${settings.baseDownloadDir}/${path}`;
      console.log(createdMessage);
      if (outputProgressMessage) {
        outputProgressMessage(createdMessage);
      }
    }
  }
}

function getFolderPath(urls, settings) {
  const folderPaths = [];

  urls.forEach(x => {
    const domainHandler = findDomainHandler(x, settings);

    if (!domainHandler) {
      return;
    }

    let ix = x.indexOf(domainHandler.createPathAfterUrlComponent);
    if (ix === -1) {
      return;
    }

    ix += domainHandler.createPathAfterUrlComponent.length;

    if (x.lastIndexOf('/') <= ix) {
      return;
    }

    let path = decodeURI(x.substring(ix, x.lastIndexOf('/'))).split('/').map(x => !isNaN(Number(x))
      ? `_${x}`
      : x).join('/');

    folderPaths.push(path);
  });

  return [...new Set(folderPaths)];
}

function findDomainHandler(url, settings) {
  return settings.domainHandlers.find(h =>
    url.toLowerCase().indexOf(h.urlMatch.toLowerCase()) > -1
  );
}

function tryInjectCredentials(url, settings) {
  const domainHandler = findDomainHandler(url, settings);

  if (!domainHandler
    || !domainHandler.username
    || !domainHandler.password) {
    return url;
  }

  return url.replace('://', `://${domainHandler.username}:${domainHandler.password}@`);
}

module.exports = {
  handleUrlsAsync,
  findDomainHandler,
  tryInjectCredentials,
};