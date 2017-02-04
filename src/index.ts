require('dotenv').config({silent: true});

import * as logger from 'winston';

import Config from './lib/config';
import Proxy from './lib/proxy';
import WebUI from './lib/webui';
import Utils from './lib/utils';

let config = new Config().load();
let utils = new Utils(config);

async function Main() {
    await utils.initFolders();

    logger.debug('Launching proxy...');
    let proxy = new Proxy(config);
    await proxy.launch();

    let webui = new WebUI(config);
    await webui.launch();

    logger.info('App ready.');
}

try {
    Main();
} catch(e) {
    logger.error(e);
}