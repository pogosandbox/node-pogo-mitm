"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
require('dotenv').config({ silent: true });
const logger = require("winston");
const config_1 = require("./lib/config");
const utils_1 = require("./lib/utils");
const proxy_1 = require("./lib/proxy");
const webui_1 = require("./lib/webui");
const alternate_endpoint_1 = require("./lib/alternate.endpoint");
function Main() {
    return __awaiter(this, void 0, void 0, function* () {
        const config = new config_1.default().load();
        const utils = new utils_1.default(config);
        yield utils.initFolders();
        const proxy = new proxy_1.default(config);
        yield proxy.launch();
        const endpoint = new alternate_endpoint_1.default(config);
        yield endpoint.launch();
        const webui = new webui_1.default(config);
        yield webui.launch();
        logger.info('App ready.');
    });
}
try {
    Main();
}
catch (e) {
    logger.error(e);
}
//# sourceMappingURL=index.js.map