"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const logger = require("winston");
const fs = require("fs");
const _ = require("lodash");
const moment = require("moment");
let yaml = require('js-yaml');
let config = {
    reqId: 0,
    proxy: {
        active: true,
        port: process.env.PROXY_PORT || 8888,
        onlyApi: true,
        plugins: [],
    },
    ui: {
        active: true,
        port: process.env.WEBUI_PORT || 8080,
        auth: {
            active: false,
            users: [],
        },
        ga: {
            key: 'UA-92205812-1',
        }
    },
    alternateEndpoint: {
        active: false,
        https: false,
    },
    protos: {
        cachejson: true,
    },
    export: {
        csv: {
            separator: ',',
        },
    },
    logger: {
        level: 'info',
        file: null,
    },
};
class Config {
    load() {
        let loaded = null;
        try {
            if (!fs.existsSync('data')) {
                fs.mkdirSync('data');
            }
            if (!fs.existsSync('config/config.yaml')) {
                logger.info('Config file not found in config/config.yaml, using default.');
            }
            else {
                logger.info('Loading config/config.yaml');
                let content = fs.readFileSync('config/config.yaml', 'utf8');
                loaded = yaml.safeLoad(content);
                loaded = _.defaultsDeep(loaded, config);
            }
            logger.remove(logger.transports.Console);
            logger.add(logger.transports.Console, {
                'timestamp': function () {
                    return moment().format('HH:mm:ss');
                },
                'colorize': false,
                'level': loaded.logger.level,
            });
            if (loaded.logger.file) {
                logger.add(logger.transports.File, {
                    'timestamp': function () {
                        return moment().format('HH:mm:ss');
                    },
                    'filename': loaded.logger.file,
                    'json': false,
                    'level': loaded.logger.level,
                });
            }
        }
        catch (e) {
            logger.error(e);
            debugger;
        }
        return loaded;
    }
}
exports.default = Config;
//# sourceMappingURL=config.js.map