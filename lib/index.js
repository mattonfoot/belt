var PouchDB = require('pouchdb');
var RSVP = require('rsvp');

var Promise = RSVP.Promise;

function Belt( options ) {
    this.options = options || {};
    this.schemas = {};
    this.repositories = {};
}

function normaliseDocument( doc ) {
    doc.id = doc._id;
    doc.rev = doc._rev;

    delete doc._id;
    delete doc._rev;

    return doc;
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

  , all: function( schema ) {
        var that = this;

        return new Promise(function( resolve, reject ) {
            that.repositories[ schema ]
                .allDocs({ include_docs: true })
                .then(function( response ) {
                    resolve( response.rows.map(function( resource ) {
                        return normaliseDocument( resource.doc );
                    }));
                })
                .catch(function( error ) {
                    throw new Error( error.message );
                });
        });
    }

  , get: function( schema, id ) {
        var that = this;

        return new Promise(function( resolve, reject ) {
            that.repositories[ schema ]
                .get( id )
                .then(function( response ) {
                    resolve( normaliseDocument( response ) );
                })
                .catch(function( error ) {
                    throw new Error( error.message );
                });
        });

    }

};

module.exports = Belt;
