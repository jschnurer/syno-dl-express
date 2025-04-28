const downloader = require("./downloader.js");
const axios = require("axios");

async function handleUrlsAsync(urls, settings, outputProgressMessage) {
  if (!urls.length) {
    throw new Error("No urls were provided!");
  }

  let allUrls = [];
  let allFolders = [];

  for (let i = 0; i < urls.length; i++) {
    console.log(urls[i]);
    await recurseFolder(encodeURI(decodeURI(urls[i])), allUrls, allFolders, 1, outputProgressMessage, settings);
  }

  // Use the downloader to handle all the URLs.
  await downloader.handleUrlsAsync(allUrls, true, settings.synoSettings, outputProgressMessage);
}

async function recurseFolder(folderUrl, allUrls, allFolders, depth, outputProgressMessage, settings) {
  if (!folderUrl.endsWith('/')) {
    throw new Error("All folder urls to recurse must end with '/'!");
  }

  let pageUrls = gatherLinks(await downloadPage(folderUrl, settings))
    .filter(x => !x.startsWith(".."));

  // Add this downloaded page to the folders list.
  allFolders.push(folderUrl.toLowerCase());

  allUrls.push(...pageUrls.filter(x => !x.endsWith("/"))
    .map(x => x.startsWith("/")
      ? undefined
      : folderUrl + x
      ));

  let subFolders = pageUrls.filter(x => x.endsWith("/"));

  if (depth >= settings.folderDownloader.maxDepth) {
    outputProgressMessage(`MAX DEPTH REACHED! SKIPPING: ${subFolders.join("\r\n")}`)
    return;
  }

  for (let i = 0; i < subFolders.length; i++) {
    if (allFolders.indexOf(subFolders[i].toLowerCase()) > -1) {
      // Skip this link if it was already scanned.
      continue;
    }

    await recurseFolder(folderUrl + subFolders[i], allUrls, allFolders, depth+1, outputProgressMessage, settings);
  }
}

async function downloadPage(url, settings) {
  const response = await axios.get(downloader.tryInjectCredentials(url, settings.synoSettings));
  return response.data;
}

function gatherLinks(html) {
  var linkUrls = html.toString().matchAll(/a href="(.+?)"/g);
  var matches = [...linkUrls];

  if (!matches) {
    return [];
  }

  return matches.map(x => x[1]);
}

module.exports = {
  handleUrlsAsync,
};