import * as express from 'express';
import * as logger from 'winston';
import * as path from 'path';
import * as fs from 'mz/fs';
import * as _ from 'lodash';
import * as moment from 'moment';
import * as passport from 'passport';
import * as Bluebird from 'bluebird';
import * as bodyparser from 'body-parser';

import Decoder from './decoder.js';
import Utils from './utils.js';
import Analysis from '../utils/analysis';
import Csv from './../export/libcsv';

export default class WebUI {
    config: any;
    decoder: Decoder;
    utils: Utils;
    app: any;

    constructor(config) {
        this.config = config;
        this.decoder = new Decoder(config);
        this.utils = new Utils(config);
    }

    launch() {
        const config = this.config.ui;
        if (config.active) {
            const app = this.app = express();
            app.set('etag', false);

            if (config.auth.active) this.activateAuth();

            app.use('/api*', function(req, res, next) {
                res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
                res.header('Expires', '-1');
                res.header('Pragma', 'no-cache');
                next();
            });

            app.get('/api/config', <express.RequestHandler>_.bind(this.getConfig, this));
            app.get('/api/sessions', <express.RequestHandler>_.bind(this.getSessions, this));
            app.get('/api/session/:session', <express.RequestHandler>_.bind(this.getRequests, this));
            app.get('/api/request/:session/:request', <express.RequestHandler>_.bind(this.decodeRequest, this));
            app.get('/api/response/:session/:request', <express.RequestHandler>_.bind(this.decodeResponse, this));
            app.get('/api/export/csv', <express.RequestHandler>_.bind(this.exportCsv, this));
            app.post('/api/analyse/:session', <express.RequestHandler>_.bind(this.analyse, this));
            app.get('/api/analyse/:session', <express.RequestHandler>_.bind(this.analyseResult, this));

            if (config.upload) {
                app.use('/upload/*', bodyparser.raw({ type: '*/*' }));
                app.post('/upload/:mode/:session/:req', <express.RequestHandler>_.bind(this.upload, this));
            }

            this.app.get('/logout', function(req, res) {
                                    req.logout();
                                    res.redirect('/');
                                });

            app.use(express.static('webui'));

            app.listen(config.port, () => {
                logger.info('UI started, port %s.', config.port);
            });

        } else {
            logger.info('UI deactivated.');
        }
    }

    activateAuth(): void {
        logger.info('Activate GitHub authentication.');
        const config = this.config.ui;
        const GitHubStrategy = require('passport-github2').Strategy;
        passport.use(new GitHubStrategy(
            {
                clientID: config.auth.githubClientId,
                clientSecret: config.auth.githubClientSecret,
                callbackURL: config.auth.callbackUrl,
            },
            function(accessToken, refreshToken, profile, done) {
                if (_.find(config.auth.users, u => u === profile.username)) {
                    logger.debug('User %s logged in.', profile.username);
                    return done(null, profile);
                } else {
                    return done('unauthorize', null);
                }
            }
        ));

        passport.serializeUser(function(user, done) {
            done(null, JSON.stringify(user));
        });

        passport.deserializeUser(function(user, done) {
            if (typeof user === 'string') {
                done(null, JSON.parse(user));
            } else {
                done(null, user);
            }
        });

        const cookieSession = require('cookie-session');
        this.app.use(cookieSession({
            name: 'mitm.session',
            secret: config.auth.secret,
            maxAge: 24 * 60 * 60 * 1000,
        }));

        this.app.use(passport.initialize());
        this.app.use(passport.session());

        this.app.get('/auth/github',
                    passport.authenticate('github', {scope: ['user:email']}),
                    function(req, res) {});

        this.app.get('/auth/github/callback',
                    passport.authenticate('github', {failureRedirect: '/auth/github'}),
                    function(req, res) {
                        res.redirect('/');
                    });

        this.app.get('/logout', function(req, res) {
                                req.logout();
                                res.redirect('/');
                            });

        this.app.use(function(req, res, next) {
            if (!req.isAuthenticated() && !_.startsWith(req.path, '/auth') && !_.startsWith(req.path, '/public')  && !_.startsWith(req.path, '/upload')) {
                res.redirect('/auth/github');
            } else {
                next();
            }
        });
    }

    async getConfig(req: express.Request, res: express.Response, next: Function): Promise<express.Response> {
        return res.json({
            auth: this.config.ui.auth.active,
            ga: this.config.ui.ga.key,
        });
    }

    async getSessions(req: express.Request, res: express.Response, next: Function): Promise<express.Response> {
        logger.info('Getting sessions.');
        try {
            const folders = await this.utils.getSessionFolders();
            const data = await Bluebird.map(folders, async folder => {
                const info = {
                    id: folder,
                    title: moment(folder, 'YYYYMMDD.HHmmss').format('DD MMM YY - HH:mm:ss'),
                };
                if (fs.existsSync(`data/${folder}/.info`)) {
                    const content = await fs.readFile(`data/${folder}/.info`, 'utf8');
                    info.title += ' ' + content;
                }
                return info;
            });
            return res.json(data);
        } catch (e) {
            logger.error(e);
            res.status(500).send(e);
        }
    }

