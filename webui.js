let express = require('express');
let logger = require('winston');
let path = require('path');
let fs = require('fs');
let Promise = require('bluebird');
let _ = require('lodash');
let moment = require('moment');

Promise.promisifyAll(fs);

class WebUI {
    constructor(config) {
        this.config = config;
    }

    launch() {
        // var bodyParser = require('body-parser');
        var app = express();
        app.set("etag", false);

        app.get('/api/sessions', function(req, res) {
            fs.readdirAsync('data')
            .then(data => {
                return Promise.filter(data, dir => {
                    return fs.readdirAsync(`data/${dir}`)
                            .then(d => d.length > 0);
                });
            })
            .then(data => {
                data = _.map(data, d => {
                    return {
                        id: d,
                        title: moment(d, 'YYYYDDMM.HHmmss').format("DD MMM YY - HH:mm:ss")
                    };
                });
                res.json(data);
            });
        });

        app.get('/api/session/:session', function(req, res) {
            fs.readdirAsync(`data/${req.params.session}`)
            .then(data => {
                return Promise.map(data, file => {
                    return fs.readFileAsync(`data/${req.params.session}/${file}`, "utf8")
                            .then(content => {
                                return JSON.parse(content);
                            })
                            .then(req => {
                                req.id = _.trimEnd(file, ".bin")
                                return req;
                            });
                });
            })
            .then(files => {
                res.json(files);
            })
            .catch(e => res.status(500).send(e));
        });

        app.use(express.static(path.resolve(__dirname, 'webui')));

        app.listen(this.config.webuiPort, () => {
            logger.info("UI started.");
        });
    }

}

module.exports = WebUI;