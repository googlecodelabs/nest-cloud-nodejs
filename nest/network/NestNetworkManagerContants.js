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
