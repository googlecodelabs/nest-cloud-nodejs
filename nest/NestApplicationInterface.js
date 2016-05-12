'use strict';

const NestNetworkManager = require('./network/NestNetworkManager');
const NestRepresentationManager = require('./representations/NestRepresentationManager');

/**
 * The application interface frontend to the WWN API SDK. Inits an instance
 * of representation and network manager and sets up the necessary event
 * listeners between the two while providing access to several public functions
 * of each interface to ease development while using the SDK.
 * @class NestApplicationInterface
 * @property {NestNetworkManager} NetworkManager
 * @property {NestRepresentationManager} RepresentationManager
 */
class NestApplicationInterface {

    /** @constructor */
    constructor ( ) {

        this.NetworkManager = new NestNetworkManager();
        this.RepresentationManager = new NestRepresentationManager();

        this.NetworkManager.addServiceStreamDataUpdateListener(
            this.RepresentationManager.handleNetworkManagerStreamUpdate.bind(
                this.RepresentationManager
            )
        );
    }

    /**
     * Handles the Nest OAUTH2 pin flow, requesting an access token from
     * the WWN API.
     * @public
     * @memberof NestApplicationInterface
     * @method doOauth
     * @param {String} clientId
     * @param {String} clientSecret
     * @param {String} pinCode - the pin generated during the oauth flow from the WWN API
     * @returns {RSVP.Promise} - a promise that will be resolved or rejected after the OAuth process is finished
     */
    doOauth ( clientId, clientSecret, pinCode ) {

        return this.NetworkManager.doOauth( clientId, clientSecret, pinCode );
    }

    /**
     * Sets the accessToken property on the network manager instance thereby
     * allowing the network manager to make HTTP requests against the WWN API.
     * @public
     * @memberof NestApplicationInterface
     * @method setToken
     * @param {String} accessToken - the WWN API OAUTH2 access token
     * @returns {NestNetworkManager} - the network manager instance so that calls can be chained
     */
    setToken( token ) {

        this.NetworkManager.setToken( token );
    }

    /**
     * Attempts to begin a REST stream against the WWN API. Returns a promise
     * which will be resolved/rejected when the REST stream ends and whether it
     * ends in error. Will also add a listener to the streams 'data' event so
     * that updates on the stream can be emitted to applicable listeners.
     * @public
     * @memberof NestApplicationInterface
     * @method _addServiceStreamDataListener
     * @returns {RSVP.Promise} - a promise to be resolved/reject upon normal closure/failure of the stream
     */
    streamServiceChanges ( ) {

        this.NetworkManager.streamServiceChanges();
    }

    /**
     * Add a listener to the 'update' event of the associated Representation
     * Manager.
     * @public
     * @memberof NestApplicationInterface
     * @method addUpdateListener
     */
    addUpdateListener ( fn ) {

        this.RepresentationManager.addUpdateListener( fn );
    }

    /**
     * Add a listener to the 'serviceStreamDataUpdate' event of the
     * associated Network Manager.
     * @public
     * @memberof NestApplicationInterface
     * @method addServiceStreamDataUpdateListener
     */
    addServiceStreamDataUpdateListener ( fn ) {

        this.NetworkManager.addServiceStreamDataUpdateListener( fn );
    }

    /**
     * Add a listener to the 'hydrated' event of the
     * associated Representation Manager.
     * @public
     * @memberof NestApplicationInterface
     * @method addServiceStreamDataUpdateListener
     */
    addHydratedListener ( fn ) {

        this.RepresentationManager.addHydratedListener( fn );
    }

    /**
     * Searches for a device in the local cache on the 'name' property. If
     * multiple devices are found with the same name the function will return
     * an array of these devices, otherwise it will return just the singular
     * device object if only one result is found or will return null if a device
     * cannot be found in the cache under the given name.
     * @public
     * @memberof NestApplicationInterface
     * @method getDeviceByName
     * @param {String} stringName - the string to search with
     * @returns {Array<Object>|Object|Null} - An array of devices if multiple instances are found,
     *  a singular device object if only one is found or null if no matches are found
     */
    getDeviceByDeviceName ( name ) {

        return this.RepresentationManager.getDeviceByName( name );
    }

    /**
     * Returns the device cache of the associated Representation Manager
     * @public
     * @memberof NestApplicationInterface
     * @method getAllDevices
     * @returns {Object} - a copy of the instances localDeviceCache property
     */
    getAllDevices ( ) {

        return this.RepresentationManager.getAllDevices();
    }

    /**
     * Returns the structure cache of the associated Representation Manager
     * @public
     * @memberof NestApplicationInterface
     * @method getAllDevices
     * @returns {Object} - a copy of the instances localDeviceCache property
     */
    getAllStructures ( ) {

        return this.RepresentationManager.getAllStructures();
    }

    /**
     * Returns a promise for resolution/rejection upon transaction completion
     * with the WWN API with the given parameters.
     * @public
     * @memberof NestApplicationInterface
     * @method updateDevice
     * @param {Object} deviceData - the device object which can be requested from the Representation Manager
     * @param {String} keyToUpdate - the key to update on the service relative to the device being updated
     * @param {String|Number} valueToUpdateWith - the value to update the WWN API with
     * @returns {RSVP.Promise} - a promise to be resolved/reject upon failure/success of the PUT request
     */
    updateDevice ( deviceData, targetKey, targetValue ) {

        return this.NetworkManager.updateDevice(
            deviceData
            , targetKey
            , targetValue
        );
    }
}

module.exports = new NestApplicationInterface();