    async getRequests(req: express.Request, res: express.Response, next: Function): Promise<express.Response> {
        logger.info('Getting requests for session %s', req.params.session);
        try {
            let files = await fs.readdir(`data/${req.params.session}`);
            files = _.filter(files, d => _.endsWith(d, '.req.bin'));

            const force = !this.config.protos.cachejson;
            const infos = await Bluebird.map(files, async file => {
                const content = await fs.readFile(`data/${req.params.session}/${file}`, 'utf8');
                if (content.length > 0) {
                    const request = JSON.parse(content);
                    request.title = '';
                    const coords = { lat: 0, lng: 0};
                    try {
                        const decoded = await this.decoder.decodeRequest(req.params.session, _.trimEnd(file, '.req.bin'), force);
                        if (decoded && decoded.decoded) {
                            coords.lat = decoded.decoded.latitude;
                            coords.lng = decoded.decoded.longitude;
                            const main = _.first(decoded.decoded.requests) as any;
                            if (main) {
                                request.title = main.request_name;
                            }
                            request.title += ` (${decoded.decoded.requests.length})`;
                        }
                    } catch (e) {}

                    delete request.data;
                    request.id = _.trimEnd(file, '.req.bin');
                    return {
                        file: request,
                        coords,
                    };
                } else {
                    // fake request when only response
                    return {
                        file: {
                            title: 'UNKNOWN',
                            decoded: {},
                            id: _.trimEnd(file, '.req.bin'),
                        },
                        coords: {
                            lat: 0, lng: 0,
                        }
                    };
                }
            });

            const result = {
                title: '',
                files: infos.map(info => info.file),
                steps: infos.map(info => info.coords),
            };

            if (fs.existsSync(`data/${req.params.session}/.info`)) {
                const info = await fs.readFile(`data/${req.params.session}/.info`, 'utf8');
                result.title = info;
            }

            return res.json(result);
        } catch (e) {
            logger.error(e);
            res.status(500).send(e);
        }
    }

    async decodeRequest(req: express.Request, res: express.Response, next: Function): Promise<express.Response> {
        logger.info('Decrypting session %d, request %s', req.params.session, req.params.request);
        try {
            const force = !this.config.protos.cachejson;
            const data = await this.decoder.decodeRequest(req.params.session, req.params.request, force);
            return res.json(data);
        } catch (e) {
            logger.error(e);
            return res.status(500).send(e);
        }
    }

    async decodeResponse(req: express.Request, res: express.Response, next: Function): Promise<express.Response> {
        logger.info('Decrypting session %d, response %s', req.params.session, req.params.request);
        try {
            const force = !this.config.protos.cachejson;
            const data = await this.decoder.decodeResponse(req.params.session, req.params.request, force);
            return res.json(data);
        } catch (e) {
            logger.error(e);
            return res.status(500).send(e);
        }
    }

    async exportCsv(req: express.Request, res: express.Response, next: Function) {
        try {
            const stats = await fs.stat('data/requests.signatures.csv');
            const mtime = moment(stats.mtime);
            if (mtime.add(15, 'm').isAfter(moment())) {
                return res.sendFile('requests.signatures.csv', {root: 'data'});
            } else {
                throw new Error('File too old.');
            }
        } catch (e) {
            logger.info('Export signatures to CSV.');
            const csv = new Csv(this.config);
            const file = await csv.exportRequestsSignature('requests.signatures.csv');
            res.sendFile(file, {root: 'data'});
        }
    }

    async analyse(req: express.Request, res: express.Response, next: Function): Promise<express.Response> {
        const report = `data/${req.params.session}/analysis.html`;
        const redirect = '/api/analyse/' + req.params.session;
        if (this.config.analysis.nocache || !await fs.exists(report)) {
            const analyser = new Analysis(this.config, this.utils);
            await analyser.run(req.params.session);
        }
        return res.json({
            redirect
        });
    }

    async analyseResult(req: express.Request, res: express.Response, next: Function) {
        const report = `data/${req.params.session}/analysis.html`;
        if (req.params.session && fs.existsSync(report)) {
            res.sendFile(report, {
                root: '.',
            });
        } else {
            res.status(404).send('Nope. Maybe because there is no issue found?');
        }
    }

    async upload(req: express.Request, res: express.Response, next: Function) {
        const session = req.params.session;
        const request = req.params.req;
        const mode = req.params.mode;
        try {
            if (mode !== 'request' && mode !== 'response') {
                res.status(500).send('Invalid.');
            } else if (!session || !request || !moment(session, 'YYYYMMDD.HHmmss').isValid()) {
                logger.error('Invalid params in upload: %s - %s', session, request);
                res.status(500).send('Invalid.');
            } else {
                if (!await fs.exists(`data/${session}`)) {
                    await fs.mkdir(`data/${session}`);
                    await fs.writeFile(`data/${session}/.info`, '(upload)', 'utf8');
                }
                const ext = mode === 'request' ? 'req.bin' : 'res.bin';
                await fs.writeFile(`data/${session}/${request}.${ext}`, req.body);
                res.send('ok');
            }
        } catch (e) {
            logger.error('Error in upload', e);
            res.status(500).send('Oups.');
        }
    }
}
