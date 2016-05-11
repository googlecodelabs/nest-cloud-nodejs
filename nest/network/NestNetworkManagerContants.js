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

'use strict';

module.exports = {
    EMITABLE_EVENTS: {
        "serviceStreamDataUpdate": "serviceStreamDataUpdate"
        , "serviceStreamClosed": "serviceStreamClosed"
        , "authTokenRevoked": "authTokenRevoked"
    }
    , NETWORK_STREAM_EVENTS: {
        "auth_revoked": "auth_revoked"
        , "put": "put"
        , "keep_alive": "keep-alive"
    }
    , NETWORK_ERROR_EVENTS: {
        "UNDER_RATE_LIMITS": "UNDER_RATE_LIMITS"
        , "PATH_NOT_FOUND": "PATH_NOT_FOUND"
        , "API_INTERNAL_ERROR": "API_INTERNAL_ERROR"
        , "AUTH_ERROR": "AUTH_ERROR"
        , "FORBIDDEN": "FORBIDDEN"
        , "SERVICE_UNAVAILABLE": "SERVICE_UNAVAILABLE"
    }
};
