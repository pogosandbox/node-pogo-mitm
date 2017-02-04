require('dotenv').config({ silent: true });
import * as fs from 'fs';
import * as logger from 'winston';
import * as dns from 'dns';
let Promise = require('bluebird');
Promise.promisifyAll(fs);
Promise.promisifyAll(dns);
import Config from './lib/config';
import Proxy from './lib/proxy';
import WebUI from './lib/webui';
import Utils from './lib/utils';
let config = new Config().load();
let utils = new Utils(config);
utils.initFolders()
    .then(() => {
    let proxy = new Proxy(config);
    proxy.launch();
})
    .then(() => {
    let webui = new WebUI(config);
    webui.launch();
})
    .then(() => {
    logger.info('App ready.');
})
    .catch(e => {
    logger.error(e);
});
//# sourceMappingURL=index.js.map