import * as logger from 'winston';
import * as fs from 'fs';
import * as _ from 'lodash';
import * as moment from 'moment';

let yaml = require('js-yaml');

let config = {
    reqId: 0,
    proxy: {
        active: true,
        port: process.env.PROXY_PORT || 8888,
    },
    ui: {
        active: true,
        port: process.env.WEBUI_PORT || 8080,
        auth: {
            active: false,
            users: [],
        },
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

export default class Config {
    load(): any {
        let loaded = config;
        if (!fs.existsSync('data/config.yaml')) {
            logger.info('Config file not found in data/config.yaml, using default.');
        } else {
            logger.info('Loading data/config.yaml');
            let loaded = yaml.safeLoad(fs.readFileSync('data/config.yaml', 'utf8'));
            loaded = _.defaultsDeep(loaded, config);
        }

        logger.remove(logger.transports.Console);
        logger.add(logger.transports.Console, {
            'timestamp': function() {
                return moment().format('HH:mm:ss');
            },
            'colorize': true,
            'level': loaded.logger.level,
        });

        if (config.logger.file) {
            logger.add(logger.transports.File, {
                filename: loaded.logger.file,
                json: false,
                level: loaded.logger.level
            });
        }

        return loaded;
    }
}
