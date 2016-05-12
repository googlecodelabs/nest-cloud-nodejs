
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
