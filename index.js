require('dotenv').config({silent: true});

let logger = require('winston');
let fs = require('fs');
let Promise = require('bluebird');
let dns = require('dns');

Promise.promisifyAll(fs);
Promise.promisifyAll(dns);

let Config = require('./lib/config');
let Proxy = require('./lib/proxy');
let WebUI = require('./lib/webui');
let Utils = require('./lib/utils');

let config = new Config().load();

logger.level = config.logger.level;
if (config.logger.file) {
    logger.add(logger.transports.File, {filename: config.logger.file, json: false});
}

let utils = new Utils(config);

utils.initFolders()
.then(() => {
    let proxy = new Proxy(config);
    proxy.launch();
})
.then(() => {
    let webui = new WebUI(config);
    webui.launch();
});
