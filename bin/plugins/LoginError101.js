"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const BasePlugin_1 = require("./BasePlugin");
class LoginError100 extends BasePlugin_1.default {
    handleResponse(context, response) {
        return __awaiter(this, void 0, void 0, function* () {
            let requestId = response.request_id.toString(16);
            if (context.clientToProxyRequest.url === '/plfe/rpc') {
                response.api_url = '';
                response.status_code = 100;
            }
            return true; // we modified something
        });
    }
}
module.exports = new LoginError100();
//# sourceMappingURL=LoginError101.js.map