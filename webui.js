
let express = require('express');
let logger = require('winston');
var path = require('path');

class WebUI {
    constructor(config) {
        this.config = config;
    }

    launch() {
        // var bodyParser = require('body-parser');
        var app = express();

        // app.use(bodyParser.urlencoded({ extended: true }));
        // app.use(bodyParser.json());
        // app.set("etag", false);
        app.use(express.static(path.resolve(__dirname, 'webui')));

        app.listen(this.config.webuiPort, () => {
            logger.info("UI started.");
        });
    }

}

module.exports = WebUI;