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
  let foldersToMake = [];
  let filesToDownload = [];

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

    if (customFolderName) {
      foldersToMake.push({ path: settings.baseDownloadDir, folderName: customFolderName });
    }

    filesToDownload.push({ url, destination });
  }

  await makeAllFolders(syno, foldersToMake);

  for (let i = 0; i < filesToDownload.length; i++) {
    await downloadFile(syno, filesToDownload[i].url, filesToDownload[i].destination);
  }
}

async function createNestedFolders(urls, syno, settings, outputProgressMessage) {
  const folderPaths = getFolderPath(urls, settings);

  let foldersToMake = [];

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

        foldersToMake.push({ path: parentPath, folderName: parentFolders[p] });
      }

    } else {
      // Now create the folder itself.
      let folder_path = parentFolders.length === 0
        ? settings.baseDownloadDir
        : [settings.baseDownloadDir, ...parentFolders].join('/');

      foldersToMake.push({ path: folder_path, folderName });
    }
  }

  await makeAllFolders(syno, foldersToMake, outputProgressMessage);
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

async function makeAllFolders(syno, foldersToMake, outputProgressMessage) {
  let folderList = foldersToMake.slice();

  // Distinct the folders to make.
  for (let i = folderList.length - 1; i >= 0; i--) {
    let thisFolder = folderList[i];

    if (folderList.findIndex(x => x.folderName === thisFolder.folderName
      && x.path === thisFolder.path) !== i) {
      // A duplicate was found earlier.
      delete folderList[i];
    }
  }

  folderList = folderList.filter(x => x !== undefined);

  console.log(`Distincted folder list from ${foldersToMake.length} items to ${folderList.length} items.`);

  // Create all necessary folders.
  for (let i = 0; i < folderList.length; i++) {
    await makeFolder(syno, folderList[i].path, folderList[i].folderName, outputProgressMessage);
  }
}

async function makeFolder(syno, path, newFolderName, outputProgressMessage) {
  console.log(`Creating folder ${path}/${newFolderName}`);

  var folderPromise = new Promise((resolve, reject) => {
    syno.fs.createFolder({
      folder_path: path,
      name: newFolderName,
      force_parent: true,
    }, (err) => {
      if (err) {
        reject(err);
      }

      resolve();
    });
  });

  await folderPromise;

  const createdMessage = `Created folder ${path}/${newFolderName}`;
  console.log(createdMessage);

  if (outputProgressMessage) {
    outputProgressMessage(createdMessage);
  }
}

async function downloadFile(syno, url, destination) {
  console.log(`Creating download task for ${url}`);

  var promise = new Promise((resolve) => {
    syno.dl.createTask({
      uri: url,
      destination: destination,
    }, () => {
      resolve();
    });
  });

  await promise;

  console.log(`Download task created for ${url}`);
}

module.exports = {
  handleUrlsAsync,
  findDomainHandler,
  tryInjectCredentials,
};