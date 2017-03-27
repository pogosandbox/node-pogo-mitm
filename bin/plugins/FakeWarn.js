"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const _ = require("lodash");
const BasePlugin_1 = require("./BasePlugin");
class FakeWarn extends BasePlugin_1.default {
    handleResponse(context, response) {
        return __awaiter(this, void 0, void 0, function* () {
            let main = _.first(response.responses);
            if (main && main.request_name === 'GET_PLAYER') {
                // getPlayer()
                main.warn = true;
                // we modified something
                return true;
            }
            return false;
        });
    }
}
module.exports = new FakeWarn();
//# sourceMappingURL=FakeWarn.js.map