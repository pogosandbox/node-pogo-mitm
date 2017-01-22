let logger = require('winston');
let fs = require('fs');
let Promise = require('bluebird');
let _ = require('lodash');

Promise.promisifyAll(fs);

let Config = require('./../lib/config');
const Utils = require('./../lib/utils.js');

class Cleaner {
    constructor(config) {
        this.config = config || new Config().load();
        this.utils = new Utils(this.config);

        logger.loglevel = this.config.loglevel;
    }

    clean() {
        return this.utils.cleanDataFolders()
                .then(() => this.utils.getSessionFolders())
                .then(folders => Promise.map(folders, _.bind(this.cleanSession, this)));
    }

    cleanSession(folder) {
        logger.info('Clean session %s', folder);
        return fs.readdirAsync(`data/${folder}`)
                .then(files => {

                });
    }
}

let cleaner = new Cleaner();
cleaner.clean()
.then(() => logger.info('Done.'))
.then(() => process.exit());
