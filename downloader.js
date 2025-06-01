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
    let destination = `${settings.baseDownloadDir}`;

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

  if (foldersToMake) {
    await makeAllFolders(syno, foldersToMake);
  }

  // Get the list of all download tasks from Syno.
  const allCurrentTasks = await getCurrentDownloadTasks(syno);

  // Group all the files to download by their destination folders.
  const filesByDestination = [];

  for (let i = 0; i < filesToDownload.length; i++) {
    const f = filesToDownload[i];

    // Search the current tasks to see if this requested download was already created
    // as a task.
    const fnOnly = f.url.substr(f.url.lastIndexOf("/") + 1);
    const existingTask = allCurrentTasks.tasks.find(x =>
      areEncodableStrsEqual(x.additional.detail.destination, f.destination)
      && areEncodableStrsEqual(x.title, fnOnly));

    if (existingTask) {
      console.log(`SKIPPED (ALREADY DOWNLOADING): ${f.url}`);
    } else {
      const existingDest = filesByDestination.find(x => x.destination === f.destination);

      if (!existingDest) {
        filesByDestination.push({
          destination: f.destination,
          urls: [
            f.url
          ],
        });
      } else {
        existingDest.urls.push(f.url);
      }
    }
  }

  // Now, for each destination folder, tell Syno to download all the files needed to that folder.
  for (let i = 0; i < filesByDestination.length; i++) {
    const chunkedUrls = chunkArray(filesByDestination[i].urls, 10);

    for (let j = 0; j < chunkedUrls.length; j++) {
      await downloadFileBatch(syno, chunkedUrls[j], filesByDestination[i].destination);
    }
  }
}

function areEncodableStrsEqual(str1, str2) {
  const enc1 = encodeURI(str1);
  const enc2 = encodeURI(str2);

  return str1 === str2
    || enc1 === str2
    || str1 === enc2
    || enc1 === enc2;
}

async function getCurrentDownloadTasks(syno) {
  var taskPromise = new Promise((resolve, reject) => {
    syno.dl.listTasks({
      limit: -1,
      offset: 0,
      additional: "detail,transfer"
    }, (err, tasks) => {
      if (err) {
        reject(err);
      } else {
        resolve(tasks);
      }
    });
  });

  return await taskPromise;
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

  const folderPaths = [];
  const folderNames = [];

  // Create all necessary folders.
  for (let i = 0; i < folderList.length; i++) {
    folderPaths.push(folderList[i].path);
    if (Array.isArray(folderList[i].folderName)) {
      folderNames.push(folderList[i].folderName[0]);
    } else {
      folderNames.push(folderList[i].folderName);
    }
  }

  if (folderPaths.length
    && folderNames.length) {
    await makeFolderBatch(syno, folderPaths, folderNames, outputProgressMessage);
  }
}

async function makeFolderBatch(syno, folderPathsArr, folderNamesArr, outputProgressMessage) {
  console.log("===== CREATING BATCH FOLDERS =====");
  console.log("=== PATHS ===");
  console.log(JSON.stringify(folderPathsArr));
  console.log("=== FOLDERS ===");
  console.log(JSON.stringify(folderNamesArr));

  var folderPromise = new Promise((resolve, reject) => {
    syno.fs.createFolder({
      folder_path: JSON.stringify(folderPathsArr),
      // Wrap the folder name in quotes. Why? If the folder name starts with a number, the Syno API
      // throws an unknown error. Adding quotes around it magically fixes it AND the quotes don't
      // appear in the folder name when Syno creates the folder. Crazy.
      name: JSON.stringify(folderNamesArr), //'"' + newFolderName + '"',
      force_parent: true,
    }, (err) => {
      if (err) {
        reject(err);
      }

      resolve();
    });
  });

  await folderPromise;

  const createdFolders = [];

  for (let i = 0; i < folderPathsArr.length; i++) {
    createdFolders.push(folderPathsArr[i] + "/" + folderNamesArr[i]);
  }

  const createdMessage = "Created folders:\n" + createdFolders.join('\n');
  console.log(createdMessage);

  if (outputProgressMessage) {
    outputProgressMessage(createdMessage);
  }
}

async function downloadFileBatch(syno, urls, destination) {

  var promise = new Promise((resolve) => {
    syno.dl.createTask({
      uri: urls.join(','),
      destination: destination,
    }, () => {
      resolve();
    });
  });

  await promise;

  console.log(`Created download tasks for:`);
  console.log(urls.join('\n'));
}

function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

module.exports = {
  handleUrlsAsync,
  findDomainHandler,
  tryInjectCredentials,
};
