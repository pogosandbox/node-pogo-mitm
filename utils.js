let fs = require('fs');
let moment = require('moment');
let Promise = require('bluebird');

class Utils {
    constructor(config) {
        this.config = config;
    }

    initFolders() {
        return this.cleanDataFolders().then(() => this.createCurrentFolder());
    }

    createCurrentFolder() {
        this.config.datadir = 'data/' + moment().format('YYYYDDMM.HHmmss');
        return fs.mkdirAsync(this.config.datadir);
    }

    cleanDataFolders() {
        try {
            fs.mkdirSync('data');
        } catch(e) {}

        return fs.readdirAsync('data')
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
