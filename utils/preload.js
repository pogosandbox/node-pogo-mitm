let logger = require('winston');
let fs = require('fs');
let Promise = require('bluebird');
let _ = require('lodash');

Promise.promisifyAll(fs);

let Config = require('./../lib/config');
const Utils = require('./../lib/utils.js');
const Decoder = require('./../lib/decoder.js');

class Preload {
    constructor(config) {
        this.config = config || new Config().load();
        this.utils = new Utils(this.config);
        this.decoder = new Decoder(this.config);

        logger.loglevel = this.config.loglevel;
    }

    preload() {
        return this.utils.cleanDataFolders()
                .then(() => this.utils.getSessionFolders())
                .then(folders => Promise.map(folders, _.bind(this.preloadSession, this)));
    }

    preloadSession(folder) {
        if (fs.existsSync(`data/${folder}/.preload`)) return;

        logger.info('Preload session %s', folder);
        return fs.readdirAsync(`data/${folder}`)
                .then(files => {
                    return this.processRequests(folder, files)
                            .then(data => this.processResponses(folder, files)
                                            .then(() => {
                                                data = _.filter(data, d => d.lat && d.lng);
                                                return fs.writeFileAsync(`data/${folder}/.preload`, JSON.stringify(data), 'utf8');
                                            }));
                });
    }

    processRequests(session, files) {
        files = _.filter(files, f => _.endsWith(f, '.req.bin'));
        return Promise.map(files, file => {
            return this.decoder.decodeRequest(session, _.trimEnd(file, '.req.bin'));
        })
        .then(data => {
            return _.map(data, d => {
                return {
                    lat: d.decoded.latitude,
                    lng: d.decoded.longitude,
                };
            });
        })
        .catch(e => {
            throw e;
        });
    }

    processResponses(session, files) {
        files = _.filter(files, f => _.endsWith(f, '.res.bin'));
        return Promise.map(files, file => {
            return this.decoder.decodeResponse(session, _.trimEnd(file, '.res.bin'));
        });
    }
}

let preload = new Preload();
preload.preload()
.then(() => logger.info('Done.'))
.then(() => process.exit());
