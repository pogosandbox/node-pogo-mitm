import * as logger from 'winston';
import * as fs from 'fs';
import * as _ from 'lodash';
import * as moment from 'moment';

const yaml = require('js-yaml');
const winstonCommon = require('winston/lib/winston/common');

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
    },
};

export default class Config {
    load(): any {
        let loaded = null;
        try {
            if (!fs.existsSync('data')) {
                fs.mkdirSync('data');
            }

            logger.transports.Console.prototype.log = function (level, message, meta, callback) {
                const output = winstonCommon.log(Object.assign({}, this, {
                    level,
                    message,
                    meta,
                }));
                console[level in console ? level : 'log'](output);
                setImmediate(callback, null, true);
            };

            if (!fs.existsSync('config/config.yaml')) {
                logger.info('Config file not found in config/config.yaml, using default.');
                loaded = config;
            } else {
                logger.info('Loading config/config.yaml');
                let content = fs.readFileSync('config/config.yaml', 'utf8');
                loaded = yaml.safeLoad(content);
                loaded = _.defaultsDeep(loaded, config);
            }

            logger.remove(logger.transports.Console);
            logger.add(logger.transports.Console, {
                'timestamp': function() {
                    return moment().format('HH:mm:ss');
                },
                'colorize': false,
                'level': loaded.logger.level,
            });

            if (loaded.logger.file) {
                logger.add(logger.transports.File, {
                    'timestamp': function() {
                        return moment().format('HH:mm:ss');
                    },
                    'filename': loaded.logger.file,
                    'json': false,
                    'level': loaded.logger.level,
                });
            }
        } catch (e) {
            logger.error(e);
        }

        return loaded;
    }
}
