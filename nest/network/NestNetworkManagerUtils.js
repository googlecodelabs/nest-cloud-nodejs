'use strict';

const isString = require('lodash').isString;

/**
 * Generates a URL used for the HTTP REST-STREAMING method for
 * streaming changes on the account root.
 * @function
 * @name generateSubscribeUrl
 * @param {String} baseUrl - the base url of the target API
 * @returns {String} - the fully formed root streaming url
 */
function generateSubscribeUrl ( baseUrl ) {

    return baseUrl;
}

/**
 * Generates a URL used for the HTTP PUT method for updating devices.
 * @function
 * @name generateDeviceUpdatePutUrl
 * @param {String} baseUrl - the base url of the target API
 * @param {String} deviceId - the WWN device id
 * @param {String} deviceType - the WWN device type ( thermostat, camera )
 * @param {String} keyToUpdate - the target key to update ( e.g. target_temperature_c )
 * @returns {String} - the fully formed PUT url
 */
function generateDeviceUpdatePutUrl ( baseUrl, deviceId, deviceType, keyToUpdate ) {

    return [
        baseUrl
        , "devices"
        , deviceType
        , deviceId
        , keyToUpdate
    ].join("/");
}

/**
 * Generates an options object which is used with the request library to
 * facilitate a REST stream request against the WWN API for an account.
 * @function
 * @name generateServiceStreamRequestOptions
 * @param {String} baseUrl - the base url of the target API
 * @param {String} accessToken - the users token for use with the WWN API
 * @returns {Object} - the options object used by the node request library
 */
function generateServiceStreamRequestOptions ( baseUrl, accessToken ) {

    return {
        url: generateSubscribeUrl( baseUrl )
        , followRedirect: true
        , removeRefererHeader: false
        , headers: {
            'Accept': 'text/event-stream'
            , "Authorization": [ "Bearer", accessToken ].join(" ")
        }
    };
}

/**
 * Generates an options object which is used with the request library to
 * facilitate a PUT request against the WWN API for a given device and field.
 * @function
 * @name generateDeviceUpdateRequestOptions
 * @param {String} baseUrl - the base url of the target API
 * @param {String} accessToken - the users token for use with the WWN API
 * @param {Object} deviceData - the device object ( returned by the representation manager )
 * @param {String} keyToUpdate - the target key to update ( e.g. target_temperature_c )
 * @param {String|Number} valueToUpdateWith - the value to update the target field with
 * @returns {Object} - the options object used by the node request library
 */
function generateDeviceUpdateRequestOptions ( baseUrl, accessToken, deviceData, keyToUpdate, valueToUpdateWith ) {

    const body = isString(valueToUpdateWith) ? valueToUpdateWith : valueToUpdateWith.toString();

    return {
        url: generateDeviceUpdatePutUrl(
            baseUrl
            , deviceData.device_id
            , deviceData._deviceType
            , keyToUpdate
        )
        , method: "PUT"
        , followRedirect: true
        , removeRefererHeader: false
        , headers: {
            'Content-Type':  'text'
            , 'User-Agent':    'Nest Codelab API'
            , "Authorization": [ "Bearer", accessToken ].join(" ")
        }
        , body: body
    };
}

/**
 * Attempts to parse the given string into a JS object. Will catch any
 * errors found in decoding and return FALSE if the parsing fails.
 * @function
 * @name checkDataBodyForJSONIntegrity
 * @param {String} body - the string to be parsed into a JS object
 * @returns {Object|Boolean} - the parsed object or FALSE on parse failure
 */
function parseStringIntoJsObject ( body ) {

    var parsedBody = {};

    try {

        parsedBody = JSON.parse( body );
    } catch ( e ) {

        // the string is not a valid JSON string, return false;
        return false;
    }

    return parsedBody;
}

/**
 * Splits a string across the '\n' char.
 * @function
 * @name splitStringByNewlines
 * @param {String} body - the string to be parsed into a JS object
 * @returns {Array} - the string split across the '\n' char
 */
function splitStringByNewlines ( body ) {

    return body.split("\n");
}

/**
 * Extracts the event type from a REST stream update string
 * @function
 * @name extractStreamUpdateEventType
 * @param {Array} splitBody - an array of string split on '\n'
 * @returns {String} - the event type inside the body
 */
function extractStreamUpdateEventType ( splitBody ) {

    return splitBody[0].split(":")[1].trim();
}

/**
 * Extracts and attempts to parse the JSON body of a REST stream update string
 * @function
 * @name extractAndParseStreamUpdateEventBody
 * @param {Array} splitBody - an array of string split on '\n'
 * @returns {Object} - the raw string and the attempted processing of the data string
 */
function extractAndParseStreamUpdateEventBody ( splitBody ) {

    const dataBodyString = splitBody[1].split("data:")[1].trim();

    return {
        raw: dataBodyString
        , parsed: parseStringIntoJsObject( dataBodyString )
    };
}

module.exports = {
    generateServiceStreamRequestOptions
    , generateDeviceUpdateRequestOptions
    , parseStringIntoJsObject
    , extractStreamUpdateEventType
    , extractAndParseStreamUpdateEventBody
    , splitStringByNewlines
};
