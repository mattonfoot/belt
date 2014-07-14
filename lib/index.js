var PouchDB = require('pouchdb');
var RSVP = require('rsvp');

var Promise = RSVP.Promise;

function Belt( options ) {
    this.options = options || {};
    this.schemas = {};
    this.repositories = {};
}

Belt.prototype = {

    schema: function( name, schema ) {
        this.schemas[ name ] = schema;
        this.repositories[ name ] = new PouchDB( name, this.options );

        return this;
    }

  , create: function( schema, data ) {
        return this.repositories[ schema ].post( data )
            .catch(function( error ) {
                throw new Error( error.message );
            });
    }

};

module.exports = Belt;
