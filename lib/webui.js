let express = require('express');
let logger = require('winston');
let path = require('path');
let fs = require('fs');
let Promise = require('bluebird');
let _ = require('lodash');
let moment = require('moment');

const Decoder = require('./decoder.js');
const Utils = require('./utils.js');
let decoder = new Decoder();
let utils = new Utils();

Promise.promisifyAll(fs);

class WebUI {
    constructor(config) {
        this.config = config;
    }

    launch() {
        if (this.config.ui.active) {
            let app = express();
            app.set('etag', false);

            app.get('/api/sessions', _.bind(this.getSessions, this));
            app.get('/api/session/:session', _.bind(this.getRequests, this));
            app.get('/api/request/:session/:request', _.bind(this.decodeRequest, this));
            app.get('/api/response/:session/:request', _.bind(this.decodeResponse, this));

            app.use(express.static(path.resolve(__dirname, '../webui')));

            app.listen(this.config.ui.port, () => {
                logger.info('UI started, port %s.', this.config.ui.port);
            });
        } else {
            logger.info('UI deactivated.');
        }
    }

    getSessions(req, res) {
        logger.info('Getting all sessions.');
        return utils.getSessionFolders()
        .then(data => {
            data = _.map(data, d => {
                return {
                    id: d,
                    title: moment(d, 'YYYYDDMM.HHmmss').format('DD MMM YY - HH:mm:ss'),
                };
            });
            res.json(data);
        });
    }

    getRequests(req, res) {
        logger.info('Getting requests for session %s', req.params.session);
        return fs.readdirAsync(`data/${req.params.session}`)
        .then(data => _.filter(data, d => _.endsWith(d, '.req.bin')))
        .then(data => {
            return Promise.map(data, file => {
                return fs.readFileAsync(`data/${req.params.session}/${file}`, 'utf8')
                        .then(content => {
                            return JSON.parse(content);
                        })
                        .then(req => {
                            req.id = _.trimEnd(file, '.req.bin');
                            return req;
                        });
            });
        })
        .then(files => {
            res.json(files);
        })
        .catch(e => res.status(500).send(e));
    }

    decodeRequest(req, res) {
        logger.info('Decrypting session %d, request %s', req.params.session, req.params.request);
        return decoder.decodeRequest(req.params.session, req.params.request)
        .then(data => {
            data.id = req.params.request;
            res.json(data);

        }).catch(e => {
            logger.error(e);
            res.status(500).send(e);

        });
    }

    decodeResponse(req, res) {
        logger.info('Decrypting session %d, response %s', req.params.session, req.params.request);
        return decoder.decodeResponse(req.params.session, req.params.request)
        .then(data => {
            res.json(data);

        }).catch(e => {
            logger.error(e);
            res.status(500).send(e);

        });
    }
}

module.exports = WebUI;
