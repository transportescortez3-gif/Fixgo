import assert from "node:assert/strict";
import {
  consumeSecuritySelfieServiceId,
  parseSecuritySelfieServiceId,
} from "./security-selfie-request";

let search = "?tab=active&securitySelfieServiceId=41";
assert.equal(parseSecuritySelfieServiceId(search), 41);

const consumed = consumeSecuritySelfieServiceId(search, 41);
assert.equal(consumed, "tab=active");
search = consumed ? `?${consumed}` : "";
assert.equal(parseSecuritySelfieServiceId(search), null, "opening the modal consumes only its one-shot URL trigger");

search = "?tab=active&securitySelfieServiceId=41";
assert.equal(parseSecuritySelfieServiceId(search), 41, "a later tap can request the same service again");

assert.equal(consumeSecuritySelfieServiceId(search, 99), null, "do not consume another service's request");
assert.equal(parseSecuritySelfieServiceId("?securitySelfieServiceId=0"), null);
assert.equal(parseSecuritySelfieServiceId("?securitySelfieServiceId=bad"), null);

console.log("Security selfie retry request checks passed");
