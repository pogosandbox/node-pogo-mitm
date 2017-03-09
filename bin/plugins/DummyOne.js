"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const logger = require("winston");
const BasePlugin_1 = require("./BasePlugin");
class DummyOne extends BasePlugin_1.default {
    init(proxy) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('DummyOne Init');
        });
    }
    handleResponse(context, response) {
        return __awaiter(this, void 0, void 0, function* () {
            logger.debug('DummyOne.handleResponse');
            logger.debug('response', response.returns.length);
            // false = we did not modify anything
            return false;
        });
    }
}
module.exports = new DummyOne();
//# sourceMappingURL=DummyOne.js.map