# Settings Configuration
The app looks for a file named `local.settings.json` alongside `server.js`. You will need to create this file yourself to run the app.

```json
{
    "useHttp": true or false,
    "httpPort": portNumber,
    "useHttps": true or false,
    "httpsPort": portNumber,
    "sslCertPath": "/path/to/privkey.pm-and-cert.pm/",
    "synoSettings": {
        "protocol": "http" or "https",
        "host": "hostname" or "ipAddr",
        "port": portNumber,
        "account": "username",
        "password": "password",
        "apiVersion": "x.x.x" or emptystring (defaults to '6.0.2'),
        "baseDownloadDir": "//path/to/dl/folder",
        "domainHandlers": [{
            "urlMatch": "searchString",
            "createPathAfterUrlComponent": "urlComponent",
            "username": "username",
            "password": "password"
        }]
    },
    "deluge": {
        "url": "url to deluge",
        "password": "deluge password",
        "dlPath": "path to download torrent to"
    }
}
```

## HTTP Server
If `useHttp` is `true` in the settings, the server will listen to the `httpPort` over HTTP.

## SSL Server
If `useHttps` is `true` in the settings, the app will use the folder defined in `sslCertPath` and attempt to read the following files:

* privkey.pem
* cert.pem
* chain.pem

These are then used to host an HTTPS server on the port defined in `httpsPort`.

If neither `useHttp` nor `useHttps` is `true`, the server will throw an error and refuse to start.

## Domain Handlers
When a URL is sent to the app to be downloaded, it will check the list of "domainHandlers" found in the synoSettings in `local.settings.json`. If the app finds a domainHandler whose `urlMatch` property appears within the URL to download, it will add the specified credentials to the request by running this line of code:

```
url.replace('://', `://${domainHandler.username}:${domainHandler.password}@`);
```

This updated url will be sent to Download Station and the Basic-Auth credentials will be sent as part of DS's request when starting the download from the remote server.

Furthermore, the app will use the `createPathAfterUrlComponent` property to figure out the nested folder path. It will search the url for the value of `createPathAfterUrlComponent` and then find all subfolders in the url after that. Then, it will create the nested folder structure within the `settings.synoSettings.baseDownloadDir` folder.

Consider the following settings:
* `domainHandler.createPathAfterUrlComponent` = "/downloads/"
* `settings.synoSettings.baseDownloadDir` = "\\Downloads"

And the following Url:
* `http://somewebsite.com/files/downloads/2021/12/songs/mySong.mp3`

The app will find the `createPathAfterUrlComponent` value ("/downloads") in the url and then find all subfolders after it (`/2021/12/songs`). It will then create each of these folders inside the `baseDownloadDir` (`\\Downloads`). The end result is the following folders being created:

* `\\Downloads\2021`
* `\\Downloads\2021\12`
* `\\Downloads\2021\12\songs`

Finally, the file will be downloaded to `\\Downloads\2021\12\songs`.

If no `createPathAfterUrlComponent` is specified, or if no domainHandler is found for a given URL, it will simply download the target file directly to the `synoSettings.baseDownloadDir`.

# Using the server

## Submitting files to Download Station
Make an HTTP POST to `/submitUrls` with the following JSON body format:

```json
{
    "urls": ["url1", "url2", "etc"]
}
```

## Submitting a magnet link to deluge
Make an HTTP POST to `/submitMagnet` with the following JSON body format;

```json
{
    "url": "the url to download"
}
```

The magnet url specified in "url" will be sent to the deluge install located at `settings.deluge.url`, using the password specified in `settings.deluge.password`. The torrent will be downloaded to `settings.deluge.dlPath`.