require('dotenv').config({silent: true});

import * as logger from 'winston';

import Config from './lib/config';
import Utils from './lib/utils';
import Proxy from './lib/proxy';
import WebUI from './lib/webui';
import AlternateEndpoint from './lib/alternate.endpoint';

async function Main() {
    let config = new Config().load();
    let utils = new Utils(config);

    await utils.initFolders();

    let proxy = new Proxy(config);
    await proxy.launch();

    let endpoint = new AlternateEndpoint(config);
    await endpoint.launch();

    let webui = new WebUI(config);
    await webui.launch();

    logger.info('App ready.');
}

try {
    Main();
} catch (e) {
    logger.error(e);
}