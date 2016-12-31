let fs = require('fs');
let moment = require('moment');
let Promise = require('bluebird');
let os = require('os');
let _ = require('lodash');

Promise.promisifyAll(fs);

class Utils {
    constructor(config) {
        this.config = config;
    }

    getIp() {
        let ipv4 = _(os.networkInterfaces())
                .filter((i, name) => !/(loopback|vmware|internal)/gi.test(name))
                .first().filter(ip => !ip.internal && ip.family == 'IPv4');

        return _.first(ipv4).address;
    }

    initFolders() {
        return this.cleanDataFolders().then(() => this.createCurrentFolder());
    }

    createCurrentFolder() {
        this.config.datadir = 'data/' + moment().format('YYYYDDMM.HHmmss');
        return fs.mkdirAsync(this.config.datadir);
    }

    getSessionFolders() {
        return fs.readdirAsync('data')
                .then(files => Promise.filter(files, file => fs.statAsync('data/' + file).then(r => r.isDirectory())));
    }

    cleanDataFolders() {
        try {
            fs.mkdirSync('data');
        } catch(e) {}

        return this.getSessionFolders()
                .then(data => {
                    return Promise.filter(data, dir => {
                        return fs.readdirAsync(`data/${dir}`)
                                .then(d => d.length == 0);
                    });
                })
                .then(data => {
                    return Promise.map(data, dir => {
                        return fs.rmdirAsync(`data/${dir}`);
                    });
                });
    }
}

module.exports = Utils;
