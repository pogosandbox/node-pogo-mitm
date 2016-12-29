require('dotenv').config({silent: true});

let logger = require('winston');
let _ = require('lodash');
let fs = require('fs');
let moment = require('moment');
let Promise = require('bluebird');
let dns = require('dns');

Promise.promisifyAll(fs);
Promise.promisifyAll(dns);

let Proxy = require('./proxy');
let WebUI = require('./webui');
let Utils = require('./utils');

let config = {
    reqId: 0,
    proxyPort: process.env.PROXY_PORT || 8888,
    webuiPort: process.env.WEBUI_PORT || 8080,
}

logger.level = "debug";

let utils = new Utils(config);

dns.lookupAsync(require('os').hostname())
.then(add => {
    config.ip = add;
    logger.info('Listening to: %s:%s', add, config.proxyPort);
})
.then(() => {
    return utils.initFolders();
})
.then(() => {
    let proxy = new Proxy(config);
    proxy.launch();
})
.then(() => {
    let webui = new WebUI(config);
    webui.launch();
});