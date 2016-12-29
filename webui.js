let express = require('express');
let logger = require('winston');
let path = require('path');
let fs = require('fs');
let Promise = require('bluebird');
let _ = require('lodash');
let moment = require('moment');
let POGOProtos = require('node-pogo-protos');

Promise.promisifyAll(fs);

class WebUI {
    constructor(config) {
        this.config = config;
    }

    launch() {
        // var bodyParser = require('body-parser');
        var app = express();
        app.set("etag", false);

        app.get('/api/sessions', this.getSessions);
        app.get('/api/session/:session', this.getRequests);
        app.get('/api/request/:session/:request', this.decryptRequest);

        app.use(express.static(path.resolve(__dirname, 'webui')));

        app.listen(this.config.webuiPort, () => {
            logger.info("UI started.");
        });
    }

    getSessions(req, res) {
        logger.info("Getting all sessions.");
        fs.readdirAsync('data')
        .then(data => {
            data = _.map(data, d => {
                return {
                    id: d,
                    title: moment(d, 'YYYYDDMM.HHmmss').format("DD MMM YY - HH:mm:ss")
                };
            });
            res.json(data);
        });
    }

    getRequests(req, res) {
        logger.info("Getting requests for session %s", req.params.session);
        fs.readdirAsync(`data/${req.params.session}`)
        .then(data => _.filter(data, d => _.endsWith(d, ".req.bin")))
        .then(data => {
            return Promise.map(data, file => {
                return fs.readFileAsync(`data/${req.params.session}/${file}`, "utf8")
                        .then(content => {
                            return JSON.parse(content);
                        })
                        .then(req => {
                            req.id = _.trimEnd(file, ".req.bin");
                            return req;
                        });
            });
        })
        .then(files => {
            res.json(files);
        })
        .catch(e => res.status(500).send(e));
    }

    decryptRequest(req, res) {
        logger.info("Decrypting session %d, request %s", req.params.session, req.params.request);
        fs.readFileAsync(`data/${req.params.session}/${req.params.request}.req.bin`)
        .then(content => {
            let data = JSON.parse(content);
            let raw = Buffer.from(data.data, 'base64');
            data.id = req.params.request;
            data.decoded = POGOProtos.Networking.Envelopes.RequestEnvelope.decode(raw);
            _.each(data.decoded.requests, req => {
                var reqname = _.findKey(POGOProtos.Networking.Requests.RequestType, r => r == req.request_type);
                reqname = _.upperFirst(_.camelCase(reqname)) + "Message";
                let requestType = POGOProtos.Networking.Requests.Messages[reqname];
                req.request_message = requestType.decode(req.request_message);
            });
            res.json(data);
        });
        
    }
}

module.exports = WebUI;