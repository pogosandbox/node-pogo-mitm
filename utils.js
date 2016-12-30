let fs = require('fs');
let moment = require('moment');
let Promise = require('bluebird');

Promise.promisifyAll(fs);

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
