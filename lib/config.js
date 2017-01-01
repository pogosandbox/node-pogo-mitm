let logger = require('winston');
let fs = require('fs');
let _ = require('lodash');
const yaml = require('js-yaml');

let config = {
    reqId: 0,
    proxy: {
        active: true,
        port: process.env.PROXY_PORT || 8888,
    },
    ngrok: {
        active: false,
        region: 'eu',
    },
    ui: {
        active: true,
        port: process.env.WEBUI_PORT || 8080,
    },
    loglevel: 'info',
};

class Config {
    load() {
        if (!fs.existsSync('data/config.yaml')) {
            logger.info('Config file not found in data/config.yaml, using default.');
            return config;
        }

        logger.info('Loading data/config.yaml');
        let loaded = yaml.safeLoad(fs.readFileSync('data/config.yaml', 'utf8'));
        return _.defaultsDeep(loaded, config);
    }
}

module.exports = Config;
