// Copyright 2016 Google Inc.
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//      http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.


class NoTokenSetWhileMakingRequest extends Error {

    constructor ( ) {

        super();

        this.name = "NoTokenSetWhileMakingRequest";
        this.message = [
            "Network manager was asked to make a request but a token"
            , "was not set on the manager instance."
        ].join(" ");
        this.stack = new Error().stack;
    }
}

class TokenMustBeString extends Error {

    constructor ( ) {

        super();

        this.name = "TokenMustBeString";
        this.message = [
            "Network manager was asked to set its token, but the given"
            , "token was not of type string."
        ].join(" ");
        this.stack = new Error().stack;
    }
}


module.exports = {
    NoTokenSetWhileMakingRequest
    , TokenMustBeString
};
