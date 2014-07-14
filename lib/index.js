var PouchDB = require('pouchdb');
var RSVP = require('rsvp');

var Promise = RSVP.Promise;

function Belt( options ) {
    this.options = options || {};
    this.schemas = {};
    this.repositories = {};
}

function normaliseDocument( doc ) {
    if (doc._id) {
        doc.id = doc._id;
        delete doc._id;
    }

    if (doc._rev) {
        doc.rev = doc._rev;
        delete doc._rev;
    }

    return doc;
}

function prepareDocument( doc ) {
    if (doc.id) {
        doc._id = doc.id;
        delete doc.id;
    }

    if (doc.rev) {
        doc._rev = doc.rev;
        delete doc.rev;
    }

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

  , get: function( schema, ids ) {
        var that = this;

        return new Promise(function( resolve, reject ) {
            var query = that.repositories[ schema ];

            if ( Array.isArray(ids) ) {
                query
                    .allDocs({ include_docs: true, keys: ids })
                    .then(function( response ) {
                        resolve( response.rows.map(function( resource ) {
                            return normaliseDocument( resource.doc );
                        }));
                    })
            } else {
                query
                    .get( ids )
                    .then(function( response ) {
                        resolve( normaliseDocument( response ) );
                    })
            }

            query.catch(function( error ) {
                    throw new Error( error.message );
                });
        });

    }

  , update: function( schema, id, data ) {
        var that = this;

        return new Promise(function( resolve, reject ) {
            that.repositories[ schema ]
                .put( prepareDocument( data ), id )
                .then(function( response ) {
                    var info = normaliseDocument( response );

                    resolve( info );
                })
                .catch(function( error ) {
                    throw new Error( error.message );
                });
        });
    }

};

module.exports = Belt;
